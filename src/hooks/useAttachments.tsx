import { useState } from 'react';
import { DocumentAttachment } from '@/utils/attachmentProcessor';

export const useAttachments = () => {
  const [documentAttachments, setDocumentAttachments] = useState<DocumentAttachment[]>([]);

  const clearAllAttachments = () => {
    setDocumentAttachments([]);
  };

  const getTotalAttachmentCount = () => {
    return documentAttachments.length;
  };

  return {
    documentAttachments,
    setDocumentAttachments,
    clearAllAttachments,
    getTotalAttachmentCount
  };
};