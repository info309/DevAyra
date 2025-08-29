import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GmailRequest {
  action: 'getEmails' | 'sendEmail' | 'searchEmails' | 'markAsRead' | 'deleteThread' | 'deleteMessage' | 'saveDraft' | 'reply' | 'downloadAttachment';
  messageId?: string;
  attachmentId?: string;
  maxResults?: number;
  pageToken?: string;
  query?: string;
  to?: string;
  subject?: string;
  content?: string;
  threadId?: string;
  replyTo?: string;
  draftId?: string;
  attachments?: {
    filename: string;
    content: string;
    contentType: string;
    size: number;
  }[];
}

// Maximum content length for emails to prevent timeouts (500KB)
const MAX_EMAIL_CONTENT_LENGTH = 500000;

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
    console.log('Gmail API request received - markRead functionality enabled');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header is required');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      throw new Error('Invalid authentication token');
    }

    const userId = user.id;
    const { action, messageId, attachmentId, maxResults = 50, pageToken, query, to, subject, content, threadId, replyTo, draftId, attachments } = await req.json();
    
    if (!userId) {
      throw new Error('User ID not found in authentication context');
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
      console.log('Testing token validity...');
      const testResponse = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!testResponse.ok) {
        console.log('Token expired, refreshing...', { status: testResponse.status, statusText: testResponse.statusText });
        
        try {
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
            const errorText = await refreshResponse.text();
            console.error('Token refresh failed:', { 
              status: refreshResponse.status, 
              statusText: refreshResponse.statusText,
              error: errorText,
              connection_email: connection.email_address
            });
            
            // Mark connection as inactive for any refresh token failure
            await supabaseClient
              .from('gmail_connections')
              .update({ is_active: false })
              .eq('id', connection.id);
            
            throw new Error(`Gmail connection for ${connection.email_address} has expired and needs to be reconnected. Please disconnect and reconnect your Gmail account.`);
          }

          const newTokens = await refreshResponse.json();
          console.log('Token refreshed successfully for:', connection.email_address);
          accessToken = newTokens.access_token;

          const { error: updateError } = await supabaseClient
            .from('gmail_connections')
            .update({ 
              access_token: accessToken,
              updated_at: new Date().toISOString()
            })
            .eq('id', connection.id);

          if (updateError) {
            console.error('Failed to update access token in database:', updateError);
            throw new Error('Failed to update access token in database');
          }
          console.log('Access token updated in database for:', connection.email_address);
          
        } catch (refreshError) {
          console.error('Failed to refresh token for:', connection.email_address, refreshError);
          
          // Mark connection as inactive
          await supabaseClient
            .from('gmail_connections')
            .update({ is_active: false })
            .eq('id', connection.id);
          
          throw new Error(`Gmail connection for ${connection.email_address} has expired and needs to be reconnected. Please disconnect and reconnect your Gmail account.`);
        }
      } else {
        console.log('Token is valid for:', connection.email_address);
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

    const findTextPart = (parts: any[]): any => {
      for (const part of parts) {
        if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
          return part;
        }
        if (part.parts) {
          const found = findTextPart(part.parts);
          if (found) return found;
        }
      }
      return null;
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

      // Truncate content if too large to prevent timeouts
      if (finalContent && finalContent.length > MAX_EMAIL_CONTENT_LENGTH) {
        console.log(`Truncating email content from ${finalContent.length} to ${MAX_EMAIL_CONTENT_LENGTH} chars`);
        finalContent = finalContent.substring(0, MAX_EMAIL_CONTENT_LENGTH) + '\n\n<p style="color: #666; font-style: italic;">Email content truncated due to size...</p>';
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
          attrs += ' style="color: #2563eb; text-decoration: underline;"';
        }
        return `<a${attrs}>`;
      });
      
      // Convert standalone URLs to links (but be careful not to break existing HTML)
      cleaned = cleaned.replace(
        /(?<!href=["']|src=["'])(?<!>)(https?:\/\/[^\s<>"'\)]{10,200})(?![^<]*>)/gi,
        '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">$1</a>'
      );
      
      // Clean up excessive whitespace and broken formatting
      cleaned = cleaned.replace(/\s+/g, ' ');
      cleaned = cleaned.replace(/>\s+</g, '><');
      cleaned = cleaned.replace(/\s+>/g, '>');
      cleaned = cleaned.replace(/<\s+/g, '<');
      
      // Remove common email artifacts
      cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, ''); // Remove HTML comments
      cleaned = cleaned.replace(/&nbsp;{3,}/g, ' '); // Replace multiple nbsp with single space
      
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
      
      // fileData is already a Uint8Array, no need to convert
      const fileBytes = fileData;

      // Generate unique filename with path
      const timestamp = Date.now();
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${userId}/documents/${timestamp}_${sanitizedFilename}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('documents')
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
        .from('documents')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (urlError) {
        console.error('Signed URL error:', urlError);
        throw new Error(`Failed to generate download URL: ${urlError.message}`);
      }

      return urlData.signedUrl;
    };

    // Function to clean email subject prefixes
    const cleanSubjectPrefixes = (subject: string): string => {
      if (!subject) return subject;
      
      // Remove common reply/forward prefixes (case insensitive)
      // Handles: Re:, RE:, Fwd:, FWD:, Fw:, multiple Re: Re: chains
      return subject
        .replace(/^(\s*(re|fwd?|aw|sv|antw):\s*)+/gi, '')
        .trim();
    };

    switch (action) {
      case 'getEmails': {
        // Build Gmail search query with label filtering, always exclude trash
        let searchQuery = '';
        
        if (query && query.includes('in:sent')) {
          // Fetch sent emails only, excluding trash
          searchQuery = encodeURIComponent('in:sent -in:trash');
        } else if (query && query.includes('in:drafts')) {
          // Fetch drafts, excluding trash
          searchQuery = encodeURIComponent('in:drafts -in:trash');
        } else if (query) {
          // Custom search query, always exclude trash
          const customQuery = query.includes('-in:trash') ? query : `${query} -in:trash`;
          searchQuery = encodeURIComponent(customQuery);
        } else {
          // Default to inbox excluding sent and trash
          searchQuery = encodeURIComponent('in:inbox -in:sent -in:trash');
        }
        
        // Use threads endpoint for proper conversation grouping
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${maxResults}${pageToken ? `&pageToken=${pageToken}` : ''}&q=${searchQuery}`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch threads');
        }

        const threadsResponse = await response.json();
        
        // Get detailed thread info
        const conversations = await Promise.all(
          (threadsResponse.threads || []).map(async (thread: any) => {
            const threadResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=full`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
              }
            );
            
            if (threadResponse.ok) {
              const threadData = await threadResponse.json();
              const messages = threadData.messages || [];
              
              // Process all messages in the thread
              const processedEmails = await Promise.all(
                messages.map(async (messageData: any) => {
                  const headers = messageData.payload?.headers || [];
                  
                  // Process content and attachments
                  const { content, attachments } = processEmailContent(messageData.payload);
                  
                  // Process attachments with download URLs
                  const processedAttachments = await Promise.all(
                    attachments.map(async (attachment) => {
                      try {
                        const downloadUrl = await downloadAndStoreAttachment(
                          messageData.id,
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
                    attachments: processedAttachments
                  };
                })
              );

              // Get the latest email for conversation metadata
              const sortedEmails = processedEmails.sort((a, b) => 
                new Date(b.date).getTime() - new Date(a.date).getTime()
              );
              
              const latestEmail = sortedEmails[0];
              const unreadCount = processedEmails.filter(email => email.unread).length;
              
              // Get all unique participants
              const allParticipants = new Set();
              processedEmails.forEach(email => {
                if (email.from) allParticipants.add(email.from);
                if (email.to) allParticipants.add(email.to);
              });

              return {
                id: thread.id,
                subject: cleanSubjectPrefixes(latestEmail?.subject || 'No Subject'),
                emails: processedEmails,
                messageCount: processedEmails.length,
                lastDate: latestEmail?.date || '',
                unreadCount: unreadCount,
                participants: Array.from(allParticipants)
              };
            }
            return null;
          })
        );

        const validConversations = conversations.filter(Boolean);

        // Log threading information for debugging
        console.log('Threading debug info (using threads endpoint):', {
          totalThreads: threadsResponse.threads?.length || 0,
          validConversations: validConversations.length,
          threadsWithMultipleMessages: validConversations.filter(c => c.messageCount > 1).length,
          sampleConversations: validConversations.slice(0, 3).map(c => ({
            threadId: c.id,
            subject: c.subject,
            messageCount: c.messageCount,
            emailIds: c.emails.map((e: any) => e.id)
          })),
          queryType: query
        });

        return new Response(JSON.stringify({
          conversations: validConversations,
          nextPageToken: threadsResponse.nextPageToken,
          allEmailsLoaded: !threadsResponse.nextPageToken
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'searchEmails': {
        if (!query) {
          throw new Error('Search query is required');
        }

        // Always exclude trash from search results
        const searchQuery = query.includes('-in:trash') ? query : `${query} -in:trash`;
        const encodedSearchQuery = encodeURIComponent(searchQuery);
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${pageToken ? `&pageToken=${pageToken}` : ''}&q=${encodedSearchQuery}`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to search messages');
        }

        const messages = await response.json();
        
        // Process search results similar to getEmails
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
              
              const { content, attachments } = processEmailContent(messageData.payload);
              
              const processedAttachments = await Promise.all(
                attachments.map(async (attachment) => {
                  try {
                    const downloadUrl = await downloadAndStoreAttachment(
                      messageData.id,
                      attachment.attachmentId,
                      attachment.filename,
                      userId
                    );
                    return { ...attachment, downloadUrl };
                  } catch (error) {
                    console.error(`Failed to process attachment ${attachment.filename}:`, error);
                    return attachment;
                  }
                })
              );
              
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
                attachments: processedAttachments
              };
            }
            return null;
          })
        );

        const validMessages = detailedMessages.filter(Boolean);

        // Group messages into conversations for consistent UI
        const conversations = validMessages.reduce((acc: any, message: any) => {
          const existing = acc.find((conv: any) => conv.id === message.threadId);
          if (existing) {
            existing.emails.push(message);
            existing.messageCount++;
            existing.unreadCount += message.unread ? 1 : 0;
            if (new Date(message.date) > new Date(existing.lastDate)) {
              existing.lastDate = message.date;
            }
            // Update participants list
            const allParticipants = [...existing.participants, message.from, message.to].filter(Boolean);
            existing.participants = [...new Set(allParticipants)]; // Remove duplicates
          } else {
            acc.push({
              id: message.threadId,
              subject: message.subject,
              emails: [message],
              messageCount: 1,
              lastDate: message.date,
              unreadCount: message.unread ? 1 : 0,
              participants: [message.from, message.to].filter(Boolean)
            });
          }
          return acc;
        }, []);

        // Log threading information for debugging
        console.log('Threading debug info:', {
          totalMessages: validMessages.length,
          conversationCount: conversations.length,
          threadsWithMultipleMessages: conversations.filter(c => c.messageCount > 1).length,
          sampleConversations: conversations.slice(0, 3).map(c => ({
            threadId: c.id,
            subject: c.subject,
            messageCount: c.messageCount,
            emailIds: c.emails.map((e: any) => e.id)
          }))
        });

        return new Response(JSON.stringify({
          conversations: conversations,
          nextPageToken: messages.nextPageToken,
          allEmailsLoaded: !messages.nextPageToken
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'markAsRead': {
        if (threadId) {
          // Mark entire thread as read
          const response = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                removeLabelIds: ['UNREAD']
              })
            }
          );

          if (!response.ok) {
            throw new Error('Failed to mark thread as read');
          }

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        } else if (messageId) {
          // Mark individual message as read
          const response = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                removeLabelIds: ['UNREAD']
              })
            }
          );

          if (!response.ok) {
            throw new Error('Failed to mark message as read');
          }

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        } else {
          throw new Error('Either threadId or messageId is required');
        }
      }

      case 'sendEmail': {
        if (!to || !subject || !content) {
          throw new Error('To, subject, and content are required');
        }

        console.log('Sending email with attachments:', attachments ? attachments.length : 0);

        // Check if this is a reply (has threadId)
        const isReply = threadId && threadId.length > 0;
        
        let emailBody: string;

        if (attachments && attachments.length > 0) {
          console.log('Creating multipart email with', attachments.length, 'attachments');
          // Create multipart email with attachments
          const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          const headers: string[] = [
            `To: ${to}`,
            `Subject: ${subject}`,
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
          ];

          // Add threading headers if this is a reply
          if (isReply && replyTo) {
            headers.push(`In-Reply-To: <${replyTo}@gmail.com>`);
            headers.push(`References: <${replyTo}@gmail.com>`);
          }

          const parts: string[] = [];
          
          // Add email content part
          const htmlContent = content.replace(/\n/g, '<br>');
          parts.push([
            `--${boundary}`,
            'Content-Type: text/html; charset=utf-8',
            'Content-Transfer-Encoding: base64',
            '',
            btoa(htmlContent)
          ].join('\n'));

          // Add attachment parts
          for (const attachment of attachments) {
            console.log('Adding attachment:', attachment.filename, 'size:', attachment.size);
            parts.push([
              `--${boundary}`,
              `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
              'Content-Transfer-Encoding: base64',
              `Content-Disposition: attachment; filename="${attachment.filename}"`,
              '',
              attachment.content
            ].join('\n'));
          }

          parts.push(`--${boundary}--`);

          emailBody = [...headers, '', parts.join('\n')].join('\n');
        } else {
          console.log('Creating simple email without attachments');
          // Create simple email without attachments
          // Convert plain text line breaks to HTML for Gmail
          const htmlContent = content.replace(/\n/g, '<br>');
          
          // Create email with proper headers
          const headers: string[] = [
            `To: ${to}`,
            `Subject: ${subject}`,
            'Content-Type: text/html; charset=utf-8',
          ];

          // Add threading headers if this is a reply
          if (isReply && replyTo) {
            headers.push(`In-Reply-To: <${replyTo}@gmail.com>`);
            headers.push(`References: <${replyTo}@gmail.com>`);
          }

          emailBody = [...headers, '', htmlContent].join('\n');
        }

        console.log('Email body created, encoding for Gmail API...');
        const encodedEmail = btoa(emailBody).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        // Prepare request body
        const requestBody: any = {
          raw: encodedEmail
        };

        // Add threadId for replies to ensure proper threading
        if (isReply) {
          requestBody.threadId = threadId;
        }

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to send email:', response.status, errorText);
          throw new Error(`Failed to send email: ${response.status}`);
        }

        const result = await response.json();
        console.log('Successfully sent email:', result.id, 'with', attachments?.length || 0, 'attachments');

        // Return success with message data for local state update
        return new Response(JSON.stringify({ 
          success: true, 
          messageId: result.id,
          sentMessage: {
            id: result.id,
            threadId: result.threadId || threadId
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'saveDraft': {
        if (!to || !subject || !content) {
          throw new Error('To, subject, and content are required for drafts');
        }

        console.log('Saving draft');

        // Convert plain text line breaks to HTML for Gmail
        const htmlContent = content.replace(/\n/g, '<br>');

        const email = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/html; charset=utf-8',
          '',
          htmlContent
        ].join('\n');

        const encodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        let url = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';
        let method = 'POST';
        let requestBody: any = {
          message: {
            raw: encodedEmail
          }
        };

        // If updating existing draft
        if (draftId) {
          url = `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`;
          method = 'PUT';
        }

        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to save draft:', response.status, errorText);
          throw new Error(`Failed to save draft: ${response.status}`);
        }

        const result = await response.json();
        console.log('Successfully saved draft:', result.id);

        return new Response(JSON.stringify({ success: true, draftId: result.id }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'deleteDraft': {
        if (!draftId) {
          throw new Error('Draft ID is required');
        }

        console.log(`Attempting to delete draft: ${draftId}`);

        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to delete draft:', response.status, errorText);
          throw new Error(`Failed to delete draft: ${response.status}`);
        }

        console.log('Successfully deleted draft:', draftId);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'reply': {
        if (!to || !subject || !content || !threadId) {
          throw new Error('To, subject, content, and threadId are required for replies');
        }

        // Create email with In-Reply-To and References headers for proper threading
        const headers: string[] = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/html; charset=utf-8',
        ];

        // Add threading headers if replying to a specific message
        if (replyTo) {
          headers.push(`In-Reply-To: <${replyTo}@gmail.com>`);
          headers.push(`References: <${replyTo}@gmail.com>`);
        }

        const email = [...headers, '', content].join('\n');
        const encodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            raw: encodedEmail,
            threadId: threadId
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to send reply:', response.status, errorText);
          throw new Error(`Failed to send reply: ${response.status}`);
        }

        const result = await response.json();
        console.log('Successfully sent reply:', result.id);

        return new Response(JSON.stringify({ success: true, messageId: result.id }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'deleteThread': {
        if (!threadId) {
          throw new Error('Thread ID is required');
        }

        console.log(`Attempting to trash thread: ${threadId}`);

        // Get all messages in the thread first
        const threadResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!threadResponse.ok) {
          throw new Error('Failed to fetch thread');
        }

        const threadData = await threadResponse.json();
        
        // Trash all messages in the thread
        const trashPromises = threadData.messages.map((message: any) =>
          fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}/trash`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          })
        );

        const results = await Promise.all(trashPromises);
        const failures = results.filter(r => !r.ok);
        
        if (failures.length > 0) {
          throw new Error('Failed to delete some messages in thread');
        }

        console.log('Successfully trashed thread:', threadId);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }


      case 'downloadAttachment': {
        if (!messageId || !attachmentId) {
          throw new Error('Message ID and Attachment ID are required');
        }

        console.log(`Downloading attachment: ${attachmentId} from message: ${messageId}`);

        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to download attachment:', response.status, errorText);
          throw new Error(`Failed to download attachment: ${response.status}`);
        }

        const result = await response.json();
        
        // Convert base64url to base64
        const base64Data = result.data.replace(/-/g, '+').replace(/_/g, '/');
        
        return new Response(JSON.stringify({ 
          success: true, 
          data: base64Data,
          size: result.size 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      case 'deleteMessage': {
        if (!messageId) {
          throw new Error('Message ID is required');
        }

        console.log(`Attempting to trash message: ${messageId}`);

        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to trash email:', response.status, errorText);
          throw new Error(`Failed to delete email: ${response.status}`);
        }

        const result = await response.json();
        console.log('Successfully trashed message:', result.id);

        return new Response(JSON.stringify({ success: true }), {
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