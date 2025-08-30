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
    attachments: z.array(z.any()).optional()
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

  constructor(token: string, requestId: string) {
    this.token = token;
    this.requestId = requestId;
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
          // Only decode if it looks like valid URL encoding
          if (decoded.match(/%[0-9A-F]{2}/gi)) {
            decoded = decodeURIComponent(decoded);
          }
        } catch (urlDecodeError) {
          // If URL decoding fails, continue with the partially decoded content
          console.warn(`[${this.requestId}] URL decoding failed, using partially decoded content:`, urlDecodeError);
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

  async sendEmail(to: string, subject: string, content: string, threadId?: string, attachments?: any[]) {
    try {
      console.log(`[${this.requestId}] === STARTING SEND EMAIL ===`);
      console.log(`[${this.requestId}] Recipient: ${to}`);
      console.log(`[${this.requestId}] Subject: ${subject}`);
      console.log(`[${this.requestId}] ThreadId: ${threadId || 'none'}`);
      console.log(`[${this.requestId}] Attachments: ${attachments?.length || 0}`);
      
      // Generate boundary for multipart message
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Build email headers
      const headers = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        `MIME-Version: 1.0`,
        '',
        `This is a multi-part message in MIME format.`,
        ''
      ];

      // Build email body parts
      const bodyParts = [];
      
      // Add the main content part
      bodyParts.push([
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: quoted-printable`,
        '',
        content,
        ''
      ].join('\r\n'));

      // Add attachment parts
      if (attachments && attachments.length > 0) {
        console.log(`[${this.requestId}] Processing ${attachments.length} attachments`);
        
        for (const attachment of attachments) {
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
      
      // Encode the entire message in base64url
      const encodedMessage = btoa(emailContent)
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
    const gmailService = new GmailService(gmailToken, requestId);

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

      case 'sendEmail':
        try {
          console.log(`[${requestId}] Starting sendEmail action with recipient: ${request.to}`);
          console.log(`[${requestId}] Request data:`, { 
            to: request.to, 
            subject: request.subject, 
            hasContent: !!request.content,
            attachmentCount: request.attachments?.length || 0 
          });
          
          result = await gmailService.sendEmail(
            request.to,
            request.subject,
            request.content,
            request.threadId,
            request.attachments
          );
          console.log(`[${requestId}] sendEmail completed successfully`);
        } catch (error) {
          console.error(`[${requestId}] sendEmail failed:`, error);
          throw error; // Re-throw to be caught by outer try-catch
        }
        break;

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