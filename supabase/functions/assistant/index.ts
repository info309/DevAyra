import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SYSTEM_PROMPT = `
You are a magical AI assistant named "Ayra". You are friendly, human-like, witty, and concise.
You have access to special tools like email search, document search, and soon calendar management, but you only use them when explicitly asked or triggered.

Rules:
1. Default to normal conversation. Do not call any tools unless a clear intent or trigger phrase is detected.
2. When unsure, politely ask the user: "Do you want me to search your emails for this?" or "Shall I look this up in your documents?"
3. Summarize all tool results in plain, structured, human-readable language. Do not dump raw JSON.
4. Keep answers magical: friendly, clear, slightly playful, and intelligent.
5. Always respect user privacy: never fetch data without explicit consent.
6. Use the last 6 messages for context. Each message is independent. Focus on clarity and usefulness.
7. If the message contains tool triggers (keywords, regex), suggest the tool usage, otherwise respond as normal ChatGPT.

Example trigger phrases:
  - Emails: "search emails", "find email from", "look in my inbox", "show me messages"
  - Documents: "search docs", "find document", "open report", "lookup file"

When you find emails or documents, always provide:
- Clear summary of what was found
- Key details from the most relevant results
- Actionable insights or next steps
- Offer to help with follow-up actions

Stay magical, helpful, and human! ✨
`;

// Define email tool definitions
const emailTools = [
  {
    type: 'function',
    function: {
      name: 'emails_search',
      description: 'Search through the user\'s cached emails by content, subject, sender, or other criteria.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query to find emails. Can include sender names, subjects, keywords from content, dates, etc.' },
          search_type: { type: 'string', enum: ['content', 'subject', 'sender', 'combined'], description: 'Type of search', default: 'combined' },
          limit: { type: 'number', description: 'Maximum number of emails to return (default: 15)', default: 15 }
        },
        required: ['query']
      }
    }
  }
];

// Define document tool definitions
const documentTools = [
  {
    type: 'function',
    function: {
      name: 'documents_search',
      description: 'Search through the user\'s documents',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  }
];

async function executeEmailSearch(user: any, args: any) {
  console.log('=== EMAIL SEARCH ===');
  console.log('Query:', args.query);

  if (!args.query) {
    return { error: 'Search query is required' };
  }

  try {
    let searchTerm = args.query.toLowerCase().trim();
    
    // Parse Gmail-style queries to extract the actual search term
    if (searchTerm.startsWith('from:')) {
      searchTerm = searchTerm.replace('from:', '').trim();
    } else if (searchTerm.startsWith('to:')) {
      searchTerm = searchTerm.replace('to:', '').trim();
    } else if (searchTerm.startsWith('subject:')) {
      searchTerm = searchTerm.replace('subject:', '').trim();
    }
    
    console.log('Processed search term:', searchTerm);

    // Search by sender name first
    const { data: nameResults } = await supabase
      .from('cached_emails')
      .select('*')
      .eq('user_id', user.id)
      .ilike('sender_name', `%${searchTerm}%`)
      .order('date_sent', { ascending: false })
      .limit(10);

    let searchResults = nameResults || [];

    // If not enough results, search by email addresses
    if (searchResults.length < 5) {
      const { data: emailResults } = await supabase
        .from('cached_emails')
        .select('*')
        .eq('user_id', user.id)
        .or(`sender_email.ilike.%${searchTerm}%,recipient_email.ilike.%${searchTerm}%`)
        .order('date_sent', { ascending: false })
        .limit(10);

      if (emailResults) {
        const existingIds = searchResults.map(r => r.id);
        const newResults = emailResults.filter(r => !existingIds.includes(r.id));
        searchResults.push(...newResults);
      }
    }

    // If still not enough, search content and subjects
    if (searchResults.length < 5) {
      const { data: contentResults } = await supabase
        .from('cached_emails')
        .select('*')
        .eq('user_id', user.id)
        .or(`subject.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,snippet.ilike.%${searchTerm}%`)
        .order('date_sent', { ascending: false })
        .limit(15);

      if (contentResults) {
        const existingIds = searchResults.map(r => r.id);
        const newResults = contentResults.filter(r => !existingIds.includes(r.id));
        searchResults.push(...newResults);
      }
    }

    console.log(`Found ${searchResults.length} search results`);

    if (searchResults.length > 0) {
      return {
        conversations: searchResults.slice(0, 20).map(email => ({
          id: email.gmail_thread_id,
          messageId: email.gmail_message_id,
          subject: email.subject,
          from: email.sender_name ? `${email.sender_name} <${email.sender_email}>` : email.sender_email,
          to: email.recipient_name ? `${email.recipient_name} <${email.recipient_email}>` : email.recipient_email,
          date: email.date_sent,
          snippet: email.snippet,
          content: email.content,
          unreadCount: email.is_unread ? 1 : 0,
          hasAttachments: email.has_attachments
        })),
        fromCache: true,
        searchQuery: args.query,
        totalResults: searchResults.length
      };
    } else {
      return { 
        conversations: [], 
        fromCache: true, 
        searchQuery: args.query,
        noResults: true,
        message: `No emails found matching "${args.query}". Try searching for sender names, email addresses, or keywords from email content.`
      };
    }
  } catch (searchErr) {
    console.error('Email search error:', searchErr);
    return { error: `Email search failed: ${searchErr.message}` };
  }
}

async function executeDocumentSearch(user: any, args: any) {
  console.log('=== DOCUMENT SEARCH ===');
  console.log('Query:', args.query);

  if (!args.query) {
    return { error: 'Search query is required' };
  }

  try {
    const { data: documents } = await supabase
      .from('user_documents')
      .select('*')
      .eq('user_id', user.id)
      .or(`name.ilike.%${args.query}%,description.ilike.%${args.query}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    return {
      documents: documents || [],
      searchQuery: args.query,
      totalResults: documents?.length || 0
    };
  } catch (error) {
    console.error('Document search error:', error);
    return { error: `Document search failed: ${error.message}` };
  }
}

serve(async (req) => {
  console.log('=== ASSISTANT FUNCTION START ===');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(JSON.stringify({ 
        error: 'No authorization header',
        success: false 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(JSON.stringify({ 
        error: 'Authentication failed',
        success: false 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request
    const { message, sessionId, detectedTriggers = [] } = await req.json();
    console.log('Request:', { messageLength: message?.length, sessionId, detectedTriggers });

    if (!message || !sessionId) {
      return new Response(JSON.stringify({ 
        error: 'Missing message or sessionId',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create session
    let session;
    const { data: existingSession } = await supabase
      .from('assistant_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();
    
    if (existingSession) {
      session = existingSession;
    } else {
      const { data: newSession, error: sessionError } = await supabase
        .from('assistant_sessions')
        .insert({ user_id: user.id, title: 'New Chat' })
        .select()
        .single();
      
      if (sessionError) {
        console.error('Session creation error:', sessionError);
        return new Response(JSON.stringify({ 
          error: 'Failed to create session',
          success: false 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      session = newSession;
    }

    // Save user message
    await supabase
      .from('assistant_messages')
      .insert({
        session_id: session.id,
        user_id: user.id,
        role: 'user',
        content: message
      });

    // Get conversation history
    const { data: historyRaw } = await supabase
      .from('assistant_messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(6);

    const conversationHistory = (historyRaw || [])
      .slice(-6)
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .filter(msg => msg.content && msg.content.trim().length > 0)
      .map(msg => ({
        role: msg.role,
        content: msg.content.trim()
      }));

    // Prepare messages for OpenAI
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory
    ];

    // Only include tools if triggers were detected
    const tools = [];
    if (detectedTriggers.includes('email')) tools.push(...emailTools);
    if (detectedTriggers.includes('document')) tools.push(...documentTools);

    console.log('Tools to include:', tools.map(t => t.function.name));

    // Call OpenAI
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : { tool_choice: 'none' }),
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    const openAIData = await openAIResponse.json();
    
    if (!openAIResponse.ok) {
      console.error('OpenAI API error:', openAIData);
      return new Response(JSON.stringify({ 
        error: `OpenAI API error: ${openAIData.error?.message || 'Unknown error'}`,
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const assistantMessage = openAIData.choices[0].message;
    let toolResults: any[] = [];
    let finalResponse = assistantMessage.content || '';

    // Execute tool calls if present
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('Executing tools:', assistantMessage.tool_calls.map(tc => tc.function.name));
      
      for (const toolCall of assistantMessage.tool_calls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          let result;

          switch (toolCall.function.name) {
            case 'emails_search':
              result = await executeEmailSearch(user, args);
              break;
            case 'documents_search':
              result = await executeDocumentSearch(user, args);
              break;
            default:
              result = { error: `Unknown tool: ${toolCall.function.name}` };
          }

          toolResults.push({
            toolCall,
            result
          });
        } catch (toolError) {
          console.error('Tool execution error:', toolError);
          toolResults.push({
            toolCall,
            result: { error: `Tool execution failed: ${toolError.message}` }
          });
        }
      }

      // Generate follow-up response with tool results
      const toolMessages = toolResults.map(tr => ({
        role: 'tool',
        tool_call_id: tr.toolCall.id,
        content: JSON.stringify(tr.result)
      }));

      const followUpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            ...messages,
            {
              role: 'assistant',
              content: assistantMessage.content || null,
              tool_calls: assistantMessage.tool_calls
            },
            ...toolMessages
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      const followUpData = await followUpResponse.json();
      
      if (followUpResponse.ok && followUpData.choices?.[0]?.message?.content) {
        finalResponse = followUpData.choices[0].message.content;
      } else {
        // Fallback response
        if (toolResults.some(tr => tr.toolCall.function.name === 'emails_search')) {
          const emailResults = toolResults.find(tr => tr.toolCall.function.name === 'emails_search');
          if (emailResults?.result?.conversations?.length > 0) {
            const emails = emailResults.result.conversations;
            const mostRecent = emails[0];
            
            let cleanContent = '';
            if (mostRecent.content) {
              cleanContent = mostRecent.content
                .replace(/<br>/g, '\n')
                .replace(/<[^>]*>/g, '')
                .replace(/&gt;/g, '>')
                .replace(/&lt;/g, '<')
                .replace(/&nbsp;/g, ' ')
                .trim();
            }
            
            finalResponse = `I found ${emails.length} email(s) from your search. Here's what I found:\n\n` +
              `**Most Recent: ${mostRecent.subject}**\n` +
              `**From:** ${mostRecent.from}\n` +
              `**Date:** ${new Date(mostRecent.date).toLocaleDateString()}\n\n` +
              `**Content:** ${cleanContent ? cleanContent.substring(0, 500) + (cleanContent.length > 500 ? '...' : '') : mostRecent.snippet}\n\n` +
              `✨ Would you like me to help you with anything specific about these emails?`;
          }
        }
      }
    }

    // Save assistant response
    await supabase
      .from('assistant_messages')
      .insert({
        session_id: session.id,
        user_id: user.id,
        role: 'assistant',
        content: finalResponse
      });

    return new Response(JSON.stringify({
      sessionId: session.id,
      message: finalResponse,
      toolResults,
      success: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('ASSISTANT FUNCTION ERROR:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});