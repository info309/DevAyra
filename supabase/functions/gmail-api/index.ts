import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GmailRequest {
  action: 'list' | 'get' | 'send' | 'search' | 'get-attachment';
  userId: string;
  messageId?: string;
  attachmentId?: string;
  maxResults?: number;
  pageToken?: string;
  query?: string; // Gmail search query
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

    const { action, userId, messageId, attachmentId, maxResults = 50, pageToken, query, to, subject, body }: GmailRequest = await req.json();
    
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

    // Helper functions for advanced decoding
    const base64UrlDecode = (str: string): Uint8Array => {
      try {
        // Convert Base64URL to Base64
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        
        // Add padding if necessary
        while (base64.length % 4) {
          base64 += '=';
        }
        
        // Decode to bytes
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      } catch (error) {
        console.error('Base64URL decode error:', error);
        return new TextEncoder().encode(str);
      }
    };

    const decodeQuotedPrintable = (str: string): string => {
      if (!str) return '';
      
      try {
        let decoded = str;
        
        // Decode =XX hex sequences
        decoded = decoded.replace(/=([0-9A-F]{2})/gi, (match, hex) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
        
        // Remove soft line breaks (= at end of line)
        decoded = decoded.replace(/=[\r\n]+/g, '');
        decoded = decoded.replace(/=$/gm, '');
        
        return decoded;
      } catch (error) {
        console.error('Quoted-printable decode error:', error);
        return str;
      }
    };

    const detectAndDecodeContent = (bodyData: string, headers: any[]): string => {
      if (!bodyData) return '';
      
      // Get Content-Transfer-Encoding header
      const encodingHeader = headers.find(
        (h: any) => h.name.toLowerCase() === 'content-transfer-encoding'
      );
      const encoding = encodingHeader?.value?.toLowerCase() || 'base64';
      
      try {
        // Step 1: Always decode from Base64URL first (Gmail format)
        const decodedBytes = base64UrlDecode(bodyData);
        let decodedString = new TextDecoder('utf-8').decode(decodedBytes);
        
        // Step 2: Apply additional decoding based on Content-Transfer-Encoding
        if (encoding === 'quoted-printable') {
          decodedString = decodeQuotedPrintable(decodedString);
        } else if (encoding === '7bit' || encoding === '8bit') {
          // Already decoded, no additional processing needed
        }
        
        // Step 3: Fix common encoding issues
        decodedString = fixCommonEncodingIssues(decodedString);
        
        return decodedString;
      } catch (error) {
        console.error('Content decode error:', error);
        // Fallback to simple base64url decode
        try {
          const fallbackBytes = base64UrlDecode(bodyData);
          return new TextDecoder('utf-8').decode(fallbackBytes);
        } catch (fallbackError) {
          console.error('Fallback decode error:', fallbackError);
          return bodyData;
        }
      }
    };

    const fixCommonEncodingIssues = (str: string): string => {
      if (!str) return '';
      
      return str
        // Fix common UTF-8 encoding issues
        .replace(/â€™/g, "'") // Right single quotation mark
        .replace(/â€œ/g, '"') // Left double quotation mark  
        .replace(/â€/g, '"') // Right double quotation mark
        .replace(/â€¦/g, '…') // Horizontal ellipsis
        .replace(/â€"/g, '–') // En dash
        .replace(/â€"/g, '—') // Em dash
        .replace(/Â /g, ' ') // Non-breaking space issues
        .replace(/Â­/g, '') // Soft hyphen
        .replace(/â\s/g, '') // Orphaned â characters
        // Fix other common issues
        .replace(/=\r?\n/g, '') // Remove quoted-printable line breaks
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\r/g, '\n'); // Convert remaining \r to \n
    };

    const processEmailContent = (payload: any): { content: string; attachments: ProcessedAttachment[] } => {
      let htmlContent = '';
      let textContent = '';
      const attachments: ProcessedAttachment[] = [];

      const processPart = (part: any) => {
        const { mimeType, filename, body, parts, headers = [] } = part;

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

        // Handle inline images
        if (mimeType && mimeType.startsWith('image/') && body?.attachmentId) {
          attachments.push({
            filename: filename || `inline-image.${mimeType.split('/')[1]}`,
            mimeType: mimeType,
            size: body.size || 0,
            attachmentId: body.attachmentId
          });
          return;
        }

        // Handle content parts
        if (body?.data) {
          const decodedContent = detectAndDecodeContent(body.data, headers);

          if (mimeType === 'text/html') {
            htmlContent += decodedContent;
          } else if (mimeType === 'text/plain') {
            textContent += decodedContent;
          }
        }

        // Process nested parts recursively
        if (parts && Array.isArray(parts)) {
          parts.forEach(processPart);
        }
      };

      processPart(payload);

      // Prefer HTML, fallback to plain text
      let finalContent = htmlContent || textContent;
      
      // Convert plain text to HTML if no HTML version exists
      if (!htmlContent && textContent) {
        finalContent = convertPlainTextToHtml(textContent);
      }

      // Clean and enhance HTML
      if (finalContent) {
        finalContent = cleanAndEnhanceHtml(finalContent);
      }

      return { content: finalContent, attachments };
    };

    const convertPlainTextToHtml = (text: string): string => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>')
        // Convert URLs to links
        .replace(/(https?:\/\/[^\s<>"']+)/gi, (url) => {
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        });
    };

    const cleanAndEnhanceHtml = (html: string): string => {
      if (!html) return '';
      
      let cleaned = html;
      
      // Remove DOCTYPE and XML declarations
      cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
      cleaned = cleaned.replace(/<\?xml[^>]*\?>/gi, '');
      cleaned = cleaned.replace(/xmlns[^=]*="[^"]*"/gi, '');
      
      // Fix broken HTML tags that are split across lines
      cleaned = cleaned.replace(/(<[^>]+)\s*\n\s*/g, '$1 ');
      cleaned = cleaned.replace(/\s*\n\s*([^<>]*>)/g, ' $1');
      
      // Fix incomplete link tags and malformed anchor tags
      cleaned = cleaned.replace(/<a\s+href=\s*([^>\s]*)\s*([^>]*)>/gi, (match, href, rest) => {
        // Clean up the href if it's malformed
        let cleanHref = href.replace(/["']/g, '');
        if (!cleanHref.startsWith('http')) {
          cleanHref = '';
        }
        
        if (cleanHref) {
          return `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer"${rest ? ' ' + rest : ''}>`;
        } else {
          return ''; // Remove broken link tags
        }
      });
      
      // Fix broken image tags with very long tracking URLs
      cleaned = cleaned.replace(/(<img[^>]*src=["']?)([^"'>\s]+)([^>]*>)/gi, (match, prefix, src, suffix) => {
        // Handle tracking URLs and proxy services
        let cleanSrc = src;
        
        // Skip obviously broken or too long URLs
        if (src.length > 500 || src.includes('api.mimecast.com') || src.includes('tracking')) {
          return '<!-- Image removed: tracking URL -->';
        }
        
        // Ensure proper URL format
        if (cleanSrc && (cleanSrc.startsWith('http') || cleanSrc.startsWith('data:'))) {
          return `${prefix}${cleanSrc}" style="max-width: 100%; height: auto; border-radius: 4px;"${suffix}`;
        } else {
          return '<!-- Image removed: invalid URL -->';
        }
      });
      
      // Remove malformed or incomplete tags
      cleaned = cleaned.replace(/<[^>]*$/g, ''); // Remove incomplete tags at end
      cleaned = cleaned.replace(/^[^<]*>/g, ''); // Remove incomplete tags at start
      cleaned = cleaned.replace(/<\s*\/?\s*>/g, ''); // Remove empty tags
      
      // Fix broken link structures - convert malformed links to plain text
      cleaned = cleaned.replace(/(<a href=)([^>]*$)/gi, (match, prefix, rest) => {
        return rest; // Just show the URL as text if the tag is broken
      });
      
      // Remove tracking pixels and 1x1 images
      cleaned = cleaned.replace(/<img[^>]*width=["']?1["']?[^>]*height=["']?1["']?[^>]*>/gi, '');
      cleaned = cleaned.replace(/<img[^>]*height=["']?1["']?[^>]*width=["']?1["']?[^>]*>/gi, '');
      
      // Enhance remaining images with proper attributes
      cleaned = cleaned.replace(/<img([^>]*?)>/gi, (match, attrs) => {
        if (!attrs.includes('style=')) {
          attrs += ' style="max-width: 100%; height: auto; display: block; border-radius: 4px; margin: 8px 0;"';
        }
        if (!attrs.includes('loading=')) {
          attrs += ' loading="lazy"';
        }
        if (!attrs.includes('alt=')) {
          attrs += ' alt="Email Image"';
        }
        return `<img${attrs}>`;
      });
      
      // Enhance links with proper attributes and fix broken ones
      cleaned = cleaned.replace(/<a([^>]*?)>/gi, (match, attrs) => {
        if (!attrs.includes('href=')) {
          return ''; // Remove links without href
        }
        
        if (!attrs.includes('target=')) {
          attrs += ' target="_blank"';
        }
        if (!attrs.includes('rel=')) {
          attrs += ' rel="noopener noreferrer"';
        }
        if (!attrs.includes('style=')) {
          attrs += ' style="color: hsl(var(--primary)); text-decoration: underline;"';
        }
        return `<a${attrs}>`;
      });
      
      // Convert standalone URLs to links (but be careful not to break existing HTML)
      cleaned = cleaned.replace(
        /(?<!href=["']|src=["'])(?<!>)(https?:\/\/[^\s<>"'\)]{10,200})(?![^<]*>)/gi,
        '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: hsl(var(--primary)); text-decoration: underline;">$1</a>'
      );
      
      // Clean up excessive whitespace and broken formatting
      cleaned = cleaned.replace(/\s+/g, ' ');
      cleaned = cleaned.replace(/>\s+</g, '><');
      cleaned = cleaned.replace(/\s+>/g, '>');
      cleaned = cleaned.replace(/<\s+/g, '<');
      
      // Remove common email artifacts
      cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, ''); // Remove HTML comments
      cleaned = cleaned.replace(/&nbsp;{3,}/g, ' '); // Replace multiple nbsp with single space
      
      // Wrap in styled container with better email-specific CSS
      cleaned = `
        <div style="
          max-width: 100%; 
          word-wrap: break-word; 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          line-height: 1.6; 
          color: hsl(var(--foreground));
          overflow-wrap: break-word;
          word-break: break-word;
        ">
          ${cleaned}
        </div>
      `;
      
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
      case 'search':
      case 'list': {
        // Build Gmail search query
        let searchQuery = '';
        if (action === 'search' && query) {
          searchQuery = encodeURIComponent(query);
        }
        
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${pageToken ? `&pageToken=${pageToken}` : ''}${searchQuery ? `&q=${searchQuery}` : ''}`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }

        const messages = await response.json();
        
        // Get detailed info for each message including content for search
        const detailedMessages = await Promise.all(
          (messages.messages || []).map(async (message: any) => {
            const messageResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
              }
            );
            
            if (messageResponse.ok) {
              const messageData = await messageResponse.json();
              const headers = messageData.payload?.headers || [];
              
              // Process content and attachments for search
              const { content, attachments } = processEmailContent(messageData.payload);
              
              return {
                id: messageData.id,
                threadId: messageData.threadId,
                snippet: messageData.snippet,
                subject: headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject',
                from: headers.find((h: any) => h.name === 'From')?.value || 'Unknown',
                to: headers.find((h: any) => h.name === 'To')?.value || '',
                date: headers.find((h: any) => h.name === 'Date')?.value || '',
                unread: messageData.labelIds?.includes('UNREAD') || false,
                content: content,
                attachments: attachments.map(att => ({
                  filename: att.filename,
                  mimeType: att.mimeType,
                  size: att.size
                }))
              };
            }
            return null;
          })
        );

        const validMessages = detailedMessages.filter(Boolean);

        return new Response(JSON.stringify({
          messages: validMessages,
          nextPageToken: messages.nextPageToken,
          totalResults: messages.resultSizeEstimate || validMessages.length
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

      case 'get-attachment': {
        if (!messageId || !attachmentId) {
          throw new Error('Message ID and Attachment ID are required');
        }

        // First check if attachment is already stored
        const storagePath = `${userId}/attachments/${messageId}/${attachmentId}`;
        
        const { data: existingFile, error: storageError } = await supabaseClient.storage
          .from('documents')
          .list(`${userId}/attachments/${messageId}`, {
            search: attachmentId
          });

        if (!storageError && existingFile && existingFile.length > 0) {
          // File already exists, return signed URL
          const { data: urlData, error: urlError } = await supabaseClient.storage
            .from('documents')
            .createSignedUrl(`${userId}/attachments/${messageId}/${existingFile[0].name}`, 3600);

          if (!urlError && urlData) {
            return new Response(JSON.stringify({
              storageUrl: urlData.signedUrl,
              fromStorage: true
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }
        }

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
          const error = await attachmentResponse.text();
          console.error('Gmail API attachment error:', error);
          throw new Error(`Failed to download attachment: ${attachmentResponse.status}`);
        }

        const attachmentData = await attachmentResponse.json();
        
        if (!attachmentData.data) {
          throw new Error('No attachment data received from Gmail API');
        }

        // Convert base64 to bytes for storage
        const byteCharacters = atob(attachmentData.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const fileBytes = new Uint8Array(byteNumbers);

        // Store in documents bucket
        const fileName = `${attachmentId}_${Date.now()}`;
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('documents')
          .upload(`${userId}/attachments/${messageId}/${fileName}`, fileBytes, {
            contentType: 'application/octet-stream',
            upsert: false
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          // Fallback to returning base64 data
          return new Response(JSON.stringify({
            attachmentData: attachmentData.data,
            size: attachmentData.size || 0,
            fromStorage: false
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        // Generate signed URL for the stored file
        const { data: urlData, error: urlError } = await supabaseClient.storage
          .from('documents')
          .createSignedUrl(`${userId}/attachments/${messageId}/${fileName}`, 3600);

        if (urlError) {
          console.error('Signed URL error:', urlError);
          // Fallback to returning base64 data
          return new Response(JSON.stringify({
            attachmentData: attachmentData.data,
            size: attachmentData.size || 0,
            fromStorage: false
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        return new Response(JSON.stringify({
          storageUrl: urlData.signedUrl,
          size: attachmentData.size || 0,
          fromStorage: true
        }), {
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