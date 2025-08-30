import { supabase } from '@/integrations/supabase/client';

export class ThumbnailGenerator {
  
  static async generatePDFThumbnail(file: File): Promise<Blob | null> {
    try {
      console.log('Generating PDF thumbnail on client...');
      
      // Dynamically import PDF.js to avoid top-level await issues
      const pdfjsLib = await import('pdfjs-dist');
      
      // Configure PDF.js worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js`;
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      
      const viewport = page.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) return null;
      
      // Set canvas size to thumbnail dimensions (300x400)
      const scale = Math.min(300 / viewport.width, 400 / viewport.height);
      const scaledViewport = page.getViewport({ scale });
      
      canvas.height = 400;
      canvas.width = 300;
      
      // Center the PDF page on canvas
      const offsetX = (300 - scaledViewport.width) / 2;
      const offsetY = (400 - scaledViewport.height) / 2;
      
      // Fill with white background
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 300, 400);
      
      // Render PDF page
      context.translate(offsetX, offsetY);
      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
      }).promise;
      
      // Convert to blob
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/webp', 0.8);
      });
      
    } catch (error) {
      console.error('Error generating PDF thumbnail:', error);
      return null;
    }
  }
  
  static async generateVideoThumbnail(file: File): Promise<Blob | null> {
    try {
      console.log('Generating video thumbnail on client...');
      
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) return null;
      
      return new Promise((resolve) => {
        video.onloadedmetadata = () => {
          // Seek to 1 second or 10% of video, whichever is smaller
          video.currentTime = Math.min(1, video.duration * 0.1);
        };
        
        video.onseeked = () => {
          // Set canvas dimensions
          canvas.width = 300;
          canvas.height = 400;
          
          // Calculate scaling to fit video in 300x400
          const scale = Math.min(300 / video.videoWidth, 400 / video.videoHeight);
          const scaledWidth = video.videoWidth * scale;
          const scaledHeight = video.videoHeight * scale;
          
          // Center the video frame
          const offsetX = (300 - scaledWidth) / 2;
          const offsetY = (400 - scaledHeight) / 2;
          
          // Fill background with black
          context.fillStyle = '#000000';
          context.fillRect(0, 0, 300, 400);
          
          // Draw video frame
          context.drawImage(video, offsetX, offsetY, scaledWidth, scaledHeight);
          
          // Convert to blob
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/webp', 0.8);
        };
        
        video.onerror = () => {
          console.error('Error loading video for thumbnail');
          resolve(null);
        };
        
        // Load video
        video.src = URL.createObjectURL(file);
        video.load();
      });
      
    } catch (error) {
      console.error('Error generating video thumbnail:', error);
      return null;
    }
  }
  
  static async uploadThumbnailAndUpdateDocument(
    documentId: string, 
    thumbnailBlob: Blob
  ): Promise<boolean> {
    try {
      const thumbnailPath = `thumbnails/${documentId}.webp`;
      
      // Upload thumbnail
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(thumbnailPath, thumbnailBlob, {
          contentType: 'image/webp',
          upsert: true
        });
      
      if (uploadError) {
        console.error('Error uploading thumbnail:', uploadError);
        return false;
      }
      
      // Update document record
      const { error: updateError } = await supabase
        .from('user_documents')
        .update({ thumbnail_path: thumbnailPath })
        .eq('id', documentId);
      
      if (updateError) {
        console.error('Error updating document with thumbnail path:', updateError);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error in uploadThumbnailAndUpdateDocument:', error);
      return false;
    }
  }
  
  static async triggerServerThumbnailGeneration(
    documentId: string,
    filePath: string,
    mimeType: string
  ): Promise<void> {
    try {
      await supabase.functions.invoke('generate-thumbnail', {
        body: { documentId, filePath, mimeType }
      });
    } catch (error) {
      console.error('Error triggering server thumbnail generation:', error);
    }
  }
  
  static async generateThumbnailForDocument(
    documentId: string,
    file: File,
    filePath: string
  ): Promise<void> {
    const mimeType = file.type;
    
    // Try client-side generation first for PDFs and videos
    if (mimeType.includes('pdf')) {
      const thumbnail = await this.generatePDFThumbnail(file);
      if (thumbnail) {
        const success = await this.uploadThumbnailAndUpdateDocument(documentId, thumbnail);
        if (success) return;
      }
    } else if (mimeType.startsWith('video/')) {
      const thumbnail = await this.generateVideoThumbnail(file);
      if (thumbnail) {
        const success = await this.uploadThumbnailAndUpdateDocument(documentId, thumbnail);
        if (success) return;
      }
    }
    
    // Fallback to server-side generation
    await this.triggerServerThumbnailGeneration(documentId, filePath, mimeType);
  }
  
  static async backfillMissingThumbnails(): Promise<void> {
    try {
      console.log('Starting thumbnail backfill...');
      
      // Get documents without thumbnails for image, PDF, and video types
      const { data: documents, error } = await supabase
        .from('user_documents')
        .select('id, name, file_path, mime_type')
        .is('thumbnail_path', null)
        .not('is_folder', 'eq', true)
        .or('mime_type.ilike.image/*,mime_type.ilike.%pdf%,mime_type.ilike.video/*')
        .limit(10); // Process in small batches
      
      if (error) {
        console.error('Error fetching documents for backfill:', error);
        return;
      }
      
      if (!documents || documents.length === 0) {
        console.log('No documents need thumbnail backfill');
        return;
      }
      
      console.log(`Processing ${documents.length} documents for thumbnail backfill`);
      
      // Process each document
      for (const doc of documents) {
        try {
          await this.triggerServerThumbnailGeneration(
            doc.id,
            doc.file_path,
            doc.mime_type || ''
          );
          
          // Add small delay to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error processing document ${doc.id} for thumbnail:`, error);
        }
      }
      
      console.log('Thumbnail backfill batch completed');
    } catch (error) {
      console.error('Error in thumbnail backfill:', error);
    }
  }
}