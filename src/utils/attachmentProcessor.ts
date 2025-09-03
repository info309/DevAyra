// Clean attachment processing utility
export interface ProcessedAttachment {
  name: string;
  data: string; // base64
  mimeType: string;
  size: number;
}

export interface DocumentAttachment {
  id: string;
  name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
}

export const convertFilesToBase64 = async (
  files: File[], 
  onProgress?: (processed: number, total: number, currentFile: string) => void
): Promise<ProcessedAttachment[]> => {
  const processedFiles: ProcessedAttachment[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      onProgress?.(i, files.length, file.name);
      
      // Process file in chunks to avoid blocking UI
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data:type;base64, prefix
          const base64Content = result.split(',')[1];
          resolve(base64Content);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      // Allow UI to update between files
      await new Promise(resolve => setTimeout(resolve, 10));
      
      processedFiles.push({
        name: file.name,
        data: base64,
        mimeType: file.type,
        size: file.size
      });
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error);
    }
  }
  
  onProgress?.(files.length, files.length, 'Complete');
  return processedFiles;
};

export const validateAttachmentSize = (attachments: ProcessedAttachment[], maxSizeMB = 20): string[] => {
  const maxSize = maxSizeMB * 1024 * 1024;
  return attachments
    .filter(att => att.size > maxSize)
    .map(att => att.name);
};

export const calculateTotalSize = (fileAttachments: ProcessedAttachment[], documentAttachments: DocumentAttachment[]): number => {
  const fileSize = fileAttachments.reduce((total, att) => total + att.size, 0);
  const docSize = documentAttachments.reduce((total, doc) => total + (doc.file_size || 0), 0);
  return fileSize + docSize;
};

export const estimateEncodedSize = (totalSize: number): number => {
  // Base64 encoding increases size by ~33%, plus MIME headers overhead
  return Math.round(totalSize * 1.4);
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};