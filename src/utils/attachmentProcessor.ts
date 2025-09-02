// Clean attachment processing utility
export interface ProcessedAttachment {
  name: string;
  content: string; // base64
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

export const convertFilesToBase64 = async (files: File[]): Promise<ProcessedAttachment[]> => {
  const processedFiles: ProcessedAttachment[] = [];
  
  for (const file of files) {
    try {
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
      
      processedFiles.push({
        name: file.name,
        content: base64,
        mimeType: file.type,
        size: file.size
      });
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error);
    }
  }
  
  return processedFiles;
};

export const validateAttachmentSize = (attachments: ProcessedAttachment[], maxSizeMB = 20): string[] => {
  const maxSize = maxSizeMB * 1024 * 1024;
  return attachments
    .filter(att => att.size > maxSize)
    .map(att => att.name);
};