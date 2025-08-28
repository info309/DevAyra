import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GmailRequest {
  action: 'list' | 'get' | 'send' | 'download-attachment';
  userId: string;
  messageId?: string;
  attachmentId?: string;
  maxResults?: number;
  pageToken?: string;
  to?: string;
  subject?: string;
  body?: string;
}

interface ProcessedAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  downloadUrl?: string;
}

interface ProcessedEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  content: string;
  attachments: ProcessedAttachment[];
  unread: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Gmail API request received');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, userId, messageId, attachmentId, maxResults = 10, pageToken, to, subject, body }: GmailRequest = await req.json();
    
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Get Gmail connection
    const { data: connections, error: connError } = await supabaseClient
      .from('gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1);

    if (connError) {
      throw connError;
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

        await supabaseClient
          .from('gmail_connections')
          .update({ access_token: accessToken })
          .eq('id', connection.id);
      }
    };

    await refreshTokenIfNeeded();

    // Helper functions for decoding
    const base64UrlDecode = (str: string): string => {
      try {
        // Convert Base64URL to Base64
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        
        // Add padding if necessary
        while (base64.length % 4) {
          base64 += '=';
        }
        
        return atob(base64);
      } catch (error) {
        console.error('Base64URL decode error:', error);
        return str;
      }
    };

    const decodeQuotedPrintable = (str: string): string => {
      if (!str) return '';
      
      try {
        return str
          // Decode =XX hex sequences
          .replace(/=([0-9A-F]{2})/gi, (match, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
          })
          // Remove soft line breaks
          .replace(/=\r?\n/g, '')
          // Clean up common artifacts
          .replace(/=3D/g, '=')
          .replace(/=20/g, ' ')
          .replace(/=\s*$/gm, '');
      } catch (error) {
        console.error('Quoted-printable decode error:', error);
        return str;
      }
    };

    const processEmailContent = (payload: any): { content: string; attachments: ProcessedAttachment[] } => {
      let htmlContent = '';
      let textContent = '';
      const attachments: ProcessedAttachment[] = [];

      const processPart = (part: any) => {
        const { mimeType, filename, body, parts } = part;

        // Handle attachments
        if (filename && filename.length > 0 && body?.attachmentId) {
          attachments.push({
            filename: filename,
            mimeType: mimeType || 'application/octet-stream',
            size: body.size || 0,
            attachmentId: body.attachmentId
          });
          return;
        }

        // Handle content parts
        if (body?.data) {
          const rawContent = base64UrlDecode(body.data);
          let decodedContent = rawContent;
          
          // Apply quoted-printable decoding if needed
          if (rawContent.includes('=20') || rawContent.includes('=3D') || rawContent.includes('=\n')) {
            decodedContent = decodeQuotedPrintable(rawContent);
          }

          if (mimeType === 'text/html') {
            htmlContent += decodedContent;
          } else if (mimeType === 'text/plain') {
            textContent += decodedContent;
          }
        }

        // Process nested parts
        if (parts && Array.isArray(parts)) {
          parts.forEach(processPart);
        }
      };

      processPart(payload);

      // Prefer HTML, fallback to plain text
      let finalContent = htmlContent || textContent;
      
      // Convert plain text to HTML if no HTML version exists
      if (!htmlContent && textContent) {
        finalContent = textContent
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')
          .replace(/\r/g, '');
      }

      // Clean and sanitize HTML
      if (finalContent) {
        finalContent = cleanHtmlContent(finalContent);
      }

      return { content: finalContent, attachments };
    };

    const cleanHtmlContent = (html: string): string => {
      if (!html) return '';
      
      let cleaned = html;
      
      // Remove DOCTYPE and XML declarations
      cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
      cleaned = cleaned.replace(/<\?xml[^>]*\?>/gi, '');
      cleaned = cleaned.replace(/xmlns[^=]*="[^"]*"/gi, '');
      
      // Remove tracking pixels
      cleaned = cleaned.replace(/<img[^>]*width=["']1["'][^>]*height=["']1["'][^>]*>/gi, '');
      cleaned = cleaned.replace(/<img[^>]*height=["']1["'][^>]*width=["']1["'][^>]*>/gi, '');
      
      // Fix malformed URLs and make links functional
      cleaned = cleaned.replace(/(https?:\/\/[^\s<>"']+)/gi, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      });
      
      // Ensure all existing links have proper attributes
      cleaned = cleaned.replace(/<a([^>]*href=["'][^"']*["'][^>]*)>/gi, (match, attrs) => {
        if (!attrs.includes('target=')) {
          attrs += ' target="_blank" rel="noopener noreferrer"';
        }
        return `<a${attrs}>`;
      });
      
      // Clean up whitespace and formatting artifacts
      cleaned = cleaned.replace(/\s+/g, ' ');
      cleaned = cleaned.replace(/>\s+</g, '><');
      
      // Wrap in container for consistent styling
      cleaned = `<div style="max-width: 100%; word-wrap: break-word; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #333;">${cleaned}</div>`;
      
      return cleaned.trim();
    };

    const downloadAndStoreAttachment = async (messageId: string, attachmentId: string, filename: string, userId: string): Promise<string> => {
      // Download attachment from Gmail
      const attachmentResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!attachmentResponse.ok) {
        throw new Error('Failed to download attachment');
      }

      const attachmentData = await attachmentResponse.json();
      const fileData = base64UrlDecode(attachmentData.data);
      
      // Convert to Uint8Array for upload
      const fileBytes = new Uint8Array(fileData.length);
      for (let i = 0; i < fileData.length; i++) {
        fileBytes[i] = fileData.charCodeAt(i);
      }

      // Generate unique filename with path
      const timestamp = Date.now();
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${userId}/${messageId}/${timestamp}_${sanitizedFilename}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('email-attachments')
        .upload(storagePath, fileBytes, {
          contentType: 'application/octet-stream',
          upsert: false
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Failed to store attachment: ${uploadError.message}`);
      }

      // Generate signed URL for download
      const { data: urlData, error: urlError } = await supabaseClient.storage
        .from('email-attachments')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (urlError) {
        console.error('Signed URL error:', urlError);
        throw new Error(`Failed to generate download URL: ${urlError.message}`);
      }

      return urlData.signedUrl;
    };

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
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata`,
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
        const headers = message.payload?.headers || [];
        
        // Process email content and attachments
        const { content, attachments } = processEmailContent(message.payload);
        
        // Download and store attachments, add download URLs
        const processedAttachments = await Promise.all(
          attachments.map(async (attachment) => {
            try {
              const downloadUrl = await downloadAndStoreAttachment(
                messageId,
                attachment.attachmentId,
                attachment.filename,
                userId
              );
              return { ...attachment, downloadUrl };
            } catch (error) {
              console.error(`Failed to process attachment ${attachment.filename}:`, error);
              return attachment; // Return without download URL if failed
            }
          })
        );

        const emailData: ProcessedEmail = {
          id: message.id,
          threadId: message.threadId,
          subject: headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject',
          from: headers.find((h: any) => h.name === 'From')?.value || 'Unknown',
          to: headers.find((h: any) => h.name === 'To')?.value || '',
          date: headers.find((h: any) => h.name === 'Date')?.value || '',
          content: content,
          attachments: processedAttachments,
          unread: message.labelIds?.includes('UNREAD') || false,
        };

        return new Response(JSON.stringify(emailData), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'send': {
        if (!to || !subject || !body) {
          throw new Error('To, subject, and body are required');
        }

        const email = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/html; charset=utf-8',
          '',
          body
        ].join('\n');

        const encodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            raw: encodedEmail
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

      default:
        return new Response('Invalid action', { status: 400, headers: corsHeaders });
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