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
    
    // For images, we'll create a simple preview frame
    const canvas = new OffscreenCanvas(300, 400);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;
    
    // Create a photo-like frame
    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 300, 400);
    
    // Frame border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 260, 300);
    
    // Image placeholder with gradient
    const gradient = ctx.createLinearGradient(25, 25, 275, 315);
    gradient.addColorStop(0, '#f3f4f6');
    gradient.addColorStop(1, '#e5e7eb');
    ctx.fillStyle = gradient;
    ctx.fillRect(25, 25, 250, 290);
    
    // Image icon
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.arc(150, 140, 30, 0, 2 * Math.PI);
    ctx.fill();
    
    // Mountain shapes for landscape icon
    ctx.beginPath();
    ctx.moveTo(100, 200);
    ctx.lineTo(130, 160);
    ctx.lineTo(160, 180);
    ctx.lineTo(200, 140);
    ctx.lineTo(240, 200);
    ctx.lineTo(100, 200);
    ctx.fillStyle = '#6b7280';
    ctx.fill();
    
    // Image label
    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('IMAGE', 150, 360);
    
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  } catch (error) {
    console.error('Error generating image thumbnail:', error);
    return null;
  }
}

async function generatePDFThumbnail(fileBlob: Blob): Promise<Blob | null> {
  try {
    console.log('Creating PDF thumbnail...');
    
    // For PDF thumbnails, we'll create a realistic document preview
    const canvas = new OffscreenCanvas(300, 400);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;
    
    // Create a realistic PDF document appearance
    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 300, 400);
    
    // Add shadow effect
    ctx.fillStyle = '#00000015';
    ctx.fillRect(5, 5, 300, 400);
    
    // Main document
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 295, 395);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 295, 395);
    
    // Header area with subtle background
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(20, 20, 255, 40);
    
    // Title simulation
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(30, 30, 180, 8);
    ctx.fillRect(30, 45, 120, 6);
    
    // Body content lines
    ctx.fillStyle = '#6b7280';
    const lineHeight = 12;
    const startY = 80;
    
    // Create varied line lengths to simulate real text
    const lineLengths = [0.9, 0.85, 0.95, 0.8, 0.9, 0.7, 0.88, 0.92, 0.85, 0.9, 0.83, 0.95, 0.78, 0.9, 0.85];
    
    for (let i = 0; i < 15; i++) {
      const lineWidth = 240 * lineLengths[i % lineLengths.length];
      ctx.fillRect(30, startY + i * lineHeight, lineWidth, 2);
    }
    
    // Add a paragraph break
    for (let i = 16; i < 25; i++) {
      const lineWidth = 240 * lineLengths[i % lineLengths.length];
      ctx.fillRect(30, startY + i * lineHeight + 8, lineWidth, 2);
    }
    
    // PDF icon in corner
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(250, 350, 30, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PDF', 265, 368);
    
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
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
    let accentColor = '#1a73e8';
    
    if (mimeType.includes('sheet') || mimeType.includes('excel')) {
      bgColor = '#0f9d58'; 
      accentColor = '#0c7c46';
      docType = 'XLS';
    } else if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
      bgColor = '#ff6d01'; 
      accentColor = '#e55100';
      docType = 'PPT';
    } else if (mimeType.includes('word')) {
      bgColor = '#4285f4'; 
      accentColor = '#1a73e8';
      docType = 'DOC';
    }
    
    // Background with shadow
    ctx.fillStyle = '#00000010';
    ctx.fillRect(5, 5, 300, 400);
    
    // Main document background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 295, 395);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 295, 395);
    
    // Header with document color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 295, 60);
    
    // Office app icon simulation
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(20, 15, 30, 30);
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(docType.charAt(0), 35, 35);
    
    // Document title area
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(60, 20, 180, 8);
    ctx.fillRect(60, 35, 120, 6);
    
    // Content area based on document type
    if (docType === 'XLS') {
      // Spreadsheet grid
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      
      // Draw grid
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 12; j++) {
          ctx.strokeRect(20 + i * 32, 80 + j * 20, 32, 20);
          
          // Add some data simulation
          if (Math.random() > 0.6) {
            ctx.fillStyle = '#6b7280';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('###', 36 + i * 32, 92 + j * 20);
          }
        }
      }
    } else if (docType === 'PPT') {
      // Presentation slides
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(40 + i * 70, 90, 60, 40);
        ctx.strokeStyle = '#e5e7eb';
        ctx.strokeRect(40 + i * 70, 90, 60, 40);
        
        // Title and content blocks
        ctx.fillStyle = '#9ca3af';
        ctx.fillRect(45 + i * 70, 95, 50, 4);
        ctx.fillRect(45 + i * 70, 105, 30, 2);
        ctx.fillRect(45 + i * 70, 110, 40, 2);
      }
    } else {
      // Document text lines
      ctx.fillStyle = '#6b7280';
      const lineHeight = 12;
      const startY = 80;
      const lineLengths = [0.9, 0.8, 0.95, 0.7, 0.85, 0.9, 0.75, 0.88];
      
      for (let i = 0; i < 20; i++) {
        const lineWidth = 240 * lineLengths[i % lineLengths.length];
        ctx.fillRect(30, startY + i * lineHeight, lineWidth, 2);
        
        // Add paragraph breaks
        if (i === 7 || i === 14) {
          i++; // Skip a line
        }
      }
    }
    
    // App type label in corner
    ctx.fillStyle = bgColor;
    ctx.fillRect(245, 345, 40, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(docType, 265, 368);
    
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  } catch (error) {
    console.error('Error generating Office document thumbnail:', error);
    return null;
  }
}