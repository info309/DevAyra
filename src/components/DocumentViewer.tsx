import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, FileText, Image, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  downloadUrl?: string;
}

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: Attachment | null;
  messageId: string;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
  isOpen, 
  onClose, 
  attachment, 
  messageId 
}) => {
  const [attachmentData, setAttachmentData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && attachment && attachment.attachmentId) {
      fetchAttachmentData();
    }
  }, [isOpen, attachment, messageId]);

  const fetchAttachmentData = async () => {
    if (!attachment?.attachmentId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'get-attachment',
          messageId,
          attachmentId: attachment.attachmentId,
        },
      });

      if (error) throw error;

      if (data?.attachmentData) {
        // Create blob URL for the attachment data
        const byteCharacters = atob(data.attachmentData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: attachment.mimeType });
        const blobUrl = URL.createObjectURL(blob);
        setAttachmentData(blobUrl);
      }
    } catch (error) {
      console.error('Error fetching attachment:', error);
      toast({
        variant: "destructive",
        title: "Preview Error",
        description: "Failed to load attachment for preview",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (attachmentData && attachment) {
      const link = document.createElement('a');
      link.href = attachmentData;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Started",
        description: `Downloading ${attachment.filename}`,
      });
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2 text-muted-foreground">Loading preview...</span>
        </div>
      );
    }

    if (!attachmentData || !attachment) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">Preview not available</p>
          <Button onClick={handleDownload} disabled={!attachmentData}>
            <Download className="w-4 h-4 mr-2" />
            Download File
          </Button>
        </div>
      );
    }

    // Handle different file types
    if (attachment.mimeType.startsWith('image/')) {
      return (
        <div className="flex flex-col items-center">
          <img
            src={attachmentData}
            alt={attachment.filename}
            className="max-w-full max-h-[70vh] object-contain rounded-lg"
          />
          <Button onClick={handleDownload} className="mt-4" variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Download Image
          </Button>
        </div>
      );
    }

    if (attachment.mimeType === 'application/pdf') {
      return (
        <div className="flex flex-col h-[80vh]">
          <iframe
            src={attachmentData}
            title={attachment.filename}
            className="flex-1 w-full border rounded-lg"
          />
          <Button onClick={handleDownload} className="mt-4" variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>
      );
    }

    // For other file types, show info and download button
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <FileText className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="font-medium mb-2">{attachment.filename}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {attachment.mimeType} • {formatFileSize(attachment.size)}
        </p>
        <p className="text-muted-foreground mb-4">Preview not supported for this file type</p>
        <Button onClick={handleDownload}>
          <Download className="w-4 h-4 mr-2" />
          Download File
        </Button>
      </div>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {attachment?.mimeType.startsWith('image/') ? (
                <Image className="w-5 h-5" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
              {attachment?.filename || 'Document Preview'}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-auto">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentViewer;