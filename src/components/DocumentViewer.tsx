import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X, FileText, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  downloadUrl?: string;
}

interface DocumentViewerProps {
  attachment: Attachment | null;
  emailId: string;
  onClose: () => void;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ attachment, emailId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (attachment && emailId) {
      fetchAttachment();
    }
  }, [attachment, emailId]);

  const fetchAttachment = async () => {
    if (!attachment || !user) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'get-attachment',
          userId: user.id,
          messageId: emailId,
          attachmentId: attachment.attachmentId
        }
      });

      if (error) throw error;

      if (data.attachmentData) {
        // Create blob URL from base64 data
        const binaryString = atob(data.attachmentData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: attachment.mimeType });
        const url = URL.createObjectURL(blob);
        setAttachmentUrl(url);
      }
    } catch (err: any) {
      console.error('Failed to fetch attachment:', err);
      setError('Failed to load attachment');
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load attachment for preview"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (attachmentUrl && attachment) {
      const link = document.createElement('a');
      link.href = attachmentUrl;
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading preview...</p>
          </div>
        </div>
      );
    }

    if (error || !attachmentUrl) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {error || 'Unable to preview this file'}
            </p>
            <p className="text-sm text-muted-foreground">
              You can still download the file using the button below.
            </p>
          </div>
        </div>
      );
    }

    // Handle different file types
    if (attachment?.mimeType.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center p-4">
          <img 
            src={attachmentUrl} 
            alt={attachment.filename}
            className="max-w-full max-h-96 object-contain rounded"
          />
        </div>
      );
    }

    if (attachment?.mimeType === 'application/pdf') {
      return (
        <div className="h-96">
          <iframe
            src={attachmentUrl}
            className="w-full h-full border-0 rounded"
            title={attachment.filename}
          />
        </div>
      );
    }

    // For other file types, show file info
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">{attachment?.filename}</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Type: {attachment?.mimeType}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Size: {attachment && formatFileSize(attachment.size)}
          </p>
          <p className="text-sm text-muted-foreground">
            Preview not available for this file type.
          </p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={!!attachment} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {attachment?.mimeType.startsWith('image/') ? (
                <ImageIcon className="w-5 h-5" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
              {attachment?.filename}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!attachmentUrl}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="overflow-auto">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentViewer;