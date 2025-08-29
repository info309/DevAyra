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
  
  console.log(`[${requestId}] ⭐ Save attachment request started`);
  
  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] OPTIONS request handled`);
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[${requestId}] 📝 Processing save attachment request`);
    
    // Authenticate user and create service role client for database operations
    console.log(`[${requestId}] 🔐 Authenticating user...`);
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error(`[${requestId}] ❌ No auth header`);
      throw new SaveAttachmentError('Authorization header required', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error(`[${requestId}] ❌ Auth failed:`, userError);
      throw new SaveAttachmentError('Invalid authentication token', 401);
    }
    
    console.log(`[${requestId}] ✅ User authenticated: ${user.email}`);

    // Create service role client for database operations to bypass RLS
    const supabaseServiceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request
    console.log(`[${requestId}] 📋 Parsing request body...`);
    const requestBody = await req.json();
    console.log(`[${requestId}] Request body:`, requestBody);
    
    const validation = requestSchema.safeParse(requestBody);
    
    if (!validation.success) {
      console.error(`[${requestId}] ❌ Validation failed:`, validation.error);
      throw new SaveAttachmentError('Invalid request format', 400);
    }

    const request = validation.data;
    console.log(`[${requestId}] ✅ Request validated:`, request);

    // First, download the attachment from Gmail API
    console.log(`[${requestId}] 📥 Downloading from Gmail API...`);
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
      console.error(`[${requestId}] ❌ Gmail API error:`, gmailResponse.error);
      throw new SaveAttachmentError(`Failed to download attachment: ${gmailResponse.error}`, 400);
    }
    
    console.log(`[${requestId}] ✅ Gmail download successful`);

    const { data: fileData, base64Data } = gmailResponse.data;

    // Convert base64URL data to Uint8Array for storage
    console.log(`[${requestId}] 🔄 Converting base64URL to binary data...`);
    
    // Gmail returns base64URL format, convert to standard base64
    let standardBase64 = base64Data.replace(/-/g, "+").replace(/_/g, "/");
    
    // Add padding if needed
    while (standardBase64.length % 4 !== 0) {
      standardBase64 += "=";
    }
    
    console.log(`[${requestId}] 📋 Base64 conversion: original length ${base64Data.length}, standard length ${standardBase64.length}`);
    
    const bytes = Uint8Array.from(atob(standardBase64), c => c.charCodeAt(0));

    // Generate unique filename to avoid collisions
    const timestamp = Date.now();
    const fileExtension = request.filename.split('.').pop() || '';
    const baseName = request.filename.replace(/\.[^/.]+$/, '');
    const uniqueFilename = `${baseName}_${timestamp}${fileExtension ? '.' + fileExtension : ''}`;
    const filePath = `attachments/${user.id}/${uniqueFilename}`;
    
    console.log(`[${requestId}] 📁 File path: ${filePath}`);

    // Upload to Supabase Storage
    console.log(`[${requestId}] ☁️ Uploading to storage bucket 'documents', path: ${filePath}, size: ${bytes.length} bytes...`);
    const { data: uploadData, error: uploadError } = await supabaseServiceClient.storage
      .from('documents')
      .upload(filePath, bytes, {
        contentType: request.mimeType,
        duplex: 'half'
      });
    
    console.log(`[${requestId}] 📤 Storage upload result:`, { uploadData, uploadError });

    if (uploadError) {
      console.error(`[${requestId}] ❌ Upload failed:`, uploadError);
      throw new SaveAttachmentError(`Failed to save attachment: ${uploadError.message}`, 500);
    }
    
    console.log(`[${requestId}] ✅ Upload successful:`, uploadData);

    // Create document record using service role client to bypass RLS
    console.log(`[${requestId}] 📝 Creating document record for user ${user.id}...`);
    const documentRecord = {
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
      description: request.description,
      is_folder: false
    };
    
    console.log(`[${requestId}] 📋 Document record to insert:`, documentRecord);
    
    const { data: documentData, error: documentError } = await supabaseServiceClient
      .from('user_documents')
      .insert(documentRecord)
      .select()
      .single();
    
    console.log(`[${requestId}] 📤 Document insert result:`, { documentData, documentError });

    if (documentError) {
      console.error(`[${requestId}] ❌ Document creation failed:`, documentError);
      
      // Clean up uploaded file if document creation failed
      await supabaseServiceClient.storage
        .from('documents')
        .remove([filePath]);
        
      throw new SaveAttachmentError(`Failed to create document record: ${documentError.message}`, 500);
    }

    console.log(`[${requestId}] ✅ Document created successfully:`, documentData);
    
    return new Response(JSON.stringify({
      success: true,
      document: documentData,
      message: 'Attachment saved to documents successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`[${requestId}] ❌ Handler error:`, error);
    
    const status = error instanceof SaveAttachmentError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';
    
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: corsHeaders }
    );
  }
};

serve(handler);