import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import { z } from 'https://esm.sh/zod@3.23.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Request validation schemas
const getEmailsSchema = z.object({
  action: z.literal('getEmails'),
  query: z.string().optional(),
  maxResults: z.number().min(1).max(100).optional(),
  pageToken: z.string().optional()
})

const searchEmailsSchema = z.object({
  action: z.literal('searchEmails'),
  query: z.string().min(1)
})

const markAsReadSchema = z.object({
  action: z.literal('markAsRead'),
  messageId: z.string().optional(),
  threadId: z.string().optional()
})

const sendEmailSchema = z.object({
  action: z.literal('sendEmail'),
  to: z.string().min(1),
  subject: z.string(),
  content: z.string(),
  replyTo: z.string().optional(),
  threadId: z.string().optional(),
  attachments: z.array(z.any()).optional()
})

const downloadAttachmentSchema = z.object({
  action: z.literal('downloadAttachment'),
  messageId: z.string().min(1),
  attachmentId: z.string().min(1)
})

const deleteSchema = z.object({
  action: z.enum(['deleteThread', 'deleteMessage']),
  threadId: z.string().optional(),
  messageId: z.string().optional()
})

const replySchema = z.object({
  action: z.literal('reply'),
  threadId: z.string().min(1),
  to: z.string().min(1),
  subject: z.string(),
  content: z.string(),
  attachments: z.array(z.any()).optional()
})

const healthSchema = z.object({
  action: z.literal('health')
})

const requestSchema = z.discriminatedUnion('action', [
  getEmailsSchema,
  searchEmailsSchema,
  markAsReadSchema,
  sendEmailSchema,
  downloadAttachmentSchema,
  deleteSchema,
  replySchema,
  healthSchema
])

interface ProcessedAttachment {
  filename: string;
  mimeType: string;
  size: number;
  downloadUrl?: string;
  attachmentId?: string;
  isInline?: boolean;
  cid?: string;
}

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

interface ApiResponse {
  conversations?: any[];
  results?: any[];
  partialSuccess?: boolean;
  errors?: Array<{ item: string; error: string }>;
  nextPageToken?: string;
  allEmailsLoaded?: boolean;
}

// Concurrency control for attachment downloads
const attachmentSemaphore = {
  available: 3,
  waiting: [] as Array<() => void>,
  acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (this.available > 0) {
        this.available--;
        resolve();
      } else {
        this.waiting.push(resolve);
      }
    });
  },
  release() {
    this.available++;
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    }
  }
};

function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

function decodeQuotedPrintable(str: string): string {
  return str.replace(/=([A-F0-9]{2})/gi, (match, hex) => 
    String.fromCharCode(parseInt(hex, 16))
  );
}

function detectAndDecodeContent(content: string, encoding?: string): string {
  if (!content) return '';
  
  try {
    if (encoding === 'base64') {
      return base64UrlDecode(content);
    } else if (encoding === 'quoted-printable') {
      return decodeQuotedPrintable(content);
    }
    return content;
  } catch (error) {
    console.error('Content decoding error:', error);
    return content;
  }
}

function fixCommonEncodingIssues(text: string): string {
  return text
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€¢/g, '•')
    .replace(/â€"/g, '—')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ');
}

async function processEmailContent(payload: any): Promise<{ content: string; attachments: ProcessedAttachment[] }> {
  const attachments: ProcessedAttachment[] = [];
  let textContent = '';
  let htmlContent = '';

  function extractParts(part: any) {
    if (part.parts) {
      part.parts.forEach(extractParts);
    } else if (part.body && part.body.data) {
      const mimeType = part.mimeType;
      const filename = part.filename;
      
      if (filename && part.body.attachmentId) {
        attachments.push({
          filename,
          mimeType,
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId,
          isInline: mimeType.startsWith('image/') && part.headers?.some((h: any) => 
            h.name.toLowerCase() === 'content-disposition' && 
            h.value.toLowerCase().includes('inline')
          ),
          cid: part.headers?.find((h: any) => h.name.toLowerCase() === 'content-id')?.value?.replace(/[<>]/g, '')
        });
      } else {
        const encoding = part.body.data ? 'base64' : undefined;
        const content = detectAndDecodeContent(part.body.data || '', encoding);
        const fixedContent = fixCommonEncodingIssues(content);
        
        if (mimeType === 'text/plain') {
          textContent += fixedContent + '\n';
        } else if (mimeType === 'text/html') {
          htmlContent += fixedContent;
        }
      }
    }
  }

  if (payload.parts) {
    payload.parts.forEach(extractParts);
  } else if (payload.body && payload.body.data) {
    const encoding = payload.body.data ? 'base64' : undefined;
    const content = detectAndDecodeContent(payload.body.data, encoding);
    const fixedContent = fixCommonEncodingIssues(content);
    
    if (payload.mimeType === 'text/html') {
      htmlContent = fixedContent;
    } else {
      textContent = fixedContent;
    }
  }

  const finalContent = htmlContent || textContent || 'No content available';
  
  return { content: finalContent, attachments };
}

async function downloadAndStoreAttachment(
  gmailToken: string, 
  messageId: string, 
  attachmentId: string, 
  filename: string, 
  mimeType: string,
  supabaseClient: any,
  userId: string,
  requestId: string
): Promise<string> {
  await attachmentSemaphore.acquire();
  
  try {
    const attachmentResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: { 'Authorization': `Bearer ${gmailToken}` }
      }
    );

    if (!attachmentResponse.ok) {
      throw new Error(`Gmail API error: ${attachmentResponse.status}`);
    }

    const attachmentData = await attachmentResponse.json();
    const fileData = base64UrlDecode(attachmentData.data);
    const blob = new Blob([new Uint8Array([...fileData].map(c => c.charCodeAt(0)))], { type: mimeType });
    
    const filePath = `attachments/${userId}/${messageId}_${attachmentId}_${filename}`;
    
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('email-attachments')
      .upload(filePath, blob, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError && uploadError.statusCode !== '409') {
      console.error(`[${requestId}] Storage upload error:`, uploadError);
      throw new Error(`Failed to store attachment: ${uploadError.message}`);
    }

    const { data: signedUrlData } = await supabaseClient.storage
      .from('email-attachments')
      .createSignedUrl(filePath, 3600);

    return signedUrlData?.signedUrl || '';
  } finally {
    attachmentSemaphore.release();
  }
}

function cleanSubjectPrefixes(subject: string): string {
  return subject
    .replace(/^(Re:|RE:|Fwd:|FWD:|Fw:)\s*/i, '')
    .trim();
}

const handler = async (req: Request): Promise<Response> => {
  const requestId = generateRequestId();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[${requestId}] Gmail API request received`);
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Get user from verified JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authorization header is required' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error(`[${requestId}] Auth error:`, userError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const userId = user.id;
    console.log(`[${requestId}] Authenticated user:`, userId);

    // Parse and validate request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate request schema
    const validation = requestSchema.safeParse(requestBody);
    if (!validation.success) {
      console.error(`[${requestId}] Validation error:`, validation.error);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request format',
          details: validation.error.errors
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const validatedRequest = validation.data;
    console.log(`[${requestId}] Action: ${validatedRequest.action}`);

    // Health check endpoint
    if (validatedRequest.action === 'health') {
      try {
        // Test database connectivity
        const { error: dbError } = await supabaseClient
          .from('gmail_connections')
          .select('id')
          .eq('user_id', userId)
          .limit(1);

        if (dbError) {
          throw new Error(`Database error: ${dbError.message}`);
        }

        return new Response(
          JSON.stringify({ 
            status: 'healthy',
            timestamp: new Date().toISOString(),
            userId: userId
          }),
          { status: 200, headers: corsHeaders }
        );
      } catch (error) {
        console.error(`[${requestId}] Health check failed:`, error);
        return new Response(
          JSON.stringify({ 
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
          }),
          { status: 503, headers: corsHeaders }
        );
      }
    }

    // Get Gmail connection using service role for database access
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: connection, error: connectionError } = await serviceRoleClient
      .from('gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (connectionError || !connection) {
      console.error(`[${requestId}] No active Gmail connection found:`, connectionError);
      return new Response(
        JSON.stringify({ error: 'No active Gmail connection found. Please reconnect your account.' }),
        { status: 401, headers: corsHeaders }
      );
    }

    let gmailToken = connection.access_token;

    // Test token validity and refresh if needed
    const testResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { 'Authorization': `Bearer ${gmailToken}` }
    });

    if (testResponse.status === 401) {
      console.log(`[${requestId}] Token expired, refreshing...`);
      
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
        const errorText = await tokenResponse.text();
        console.error(`[${requestId}] Token refresh failed:`, errorText);
        return new Response(
          JSON.stringify({ error: 'Gmail token expired and needs to be reconnected. Please reconnect your Gmail account.' }),
          { status: 401, headers: corsHeaders }
        );
      }

      const tokenData = await tokenResponse.json();
      gmailToken = tokenData.access_token;

      await serviceRoleClient
        .from('gmail_connections')
        .update({ access_token: gmailToken, updated_at: new Date().toISOString() })
        .eq('id', connection.id);
    }

    const response: ApiResponse = {
      partialSuccess: false,
      errors: []
    };

    // Handle different actions
    switch (validatedRequest.action) {
      case 'getEmails': {
        const { query = 'in:inbox', maxResults = 50, pageToken } = validatedRequest;
        
        try {
          let threadsUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${maxResults}&q=${encodeURIComponent(query)}`;
          if (pageToken) {
            threadsUrl += `&pageToken=${pageToken}`;
          }

          const threadsResponse = await fetch(threadsUrl, {
            headers: { 'Authorization': `Bearer ${gmailToken}` }
          });

          if (!threadsResponse.ok) {
            throw new Error(`Gmail API threads error: ${threadsResponse.status}`);
          }

          const threadsData = await threadsResponse.json();
          const threads = threadsData.threads || [];

          console.log(`[${requestId}] Processing ${threads.length} threads for query: ${query}`);

          const conversations = await Promise.all(
            threads.map(async (thread: any) => {
              try {
                const threadResponse = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=full`,
                  { headers: { 'Authorization': `Bearer ${gmailToken}` } }
                );

                if (!threadResponse.ok) {
                  response.errors!.push({
                    item: `thread-${thread.id}`,
                    error: `Failed to fetch: ${threadResponse.status}`
                  });
                  return null;
                }

                const threadData = await threadResponse.json();
                const messages = threadData.messages || [];
                
                const processedEmails = await Promise.all(
                  messages.map(async (message: any) => {
                    try {
                      const headers = message.payload.headers || [];
                      const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
                      const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
                      const to = headers.find((h: any) => h.name === 'To')?.value || 'Unknown';
                      const date = headers.find((h: any) => h.name === 'Date')?.value || new Date().toISOString();

                      const { content, attachments } = await processEmailContent(message.payload);
                      
                      // For getEmails, don't download attachments immediately - just return metadata
                      const attachmentMetadata = attachments.map(att => ({
                        filename: att.filename,
                        mimeType: att.mimeType,
                        size: att.size,
                        attachmentId: att.attachmentId,
                        isInline: att.isInline,
                        cid: att.cid
                      }));

                      return {
                        id: message.id,
                        threadId: thread.id,
                        snippet: message.snippet || '',
                        subject: cleanSubjectPrefixes(subject),
                        from,
                        to,
                        date,
                        content,
                        unread: message.labelIds?.includes('UNREAD') || false,
                        attachments: attachmentMetadata
                      };
                    } catch (error) {
                      console.error(`[${requestId}] Error processing message ${message.id}:`, error);
                      response.errors!.push({
                        item: `message-${message.id}`,
                        error: error.message || 'Processing failed'
                      });
                      return null;
                    }
                  })
                );

                const validEmails = processedEmails.filter(email => email !== null);
                if (validEmails.length === 0) return null;

                const lastEmail = validEmails[validEmails.length - 1];
                const unreadCount = validEmails.filter(email => email.unread).length;
                const participants = [...new Set(validEmails.flatMap(email => [email.from, email.to]))];

                return {
                  id: thread.id,
                  subject: lastEmail.subject,
                  emails: validEmails,
                  messageCount: validEmails.length,
                  lastDate: lastEmail.date,
                  unreadCount,
                  participants
                };
              } catch (error) {
                console.error(`[${requestId}] Error processing thread ${thread.id}:`, error);
                response.errors!.push({
                  item: `thread-${thread.id}`,
                  error: error.message || 'Processing failed'
                });
                return null;
              }
            })
          );

          response.conversations = conversations.filter(conv => conv !== null);
          response.nextPageToken = threadsData.nextPageToken;
          response.allEmailsLoaded = !threadsData.nextPageToken;
          response.partialSuccess = response.errors!.length > 0;

          console.log(`[${requestId}] Processed ${response.conversations.length} conversations, ${response.errors!.length} errors`);

        } catch (error) {
          console.error(`[${requestId}] GetEmails error:`, error);
          return new Response(
            JSON.stringify({ error: error.message || 'Failed to fetch emails' }),
            { status: 500, headers: corsHeaders }
          );
        }
        break;
      }

      case 'downloadAttachment': {
        const { messageId, attachmentId } = validatedRequest;
        
        try {
          // Get message to find attachment details
          const messageResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
            { headers: { 'Authorization': `Bearer ${gmailToken}` } }
          );

          if (!messageResponse.ok) {
            throw new Error(`Failed to fetch message: ${messageResponse.status}`);
          }

          const messageData = await messageResponse.json();
          const { attachments } = await processEmailContent(messageData.payload);
          
          const attachment = attachments.find(att => att.attachmentId === attachmentId);
          if (!attachment) {
            throw new Error('Attachment not found');
          }

          const downloadUrl = await downloadAndStoreAttachment(
            gmailToken,
            messageId,
            attachmentId,
            attachment.filename,
            attachment.mimeType,
            serviceRoleClient,
            userId,
            requestId
          );

          response.results = [{ downloadUrl, filename: attachment.filename }];

        } catch (error) {
          console.error(`[${requestId}] DownloadAttachment error:`, error);
          return new Response(
            JSON.stringify({ error: error.message || 'Failed to download attachment' }),
            { status: 500, headers: corsHeaders }
          );
        }
        break;
      }

      case 'searchEmails': {
        const { query } = validatedRequest;
        
        try {
          const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`;
          
          const searchResponse = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${gmailToken}` }
          });

          if (!searchResponse.ok) {
            throw new Error(`Gmail API search error: ${searchResponse.status}`);
          }

          const searchData = await searchResponse.json();
          const messages = searchData.messages || [];

          console.log(`[${requestId}] Processing ${messages.length} search results for query: ${query}`);

          const results = await Promise.all(
            messages.map(async (message: any) => {
              try {
                const messageResponse = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`,
                  { headers: { 'Authorization': `Bearer ${gmailToken}` } }
                );

                if (!messageResponse.ok) {
                  response.errors!.push({
                    item: `message-${message.id}`,
                    error: `Failed to fetch: ${messageResponse.status}`
                  });
                  return null;
                }

                const messageData = await messageResponse.json();
                const headers = messageData.payload.headers || [];
                const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
                const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
                const to = headers.find((h: any) => h.name === 'To')?.value || 'Unknown';
                const date = headers.find((h: any) => h.name === 'Date')?.value || new Date().toISOString();

                const { content, attachments } = await processEmailContent(messageData.payload);

                return {
                  id: message.id,
                  threadId: messageData.threadId,
                  snippet: messageData.snippet || '',
                  subject: cleanSubjectPrefixes(subject),
                  from,
                  to,
                  date,
                  content,
                  unread: messageData.labelIds?.includes('UNREAD') || false,
                  attachments: attachments.map(att => ({
                    filename: att.filename,
                    mimeType: att.mimeType,
                    size: att.size,
                    attachmentId: att.attachmentId,
                    isInline: att.isInline,
                    cid: att.cid
                  }))
                };
              } catch (error) {
                console.error(`[${requestId}] Error processing search result ${message.id}:`, error);
                response.errors!.push({
                  item: `message-${message.id}`,
                  error: error.message || 'Processing failed'
                });
                return null;
              }
            })
          );

          response.results = results.filter(result => result !== null);
          response.partialSuccess = response.errors!.length > 0;

          console.log(`[${requestId}] Processed ${response.results.length} search results, ${response.errors!.length} errors`);

        } catch (error) {
          console.error(`[${requestId}] SearchEmails error:`, error);
          return new Response(
            JSON.stringify({ error: error.message || 'Failed to search emails' }),
            { status: 500, headers: corsHeaders }
          );
        }
        break;
      }

      case 'markAsRead': {
        const { messageId, threadId } = validatedRequest;
        
        try {
          if (messageId) {
            const modifyResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${gmailToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  removeLabelIds: ['UNREAD']
                })
              }
            );

            if (!modifyResponse.ok) {
              throw new Error(`Failed to mark message as read: ${modifyResponse.status}`);
            }
          } else if (threadId) {
            const modifyResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${gmailToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  removeLabelIds: ['UNREAD']
                })
              }
            );

            if (!modifyResponse.ok) {
              throw new Error(`Failed to mark thread as read: ${modifyResponse.status}`);
            }
          } else {
            throw new Error('Either messageId or threadId is required');
          }

          response.results = [{ success: true }];

        } catch (error) {
          console.error(`[${requestId}] MarkAsRead error:`, error);
          return new Response(
            JSON.stringify({ error: error.message || 'Failed to mark as read' }),
            { status: 500, headers: corsHeaders }
          );
        }
        break;
      }

      case 'sendEmail': {
        const { to, subject, content, replyTo, threadId, attachments } = validatedRequest;
        
        try {
          // Create proper MIME message format
          const boundary = `----=_Part_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
          
          let emailContent = `MIME-Version: 1.0\r\n`;
          emailContent += `To: ${to}\r\n`;
          emailContent += `Subject: ${subject}\r\n`;
          if (replyTo) {
            emailContent += `Reply-To: ${replyTo}\r\n`;
          }
          
          if (attachments && attachments.length > 0) {
            // Multipart message with attachments
            emailContent += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
            emailContent += `\r\n`;
            emailContent += `--${boundary}\r\n`;
            emailContent += `Content-Type: text/html; charset=utf-8\r\n`;
            emailContent += `Content-Transfer-Encoding: quoted-printable\r\n`;
            emailContent += `\r\n`;
            emailContent += `${content}\r\n`;
            
            // Add attachments (placeholder - full implementation would require file processing)
            for (const attachment of attachments) {
              emailContent += `--${boundary}\r\n`;
              emailContent += `Content-Type: ${attachment.mimeType || 'application/octet-stream'}; name="${attachment.filename}"\r\n`;
              emailContent += `Content-Transfer-Encoding: base64\r\n`;
              emailContent += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
              emailContent += `\r\n`;
              emailContent += `${attachment.data || ''}\r\n`;
            }
            
            emailContent += `--${boundary}--\r\n`;
          } else {
            // Simple text/html message
            emailContent += `Content-Type: text/html; charset=utf-8\r\n`;
            emailContent += `Content-Transfer-Encoding: quoted-printable\r\n`;
            emailContent += `\r\n`;
            emailContent += `${content || 'This email has no content.'}\r\n`;
          }

          const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          const sendData: any = {
            raw: encodedEmail
          };

          if (threadId) {
            sendData.threadId = threadId;
          }

          const sendResponse = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${gmailToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(sendData)
            }
          );

          if (!sendResponse.ok) {
            const errorText = await sendResponse.text();
            throw new Error(`Failed to send email: ${sendResponse.status} - ${errorText}`);
          }

          const sentMessage = await sendResponse.json();
          response.results = [{ messageId: sentMessage.id, threadId: sentMessage.threadId }];

        } catch (error) {
          console.error(`[${requestId}] SendEmail error:`, error);
          return new Response(
            JSON.stringify({ error: error.message || 'Failed to send email' }),
            { status: 500, headers: corsHeaders }
          );
        }
        break;
      }

      case 'reply': {
        const { threadId, to, subject, content, attachments } = validatedRequest;
        
        try {
          // Create proper MIME message format  
          const boundary = `----=_Part_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
          
          let emailContent = `MIME-Version: 1.0\r\n`;
          emailContent += `To: ${to}\r\n`;
          emailContent += `Subject: Re: ${subject}\r\n`;
          emailContent += `In-Reply-To: <${threadId}@gmail.com>\r\n`;
          emailContent += `References: <${threadId}@gmail.com>\r\n`;
          
          if (attachments && attachments.length > 0) {
            // Multipart message with attachments
            emailContent += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
            emailContent += `\r\n`;
            emailContent += `--${boundary}\r\n`;
            emailContent += `Content-Type: text/html; charset=utf-8\r\n`;
            emailContent += `Content-Transfer-Encoding: quoted-printable\r\n`;
            emailContent += `\r\n`;
            emailContent += `${content || 'This email has no content.'}\r\n`;
            
            // Add attachments (placeholder - full implementation would require file processing)
            for (const attachment of attachments) {
              emailContent += `--${boundary}\r\n`;
              emailContent += `Content-Type: ${attachment.mimeType || 'application/octet-stream'}; name="${attachment.filename}"\r\n`;
              emailContent += `Content-Transfer-Encoding: base64\r\n`;
              emailContent += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
              emailContent += `\r\n`;
              emailContent += `${attachment.data || ''}\r\n`;
            }
            
            emailContent += `--${boundary}--\r\n`;
          } else {
            // Simple text/html message
            emailContent += `Content-Type: text/html; charset=utf-8\r\n`;
            emailContent += `Content-Transfer-Encoding: quoted-printable\r\n`;
            emailContent += `\r\n`;
            emailContent += `${content || 'This email has no content.'}\r\n`;
          }

          const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          const sendResponse = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${gmailToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                raw: encodedEmail,
                threadId: threadId
              })
            }
          );

          if (!sendResponse.ok) {
            const errorText = await sendResponse.text();
            throw new Error(`Failed to send reply: ${sendResponse.status} - ${errorText}`);
          }

          const sentMessage = await sendResponse.json();
          response.results = [{ messageId: sentMessage.id, threadId: sentMessage.threadId }];

        } catch (error) {
          console.error(`[${requestId}] Reply error:`, error);
          return new Response(
            JSON.stringify({ error: error.message || 'Failed to send reply' }),
            { status: 500, headers: corsHeaders }
          );
        }
        break;
      }

      case 'deleteThread': {
        const { threadId } = validatedRequest;
        
        if (!threadId) {
          return new Response(
            JSON.stringify({ error: 'threadId is required for deleteThread action' }),
            { status: 400, headers: corsHeaders }
          );
        }

        try {
          const deleteResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`,
            {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${gmailToken}` }
            }
          );

          if (!deleteResponse.ok) {
            throw new Error(`Failed to delete thread: ${deleteResponse.status}`);
          }

          response.results = [{ success: true, threadId }];

        } catch (error) {
          console.error(`[${requestId}] DeleteThread error:`, error);
          return new Response(
            JSON.stringify({ error: error.message || 'Failed to delete thread' }),
            { status: 500, headers: corsHeaders }
          );
        }
        break;
      }

      case 'deleteMessage': {
        const { messageId } = validatedRequest;
        
        if (!messageId) {
          return new Response(
            JSON.stringify({ error: 'messageId is required for deleteMessage action' }),
            { status: 400, headers: corsHeaders }
          );
        }

        try {
          const deleteResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
            {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${gmailToken}` }
            }
          );

          if (!deleteResponse.ok) {
            throw new Error(`Failed to delete message: ${deleteResponse.status}`);
          }

          response.results = [{ success: true, messageId }];

        } catch (error) {
          console.error(`[${requestId}] DeleteMessage error:`, error);
          return new Response(
            JSON.stringify({ error: error.message || 'Failed to delete message' }),
            { status: 500, headers: corsHeaders }
          );
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${(validatedRequest as any).action}` }),
          { status: 400, headers: corsHeaders }
        );
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Unhandled error:`, error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        requestId 
      }),
      { status: 500, headers: corsHeaders }
    );
  }
};

serve(handler);
