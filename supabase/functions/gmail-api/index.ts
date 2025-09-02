import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import { z } from 'https://esm.sh/zod@3.23.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Request validation schemas
const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('getEmails'),
    query: z.string().optional(),
    maxResults: z.number().min(1).max(100).optional(),
    pageToken: z.string().optional()
  }),
  z.object({
    action: z.literal('searchEmails'),
    query: z.string().min(1)
  }),
  z.object({
    action: z.literal('markAsRead'),
    messageId: z.string().optional(),
    threadId: z.string().optional()
  }),
  z.object({
    action: z.literal('sendEmail'),
    to: z.string().min(1),
    subject: z.string(),
    content: z.string(),
    replyTo: z.string().optional(),
    threadId: z.string().optional(),
    attachments: z.array(z.any()).optional(),
    attachmentUrls: z.array(z.string()).optional(), // Public URLs to fetch attachments from
    documentAttachments: z.array(z.object({
      name: z.string(),
      file_path: z.string(),
      mime_type: z.string(),
      file_size: z.number()
    })).optional()
  }),
  z.object({
    action: z.literal('downloadAttachment'),
    messageId: z.string().min(1),
    attachmentId: z.string().min(1)
  }),
  z.object({
    action: z.enum(['trashThread', 'trashMessage']),
    threadId: z.string().optional(),
    messageId: z.string().optional()
  }),
  z.object({
    action: z.enum(['deleteThread', 'deleteMessage']),
    threadId: z.string().optional(),
    messageId: z.string().optional()
  }),
  z.object({
    action: z.literal('health')
  })
])

interface ProcessedEmail {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  content: string;
  labels: string[];
  isRead: boolean;
  attachments: ProcessedAttachment[];
}

interface ProcessedAttachment {
  filename: string;
  mimeType: string;
  size: number;
  downloadUrl?: string;
  attachmentId?: string;
}

class GmailApiError extends Error {
  constructor(message: string, public status: number = 500) {
    super(message);
    this.name = 'GmailApiError';
  }
}

class GmailService {
  private token: string;
  private requestId: string;
  private userEmail: string;

  constructor(token: string, requestId: string, userEmail: string) {
    this.token = token;
    this.requestId = requestId;
    this.userEmail = userEmail;
  }

  private async makeGmailRequest(url: string, options?: RequestInit) {
    console.log(`[${this.requestId}] Gmail API request: ${url}`);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        ...options?.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${this.requestId}] Gmail API error:`, response.status, errorText);
      
      if (response.status === 401) {
        throw new GmailApiError('Gmail authentication expired', 401);
      }
      if (response.status === 429) {
        throw new GmailApiError('Rate limit exceeded', 429);
      }
      
      throw new GmailApiError(`Gmail API error: ${response.status} ${errorText}`, response.status);
    }

    return response.json();
  }

  // Gmail Base64URL decoder - handles Gmail's quirky encoding properly
  private gmailB64Decode(b64url: string): string {
    if (!b64url) return "";

    // 1. Convert Base64URL → standard Base64
    let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");

    // 2. Pad with '=' to make length divisible by 4
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }

    // 3. Decode Base64 to binary, then convert to UTF-8
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      // 4. Convert to UTF-8 string
      let decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      
      // 5. Handle additional URL encoding that may be present (like Tesla emails)
      // Check if content contains URL-encoded patterns
      if (decoded.includes('-2F') || decoded.includes('-2B') || decoded.includes('%')) {
        try {
          // First handle common URL-encoded dash patterns (used by email link tracking)
          decoded = decoded
            .replace(/-2F/g, '/')
            .replace(/-2B/g, '+')
            .replace(/-3D/g, '=')
            .replace(/-26/g, '&')
            .replace(/-3A/g, ':')
            .replace(/-3F/g, '?')
            .replace(/-23/g, '#');
          
          // Then try standard URL decoding for remaining % patterns
          // Only decode if it looks like valid URL encoding and is safe
          if (decoded.match(/%[0-9A-F]{2}/gi)) {
            // Split by segments and decode each valid segment individually
            const segments = decoded.split(/%/);
            let safeDecoded = segments[0]; // First segment is never URL-encoded
            
            for (let i = 1; i < segments.length; i++) {
              const segment = segments[i];
              if (segment.length >= 2 && /^[0-9A-F]{2}/i.test(segment.substring(0, 2))) {
                try {
                  // Valid hex pattern - try to decode just this part
                  const hexPart = segment.substring(0, 2);
                  const restPart = segment.substring(2);
                  const decodedChar = decodeURIComponent('%' + hexPart);
                  safeDecoded += decodedChar + restPart;
                } catch (segmentError) {
                  // If individual segment fails, keep the original
                  safeDecoded += '%' + segment;
                }
              } else {
                // Not a valid hex pattern, keep original
                safeDecoded += '%' + segment;
              }
            }
            decoded = safeDecoded;
          }
        } catch (urlDecodeError) {
          // If any URL decoding fails, continue with the partially decoded content
          // Don't log warnings for common decoding issues to reduce noise
        }
      }
      
      return decoded;
    } catch (e) {
      console.error(`[${this.requestId}] gmailB64Decode failed:`, e);
      return "";
    }
  }

  private extractEmailContent(payload: any): { content: string; attachments: ProcessedAttachment[] } {
    const attachments: ProcessedAttachment[] = [];
    let textContent = '';
    let htmlContent = '';

    const processPart = (part: any) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId
        });
        return;
      }

      if (part.body?.data) {
        const decoded = this.gmailB64Decode(part.body.data);
        if (part.mimeType === 'text/html') {
          htmlContent = decoded;
        } else if (part.mimeType === 'text/plain') {
          textContent = decoded;
        }
      }

      if (part.parts) {
        part.parts.forEach(processPart);
      }
    };

    if (payload.parts) {
      payload.parts.forEach(processPart);
    } else if (payload.body?.data) {
      const decoded = this.gmailB64Decode(payload.body.data);
      if (payload.mimeType === 'text/html') {
        htmlContent = decoded;
      } else {
        textContent = decoded;
      }
    }

    // Choose content format: prefer HTML for marketing emails, text/plain for regular emails
    let finalContent = '';
    
    // Check if this looks like a marketing email with tracking links
    const isMarketingEmail = textContent.includes('link.') || textContent.includes('track') || 
                           textContent.includes('click?') || textContent.includes('[https://') ||
                           htmlContent.includes('link.') || htmlContent.includes('track');
    
    if (htmlContent.trim() && isMarketingEmail) {
      // Use HTML content for marketing emails (better formatting)
      finalContent = htmlContent.trim();
    } else if (textContent.trim()) {
      // Convert text/plain to HTML-safe format for regular emails
      finalContent = textContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>')
        .trim();
    } else if (htmlContent.trim()) {
      // Fallback to HTML content
      finalContent = htmlContent.trim();
    }

    return { content: finalContent, attachments };
  }

  private processMessage(message: any): ProcessedEmail {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    
    const { content, attachments } = this.extractEmailContent(message.payload);
    
    return {
      id: message.id,
      threadId: message.threadId,
      snippet: message.snippet || '',
      subject: getHeader('Subject'),
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      content,
      labels: message.labelIds || [],
      isRead: !message.labelIds?.includes('UNREAD'),
      attachments
    };
  }

  async getEmails(query: string = 'in:inbox', maxResults: number = 100, pageToken?: string) {
    try {
      // Get threads
      let threadsUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${maxResults}&q=${encodeURIComponent(query)}`;
      if (pageToken) threadsUrl += `&pageToken=${pageToken}`;
      
      const threadsData = await this.makeGmailRequest(threadsUrl);
      const threads = threadsData.threads || [];
      
      if (threads.length === 0) {
        return { conversations: [], nextPageToken: threadsData.nextPageToken };
      }

      console.log(`[${this.requestId}] Processing ${threads.length} threads`);

      // Process threads in smaller batches to avoid timeouts
      const batchSize = 3;
      const conversations = [];
      
      for (let i = 0; i < threads.length; i += batchSize) {
        const batch = threads.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (thread) => {
          try {
            const threadData = await this.makeGmailRequest(
              `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=full`
            );
            
            const messages = threadData.messages || [];
            const processedMessages = messages.map(msg => this.processMessage(msg));
            
            // Transform to match UI expectations
            const firstEmail = processedMessages[0];
            return {
              id: thread.id,
              threadId: thread.id,
              subject: firstEmail?.subject || 'No Subject',
              emails: processedMessages.map(msg => ({
                id: msg.id,
                threadId: msg.threadId,
                snippet: msg.snippet,
                subject: msg.subject,
                from: msg.from,
                to: msg.to,
                date: msg.date,
                content: msg.content,
                unread: !msg.isRead,
                attachments: msg.attachments
              })),
              messageCount: processedMessages.length,
              lastDate: firstEmail?.date || new Date().toISOString(),
              unreadCount: processedMessages.filter(msg => !msg.isRead).length,
              participants: [...new Set(processedMessages.flatMap(msg => [msg.from, msg.to]).filter(Boolean))]
            };
          } catch (error) {
            console.error(`[${this.requestId}] Error processing thread ${thread.id}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        conversations.push(...batchResults.filter(Boolean));
        
        // Small delay between batches to avoid rate limiting
        if (i + batchSize < threads.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return {
        conversations,
        nextPageToken: threadsData.nextPageToken,
        allEmailsLoaded: !threadsData.nextPageToken
      };
    } catch (error) {
      console.error(`[${this.requestId}] getEmails error:`, error);
      throw error;
    }
  }

  async downloadAttachment(messageId: string, attachmentId: string) {
    try {
      console.log(`[${this.requestId}] Downloading attachment ${attachmentId} from message ${messageId}`);
      
      const attachmentData = await this.makeGmailRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`
      );

      // For attachments, we need binary data, not text
      // Convert Base64URL to binary data directly
      let base64 = attachmentData.data.replace(/-/g, "+").replace(/_/g, "/");
      
      // Pad with '=' to make length divisible by 4
      while (base64.length % 4 !== 0) {
        base64 += "=";
      }
      
      // Decode to binary data (Uint8Array)
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      console.log(`[${this.requestId}] Decoded attachment: ${bytes.length} bytes`);
      
      return {
        data: bytes, // Return raw binary data as Uint8Array
        size: attachmentData.size,
        base64Data: attachmentData.data // Keep original for potential storage
      };
    } catch (error) {
      console.error(`[${this.requestId}] downloadAttachment error:`, error);
      throw error;
    }
  }

  async markAsRead(messageId?: string, threadId?: string) {
    try {
      const labels = { removeLabelIds: ['UNREAD'] };
      
      if (threadId) {
        await this.makeGmailRequest(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(labels)
          }
        );
      } else if (messageId) {
        await this.makeGmailRequest(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(labels)
          }
        );
      }

      return { success: true };
    } catch (error) {
      console.error(`[${this.requestId}] markAsRead error:`, error);
      throw error;
    }
  }

  async sendEmail(to: string, subject: string, content: string, threadId?: string, attachments?: any[], attachmentUrls?: string[], documentAttachments?: any[]) {
    try {
      console.log(`[${this.requestId}] === STARTING SEND EMAIL ===`);
      console.log(`[${this.requestId}] Recipient: ${to}`);
      console.log(`[${this.requestId}] Subject: ${subject}`);
      console.log(`[${this.requestId}] ThreadId: ${threadId || 'none'}`);
      console.log(`[${this.requestId}] Direct attachments: ${attachments?.length || 0}`);
      console.log(`[${this.requestId}] Document attachments: ${documentAttachments?.length || 0}`);
      
      // Process all attachments into a unified format
      const processedAttachments: any[] = [];

      // Add direct base64 attachments (already processed from frontend)
      if (attachments && attachments.length > 0) {
        console.log(`[${this.requestId}] Adding ${attachments.length} direct attachments`);
        
        for (const attachment of attachments) {
          console.log(`[${this.requestId}] Processing direct attachment: ${attachment.name || attachment.filename}`);
          
          processedAttachments.push({
            name: attachment.name || attachment.filename,
            filename: attachment.name || attachment.filename,
            data: attachment.data || attachment.content, // base64 content
            mimeType: attachment.mimeType || attachment.type,
            size: attachment.size
          });
        }
      }

      // Process document attachments
      if (documentAttachments && documentAttachments.length > 0) {
        console.log(`[${this.requestId}] Processing ${documentAttachments.length} document attachments`);
        
        // Create Supabase client for document storage access
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        
        for (const doc of documentAttachments) {
          try {
            console.log(`[${this.requestId}] Starting download of document: ${doc.name} from ${doc.file_path}`);
            
            // Add timeout to document download
            const downloadPromise = supabaseClient.storage
              .from('documents')
              .download(doc.file_path);
            
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Document download timeout')), 30000);
            });
            
            const { data, error } = await Promise.race([downloadPromise, timeoutPromise]) as any;

            if (error) {
              console.error(`[${this.requestId}] Document download error for ${doc.name}:`, error);
              continue;
            }

            console.log(`[${this.requestId}] Successfully downloaded document: ${doc.name}, size: ${data?.size || 'unknown'}`);

            // Convert to base64 using streaming approach for large files
            const arrayBuffer = await data.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            console.log(`[${this.requestId}] Converting document ${doc.name} to base64 (${uint8Array.length} bytes)...`);
            
            // Stream encode to prevent call stack overflow on large files
            let base64 = '';
            const chunkSize = 8192; // 8KB chunks
            
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.slice(i, i + chunkSize);
              base64 += btoa(String.fromCharCode.apply(null, Array.from(chunk)));
              
              // Log progress for large files
              if (i % (chunkSize * 10) === 0) {
                console.log(`[${this.requestId}] Document encoding progress: ${Math.round((i / uint8Array.length) * 100)}%`);
              }
            }
            
            console.log(`[${this.requestId}] Document base64 encoding complete: ${base64.length} chars`);
            
            // Add line breaks every 76 characters for MIME compliance
            const formatBase64ForMime = (b64: string) => {
              return b64.match(/.{1,76}/g)?.join('\r\n') || b64;
            };
            base64 = formatBase64ForMime(base64);

            processedAttachments.push({
              name: doc.name,
              filename: doc.name,
              data: base64,
              mimeType: doc.mime_type,
              size: doc.file_size
            });

            console.log(`[${this.requestId}] Successfully processed document: ${doc.name} (${doc.file_size} bytes)`);
          } catch (docError) {
            console.error(`[${this.requestId}] Error processing document ${doc.name}:`, docError);
            // Continue with other attachments rather than failing completely
          }
        }
      }

      console.log(`[${this.requestId}] Total processed attachments: ${processedAttachments.length}`);
      
      // Log attachment details for debugging
      if (processedAttachments.length > 0) {
        processedAttachments.forEach((att, idx) => {
          const base64Length = att.data?.length || 0;
          const hasLineBreaks = att.data?.includes('\r\n') || false;
          console.log(`[${this.requestId}] Attachment ${idx}: ${att.filename}, size: ${att.size} bytes, base64: ${base64Length} chars, hasLineBreaks: ${hasLineBreaks}`);
        });
      }
      
      // Generate boundary for multipart message
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Get user's email from auth context
      const fromEmail = this.userEmail || 'noreply@example.com';
      
      // Build email headers with required fields for delivery and spam prevention
      const headers = [
        `From: ${fromEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: <${Date.now()}.${Math.random().toString(36).substr(2, 9)}@gmail.com>`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        `X-Mailer: Ayra App`,
        `X-Priority: 3`,
        '',
        `This is a multi-part message in MIME format.`,
        ''
      ];

      // Build email body parts
      const bodyParts = [];
      
      // Add the main content part with proper encoding
      bodyParts.push([
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: 8bit`,
        '',
        content,
        ''
      ].join('\r\n'));

      // Add attachment parts
      if (processedAttachments && processedAttachments.length > 0) {
        console.log(`[${this.requestId}] Adding ${processedAttachments.length} attachments to email`);
        
        for (const attachment of processedAttachments) {
          console.log(`[${this.requestId}] Adding attachment: ${attachment.filename || attachment.name}`);
          
          const filename = attachment.filename || attachment.name;
          const mimeType = attachment.mimeType || attachment.type || 'application/octet-stream';
          const data = attachment.data || attachment.content;
          
          if (!data) {
            console.warn(`[${this.requestId}] Skipping attachment ${filename} - no data`);
            continue;
          }
          
          bodyParts.push([
            `--${boundary}`,
            `Content-Type: ${mimeType}`,
            `Content-Disposition: attachment; filename="${filename}"`,
            `Content-Transfer-Encoding: base64`,
            '',
            data,
            ''
          ].join('\r\n'));
        }
      }
      
      // Close the boundary
      bodyParts.push(`--${boundary}--`);
      
      // Combine headers and body with proper MIME structure
      const emailContent = headers.join('\r\n') + '\r\n' + bodyParts.join('\r\n');
      
      console.log(`[${this.requestId}] Email content preview:`, emailContent.substring(0, 500));
      
      // Properly encode the entire message in base64url
      // First convert to UTF-8 bytes, then to base64, then to base64url
      const utf8Encoder = new TextEncoder();
      const utf8Bytes = utf8Encoder.encode(emailContent);
      
      // Convert bytes to base64 string
      let base64String = '';
      const chunk = 1024;
      for (let i = 0; i < utf8Bytes.length; i += chunk) {
        const slice = utf8Bytes.slice(i, i + chunk);
        const binaryString = Array.from(slice, byte => String.fromCharCode(byte)).join('');
        base64String += btoa(binaryString);
      }
      
      // Convert base64 to base64url (Gmail's format)
      const encodedMessage = base64String
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      console.log(`[${this.requestId}] Email message size: ${emailContent.length} chars, encoded: ${encodedMessage.length} chars`);

      const requestBody: any = {
        raw: encodedMessage
      };

      if (threadId) {
        requestBody.threadId = threadId;
      }

      const result = await this.makeGmailRequest(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      console.log(`[${this.requestId}] === EMAIL SENT SUCCESSFULLY ===`);
      console.log(`[${this.requestId}] Message ID: ${result.id}`);
      console.log(`[${this.requestId}] Recipient: ${to}`);
      console.log(`[${this.requestId}] Gmail API response:`, JSON.stringify(result, null, 2));
      return { success: true, messageId: result.id, sentMessage: result };
    } catch (error) {
      console.error(`[${this.requestId}] sendEmail error:`, error);
      throw error;
    }
  }

  async trashMessage(messageId: string) {
    try {
      await this.makeGmailRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
        { method: 'POST' }
      );
      return { success: true };
    } catch (error) {
      console.error(`[${this.requestId}] trashMessage error:`, error);
      throw error;
    }
  }

  async trashThread(threadId: string) {
    try {
      await this.makeGmailRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/trash`,
        { method: 'POST' }
      );
      return { success: true };
    } catch (error) {
      console.error(`[${this.requestId}] trashThread error:`, error);
      throw error;
    }
  }

  async deleteMessage(messageId: string) {
    try {
      await this.makeGmailRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
        { method: 'DELETE' }
      );
      return { success: true };
    } catch (error) {
      console.error(`[${this.requestId}] deleteMessage error:`, error);
      throw error;
    }
  }

  async deleteThread(threadId: string) {
    try {
      await this.makeGmailRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`,
        { method: 'DELETE' }
      );
      return { success: true };
    } catch (error) {
      console.error(`[${this.requestId}] deleteThread error:`, error);
      throw error;
    }
  }
}

async function authenticateAndGetToken(userId: string): Promise<string> {
  const serviceRoleClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Get Gmail connection
  const { data: connection, error: connectionError } = await serviceRoleClient
    .from('gmail_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (connectionError || !connection) {
    throw new GmailApiError('No active Gmail connection found. Please reconnect your account.', 401);
  }

  let gmailToken = connection.access_token;

  // Test token validity
  const testResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { 'Authorization': `Bearer ${gmailToken}` }
  });

  // Refresh token if expired
  if (testResponse.status === 401) {
    console.log('Token expired, refreshing...');
    
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token'
      })
    });

    if (!tokenResponse.ok) {
      throw new GmailApiError('Gmail token expired and refresh failed. Please reconnect your Gmail account.', 401);
    }

    const tokenData = await tokenResponse.json();
    gmailToken = tokenData.access_token;

    // Update token in database
    await serviceRoleClient
      .from('gmail_connections')
      .update({ access_token: gmailToken, updated_at: new Date().toISOString() })
      .eq('id', connection.id);
  }

  return gmailToken;
}

const handler = async (req: Request): Promise<Response> => {
  const requestId = Math.random().toString(36).substring(2, 15);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[${requestId}] Gmail API request received`);
    
    // Authenticate user using service role for robust token validation
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error(`[${requestId}] Missing Authorization header`);
      throw new GmailApiError('Authorization header required', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error(`[${requestId}] Auth validation failed:`, userError?.message || 'No user found');
      throw new GmailApiError('Invalid or expired authentication token', 401);
    }

    console.log(`[${requestId}] User authenticated: ${user.email}`);

    // Parse request
    const requestBody = await req.json();
    const validation = requestSchema.safeParse(requestBody);
    
    if (!validation.success) {
      console.error(`[${requestId}] Validation error:`, validation.error);
      throw new GmailApiError('Invalid request format', 400);
    }

    const request = validation.data;
    console.log(`[${requestId}] Action: ${request.action}`);

    // Health check
    if (request.action === 'health') {
      return new Response(
        JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Get Gmail token
    const gmailToken = await authenticateAndGetToken(user.id);
    const gmailService = new GmailService(gmailToken, requestId, user.email || 'noreply@example.com');

    // Handle actions
    let result;
    switch (request.action) {
      case 'getEmails':
        result = await gmailService.getEmails(
          request.query || 'in:inbox',
          request.maxResults || 50,
          request.pageToken
        );
        break;

      case 'downloadAttachment':
        result = await gmailService.downloadAttachment(request.messageId, request.attachmentId);
        break;

      case 'markAsRead':
        result = await gmailService.markAsRead(request.messageId, request.threadId);
        break;

        case 'sendEmail': {
          console.log(`[${requestId}] === GMAIL SENDEMAIL ACTION START ===`);
          console.log(`[${requestId}] Request data:`, { 
            to: request.to, 
            subject: request.subject, 
            hasContent: !!request.content,
            contentLength: request.content?.length || 0,
            attachmentCount: request.attachments?.length || 0,
            attachmentUrlsCount: request.attachmentUrls?.length || 0,
            documentAttachmentsCount: request.documentAttachments?.length || 0
          });
          
          const result = await gmailService.sendEmail(
            request.to,
            request.subject,
            request.content,
            request.threadId,
            request.attachments,
            request.attachmentUrls,
            request.documentAttachments
          );
          
          console.log(`[${requestId}] === GMAIL SENDEMAIL ACTION COMPLETE ===`);
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

      case 'trashMessage':
        result = await gmailService.trashMessage(request.messageId!);
        break;

      case 'trashThread':
        result = await gmailService.trashThread(request.threadId!);
        break;

      case 'deleteMessage':
        result = await gmailService.deleteMessage(request.messageId!);
        break;

      case 'deleteThread':
        result = await gmailService.deleteThread(request.threadId!);
        break;

      default:
        throw new GmailApiError('Unsupported action', 400);
    }

    console.log(`[${requestId}] Action completed successfully`);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`[${requestId}] Handler error:`, error);
    
    const status = error instanceof GmailApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';
    
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: corsHeaders }
    );
  }
};

serve(handler);