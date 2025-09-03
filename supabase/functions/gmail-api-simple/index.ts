import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

interface SendEmailRequest {
  action: string;
  to: string;
  subject: string;
  content: string;
  attachments?: Array<{
    name: string;
    data: string; // base64
    type: string;
    size: number;
  }>;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] === SIMPLE GMAIL API START ===`);

  try {
    // Get auth token from headers
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    
    const accessToken = authHeader.replace('Bearer ', '');
    console.log(`[${requestId}] Got access token`);

    const body = await req.json();
    console.log(`[${requestId}] Action: ${body.action}`);

    if (body.action === 'sendEmail') {
      return await handleSendEmail(requestId, accessToken, body);
    }

    // For other actions, proxy to original function
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data, error } = await supabase.functions.invoke('gmail-api', {
      body,
      headers: { authorization: authHeader }
    });

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`[${requestId}] Handler error:`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
};

async function handleSendEmail(
  requestId: string, 
  accessToken: string, 
  request: SendEmailRequest
): Promise<Response> {
  console.log(`[${requestId}] === SEND EMAIL START ===`);
  console.log(`[${requestId}] To: ${request.to}`);
  console.log(`[${requestId}] Subject: ${request.subject}`);
  console.log(`[${requestId}] Attachments: ${request.attachments?.length || 0}`);

  // Set strict timeout
  const timeout = setTimeout(() => {
    console.error(`[${requestId}] TIMEOUT - Operation exceeded 8 seconds`);
    throw new Error('Email sending timeout');
  }, 8000);

  try {
    // Validate attachments
    if (request.attachments?.length) {
      const totalSize = request.attachments.reduce((sum, att) => sum + (att.size || 0), 0);
      console.log(`[${requestId}] Total attachment size: ${Math.round(totalSize / 1024 / 1024 * 100) / 100}MB`);
      
      if (totalSize > 25 * 1024 * 1024) {
        throw new Error('Total attachment size exceeds 25MB Gmail limit');
      }
    }

    // Build email
    const boundary = `----SimpleBoundary${Date.now()}`;
    
    let emailParts = [
      `To: ${request.to}`,
      `Subject: ${request.subject}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
    ];

    if (request.attachments?.length) {
      emailParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      emailParts.push('');
      emailParts.push(`--${boundary}`);
      emailParts.push('Content-Type: text/html; charset=utf-8');
      emailParts.push('');
      emailParts.push(request.content);
      
      // Add attachments
      for (const att of request.attachments) {
        console.log(`[${requestId}] Adding attachment: ${att.name}`);
        emailParts.push('');
        emailParts.push(`--${boundary}`);
        emailParts.push(`Content-Type: ${att.type || 'application/octet-stream'}`);
        emailParts.push(`Content-Disposition: attachment; filename="${att.name}"`);
        emailParts.push('Content-Transfer-Encoding: base64');
        emailParts.push('');
        
        // Format base64 data with line breaks
        const formattedData = att.data.match(/.{1,76}/g)?.join('\r\n') || att.data;
        emailParts.push(formattedData);
      }
      
      emailParts.push('');
      emailParts.push(`--${boundary}--`);
    } else {
      emailParts.push('Content-Type: text/html; charset=utf-8');
      emailParts.push('');
      emailParts.push(request.content);
    }

    const emailContent = emailParts.join('\r\n');
    console.log(`[${requestId}] Email built, size: ${emailContent.length} chars`);

    // Encode for Gmail API
    const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    console.log(`[${requestId}] Email encoded, making Gmail API call...`);

    // Send via Gmail API
    const response = await fetch(`${GMAIL_API_BASE}/users/me/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedEmail }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] Gmail API error:`, response.status, errorText);
      throw new Error(`Gmail API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[${requestId}] === EMAIL SENT SUCCESSFULLY ===`);
    console.log(`[${requestId}] Message ID: ${result.id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: result.id 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    clearTimeout(timeout);
    console.error(`[${requestId}] Send email error:`, error);
    throw error;
  }
}

serve(handler);