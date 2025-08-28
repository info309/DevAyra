import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import FileUpload from './FileUpload';

interface DocumentUploadDialogProps {
  onUpload: (files: File[], metadata: { category?: string; description?: string }) => Promise<void>;
  isUploading?: boolean;
  children?: React.ReactNode;
}

const DocumentUploadDialog: React.FC<DocumentUploadDialogProps> = ({
  onUpload,
  isUploading = false,
  children
}) => {
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleUpload = async (files: File[], metadata: { category?: string; description?: string }) => {
    await onUpload(files, metadata);
    setOpen(false);
    setSelectedFiles([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Upload Files
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Upload files to your document library. You can add multiple files at once.
          </DialogDescription>
        </DialogHeader>
        
        <FileUpload
          onFileSelect={setSelectedFiles}
          onUpload={handleUpload}
          isUploading={isUploading}
          maxFiles={20}
        />
      </DialogContent>
    </Dialog>
  );
};

export default DocumentUploadDialog;