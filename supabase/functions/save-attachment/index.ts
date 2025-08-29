import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import { z } from 'https://esm.sh/zod@3.23.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const requestSchema = z.object({
  messageId: z.string().min(1),
  attachmentId: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().min(0),
  emailSubject: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional()
})

class SaveAttachmentError extends Error {
  constructor(message: string, public status: number = 500) {
    super(message);
    this.name = 'SaveAttachmentError';
  }
}

const handler = async (req: Request): Promise<Response> => {
  const requestId = Math.random().toString(36).substring(2, 15);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[${requestId}] Save attachment request received`);
    
    // Authenticate user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new SaveAttachmentError('Authorization header required', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error(`[${requestId}] Auth error:`, userError);
      throw new SaveAttachmentError('Invalid authentication token', 401);
    }

    // Parse request
    const requestBody = await req.json();
    const validation = requestSchema.safeParse(requestBody);
    
    if (!validation.success) {
      console.error(`[${requestId}] Validation error:`, validation.error);
      throw new SaveAttachmentError('Invalid request format', 400);
    }

    const request = validation.data;

    // First, download the attachment from Gmail API
    const gmailResponse = await supabaseClient.functions.invoke('gmail-api', {
      body: {
        action: 'downloadAttachment',
        messageId: request.messageId,
        attachmentId: request.attachmentId
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (gmailResponse.error) {
      throw new SaveAttachmentError(`Failed to download attachment: ${gmailResponse.error}`, 400);
    }

    const { data: fileData, base64Data } = gmailResponse.data;

    // Convert base64 data to Uint8Array for storage
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Generate unique filename to avoid collisions
    const timestamp = Date.now();
    const fileExtension = request.filename.split('.').pop() || '';
    const baseName = request.filename.replace(/\.[^/.]+$/, '');
    const uniqueFilename = `${baseName}_${timestamp}${fileExtension ? '.' + fileExtension : ''}`;
    const filePath = `attachments/${user.id}/${uniqueFilename}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('documents')
      .upload(filePath, bytes, {
        contentType: request.mimeType,
        duplex: 'half'
      });

    if (uploadError) {
      console.error(`[${requestId}] Upload error:`, uploadError);
      throw new SaveAttachmentError(`Failed to save attachment: ${uploadError.message}`, 500);
    }

    // Create document record
    const { data: documentData, error: documentError } = await supabaseClient
      .from('user_documents')
      .insert({
        user_id: user.id,
        name: request.filename,
        file_path: filePath,
        file_size: request.size,
        mime_type: request.mimeType,
        source_type: 'email_attachment',
        source_email_id: request.messageId,
        source_email_subject: request.emailSubject,
        category: request.category || 'email_attachment',
        tags: request.tags || [],
        description: request.description
      })
      .select()
      .single();

    if (documentError) {
      console.error(`[${requestId}] Document insert error:`, documentError);
      
      // Clean up uploaded file if document creation failed
      await supabaseClient.storage
        .from('documents')
        .remove([filePath]);
        
      throw new SaveAttachmentError(`Failed to create document record: ${documentError.message}`, 500);
    }

    console.log(`[${requestId}] Attachment saved successfully: ${filePath}`);
    
    return new Response(JSON.stringify({
      success: true,
      document: documentData,
      message: 'Attachment saved to documents successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`[${requestId}] Handler error:`, error);
    
    const status = error instanceof SaveAttachmentError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';
    
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: corsHeaders }
    );
  }
};

serve(handler);