
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: Array<any>;
    body?: { data?: string };
  };
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
}

// Refresh Google OAuth token
async function refreshGoogleToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

// Call Gmail API directly
async function callGmailApi(accessToken: string, endpoint: string, params?: URLSearchParams) {
  const url = `https://gmail.googleapis.com/gmail/v1${endpoint}${params ? `?${params}` : ''}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }
    throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Get email content from message
function extractEmailContent(message: GmailMessage): string {
  const { payload } = message;
  
  // Try to get text from body
  if (payload.body?.data) {
    try {
      return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    } catch (e) {
      console.warn('Failed to decode body data:', e);
    }
  }
  
  // Try to find text/plain or text/html in parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        try {
          return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } catch (e) {
          console.warn('Failed to decode part data:', e);
        }
      }
    }
    
    // Fallback to HTML if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        try {
          return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } catch (e) {
          console.warn('Failed to decode HTML part data:', e);
        }
      }
    }
  }
  
  return message.snippet || '';
}

// Get header value by name
function getHeaderValue(headers: Array<{ name: string; value: string }>, name: string): string {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

// Parse email address from header
function parseEmailAddress(emailStr: string): { email: string; name: string } {
  if (!emailStr) return { email: '', name: '' };
  
  const match = emailStr.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/"/g, '').trim(),
      email: match[2].trim()
    };
  }
  
  // Just an email address
  return {
    email: emailStr.trim(),
    name: ''
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Auto-cache emails job started');

    // Get all users with active Gmail connections
    const { data: connections, error: connectionsError } = await supabase
      .from('gmail_connections')
      .select('user_id, access_token, refresh_token, email_address')
      .eq('is_active', true);

    if (connectionsError) {
      throw connectionsError;
    }

    console.log(`Found ${connections?.length || 0} active Gmail connections`);

    for (const connection of connections || []) {
      try {
        console.log(`Caching emails for user: ${connection.user_id}`);

        let currentAccessToken = connection.access_token;

        // Step 1: Get list of recent messages
        const params = new URLSearchParams({
          q: 'in:inbox',
          maxResults: '100'
        });

        let messagesListResponse: GmailListResponse;
        
        try {
          messagesListResponse = await callGmailApi(currentAccessToken, '/users/me/messages', params);
        } catch (error) {
          if ((error as any)?.message === 'UNAUTHORIZED' && connection.refresh_token) {
            console.log(`Access token expired for user ${connection.user_id}, refreshing...`);
            
            try {
              currentAccessToken = await refreshGoogleToken(connection.refresh_token);
              
              // Update the stored access token
              await supabase
                .from('gmail_connections')
                .update({ access_token: currentAccessToken })
                .eq('user_id', connection.user_id);

              console.log(`Token refreshed for user ${connection.user_id}`);
              
              // Retry the API call
              messagesListResponse = await callGmailApi(currentAccessToken, '/users/me/messages', params);
            } catch (refreshError) {
              console.error(`Failed to refresh token for user ${connection.user_id}:`, refreshError);
              
              // Mark connection as inactive
              await supabase
                .from('gmail_connections')
                .update({ 
                  is_active: false,
                  last_error: `Token refresh failed: ${(refreshError as Error)?.message || 'Unknown error'}`
                })
                .eq('user_id', connection.user_id);
              
              continue;
            }
          } else {
            throw error;
          }
        }

        if (!messagesListResponse.messages || messagesListResponse.messages.length === 0) {
          console.log(`No messages found for user ${connection.user_id}`);
          continue;
        }

        console.log(`Found ${messagesListResponse.messages.length} messages for user ${connection.user_id}`);

        // Step 2: Get full message details for each message
        const emailsToCache = [];
        
        for (const messageRef of messagesListResponse.messages) {
          try {
            const fullMessage: GmailMessage = await callGmailApi(
              currentAccessToken, 
              `/users/me/messages/${messageRef.id}`
            );

            const headers = fullMessage.payload.headers;
            const subject = getHeaderValue(headers, 'Subject');
            const fromHeader = getHeaderValue(headers, 'From');
            const toHeader = getHeaderValue(headers, 'To');
            const dateHeader = getHeaderValue(headers, 'Date');
            
            const sender = parseEmailAddress(fromHeader);
            const recipient = parseEmailAddress(toHeader);
            
            // Parse date
            let parsedDate = null;
            if (dateHeader) {
              try {
                parsedDate = new Date(dateHeader).toISOString();
              } catch (error) {
                console.error('Failed to parse date:', dateHeader, error);
                parsedDate = new Date().toISOString();
              }
            }

            const content = extractEmailContent(fullMessage);

            emailsToCache.push({
              user_id: connection.user_id,
              gmail_message_id: fullMessage.id,
              gmail_thread_id: fullMessage.threadId,
              subject: subject,
              sender_email: sender.email,
              sender_name: sender.name,
              recipient_email: recipient.email,
              recipient_name: recipient.name,
              content: content,
              snippet: fullMessage.snippet,
              date_sent: parsedDate,
              is_unread: false, // We'll assume read for now - could enhance later
              has_attachments: false, // Could enhance to detect attachments
              attachment_info: null,
              email_type: 'inbox'
            });

          } catch (error) {
            console.error(`Failed to get message ${messageRef.id}:`, error);
            // Continue with other messages
          }
        }

        if (emailsToCache.length > 0) {
          // Upsert emails to handle duplicates
          const { error: upsertError } = await supabase
            .from('cached_emails')
            .upsert(emailsToCache, { 
              onConflict: 'user_id,gmail_message_id',
              ignoreDuplicates: false 
            });

          if (upsertError) {
            console.error(`Error caching emails for user ${connection.user_id}:`, upsertError);
          } else {
            console.log(`Successfully cached ${emailsToCache.length} emails for user ${connection.user_id}`);
            
            // Update last sync timestamp
            await supabase
              .from('gmail_connections')
              .update({ last_email_sync_at: new Date().toISOString() })
              .eq('user_id', connection.user_id);
          }
        }

      } catch (error) {
        console.error(`Error processing user ${connection.user_id}:`, error);
        
        // Update connection with error info
        await supabase
          .from('gmail_connections')
          .update({ 
            last_error: (error as Error)?.message || 'Unknown error'
          })
          .eq('user_id', connection.user_id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Auto-cache job completed',
      processedUsers: connections?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Auto-cache emails function error:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error)?.message || 'Unknown error',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
