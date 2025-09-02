import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  subject: string;
  content: string;
  threadId?: string;
  attachmentPaths: string[];
  documentAttachments: Array<{
    name: string;
    file_path: string;
    mime_type: string;
    file_size: number;
  }>;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== ASYNC EMAIL SENDER START ===');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid authorization token');
    }

    console.log('User authenticated:', user.email);

    const emailRequest: EmailRequest = await req.json();
    console.log('Email request:', {
      to: emailRequest.to,
      subject: emailRequest.subject,
      hasContent: !!emailRequest.content,
      threadId: emailRequest.threadId,
      attachmentPaths: emailRequest.attachmentPaths.length,
      documentAttachments: emailRequest.documentAttachments.length
    });

    // Process attachments from storage in chunks to avoid memory issues
    const processedAttachments = [];
    
    // Process uploaded file attachments
    for (const attachmentPath of emailRequest.attachmentPaths) {
      try {
        console.log('Processing attachment from storage:', attachmentPath);
        
        // Download the file from storage
        const { data: fileData, error: downloadError } = await supabaseClient.storage
          .from('email-attachments')
          .download(attachmentPath);

        if (downloadError) {
          console.error('Failed to download attachment:', downloadError);
          continue; // Skip this attachment but continue with others
        }

        if (!fileData) {
          console.error('No data received for attachment:', attachmentPath);
          continue;
        }

        // Convert to base64 in chunks to avoid memory issues
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Process in 1MB chunks
        const chunkSize = 1024 * 1024; // 1MB
        let base64String = '';
        
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, i + chunkSize);
          const binaryString = Array.from(chunk, byte => String.fromCharCode(byte)).join('');
          base64String += btoa(binaryString);
        }

        // Extract filename from path
        const filename = attachmentPath.split('/').pop() || 'attachment';
        const cleanFilename = filename.replace(/^\d+-/, ''); // Remove timestamp prefix

        processedAttachments.push({
          name: cleanFilename,
          filename: cleanFilename,
          data: base64String,
          type: fileData.type || 'application/octet-stream',
          mimeType: fileData.type || 'application/octet-stream',
          size: fileData.size
        });

        console.log('Successfully processed attachment:', cleanFilename);

        // Clean up the temporary file from storage
        await supabaseClient.storage
          .from('email-attachments')
          .remove([attachmentPath]);

      } catch (error) {
        console.error('Error processing attachment:', attachmentPath, error);
        // Continue with other attachments
      }
    }

    // Process document attachments
    for (const docAttachment of emailRequest.documentAttachments) {
      try {
        console.log('Processing document attachment:', docAttachment.name);
        
        const { data: docData, error: docError } = await supabaseClient.storage
          .from('documents')
          .download(docAttachment.file_path);

        if (docError || !docData) {
          console.error('Failed to download document:', docError);
          continue;
        }

        // Convert to base64 in chunks
        const arrayBuffer = await docData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        const chunkSize = 1024 * 1024; // 1MB
        let base64String = '';
        
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, i + chunkSize);
          const binaryString = Array.from(chunk, byte => String.fromCharCode(byte)).join('');
          base64String += btoa(binaryString);
        }

        processedAttachments.push({
          name: docAttachment.name,
          filename: docAttachment.name,
          data: base64String,
          type: docAttachment.mime_type || 'application/octet-stream',
          mimeType: docAttachment.mime_type || 'application/octet-stream',
          size: docAttachment.file_size || 0
        });

        console.log('Successfully processed document attachment:', docAttachment.name);

      } catch (error) {
        console.error('Error processing document attachment:', docAttachment.name, error);
        // Continue with other attachments
      }
    }

    console.log('Total processed attachments:', processedAttachments.length);

    // Now send the email via the existing Gmail API function
    const emailPayload = {
      action: 'sendEmail',
      to: emailRequest.to,
      subject: emailRequest.subject,
      content: emailRequest.content,
      ...(emailRequest.threadId && { threadId: emailRequest.threadId }),
      ...(processedAttachments.length > 0 && { attachments: processedAttachments })
    };

    console.log('Calling Gmail API with payload keys:', Object.keys(emailPayload));

    const { data: emailResult, error: emailError } = await supabaseClient.functions.invoke('gmail-api', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: emailPayload
    });

    if (emailError) {
      console.error('Gmail API error:', emailError);
      throw new Error(`Failed to send email: ${emailError.message}`);
    }

    console.log('Email sent successfully:', emailResult);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Email sent successfully',
      result: emailResult 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Error in async email sender:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);