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

    console.log('Assistant request:', { userId: user.id, sessionId, message: message.substring(0, 100) });

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
        content: `You are Ayra, a helpful AI assistant integrated with the user's Gmail and documents. You can:

1. Search and read emails (inbox/sent/all)
2. Draft and send emails (requires confirmation)
3. List and search documents
4. Answer questions about email content and documents

Available tools:
- emails.list: Get recent emails with optional query/label filter
- emails.search: Search emails by keywords  
- emails.read: Get full email content by message ID
- emails.send: Draft/send emails (always ask for confirmation)
- documents.list: List user's documents with optional search
- documents.search: Search documents by name/content

Be helpful, concise, and always confirm before sending emails.`
      },
      ...(history || []).map(msg => ({
        role: msg.role,
        content: msg.content || '',
        ...(msg.tool_name && msg.tool_result ? {
          tool_calls: [{
            id: `call_${msg.id}`,
            type: 'function',
            function: {
              name: msg.tool_name,
              arguments: JSON.stringify(msg.tool_args || {})
            }
          }],
          tool_call_id: `call_${msg.id}`,
          name: msg.tool_name,
          content: JSON.stringify(msg.tool_result)
        } : {})
      }))
    ];

    // Define available tools
    const tools = [
      {
        type: 'function',
        function: {
          name: 'emails.list',
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
          name: 'emails.search',
          description: 'Search emails by keywords',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search keywords' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'emails.read',
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
          name: 'emails.send',
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
          name: 'documents.list',
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
          name: 'documents.search',
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

    // Execute tool calls if present
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const toolCall of assistantMessage.tool_calls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          let result;

          console.log('Executing tool:', toolCall.function.name, args);

          switch (toolCall.function.name) {
            case 'emails.list':
            case 'emails.search':
            case 'emails.read':
            case 'emails.send':
              // Call existing gmail-api function
              const { data: gmailResult, error: gmailError } = await supabase.functions.invoke('gmail-api', {
                body: {
                  action: toolCall.function.name.replace('emails.', ''),
                  ...args
                },
                headers: {
                  Authorization: `Bearer ${token}`,
                }
              });
              
              if (gmailError) throw gmailError;
              result = gmailResult;
              break;

            case 'documents.list':
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

            case 'documents.search':
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
    }

    // Save assistant response
    const { error: assistantMessageError } = await supabase
      .from('assistant_messages')
      .insert({
        session_id: session.id,
        user_id: user.id,
        role: 'assistant',
        content: assistantMessage.content || ''
      });

    if (assistantMessageError) throw assistantMessageError;

    return new Response(JSON.stringify({
      sessionId: session.id,
      message: assistantMessage.content || '',
      toolResults,
      success: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Assistant function error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});