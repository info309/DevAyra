import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  action: 'list' | 'get' | 'send' | 'draft';
  userId: string;
  messageId?: string;
  to?: string;
  subject?: string;
  body?: string;
  maxResults?: number;
  pageToken?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Gmail API request received');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, userId, messageId, to, subject, body, maxResults = 10, pageToken }: EmailRequest = await req.json();

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Get user's Gmail connection
    const { data: connections, error: connectionError } = await supabaseClient
      .from('gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1);

    if (connectionError) {
      throw connectionError;
    }

    if (!connections || connections.length === 0) {
      throw new Error('No active Gmail connection found');
    }

    const connection = connections[0];
    let accessToken = connection.access_token;

    // Refresh token if needed
    const refreshTokenIfNeeded = async () => {
      const testResponse = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!testResponse.ok) {
        console.log('Token expired, refreshing...');
        
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
            client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
            refresh_token: connection.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        if (!refreshResponse.ok) {
          throw new Error('Failed to refresh token');
        }

        const newTokens = await refreshResponse.json();
        accessToken = newTokens.access_token;

        // Update the database with the new token
        await supabaseClient
          .from('gmail_connections')
          .update({ access_token: accessToken })
          .eq('id', connection.id);
      }
    };

    await refreshTokenIfNeeded();

    switch (action) {
      case 'list': {
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${pageToken ? `&pageToken=${pageToken}` : ''}`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }

        const messages = await response.json();
        
        // Get detailed info for each message
        const detailedMessages = await Promise.all(
          (messages.messages || []).map(async (message: any) => {
            const messageResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
              }
            );
            
            if (messageResponse.ok) {
              const messageData = await messageResponse.json();
              const headers = messageData.payload?.headers || [];
              
              return {
                id: messageData.id,
                threadId: messageData.threadId,
                snippet: messageData.snippet,
                subject: headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject',
                from: headers.find((h: any) => h.name === 'From')?.value || 'Unknown',
                date: headers.find((h: any) => h.name === 'Date')?.value || '',
                unread: messageData.labelIds?.includes('UNREAD') || false,
              };
            }
            return null;
          })
        );

        return new Response(JSON.stringify({
          messages: detailedMessages.filter(Boolean),
          nextPageToken: messages.nextPageToken,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'get': {
        if (!messageId) {
          throw new Error('Message ID is required');
        }

        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch message');
        }

        const message = await response.json();
        
        // Extract email content
        const getTextContent = (part: any): string => {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }
          if (part.mimeType === 'text/html' && part.body?.data) {
            return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }
          if (part.parts) {
            return part.parts.map(getTextContent).join('');
          }
          return '';
        };

        const headers = message.payload?.headers || [];
        const content = getTextContent(message.payload);

        const emailData = {
          id: message.id,
          threadId: message.threadId,
          subject: headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject',
          from: headers.find((h: any) => h.name === 'From')?.value || 'Unknown',
          to: headers.find((h: any) => h.name === 'To')?.value || '',
          date: headers.find((h: any) => h.name === 'Date')?.value || '',
          content: content,
          unread: message.labelIds?.includes('UNREAD') || false,
        };

        return new Response(JSON.stringify(emailData), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'send': {
        if (!to || !subject || !body) {
          throw new Error('To, subject, and body are required for sending emails');
        }

        const rawMessage = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/html; charset=utf-8',
          '',
          body,
        ].join('\n');

        const encodedMessage = btoa(rawMessage).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            raw: encodedMessage,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to send email');
        }

        const result = await response.json();
        return new Response(JSON.stringify({ success: true, messageId: result.id }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'draft': {
        if (!to || !subject || !body) {
          throw new Error('To, subject, and body are required for creating drafts');
        }

        const rawMessage = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/html; charset=utf-8',
          '',
          body,
        ].join('\n');

        const encodedMessage = btoa(rawMessage).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              raw: encodedMessage,
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create draft');
        }

        const result = await response.json();
        return new Response(JSON.stringify({ success: true, draftId: result.id }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      default:
        throw new Error('Invalid action');
    }

  } catch (error: any) {
    console.error('Error in gmail-api function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);