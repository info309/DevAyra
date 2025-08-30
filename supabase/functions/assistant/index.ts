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
You have access to special tools like email search, document search, and email sending, but you only use them when explicitly asked or triggered.
The user's name is: {{USER_NAME}} - use it naturally in conversation when appropriate.

Rules:
1. Default to normal conversation. Do not call any tools unless a clear intent or trigger phrase is detected.
2. CRITICAL: When the user wants to send an email after discussing its contents, ALWAYS use "emails_compose_draft" to create a draft that opens in their compose window. DO NOT send emails directly unless explicitly asked to "send it now" or similar.
3. If the user is asking about a specific person's email (like Michelle, Carlo, etc.) - automatically search for it without asking permission.
4. Summarize all tool results in plain, structured, human-readable language. Do not dump raw JSON.
5. Keep answers magical: friendly, clear, slightly playful, and intelligent.
6. Always respect user privacy: never fetch data without explicit consent.
7. Use the last 6 messages for context. Each message is independent. Focus on clarity and usefulness.
8. Be conversational and context-aware - don't repeat the same questions.

Email Handling Rules:
- CRITICAL: When user says "send", "send it", "yes", "go ahead", "all good", "Id like to send it" after discussing email content - IMMEDIATELY call "emails_compose_draft" tool
- DO NOT ask "shall I prepare this draft" or similar - just call the tool immediately 
- NEVER actually send emails - only create drafts for user review
- CRITICAL: When creating email drafts, ALWAYS use the actual email address from the search results (e.g., "carlobordi@aol.com") NOT placeholder addresses like "carlo@example.com"

Example conversation flow:
User: "Tell him I'm on it and I'll let him know"  
Assistant: [searches for email, finds carlobordi@aol.com, drafts email content]
User: "send"  
Assistant: [IMMEDIATELY calls emails_compose_draft with "to": "carlobordi@aol.com" - NO confirmation needed]

Example trigger phrases:
  - Email search: "search emails", "find email from", "look in my inbox", "show me messages", "email from Michelle", "what did Carlo ask"
  - Email draft/compose: "draft an email", "compose a message", "write an email", "prepare a response", "send", "send it", "go ahead", "I want to send"
  - Email immediate send: "send it now", "send immediately", "send right away"
  - Documents: "search docs", "find document", "open report", "lookup file"

When you find emails or documents, always provide:
- Clear summary of what was found
- Key details from the most relevant results  
- Actionable insights or next steps
- Offer to help with follow-up actions

CRITICAL EMAIL ADDRESS EXTRACTION:
When user wants to reply to someone (like Carlo, Michelle), you MUST:
1. First search for their emails using emails_search  
2. Extract the actual email address from the search results (e.g., "carlobordi@aol.com")
3. Use that EXACT email address in emails_compose_draft - NEVER use "carlo@example.com" 
4. Include the thread ID from the original email if replying

Be smart about context - if someone asks about "Michelle's email" or confirms they want to search, just do it! ✨

Stay magical, helpful, and human! ✨
`;

// Tool definitions
const EMAIL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'emails_search',
      description: 'Search through the user\'s cached emails by content, subject, sender, or other criteria.',
      parameters: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Search query to find emails. Can include sender names, subjects, keywords from content, dates, etc.' 
          },
          search_type: { 
            type: 'string', 
            enum: ['content', 'subject', 'sender', 'combined'], 
            description: 'Type of search', 
            default: 'combined' 
          },
          limit: { 
            type: 'number', 
            description: 'Maximum number of emails to return (default: 15)', 
            default: 15 
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'emails_compose_draft',
      description: 'Compose a draft email that will be opened in the user\'s compose window for review and sending.',
      parameters: {
        type: 'object',
        properties: {
          to: { 
            type: 'string', 
            description: 'Recipient email address' 
          },
          subject: { 
            type: 'string', 
            description: 'Email subject line' 
          },
          content: { 
            type: 'string', 
            description: 'Email body content (plain text)' 
          },
          threadId: { 
            type: 'string', 
            description: 'Thread ID if this is a reply to an existing conversation',
            optional: true
          }
        },
        required: ['to', 'subject', 'content']
      }
    }
  }
];

const DOCUMENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'documents_search',
      description: 'Search through the user\'s documents',
      parameters: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Search query for documents' 
          }
        },
        required: ['query']
      }
    }
  }
];

// Tool execution functions
async function searchEmails(userId: string, query: string) {
  try {
    console.log(`Searching emails for user ${userId} with query: "${query}"`);
    
    // Clean and parse query
    let searchTerm = query.toLowerCase().trim();
    
    // Parse Gmail-style queries
    if (searchTerm.startsWith('from:')) {
      searchTerm = searchTerm.replace('from:', '').trim();
    } else if (searchTerm.startsWith('to:')) {
      searchTerm = searchTerm.replace('to:', '').trim();
    } else if (searchTerm.startsWith('subject:')) {
      searchTerm = searchTerm.replace('subject:', '').trim();
    }
    
    console.log(`Processed search term: "${searchTerm}"`);

    // Search by sender name first
    const { data: senderResults, error: senderError } = await supabase
      .from('cached_emails')
      .select('*')
      .eq('user_id', userId)
      .ilike('sender_name', `%${searchTerm}%`)
      .order('date_sent', { ascending: false })
      .limit(10);

    if (senderError) {
      console.error('Sender search error:', senderError);
      return { error: `Email search failed: ${senderError.message}` };
    }

    let searchResults = senderResults || [];
    console.log(`Found ${searchResults.length} results by sender name`);

    // If not enough results, search by email addresses
    if (searchResults.length < 5) {
      const { data: emailResults, error: emailError } = await supabase
        .from('cached_emails')
        .select('*')
        .eq('user_id', userId)
        .or(`sender_email.ilike.%${searchTerm}%,recipient_email.ilike.%${searchTerm}%`)
        .order('date_sent', { ascending: false })
        .limit(10);

      if (!emailError && emailResults) {
        const existingIds = searchResults.map(r => r.id);
        const newResults = emailResults.filter(r => !existingIds.includes(r.id));
        searchResults.push(...newResults);
        console.log(`Added ${newResults.length} more results by email address`);
      }
    }

    // If still not enough, search content and subjects
    if (searchResults.length < 5) {
      const { data: contentResults, error: contentError } = await supabase
        .from('cached_emails')
        .select('*')
        .eq('user_id', userId)
        .or(`subject.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,snippet.ilike.%${searchTerm}%`)
        .order('date_sent', { ascending: false })
        .limit(15);

      if (!contentError && contentResults) {
        const existingIds = searchResults.map(r => r.id);
        const newResults = contentResults.filter(r => !existingIds.includes(r.id));
        searchResults.push(...newResults);
        console.log(`Added ${newResults.length} more results by content`);
      }
    }

    console.log(`Total search results: ${searchResults.length}`);

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
        searchQuery: query,
        totalResults: searchResults.length
      };
    } else {
      return { 
        conversations: [], 
        fromCache: true, 
        searchQuery: query,
        noResults: true,
        message: `No emails found matching "${query}". Try searching for sender names, email addresses, or keywords from email content.`
      };
    }
  } catch (error) {
    console.error('Email search error:', error);
    return { error: `Email search failed: ${error.message}` };
  }
}

async function searchDocuments(userId: string, query: string) {
  try {
    console.log(`Searching documents for user ${userId} with query: "${query}"`);
    
    const { data: documents, error } = await supabase
      .from('user_documents')
      .select('*')
      .eq('user_id', userId)
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Document search error:', error);
      return { error: `Document search failed: ${error.message}` };
    }

    return {
      documents: documents || [],
      searchQuery: query,
      totalResults: documents?.length || 0
    };
  } catch (error) {
    console.error('Document search error:', error);
    return { error: `Document search failed: ${error.message}` };
  }
}

async function composeEmailDraft(to: string, subject: string, content: string, threadId?: string) {
  console.log('Composing email draft:', { to, subject, threadId });
  
  // Build draft data with only defined fields
  const draftData: any = {
    to,
    subject,
    content,
    action: 'compose_draft'
  };
  
  // Only include threadId if it's a valid string
  if (threadId && typeof threadId === 'string' && threadId.trim()) {
    draftData.threadId = threadId;
  }
  
  return draftData;
}

// Main handler
serve(async (req) => {
  console.log('=== ASSISTANT FUNCTION START ===');
  console.log('Method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create client with JWT token from request
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
    
    // Create a new client instance with the user's token
    const userSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    
    // Verify the JWT token and get user info
    const { data: { user }, error: authError } = await userSupabase.auth.getUser(token);
    
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

    console.log('User authenticated:', user.id);

    // Get user profile for personalization
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    // Extract first name - if it's an email, use the part before @, otherwise use as-is
    const userName = userProfile?.display_name ? 
      (userProfile.display_name.includes('@') ? 
        userProfile.display_name.split('@')[0] : 
        userProfile.display_name) : 
      'there';

    console.log('User profile loaded:', userName);

    // Parse request
    const { message, sessionId, detectedTriggers = [] } = await req.json();
    console.log('Request params:', { 
      messageLength: message?.length, 
      sessionId, 
      detectedTriggers 
    });

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
      .maybeSingle();
    
    if (existingSession) {
      session = existingSession;
      console.log('Using existing session');
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
      console.log('Created new session');
    }

    // Save user message
    const { error: userMessageError } = await supabase
      .from('assistant_messages')
      .insert({
        session_id: session.id,
        user_id: user.id,
        role: 'user',
        content: message
      });

    if (userMessageError) {
      console.error('Error saving user message:', userMessageError);
    }

    // Get conversation history (last 6 messages)
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

    console.log('Conversation history length:', conversationHistory.length);

    // Prepare messages for OpenAI with personalized system prompt
    const personalizedSystemPrompt = SYSTEM_PROMPT.replace('{{USER_NAME}}', userName);
    
    const messages = [
      { role: 'system', content: personalizedSystemPrompt },
      ...conversationHistory
    ];

    // Determine which tools to include
    const tools = [];
    if (detectedTriggers.includes('email')) {
      tools.push(...EMAIL_TOOLS);
      console.log('Added email tools');
    }
    if (detectedTriggers.includes('document')) {
      tools.push(...DOCUMENT_TOOLS);
      console.log('Added document tools');
    }

    console.log('Tools to use:', tools.map(t => t.function.name));

    // Call OpenAI
    const openAIRequest = {
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    };

    if (tools.length > 0) {
      openAIRequest.tools = tools;
      openAIRequest.tool_choice = 'auto';
    }

    console.log('Calling OpenAI with model:', openAIRequest.model);

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openAIRequest),
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
    let toolResults = [];
    let finalResponse = assistantMessage.content || '';

    console.log('OpenAI response received, tool calls:', assistantMessage.tool_calls?.length || 0);

    // Execute tool calls if present
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('Executing tool calls...');
      
      for (const toolCall of assistantMessage.tool_calls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          let result;

          console.log(`Executing tool: ${toolCall.function.name} with args:`, args);

          switch (toolCall.function.name) {
            case 'emails_search':
              result = await searchEmails(user.id, args.query);
              break;
            case 'documents_search':
              result = await searchDocuments(user.id, args.query);
              break;
            case 'emails_compose_draft':
              result = await composeEmailDraft(args.to, args.subject, args.content, args.threadId);
              break;
            default:
              result = { error: `Unknown tool: ${toolCall.function.name}` };
          }

          toolResults.push({
            toolCall,
            result
          });

          // Save tool message to database for UI rendering
          await supabase
            .from('assistant_messages')
            .insert({
              session_id: session.id,
              user_id: user.id,
              role: 'tool',
              content: JSON.stringify(result),
              tool_name: toolCall.function.name,
              tool_args: JSON.stringify(args),
              tool_result: JSON.stringify(result)
            });

          console.log(`Tool ${toolCall.function.name} executed, result:`, result?.conversations?.length || result?.documents?.length || 'error');
        } catch (toolError) {
          console.error('Tool execution error:', toolError);
          toolResults.push({
            toolCall,
            result: { error: `Tool execution failed: ${toolError.message}` }
          });
        }
      }

      // Get follow-up response from OpenAI with tool results
      if (toolResults.length > 0) {
        console.log('Getting follow-up response from OpenAI...');
        
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
                content: assistantMessage.content,
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
          console.log('Got follow-up response from OpenAI');
        } else {
          console.error('Follow-up OpenAI call failed:', followUpData);
          // Use fallback response
          if (toolResults.some(tr => tr.toolCall.function.name === 'emails_search')) {
            const emailResults = toolResults.find(tr => tr.toolCall.function.name === 'emails_search');
            if (emailResults?.result?.conversations?.length > 0) {
              finalResponse = `✨ I found ${emailResults.result.conversations.length} email(s) matching your search! Let me know if you'd like me to help with anything specific about these emails.`;
            }
          }
        }
      }
    }

    // Save assistant response
    const { error: assistantMessageError } = await supabase
      .from('assistant_messages')
      .insert({
        session_id: session.id,
        user_id: user.id,
        role: 'assistant',
        content: finalResponse
      });

    if (assistantMessageError) {
      console.error('Error saving assistant message:', assistantMessageError);
    }

    console.log('=== ASSISTANT FUNCTION COMPLETE ===');

    return new Response(JSON.stringify({
      sessionId: session.id,
      message: finalResponse,
      toolResults,
      success: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== ASSISTANT FUNCTION ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});