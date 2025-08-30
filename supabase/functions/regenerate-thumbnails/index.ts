import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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
    console.log('Regenerate thumbnails request received');
    
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get user from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Verify user authentication
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    
    console.log('Finding documents without thumbnails for user:', user.id);
    
    // Find documents without thumbnails that support thumbnail generation
    const { data: documents, error: documentsError } = await supabase
      .from('user_documents')
      .select('id, name, file_path, mime_type')
      .eq('user_id', user.id)
      .eq('is_folder', false)
      .is('thumbnail_path', null)
      .not('mime_type', 'is', null);
    
    if (documentsError) {
      console.error('Error fetching documents:', documentsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch documents' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    const supportedTypes = documents?.filter(doc => 
      doc.mime_type && (
        doc.mime_type.startsWith('image/') ||
        doc.mime_type.includes('pdf') ||
        doc.mime_type.includes('officedocument') ||
        doc.mime_type.includes('msword') ||
        doc.mime_type.includes('ms-excel') ||
        doc.mime_type.includes('ms-powerpoint')
      )
    ) || [];
    
    console.log(`Found ${supportedTypes.length} documents that can have thumbnails generated`);
    
    if (supportedTypes.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No documents found that need thumbnail generation',
          processed: 0,
          total: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process documents in batches to avoid overwhelming the system
    for (const doc of supportedTypes) {
      try {
        console.log(`Generating thumbnail for: ${doc.name}`);
        
        const { error: thumbnailError } = await supabase.functions.invoke('generate-thumbnail', {
          body: {
            documentId: doc.id,
            filePath: doc.file_path,
            mimeType: doc.mime_type
          }
        });
        
        if (thumbnailError) {
          console.error(`Failed to generate thumbnail for ${doc.name}:`, thumbnailError);
          errorCount++;
        } else {
          console.log(`Successfully generated thumbnail for: ${doc.name}`);
          successCount++;
        }
        
        // Add a small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error processing ${doc.name}:`, error);
        errorCount++;
      }
    }
    
    console.log(`Thumbnail generation complete. Success: ${successCount}, Errors: ${errorCount}`);
    
    return new Response(
      JSON.stringify({
        message: 'Thumbnail generation completed',
        processed: successCount + errorCount,
        successful: successCount,
        failed: errorCount,
        total: supportedTypes.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in regenerate-thumbnails function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});