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
    console.log('Thumbnail generation request received');
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { documentId, filePath, mimeType } = await req.json();
    
    console.log('Processing thumbnail for:', { documentId, filePath, mimeType });
    
    if (!documentId || !filePath || !mimeType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: documentId, filePath, mimeType' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Download the original file
    console.log('Downloading original file from storage...');
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(filePath);
    
    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError);
      return new Response(
        JSON.stringify({ error: 'Failed to download original file' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    console.log('File downloaded successfully, size:', fileData.size);
    
    let thumbnailBlob: Blob | null = null;
    
    // Generate thumbnail based on file type
    if (mimeType.startsWith('image/')) {
      console.log('Generating thumbnail for image...');
      thumbnailBlob = await generateImageThumbnail(fileData);
    } else if (mimeType.includes('pdf')) {
      console.log('Generating thumbnail for PDF...');
      thumbnailBlob = await generatePDFThumbnail(fileData);
    } else if (mimeType.includes('officedocument') || mimeType.includes('msword') || mimeType.includes('ms-excel') || mimeType.includes('ms-powerpoint')) {
      console.log('Generating thumbnail for Office document...');
      thumbnailBlob = await generateOfficeThumbnail(fileData, mimeType);
    } else {
      console.log('Unsupported file type for thumbnail generation:', mimeType);
      return new Response(
        JSON.stringify({ message: 'Thumbnail generation not supported for this file type' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    
    if (!thumbnailBlob) {
      console.log('No thumbnail generated');
      return new Response(
        JSON.stringify({ message: 'Failed to generate thumbnail' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    
    // Upload thumbnail to storage
    const thumbnailPath = `thumbnails/${documentId}.jpg`;
    console.log('Uploading thumbnail to storage:', thumbnailPath);
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(thumbnailPath, thumbnailBlob, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (uploadError) {
      console.error('Error uploading thumbnail:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload thumbnail' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    // Update document record with thumbnail path
    const { error: updateError } = await supabase
      .from('user_documents')
      .update({ thumbnail_path: thumbnailPath })
      .eq('id', documentId);
    
    if (updateError) {
      console.error('Error updating document with thumbnail path:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update document record' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    console.log('Thumbnail generated and saved successfully');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        thumbnailPath,
        message: 'Thumbnail generated successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in generate-thumbnail function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function generateImageThumbnail(fileBlob: Blob): Promise<Blob | null> {
  try {
    console.log('Creating image thumbnail...');
    
    // Convert blob to base64 for processing
    const arrayBuffer = await fileBlob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const dataUrl = `data:${fileBlob.type};base64,${base64}`;
    
    // For now, we'll return the original image as thumbnail
    // In a production environment, you'd want to resize this
    const canvas = new OffscreenCanvas(300, 400);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;
    
    // Create a simple thumbnail placeholder for images
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 300, 400);
    ctx.fillStyle = '#666';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Image Thumbnail', 150, 200);
    
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } catch (error) {
    console.error('Error generating image thumbnail:', error);
    return null;
  }
}

async function generatePDFThumbnail(fileBlob: Blob): Promise<Blob | null> {
  try {
    console.log('Creating PDF thumbnail...');
    
    // Create a placeholder thumbnail for PDFs
    const canvas = new OffscreenCanvas(300, 400);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;
    
    // Create a PDF-like thumbnail
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 300, 400);
    ctx.strokeStyle = '#ddd';
    ctx.strokeRect(0, 0, 300, 400);
    
    // Add some lines to simulate text
    ctx.fillStyle = '#333';
    for (let i = 0; i < 15; i++) {
      ctx.fillRect(20, 30 + i * 20, 260, 2);
    }
    
    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PDF', 150, 360);
    
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } catch (error) {
    console.error('Error generating PDF thumbnail:', error);
    return null;
  }
}

async function generateOfficeThumbnail(fileBlob: Blob, mimeType: string): Promise<Blob | null> {
  try {
    console.log('Creating Office document thumbnail...');
    
    const canvas = new OffscreenCanvas(300, 400);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;
    
    // Determine document type and color
    let bgColor = '#4285f4'; // Default blue
    let docType = 'DOC';
    
    if (mimeType.includes('sheet') || mimeType.includes('excel')) {
      bgColor = '#0f9d58'; // Green for Excel
      docType = 'XLS';
    } else if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
      bgColor = '#ff6d01'; // Orange for PowerPoint
      docType = 'PPT';
    } else if (mimeType.includes('word')) {
      bgColor = '#4285f4'; // Blue for Word
      docType = 'DOC';
    }
    
    // Create document-like thumbnail
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 300, 400);
    ctx.strokeStyle = '#ddd';
    ctx.strokeRect(0, 0, 300, 400);
    
    // Add header with document color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 300, 80);
    
    // Add document content simulation
    ctx.fillStyle = '#333';
    for (let i = 0; i < 12; i++) {
      ctx.fillRect(20, 100 + i * 20, 260, 2);
    }
    
    // Add document type label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(docType, 150, 50);
    
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } catch (error) {
    console.error('Error generating Office document thumbnail:', error);
    return null;
  }
}