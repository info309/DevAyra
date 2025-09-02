import { useState } from 'react';
import { ProcessedAttachment, DocumentAttachment, convertFilesToBase64, validateAttachmentSize } from '@/utils/attachmentProcessor';
import { useToast } from '@/hooks/use-toast';

export const useAttachments = () => {
  const [fileAttachments, setFileAttachments] = useState<ProcessedAttachment[]>([]);
  const [documentAttachments, setDocumentAttachments] = useState<DocumentAttachment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleFileSelection = async (files: File[]) => {
    setIsProcessing(true);
    try {
      const processedFiles = await convertFilesToBase64(files);
      
      // Validate file sizes
      const oversizedFiles = validateAttachmentSize(processedFiles);
      if (oversizedFiles.length > 0) {
        toast({
          title: "Files Too Large",
          description: `These files exceed 20MB limit: ${oversizedFiles.join(', ')}`,
          variant: "destructive"
        });
        return;
      }

      setFileAttachments(prev => [...prev, ...processedFiles]);
      
      if (processedFiles.length > 0) {
        toast({
          title: "Files Added",
          description: `Added ${processedFiles.length} file(s) to email`,
        });
      }
    } catch (error) {
      console.error('Error processing files:', error);
      toast({
        title: "Error",
        description: "Failed to process files. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAllAttachments = () => {
    setFileAttachments([]);
    setDocumentAttachments([]);
  };

  const getTotalAttachmentCount = () => {
    return fileAttachments.length + documentAttachments.length;
  };

  return {
    fileAttachments,
    documentAttachments,
    isProcessing,
    setFileAttachments,
    setDocumentAttachments,
    handleFileSelection,
    clearAllAttachments,
    getTotalAttachmentCount
  };
};