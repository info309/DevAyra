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
        
        // Extract email content and attachments with proper decoding
        const getEmailParts = (part: any): { content: string; attachments: any[] } => {
          let htmlContent = '';
          let textContent = '';
          let attachments: any[] = [];

          const processPart = (p: any) => {
            // Check if this part has an attachment
            if (p.filename && p.filename.length > 0 && p.body?.attachmentId) {
              attachments.push({
                filename: p.filename,
                mimeType: p.mimeType,
                size: p.body.size,
                attachmentId: p.body.attachmentId
              });
            }
            // Extract HTML content (preferred)
            else if (p.mimeType === 'text/html' && p.body?.data) {
              const rawContent = atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/'));
              htmlContent += decodeQuotedPrintable(rawContent);
            }
            // Extract plain text content (fallback)
            else if (p.mimeType === 'text/plain' && p.body?.data) {
              const rawContent = atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/'));
              textContent += decodeQuotedPrintable(rawContent);
            }
            // Process nested parts
            else if (p.parts) {
              p.parts.forEach(processPart);
            }
          };

          // Helper function to decode quoted-printable encoding
          const decodeQuotedPrintable = (str: string): string => {
            return str
              // Decode =XX hex sequences
              .replace(/=([0-9A-F]{2})/gi, (match, hex) => {
                return String.fromCharCode(parseInt(hex, 16));
              })
              // Remove soft line breaks (=\r\n or =\n)
              .replace(/=\r?\n/g, '')
              // Decode common UTF-8 sequences
              .replace(/=C2=A0/g, ' ') // Non-breaking space
              .replace(/=E2=80=93/g, '–') // En dash
              .replace(/=E2=80=94/g, '—') // Em dash
              .replace(/=E2=80=99/g, "'") // Right single quotation mark
              .replace(/=E2=80=9C/g, '"') // Left double quotation mark
              .replace(/=E2=80=9D/g, '"') // Right double quotation mark
              .replace(/=E2=80=A6/g, '…') // Horizontal ellipsis
              .replace(/=3D/g, '=') // Equals sign
              .replace(/=20/g, ' '); // Space
          };

          processPart(part);
          
          // Prefer HTML content, fallback to text, convert text to HTML if needed
          let finalContent = htmlContent || textContent;
          
          if (!htmlContent && textContent) {
            // Convert plain text to HTML
            finalContent = textContent
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\n/g, '<br>');
          }
          
          // Clean up malformed HTML and improve readability
          if (finalContent) {
            finalContent = cleanHtmlContent(finalContent);
          }
          
          return { content: finalContent, attachments };
        };

        // Helper function to clean HTML content
        const cleanHtmlContent = (html: string): string => {
          let cleaned = html;
          
          // Remove DOCTYPE and XML declarations
          cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
          cleaned = cleaned.replace(/<\?xml[^>]*\?>/gi, '');
          cleaned = cleaned.replace(/xmlns[^=]*="[^"]*"/gi, '');
          
          // Remove weird spacing characters that appear in emails
          cleaned = cleaned.replace(/âÍ/g, '');
          cleaned = cleaned.replace(/Â­/g, '');
          cleaned = cleaned.replace(/â\s/g, '');
          
          // Fix broken image tags - convert malformed img syntax to proper format
          cleaned = cleaned.replace(/([^>])https:\/\/[^"]*\.(png|jpg|jpeg|gif|webp)"[^>]*>/gi, (match, before, ext) => {
            const urlMatch = match.match(/https:\/\/[^"]*\.(png|jpg|jpeg|gif|webp)/i);
            if (urlMatch) {
              return `${before}<img src="${urlMatch[0]}" style="max-width: 100%; height: auto;" alt="Image">`;
            }
            return before;
          });
          
          // Fix broken link tags - ensure proper href attributes
          cleaned = cleaned.replace(/([^>])https:\/\/[^"]*" target="_blank"/gi, (match, before) => {
            const urlMatch = match.match(/https:\/\/[^"]*/);
            if (urlMatch) {
              return `${before}<a href="${urlMatch[0]}" target="_blank" rel="noopener noreferrer">`;
            }
            return before;
          });
          
          // Clean up malformed image references
          cleaned = cleaned.replace(/(\w+)https:\/\/[^"]*\.(png|jpg|jpeg|gif|webp)">/gi, (match, text, ext) => {
            const urlMatch = match.match(/https:\/\/[^"]*\.(png|jpg|jpeg|gif|webp)/i);
            if (urlMatch) {
              return `<div><img src="${urlMatch[0]}" alt="${text}" style="max-width: 100%; height: auto;"><p>${text}</p></div>`;
            }
            return text;
          });
          
          // Remove tracking pixels and 1x1 images
          cleaned = cleaned.replace(/<img[^>]*width="1"[^>]*height="1"[^>]*>/gi, '');
          cleaned = cleaned.replace(/<img[^>]*height="1"[^>]*width="1"[^>]*>/gi, '');
          
          // Fix standalone URLs that should be links
          cleaned = cleaned.replace(/([^">])(https?:\/\/[^\s<>"]+)/gi, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
          
          // Clean up excessive whitespace and broken formatting
          cleaned = cleaned.replace(/\s+/g, ' ');
          cleaned = cleaned.replace(/>\s+</g, '><');
          cleaned = cleaned.replace(/â+/g, '');
          
          // Wrap in a container for better styling
          cleaned = `<div style="max-width: 100%; word-wrap: break-word; font-family: Arial, sans-serif; line-height: 1.4;">${cleaned}</div>`;
          
          return cleaned.trim();
        };

        const headers = message.payload?.headers || [];
        const { content, attachments } = getEmailParts(message.payload);

        const emailData = {
          id: message.id,
          threadId: message.threadId,
          subject: headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject',
          from: headers.find((h: any) => h.name === 'From')?.value || 'Unknown',
          to: headers.find((h: any) => h.name === 'To')?.value || '',
          date: headers.find((h: any) => h.name === 'Date')?.value || '',
          content: content,
          attachments: attachments,
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