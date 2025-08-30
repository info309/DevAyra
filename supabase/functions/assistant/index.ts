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

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface EmailTool {
  type: 'emails.list' | 'emails.search' | 'emails.read' | 'emails.send';
  args: any;
}

interface DocumentTool {
  type: 'documents.list' | 'documents.search';
  args: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    const { message, sessionId } = await req.json();

    console.log('Assistant request received:', { 
      userId: user.id, 
      sessionId, 
      message: message.substring(0, 100),
      timestamp: new Date().toISOString()
    });

    // Get or create session
    let session;
    if (sessionId) {
      const { data: existingSession } = await supabase
        .from('assistant_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();
      session = existingSession;
    }

    if (!session) {
      const { data: newSession, error: sessionError } = await supabase
        .from('assistant_sessions')
        .insert({ user_id: user.id, title: 'New Chat' })
        .select()
        .single();
      
      if (sessionError) throw sessionError;
      session = newSession;
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

    if (userMessageError) throw userMessageError;

    // Get recent conversation history
    const { data: history } = await supabase
      .from('assistant_messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(20);

    // Prepare messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: `You are Ayra, a conversational AI assistant integrated with the user's Gmail and documents. 

PERSONALITY & BEHAVIOR:
- Be conversational, helpful, and intelligent like a real human assistant
- Ask clarifying questions when requests are unclear or ambiguous
- Provide context and explanation for your actions
- Summarize what you found and offer next steps
- Confirm before taking important actions like sending emails
- Be proactive in suggesting related actions or information

CAPABILITIES:
1. EMAIL MANAGEMENT:
   - Search and read emails with smart filtering
   - Analyze email content and provide summaries
   - Draft and send emails (always confirm first)
   - Help with email organization and follow-ups

2. DOCUMENT ACCESS:
   - Search and list user documents
   - Help find specific files and information
   - Provide document insights and summaries

3. INTELLIGENT ASSISTANCE:
   - Answer questions about email content
   - Help prioritize tasks from emails
   - Suggest responses and actions
   - Remember context from our conversation

TOOL USAGE:
- emails_list: Get recent emails from your local cache (much faster than Gmail API)
- emails_search: Search emails by keywords in your cached emails 
- emails_read: Get full email content by ID (use when user asks about specific email details)
- emails_send: Draft/send emails (ALWAYS ask for confirmation first)
- documents_list: List documents (use for "show my files", "what documents do I have")
- documents_search: Search documents by content/name

EMAIL SEARCH STRATEGY:
- Your emails are automatically cached locally when you view your mailbox
- This makes searches much faster and more reliable than calling Gmail API
- When searching for emails from specific people, the cache can find them instantly
- If no cached results are found, inform the user they may need to visit their mailbox first

CONVERSATION FLOW:
1. If a request is unclear, ask specific clarifying questions
2. Execute the appropriate tool calls to gather information
3. If tools fail, try alternative approaches automatically
4. Analyze and summarize the results in a conversational way
5. Suggest follow-up actions or ask if they need anything else
6. For email sending, always confirm details before executing

Remember: You're having a conversation, not just executing commands. Be human-like in your responses and persistent in helping users find what they need.`
      },
      ...(history || []).filter(msg => msg.role === 'user' || msg.role === 'assistant').map(msg => ({
        role: msg.role,
        content: msg.content || ''
      }))
    ];

    // Define available tools
    const tools = [
      {
        type: 'function',
        function: {
          name: 'emails_list',
          description: 'Get recent emails from Gmail',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Gmail search query (optional)' },
              maxResults: { type: 'number', default: 10, description: 'Number of emails to fetch' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'emails_search',
          description: 'Search through the user\'s cached emails by content, subject, sender, or other criteria. This searches locally cached emails which is much faster than the Gmail API. Use different search approaches for better results.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query to find emails. Can include sender names, subjects, keywords from content, dates, etc. Examples: \'from:tesla\', \'subject:invoice\', \'meeting tomorrow\', \'amazon order\'' },
              search_type: { type: 'string', enum: ['content', 'subject', 'sender', 'combined'], description: 'Type of search - content: search email body, subject: search subject line, sender: search sender info, combined: search all fields', default: 'combined' },
              limit: { type: 'number', description: 'Maximum number of emails to return (default: 15)', default: 15 }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'emails_read',
          description: 'Get full content of a specific email',
          parameters: {
            type: 'object',
            properties: {
              messageId: { type: 'string', description: 'Gmail message ID' }
            },
            required: ['messageId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'emails_send',
          description: 'Draft or send an email',
          parameters: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Recipient email address' },
              subject: { type: 'string', description: 'Email subject' },
              content: { type: 'string', description: 'Email content/body' },
              threadId: { type: 'string', description: 'Thread ID for replies (optional)' }
            },
            required: ['to', 'subject', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'documents_list',
          description: 'List user documents',
          parameters: {
            type: 'object',
            properties: {
              search: { type: 'string', description: 'Search term for document names (optional)' },
              limit: { type: 'number', default: 20, description: 'Number of documents to return' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'documents_search',
          description: 'Search documents by name or content',
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

    // Call OpenAI
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages,
        tools,
        max_completion_tokens: 1000,
      }),
    });

    const openAIData = await openAIResponse.json();
    
    if (!openAIResponse.ok) {
      console.error('OpenAI API error:', openAIData);
      throw new Error(`OpenAI API error: ${openAIData.error?.message || 'Unknown error'}`);
    }

    const assistantMessage = openAIData.choices[0].message;
    let toolResults: any[] = [];
    let finalResponse = assistantMessage.content || '';

    // Execute tool calls if present
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const toolCall of assistantMessage.tool_calls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          let result;

          console.log('Executing tool:', toolCall.function.name, args);

          switch (toolCall.function.name) {
            case 'emails_list':
              // First try to get from local cache
              const { data: cachedEmails, error: cacheError } = await supabase
                .from('cached_emails')
                .select('*')
                .eq('user_id', user.id)
                .order('date_sent', { ascending: false })
                .limit(args.maxResults || 50);
              
              if (!cacheError && cachedEmails && cachedEmails.length > 0) {
                // Convert cached emails to conversation format
                result = {
                  conversations: cachedEmails.map(email => ({
                    id: email.gmail_thread_id,
                    subject: email.subject,
                    from: email.sender_name || email.sender_email,
                    to: email.recipient_name || email.recipient_email,
                    date: email.date_sent,
                    snippet: email.snippet,
                    unreadCount: email.is_unread ? 1 : 0
                  })),
                  fromCache: true
                };
              } else {
                // Fallback to Gmail API if cache is empty
                const { data: gmailResult, error: gmailError } = await supabase.functions.invoke('gmail-api', {
                  body: {
                    action: 'getEmails',
                    ...args
                  },
                  headers: {
                    Authorization: `Bearer ${token}`,
                  }
                });
                
                if (gmailError) throw gmailError;
                result = gmailResult;
              }
              break;

            case 'emails_search':
              console.log('Starting email search for query:', args.query);
              
              if (args.query) {
                try {
                  const searchTerm = args.query.toLowerCase();
                  let searchResults = [];
                  
                  // Step 1: Search by sender name (most relevant)
                  const { data: nameResults, error: nameError } = await supabase
                    .from('cached_emails')
                    .select('*')
                    .eq('user_id', user.id)
                    .ilike('sender_name', `%${searchTerm}%`)
                    .order('date_sent', { ascending: false })
                    .limit(10);
                  
                  if (!nameError && nameResults) {
                    searchResults.push(...nameResults);
                  }
                  
                  // Step 2: Search by email addresses if we need more results
                  if (searchResults.length < 5) {
                    const { data: emailResults, error: emailError } = await supabase
                      .from('cached_emails')
                      .select('*')
                      .eq('user_id', user.id)
                      .or(`sender_email.ilike.%${searchTerm}%,recipient_email.ilike.%${searchTerm}%`)
                      .order('date_sent', { ascending: false })
                      .limit(10);
                    
                    if (!emailError && emailResults) {
                      // Add only new results (avoid duplicates)
                      const existingIds = searchResults.map(r => r.id);
                      const newResults = emailResults.filter(r => !existingIds.includes(r.id));
                      searchResults.push(...newResults);
                    }
                  }
                  
                  // Step 3: Search by subject and content if we still need more results
                  if (searchResults.length < 5) {
                    const { data: contentResults, error: contentError } = await supabase
                      .from('cached_emails')
                      .select('*')
                      .eq('user_id', user.id)
                      .or(`subject.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,snippet.ilike.%${searchTerm}%`)
                      .order('date_sent', { ascending: false })
                      .limit(15);
                    
                    if (!contentError && contentResults) {
                      // Add only new results (avoid duplicates)
                      const existingIds = searchResults.map(r => r.id);
                      const newResults = contentResults.filter(r => !existingIds.includes(r.id));
                      searchResults.push(...newResults);
                    }
                  }
                  
                  console.log(`Found ${searchResults.length} search results for query: ${args.query}`);
                  
                  if (searchResults.length > 0) {
                    result = {
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
                    result = { 
                      conversations: [], 
                      fromCache: true, 
                      searchQuery: args.query,
                      noResults: true,
                      message: `No emails found matching "${args.query}". Try searching for sender names, email addresses, or keywords from email content.`
                    };
                  }
                } catch (searchErr) {
                  console.error('Email search error:', searchErr);
                  result = { error: `Email search failed: ${searchErr.message}` };
                }
              } else {
                result = { error: 'Search query is required' };
              }
              break;

            case 'emails_read':
              // For reading a specific email, we need to get it from the gmail-api
              const { data: gmailReadResult, error: gmailReadError } = await supabase.functions.invoke('gmail-api', {
                body: {
                  action: 'getEmails',
                  query: `rfc822msgid:${args.messageId}`,
                  maxResults: 1
                },
                headers: {
                  Authorization: `Bearer ${token}`,
                }
              });
              
              if (gmailReadError) throw gmailReadError;
              result = gmailReadResult;
              break;

            case 'emails_send':
              // Call existing gmail-api function
              const { data: gmailSendResult, error: gmailSendError } = await supabase.functions.invoke('gmail-api', {
                body: {
                  action: 'sendEmail',
                  ...args
                },
                headers: {
                  Authorization: `Bearer ${token}`,
                }
              });
              
              if (gmailSendError) throw gmailSendError;
              result = gmailSendResult;
              break;

            case 'documents_list':
              const { data: docsList, error: docsError } = await supabase
                .from('user_documents')
                .select('id, name, mime_type, file_size, created_at, is_favorite, category, description')
                .eq('user_id', user.id)
                .eq('is_folder', false)
                .ilike('name', args.search ? `%${args.search}%` : '%')
                .order('created_at', { ascending: false })
                .limit(args.limit || 20);
              
              if (docsError) throw docsError;
              result = { documents: docsList };
              break;

            case 'documents_search':
              const { data: searchDocs, error: searchError } = await supabase
                .from('user_documents')
                .select('id, name, mime_type, file_size, created_at, is_favorite, category, description')
                .eq('user_id', user.id)
                .eq('is_folder', false)
                .or(`name.ilike.%${args.query}%, description.ilike.%${args.query}%`)
                .order('created_at', { ascending: false })
                .limit(20);
              
              if (searchError) throw searchError;
              result = { documents: searchDocs };
              break;

            default:
              result = { error: `Unknown tool: ${toolCall.function.name}` };
          }

          // If email search fails, try listing recent emails as fallback
          if (toolCall.function.name === 'emails_search' && (result.error || !result.conversations)) {
            console.log('Email search failed, falling back to list recent emails');
            try {
              const { data: fallbackResult, error: fallbackError } = await supabase.functions.invoke('gmail-api', {
                body: {
                  action: 'getEmails',
                  maxResults: 50
                },
                headers: {
                  Authorization: `Bearer ${token}`,
                }
              });
              
              if (!fallbackError && fallbackResult?.conversations) {
                result = {
                  ...fallbackResult,
                  fallback_used: true,
                  original_error: result.error
                };
              }
            } catch (fallbackErr) {
              console.error('Fallback also failed:', fallbackErr);
            }
          }

          toolResults.push({
            toolCall,
            result
          });

          // Save tool call message
          await supabase.from('assistant_messages').insert({
            session_id: session.id,
            user_id: user.id,
            role: 'assistant',
            tool_name: toolCall.function.name,
            tool_args: args,
            tool_result: result
          });

        } catch (error) {
          console.error('Tool execution error:', error);
          toolResults.push({
            toolCall,
            result: { error: error.message }
          });
        }
      }

      // If we executed tools, get a follow-up response from OpenAI
      if (toolResults.length > 0) {
        console.log('Executing follow-up OpenAI call with tool results');
        
        const toolMessages = toolResults.map(tr => ({
          role: 'tool',
          content: JSON.stringify(tr.result),
          tool_call_id: tr.toolCall.id
        }));

        try {
          const followUpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-5-2025-08-07',
              messages: [
                ...messages,
                {
                  role: 'assistant',
                  content: assistantMessage.content,
                  tool_calls: assistantMessage.tool_calls
                },
                ...toolMessages
              ],
              max_completion_tokens: 1000,
            }),
          });

          const followUpData = await followUpResponse.json();
          console.log('Follow-up OpenAI response status:', followUpResponse.status);
          console.log('Follow-up OpenAI response data:', JSON.stringify(followUpData));
          
          if (followUpResponse.ok && followUpData.choices?.[0]?.message?.content) {
            finalResponse = followUpData.choices[0].message.content;
            console.log('Successfully got follow-up response:', finalResponse);
          } else {
            console.error('Follow-up OpenAI call failed or returned no content');
            // Provide a fallback response
            if (toolResults.some(tr => tr.toolCall.function.name === 'emails_search')) {
              const emailResults = toolResults.find(tr => tr.toolCall.function.name === 'emails_search');
              if (emailResults?.result?.conversations?.length > 0) {
                finalResponse = `I found ${emailResults.result.conversations.length} email(s) from Michelle. Here's what she was asking:\n\n` +
                  emailResults.result.conversations.map(email => 
                    `**${email.subject}** (${new Date(email.date).toLocaleDateString()})\n${email.snippet || email.content?.substring(0, 200)}...`
                  ).join('\n\n');
              } else {
                finalResponse = "I searched for emails from Michelle but couldn't find any in your cached emails. You may need to refresh your mailbox first.";
              }
            }
          }
        } catch (followUpError) {
          console.error('Follow-up OpenAI call error:', followUpError);
          finalResponse = "I found some results but had trouble generating a response. Please try asking again.";
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

    if (assistantMessageError) throw assistantMessageError;

    return new Response(JSON.stringify({
      sessionId: session.id,
      message: finalResponse,
      toolResults,
      success: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Assistant function error details:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});