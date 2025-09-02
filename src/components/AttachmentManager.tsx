import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Paperclip, X, Upload, FolderOpen } from 'lucide-react';
import DocumentPicker from '@/components/DocumentPicker';
import { ProcessedAttachment, DocumentAttachment } from '@/utils/attachmentProcessor';

interface AttachmentManagerProps {
  fileAttachments: ProcessedAttachment[];
  documentAttachments: DocumentAttachment[];
  onFileAttachmentsChange: (attachments: ProcessedAttachment[]) => void;
  onDocumentAttachmentsChange: (attachments: DocumentAttachment[]) => void;
  onAddFiles: () => void;
  showAddButton?: boolean;
}

const AttachmentManager: React.FC<AttachmentManagerProps> = ({
  fileAttachments,
  documentAttachments,
  onFileAttachmentsChange,
  onDocumentAttachmentsChange,
  onAddFiles,
  showAddButton = true
}) => {
  const totalAttachments = fileAttachments.length + documentAttachments.length;

  const removeFileAttachment = (index: number) => {
    const newAttachments = fileAttachments.filter((_, i) => i !== index);
    onFileAttachmentsChange(newAttachments);
  };

  const removeDocumentAttachment = (id: string) => {
    const newAttachments = documentAttachments.filter(doc => doc.id !== id);
    onDocumentAttachmentsChange(newAttachments);
  };

  if (totalAttachments === 0 && !showAddButton) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Attachments Display */}
      {totalAttachments > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Attachments</span>
            <Badge variant="secondary">{totalAttachments}</Badge>
          </div>

          {/* File Attachments */}
          {fileAttachments.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Files from device:</p>
              {fileAttachments.map((file, index) => (
                <div key={index} className="flex items-center gap-3 p-2 bg-secondary rounded-lg">
                  <Paperclip className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFileAttachment(index)}
                    className="flex-shrink-0 p-1 h-6 w-6"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Document Attachments */}
          {documentAttachments.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">From documents:</p>
              {documentAttachments.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-2 bg-accent rounded-lg">
                  <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.file_size ? (doc.file_size / (1024 * 1024)).toFixed(2) + ' MB' : 'Unknown size'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDocumentAttachment(doc.id)}
                    className="flex-shrink-0 p-1 h-6 w-6"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Attachments Button */}
      {showAddButton && (
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddFiles}
            className="gap-2"
          >
            <Paperclip className="w-4 h-4" />
            Add Files {totalAttachments > 0 && `(${totalAttachments})`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default AttachmentManager;