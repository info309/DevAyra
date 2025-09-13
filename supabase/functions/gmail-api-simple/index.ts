import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.190.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

const handler = async (req: Request): Promise<Response> => {
  console.log('=== SIMPLE GMAIL API HANDLER START ===');
  
  // Handle CORS
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] Processing request`);

  try {
    // Get request body
    let body;
    try {
      body = await req.json();
      console.log(`[${requestId}] Request body parsed:`, { action: body.action, to: body.to });
    } catch (e) {
      console.error(`[${requestId}] Failed to parse JSON:`, e);
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get auth token and verify with Supabase
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error(`[${requestId}] No authorization header`);
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const supabaseToken = authHeader.replace('Bearer ', '');
    console.log(`[${requestId}] Got Supabase token (length: ${supabaseToken.length})`);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(supabaseToken);
    
    if (userError || !user) {
      console.error(`[${requestId}] Failed to get user:`, userError);
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[${requestId}] Authenticated user: ${user.id}`);

    // Get user's Gmail connection
    const { data: gmailConnection, error: connectionError } = await supabase
      .from('gmail_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (connectionError || !gmailConnection) {
      console.error(`[${requestId}] No active Gmail connection:`, connectionError);
      return new Response(JSON.stringify({ error: 'Gmail account not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[${requestId}] Found Gmail connection for: ${gmailConnection.email_address}`);
    const gmailAccessToken = gmailConnection.access_token;

    if (body.action === 'sendEmail') {
      return await handleSendEmail(requestId, gmailAccessToken, body);
    } else {
      console.error(`[${requestId}] Unsupported action: ${body.action}`);
      return new Response(JSON.stringify({ error: 'Unsupported action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error(`[${requestId}] Handler error:`, error);
    console.error(`[${requestId}] Error stack:`, error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error',
      details: error.toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

async function handleSendEmail(requestId: string, accessToken: string, request: any): Promise<Response> {
  // Create a Supabase client for storage operations within this scope
  const supabaseStorage = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );
  console.log(`[${requestId}] === SEND EMAIL START ===`);
  console.log(`[${requestId}] To: ${request.to}`);
  console.log(`[${requestId}] Subject: ${request.subject}`);
  console.log(`[${requestId}] Attachments: ${request.attachments?.length || 0}`);

  try {
    // Validate required fields
    if (!request.to || !request.subject) {
      throw new Error('Missing required fields: to, subject');
    }

    // Validate attachments
    if (request.attachments?.length) {
      const totalSize = request.attachments.reduce((sum: number, att: any) => sum + (att.size || 0), 0);
      console.log(`[${requestId}] Total attachment size: ${Math.round(totalSize / 1024 / 1024 * 100) / 100}MB`);
      
      if (totalSize > 25 * 1024 * 1024) {
        throw new Error('Total attachment size exceeds 25MB Gmail limit');
      }
      
      // Validate each attachment has required data
      for (const att of request.attachments) {
        if (!att.data) {
          throw new Error(`Attachment ${att.name || 'undefined'} is missing data`);
        }
        if (!att.name) {
          throw new Error('Attachment name is required');
        }
        if (!att.type) {
          throw new Error(`Attachment ${att.name} is missing type`);
        }
        // For URL attachments, validate that we have either a full HTTP URL or a valid storage path
        if (att.isUrl && att.bucket && !att.data.startsWith('http')) {
          // This is a Supabase storage path - validate it has the expected format
          if (!att.data.includes('/')) {
            throw new Error(`Attachment ${att.name} has invalid storage path format`);
          }
        } else if (att.isUrl && !att.bucket && !att.data.startsWith('http')) {
          throw new Error(`Attachment ${att.name} has invalid URL`);
        }
      }
    }

    // Build simple email without attachments first (for testing)
    let emailContent;
    
    if (!request.attachments?.length) {
      // Simple text email
      emailContent = [
        `To: ${request.to}`,
        `Subject: ${request.subject}`,
        `Date: ${new Date().toUTCString()}`,
        `Content-Type: text/html; charset=utf-8`,
        '',
        request.content || 'No content'
      ].join('\r\n');
    } else {
      // Email with attachments
      const boundary = `----SimpleBoundary${Date.now()}`;
      
      emailContent = [
        `To: ${request.to}`,
        `Subject: ${request.subject}`,
        `Date: ${new Date().toUTCString()}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: 7bit`,
        '',
        request.content || 'No content',
        ''
      ].join('\r\n');
      
      // Add attachments
      for (const att of request.attachments) {
        // Normalize name: accept either name or filename from client
        if (!att.name && att.filename) {
          att.name = att.filename;
        }
        console.log(`[${requestId}] Processing attachment:`, {
          name: att.name,
          type: att.type,
          size: att.size,
          isUrl: att.isUrl,
          bucket: att.bucket
        });

        let attachmentData = att.data;
        
        // If this is a URL attachment, check if we need to fetch the data
        if (att.isUrl) {
          // Check if data is already base64 content or needs to be fetched
          // Base64 content typically starts with letters/numbers and doesn't look like a path
          const looksLikeBase64 = /^[A-Za-z0-9+/]/.test(att.data) && att.data.length > 100;
          const looksLikePath = att.data.includes('/') && !att.data.startsWith('http') && att.data.split('/').length >= 2;
          const isBase64Content = looksLikeBase64 && !looksLikePath;
          
          if (isBase64Content) {
            console.log(`[${requestId}] Attachment data is already base64 content, using directly`);
            // Data is already base64 encoded, use it directly
            attachmentData = att.data;
          } else {
            console.log(`[${requestId}] Fetching attachment from URL`);
            
            let bucket, path;
            
            // Handle both full URLs and storage paths
            if (att.data.startsWith('http')) {
              // Extract bucket and path from the public URL: /storage/v1/object/public/<bucket>/<path>
              const url = new URL(att.data);
              const prefix = '/storage/v1/object/public/';
              let relativePath = url.pathname.startsWith(prefix)
                ? url.pathname.slice(prefix.length)
                : url.pathname.replace(/^\/+/, '');
              const [bucketName, ...pathParts] = relativePath.split('/');
              bucket = bucketName;
              path = pathParts.join('/');
            } else {
              // Handle direct storage path format (bucket provided separately)
              bucket = att.bucket || 'documents';
              path = att.data;
            }
            
            console.log(`[${requestId}] Fetching from storage:`, { bucket, path });
            
            const { data: fileData, error: downloadError } = await supabaseStorage
              .storage
              .from(bucket)
              .download(path);
              
            if (downloadError) {
              console.error(`[${requestId}] Failed to download from storage:`, downloadError);
              throw new Error(`Failed to download ${att.name}: ${downloadError.message}`);
            }
            
            if (!fileData) {
              throw new Error(`No data received for ${att.name}`);
            }
            
            console.log(`[${requestId}] File downloaded successfully:`, {
              name: att.name,
              type: att.type,
              size: fileData.size
            });
            // Convert Blob to ArrayBuffer
            const buffer = await fileData.arrayBuffer();
            // Use Deno stdlib base64 encoder for binary safety
            let uint8 = new Uint8Array(buffer);

            // Validate magic bytes; if mismatch, fall back to fetching the public URL directly
            const magic = Array.from(uint8.slice(0, 8));
            const isLikelyPdf = magic[0] === 0x25 && magic[1] === 0x50 && magic[2] === 0x44 && magic[3] === 0x46; // %PDF
            const isLikelyIsoBmff = magic[4] === 0x66 && magic[5] === 0x74 && magic[6] === 0x79 && magic[7] === 0x70; // ....ftyp
            const expectedPdf = att.type === 'application/pdf';
            const expectedImage = (att.type || '').startsWith('image/');

            if ((expectedPdf && !isLikelyPdf) || (expectedImage && !isLikelyIsoBmff && att.type !== 'image/png' && att.type !== 'image/jpeg')) {
              console.warn(`[${requestId}] Storage download signature mismatch for ${att.name}. Falling back to direct fetch.`);
              const direct = await fetch(att.data);
              if (!direct.ok) {
                throw new Error(`Fallback fetch failed ${direct.status}`);
              }
              const ab = await direct.arrayBuffer();
              uint8 = new Uint8Array(ab);
            }

            attachmentData = encodeBase64(uint8);
            console.log(`[${requestId}] Attachment fetched and encoded: ${attachmentData.length} chars`);
          }
        }
        
        emailContent += [
          `--${boundary}`,
          `Content-Type: ${att.type || 'application/octet-stream'}; name="${att.name}"`,
          `Content-Disposition: attachment; filename="${att.name}"`,
          `Content-Transfer-Encoding: base64`,
          '',
          attachmentData.match(/.{1,76}/g)?.join('\r\n') || attachmentData,
          ''
        ].join('\r\n');
      }
      
      emailContent += `--${boundary}--\r\n`;
    }

    console.log(`[${requestId}] Email built, size: ${emailContent.length} chars`);

    // Encode for Gmail API using binary-safe path
    const rawBytes = new TextEncoder().encode(emailContent);
    const encodedEmail = encodeBase64(rawBytes)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    console.log(`[${requestId}] Email encoded, size: ${encodedEmail.length} chars`);

    // Test Gmail API access first
    console.log(`[${requestId}] Testing Gmail API access...`);
    const testResponse = await fetch(`${GMAIL_API_BASE}/users/me/profile`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error(`[${requestId}] Gmail API access test failed:`, testResponse.status, errorText);
      throw new Error(`Gmail API access denied: ${testResponse.status} - ${errorText}`);
    }

    console.log(`[${requestId}] Gmail API access OK, sending email...`);

    // Send email
    const response = await fetch(`${GMAIL_API_BASE}/users/me/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedEmail }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] Gmail send failed:`, response.status, errorText);
      throw new Error(`Gmail API send error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[${requestId}] === EMAIL SENT SUCCESSFULLY ===`);
    console.log(`[${requestId}] Message ID: ${result.id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: result.id 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`[${requestId}] Send email error:`, error);
    console.error(`[${requestId}] Send email stack:`, error.stack);
    
    return new Response(JSON.stringify({
      error: error.message || 'Send email failed',
      details: error.toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

serve(handler);