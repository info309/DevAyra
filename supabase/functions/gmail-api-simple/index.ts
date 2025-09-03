import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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

    // Get auth token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error(`[${requestId}] No authorization header`);
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const accessToken = authHeader.replace('Bearer ', '');
    console.log(`[${requestId}] Got access token (length: ${accessToken.length})`);

    if (body.action === 'sendEmail') {
      return await handleSendEmail(requestId, accessToken, body);
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
          throw new Error(`Attachment ${att.name} is missing data`);
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
        '',
        request.content || 'No content',
        ''
      ].join('\r\n');
      
      // Add attachments
      for (const att of request.attachments) {
        console.log(`[${requestId}] Adding attachment: ${att.name} (${att.size} bytes)`);
        
        emailContent += [
          `--${boundary}`,
          `Content-Type: ${att.type || 'application/octet-stream'}`,
          `Content-Disposition: attachment; filename="${att.name}"`,
          `Content-Transfer-Encoding: base64`,
          '',
          att.data.match(/.{1,76}/g)?.join('\r\n') || att.data,
          ''
        ].join('\r\n');
      }
      
      emailContent += `--${boundary}--\r\n`;
    }

    console.log(`[${requestId}] Email built, size: ${emailContent.length} chars`);

    // Encode for Gmail API
    const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
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