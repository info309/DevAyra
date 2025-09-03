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
    attachments: z.array(z.object({
      name: z.string(),
      data: z.string(), // base64 content
      mimeType: z.string(),
      size: z.number()
    })).optional(),
    documentAttachments: z.array(z.object({
      id: z.string().optional(),
      name: z.string(),
      file_path: z.string(),
      mime_type: z.string().optional(),
      file_size: z.number().optional()
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
  unread: boolean;
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

  constructor(token: string, userEmail: string, requestId: string) {
    this.token = token;
    this.userEmail = userEmail;
    this.requestId = requestId;
  }

  private async makeGmailRequest(url: string, options: RequestInit = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${this.requestId}] Gmail API error: ${response.status} ${response.statusText} - ${errorText}`);
      
      if (response.status === 401) {
        throw new GmailApiError('Gmail authentication expired. Please reconnect your Gmail account.', 401);
      } else if (response.status === 403) {
        throw new GmailApiError('Gmail access forbidden. Check permissions.', 403);
      } else if (response.status === 429) {
        throw new GmailApiError('Gmail API rate limit exceeded. Please try again later.', 429);
      } else {
        throw new GmailApiError(`Gmail API error: ${response.status} ${response.statusText}`, response.status);
      }
    }

    return await response.json();
  }

  private parseHeaders(headers: any[]): Record<string, string> {
    const headerMap: Record<string, string> = {};
    
    if (!headers || !Array.isArray(headers)) {
      return headerMap;
    }
    
    headers.forEach(header => {
      if (header && header.name && header.value) {
        headerMap[header.name.toLowerCase()] = header.value;
      }
    });
    
    return headerMap;
  }

  private processMessage(messageData: any): ProcessedEmail {
    const headers = this.parseHeaders(messageData.payload?.headers || []);
    
    // Extract email content
    let content = '';
    let snippet = messageData.snippet || '';
    
    const extractContent = (part: any): string => {
      if (!part) return '';
      
      if (part.body?.data) {
        try {
          const decoded = atob(part.body.data.replace(/[-_]/g, m => ({ '-': '+', '_': '/' })[m] || m));
          return decoded;
        } catch (e) {
          console.warn(`[${this.requestId}] Failed to decode part body:`, e);
          return '';
        }
      }
      
      if (part.parts) {
        return part.parts.map(extractContent).join('\n');
      }
      
      return '';
    };
    
    content = extractContent(messageData.payload) || snippet;
    
    // Process attachments
    const attachments: ProcessedAttachment[] = [];
    
    const extractAttachments = (part: any) => {
      if (!part) return;
      
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId
        });
      }
      
      if (part.parts) {
        part.parts.forEach(extractAttachments);
      }
    };
    
    extractAttachments(messageData.payload);
    
    // Determine if message is unread
    const isUnread = messageData.labelIds?.includes('UNREAD') || false;
    
    return {
      id: messageData.id,
      threadId: messageData.threadId,
      snippet: snippet,
      subject: headers.subject || 'No Subject',
      from: headers.from || 'Unknown Sender',
      to: headers.to || 'Unknown Recipient',
      date: headers.date || new Date().toISOString(),
      content: content,
      unread: isUnread,
      attachments: attachments
    };
  }

  async getEmails(query = 'in:inbox', pageToken?: string) {
    try {
      console.log(`[${this.requestId}] Getting individual messages with query: ${query}`);
      
      // Use Gmail messages API instead of threads API
      const messagesUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(query)}${pageToken ? `&pageToken=${pageToken}` : ''}`;
      
      const messagesData = await this.makeGmailRequest(messagesUrl);
      const messages = messagesData.messages || [];
      
      if (messages.length === 0) {
        return { 
          conversations: [],
          nextPageToken: null,
          allEmailsLoaded: true
        };
      }

      console.log(`[${this.requestId}] Found ${messages.length} messages`);

      // Process messages in batches to avoid overwhelming the API
      const batchSize = 10;
      const emails = [];
      
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (message) => {
          try {
            const messageData = await this.makeGmailRequest(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`
            );
            
            const processedMessage = this.processMessage(messageData);
            
            // Convert each message to a simple "conversation" format for compatibility
            return {
              id: message.id,
              threadId: message.threadId || message.id,
              subject: processedMessage.subject || 'No Subject',
              emails: [{
                id: processedMessage.id,
                threadId: processedMessage.threadId,
                snippet: processedMessage.snippet,
                subject: processedMessage.subject,
                from: processedMessage.from,
                to: processedMessage.to,
                date: processedMessage.date,
                content: processedMessage.content,
                unread: processedMessage.unread,
                attachments: processedMessage.attachments
              }],
              messageCount: 1,
              lastDate: processedMessage.date,
              unreadCount: processedMessage.unread ? 1 : 0,
              participants: [processedMessage.from, processedMessage.to].filter(Boolean)
            };
          } catch (error) {
            console.error(`[${this.requestId}] Error processing message ${message.id}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter(Boolean);
        emails.push(...validResults);
        
        // Small delay between batches to be nice to Gmail API
        if (i + batchSize < messages.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Sort emails by most recent date
      emails.sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());

      return {
        conversations: emails,
        nextPageToken: messagesData.nextPageToken,
        allEmailsLoaded: !messagesData.nextPageToken
      };
    } catch (error) {
      console.error(`[${this.requestId}] getEmails error:`, error);
      throw error;
    }
  }

  async searchEmails(query: string) {
    // Same as getEmails but with search query
    return this.getEmails(query);
  }

  async downloadAttachment(messageId: string, attachmentId: string) {
    try {
      console.log(`[${this.requestId}] Downloading attachment ${attachmentId} from message ${messageId}`);
      
      const attachmentData = await this.makeGmailRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`
      );

      let base64 = attachmentData.data.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4 !== 0) {
        base64 += "=";
      }
      
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      return {
        data: bytes,
        size: attachmentData.size,
        base64Data: attachmentData.data
      };
    } catch (error) {
      console.error(`[${this.requestId}] downloadAttachment error:`, error);
      throw error;
    }
  }

  async markAsRead(messageId?: string, threadId?: string) {
    try {
      const labels = { removeLabelIds: ['UNREAD'] };
      
      if (messageId) {
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

  async sendEmail(to: string, subject: string, content: string, threadId?: string, attachments?: any[], documentAttachments?: any[]) {
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

      // Add document attachments by downloading them
      if (documentAttachments && documentAttachments.length > 0) {
        console.log(`[${this.requestId}] Processing ${documentAttachments.length} document attachments`);
        
        for (const doc of documentAttachments) {
          try {
            console.log(`[${this.requestId}] Downloading document: ${doc.name}`);
            
            // Create service role client for document download
            const serviceRoleClient = createClient(
              Deno.env.get('SUPABASE_URL') ?? '',
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );
            
            // Download the document from storage
            const { data: fileData, error: downloadError } = await serviceRoleClient.storage
              .from('documents')
              .download(doc.file_path);

            if (downloadError) {
              console.error(`[${this.requestId}] Error downloading ${doc.name}:`, downloadError);
              console.error(`[${this.requestId}] Download error details:`, downloadError);
              continue;
            }

            if (!fileData) {
              console.error(`[${this.requestId}] No data received for ${doc.name}`);
              continue;
            }

            console.log(`[${this.requestId}] Document downloaded successfully: ${doc.name} (${fileData.size} bytes)`);
            
            // Convert to base64 efficiently for large files
            const arrayBuffer = await fileData.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            console.log(`[${this.requestId}] Converting document to base64: ${doc.name}`);
            
            // Use btoa directly for smaller files, chunked processing for larger ones
            let base64 = '';
            if (uint8Array.length < 1024 * 1024) { // Less than 1MB
              // Simple conversion for small files
              const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
              base64 = btoa(binaryString);
            } else {
              // Chunked processing for large files
              const chunkSize = 8192;
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.slice(i, i + chunkSize);
                const binaryString = Array.from(chunk, byte => String.fromCharCode(byte)).join('');
                base64 += btoa(binaryString);
                
                // Log progress for large files
                if (i % (chunkSize * 10) === 0) {
                  console.log(`[${this.requestId}] Document encoding progress: ${Math.round((i / uint8Array.length) * 100)}%`);
                }
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
              mimeType: doc.mime_type || 'application/octet-stream',
              size: doc.file_size || arrayBuffer.byteLength || 0
            });

            console.log(`[${this.requestId}] Successfully processed document: ${doc.name} (${doc.file_size || arrayBuffer.byteLength || 0} bytes)`);
          } catch (docError) {
            console.error(`[${this.requestId}] Error processing document ${doc.name}:`, docError);
            console.error(`[${this.requestId}] Document processing stack trace:`, docError.stack);
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] === GMAIL API REQUEST START ===`);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new GmailApiError('No authorization header', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      throw new GmailApiError('Invalid user token', 401);
    }

    // Get Gmail access token
    const { data: connection } = await supabase
      .from('gmail_connections')
      .select('access_token, email')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!connection) {
      throw new GmailApiError('No active Gmail connection found', 404);
    }

    const requestData = await req.json();
    console.log(`[${requestId}] Request:`, requestData);

    const validatedRequest = requestSchema.parse(requestData);
    const gmailService = new GmailService(connection.access_token, connection.email, requestId);

    let result;

    switch (validatedRequest.action) {
      case 'getEmails':
        result = await gmailService.getEmails(
          validatedRequest.query,
          validatedRequest.pageToken
        );
        break;
      case 'searchEmails':
        result = await gmailService.searchEmails(validatedRequest.query);
        break;
      case 'markAsRead':
        result = await gmailService.markAsRead(
          validatedRequest.messageId,
          validatedRequest.threadId
        );
        break;
      case 'downloadAttachment':
        result = await gmailService.downloadAttachment(
          validatedRequest.messageId,
          validatedRequest.attachmentId
        );
        break;
      case 'sendEmail':
        result = await gmailService.sendEmail(
          validatedRequest.to,
          validatedRequest.subject,
          validatedRequest.content,
          validatedRequest.threadId,
          validatedRequest.attachments,
          validatedRequest.documentAttachments
        );
        break;
      case 'trashMessage':
        result = await gmailService.trashMessage(validatedRequest.messageId!);
        break;
      case 'trashThread':
        result = await gmailService.trashThread(validatedRequest.threadId!);
        break;
      case 'deleteMessage':
        result = await gmailService.deleteMessage(validatedRequest.messageId!);
        break;
      case 'deleteThread':
        result = await gmailService.deleteThread(validatedRequest.threadId!);
        break;
      case 'health':
        result = { status: 'healthy', timestamp: new Date().toISOString() };
        break;
      default:
        throw new GmailApiError('Unknown action', 400);
    }

    console.log(`[${requestId}] === SUCCESS ===`);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${requestId}] === ERROR ===`, error);
    
    if (error instanceof GmailApiError) {
      return new Response(JSON.stringify({ 
        error: error.message,
        status: error.status 
      }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
