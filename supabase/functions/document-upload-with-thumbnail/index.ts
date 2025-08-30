import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

interface Database {
  public: {
    Tables: {
      user_documents: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          file_path: string;
          file_size: number | null;
          mime_type: string | null;
          source_type: string | null;
          source_email_id: string | null;
          source_email_subject: string | null;
          category: string | null;
          tags: string[] | null;
          description: string | null;
          is_favorite: boolean | null;
          is_folder: boolean;
          folder_id: string | null;
          thumbnail_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_documents']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_documents']['Insert']>;
      };
    };
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Document upload with thumbnail generation request received');
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Get user from request headers
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Verify user authentication
    const { data: userData, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const userId = userData.user.id;

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const folderId = formData.get('folderId') as string;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return new Response(
        JSON.stringify({ error: 'File size exceeds 50MB limit' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Generate unique file path
    const fileExtension = file.name.split('.').pop() || '';
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
    const filePath = `${userId}/${uniqueFileName}`;

    console.log('Uploading file to storage:', filePath);

    // Upload file to storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        contentType: file.type,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload file to storage' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('File uploaded successfully, inserting database record...');

    // Insert document record
    const { data: documentData, error: insertError } = await supabase
      .from('user_documents')
      .insert({
        user_id: userId,
        name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        source_type: 'upload',
        folder_id: folderId || null,
        is_folder: false,
      })
      .select()
      .single();

    if (insertError || !documentData) {
      console.error('Database insert error:', insertError);
      
      // Clean up uploaded file
      await supabase.storage.from('documents').remove([filePath]);
      
      return new Response(
        JSON.stringify({ error: 'Failed to create document record' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('Document record created successfully, triggering thumbnail generation...');

    // Trigger thumbnail generation asynchronously (don't wait for it)
    supabase.functions.invoke('generate-thumbnail', {
      body: {
        documentId: documentData.id,
        filePath: filePath,
        mimeType: file.type
      }
    }).catch(error => {
      console.error('Error triggering thumbnail generation:', error);
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        document: documentData 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in document-upload-with-thumbnail function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});