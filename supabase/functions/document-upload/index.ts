import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
          source_type: string;
          source_email_id: string | null;
          source_email_subject: string | null;
          category: string | null;
          tags: string[] | null;
          description: string | null;
          is_favorite: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          file_path: string;
          file_size?: number | null;
          mime_type?: string | null;
          source_type?: string;
          source_email_id?: string | null;
          source_email_subject?: string | null;
          category?: string | null;
          tags?: string[] | null;
          description?: string | null;
          is_favorite?: boolean;
        };
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
    // Create Supabase client
    const supabaseClient = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the user from the Authorization header
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const category = formData.get('category') as string;
    const description = formData.get('description') as string;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return new Response(JSON.stringify({ error: 'File too large. Maximum size is 50MB.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate unique file path
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${user.id}/documents/${timestamp}_${sanitizedFilename}`;

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { error: storageError } = await supabaseClient.storage
      .from('documents')
      .upload(filePath, uint8Array, {
        contentType: file.type,
        upsert: false
      });

    if (storageError) {
      console.error('Storage upload error:', storageError);
      return new Response(JSON.stringify({ error: 'Failed to upload file' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Save document record to database
    const { data: document, error: dbError } = await supabaseClient
      .from('user_documents')
      .insert({
        user_id: user.id,
        name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        source_type: 'upload',
        category: category || null,
        description: description || null
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      
      // Try to cleanup uploaded file if database insert fails
      await supabaseClient.storage
        .from('documents')
        .remove([filePath]);
        
      return new Response(JSON.stringify({ error: 'Failed to save document record' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      document,
      message: 'File uploaded successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in document-upload function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});