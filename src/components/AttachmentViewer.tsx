import React, { useState, useEffect } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Download, Save, Eye, Calendar, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatFileSize } from '@/lib/utils';

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  downloadUrl?: string;
}

interface Email {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  unread: boolean;
  content?: string;
  attachments?: Attachment[];
}

interface AttachmentViewerProps {
  attachment: Attachment | null;
  email: Email | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (attachment: Attachment, email: Email) => void;
  onDownload: (attachment: Attachment, email: Email) => void;
}

const AttachmentViewer: React.FC<AttachmentViewerProps> = ({
  attachment,
  email,
  isOpen,
  onClose,
  onSave,
  onDownload
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const { toast } = useToast();

  const isPreviewable = (attachment: Attachment | null): boolean => {
    if (!attachment?.mimeType) return false;
    
    return (
      attachment.mimeType.startsWith('image/') ||
      attachment.mimeType.includes('pdf') ||
      attachment.mimeType.startsWith('text/') ||
      attachment.mimeType.includes('plain') ||
      attachment.mimeType === 'text/calendar' ||
      attachment.mimeType === 'application/ics'
    );
  };

  const isCalendarInvite = (attachment: Attachment | null): boolean => {
    if (!attachment) return false;
    return attachment.mimeType === 'text/calendar' || 
           attachment.mimeType === 'application/ics' ||
           attachment.filename.toLowerCase().endsWith('.ics');
  };

  useEffect(() => {
    if (attachment && email && isOpen && isPreviewable(attachment)) {
      generatePreview();
    }
    
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [attachment, email, isOpen]);

  const generatePreview = async () => {
    if (!attachment || !email || !attachment.attachmentId) return;

    try {
      setLoading(true);
      console.log('AttachmentViewer: Generating preview for:', attachment.filename);
      
      // Download the attachment data
      const { gmailApi } = await import('@/utils/gmailApi');
      const data = await gmailApi.downloadAttachment(email.id, attachment.attachmentId);
      
      // Create blob from the downloaded data
      const blob = new Blob([data.data], { type: attachment.mimeType });
      
      // For text files, read as text
      if (attachment.mimeType.startsWith('text/') || attachment.mimeType.includes('plain')) {
        const text = await blob.text();
        setTextContent(text);
      } else {
        // For other files, create object URL
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
      
    } catch (error) {
      console.error('AttachmentViewer: Error generating preview:', error);
      toast({
        title: "Preview Error",
        description: "Failed to load attachment preview",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (attachment && email) {
      onSave(attachment, email);
    }
  };

  const handleDownload = () => {
    if (attachment && email) {
      onDownload(attachment, email);
    }
  };

  const getFileIcon = () => {
    if (!attachment) return <FileText className="w-8 h-8" />;
    
    if (attachment.mimeType.startsWith('image/')) {
      return <Eye className="w-8 h-8 text-purple-500" />;
    }
    if (attachment.mimeType.includes('pdf')) {
      return <FileText className="w-8 h-8 text-red-500" />;
    }
    if (isCalendarInvite(attachment)) {
      return <Calendar className="w-8 h-8 text-blue-500" />;
    }
    return <FileText className="w-8 h-8 text-gray-500" />;
  };

  const renderPreview = () => {
    if (!attachment || !isPreviewable(attachment)) {
      return (
        <div className="flex items-center justify-center h-full bg-background">
          <div className="text-center max-w-sm p-6">
            {getFileIcon()}
            <h3 className="text-lg font-medium mb-2 mt-4">{attachment?.filename}</h3>
            <p className="text-muted-foreground mb-4">
              This file type cannot be previewed
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={handleDownload} variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="w-4 h-4" />
                Save to Documents
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center h-full bg-background">
          <div className="text-center">
            {getFileIcon()}
            <p className="text-muted-foreground mt-4">Loading preview...</p>
          </div>
        </div>
      );
    }

    // Text content preview
    if (textContent !== null) {
      return (
        <div className="w-full h-full bg-background p-4 overflow-auto">
          <div className="max-w-4xl mx-auto">
            <pre className="whitespace-pre-wrap text-sm font-mono bg-muted/30 p-4 rounded-lg">
              {textContent}
            </pre>
          </div>
        </div>
      );
    }

    // Image preview
    if (attachment.mimeType.startsWith('image/') && previewUrl) {
      return (
        <div className="w-full h-full bg-background overflow-auto flex items-center justify-center p-4">
          <img
            src={previewUrl}
            alt={attachment.filename}
            className="max-w-full max-h-full object-contain"
            onError={() => {
              console.error('Failed to load image preview');
              setPreviewUrl(null);
            }}
          />
        </div>
      );
    }

    // PDF preview
    if (attachment.mimeType.includes('pdf') && previewUrl) {
      return (
        <div className="w-full h-full bg-background">
          <iframe
            src={`${previewUrl}#view=FitH&pagemode=none&toolbar=1`}
            className="w-full h-full border-0"
            title={`Preview of ${attachment.filename}`}
            onError={() => {
              console.error('Failed to load PDF preview');
              setPreviewUrl(null);
            }}
          />
        </div>
      );
    }

    // Fallback
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center max-w-sm p-6">
          {getFileIcon()}
          <h3 className="text-lg font-medium mb-2 mt-4">{attachment.filename}</h3>
          <p className="text-muted-foreground mb-4">Preview not available</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={handleDownload} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Download
            </Button>
            <Button onClick={handleSave} className="gap-2">
              <Save className="w-4 h-4" />
              Save to Documents
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (!attachment || !email) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="h-[95vh] w-full max-w-none mx-auto">
        {/* Header */}
        <DrawerHeader className="border-b px-4 py-3 bg-background">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0 pr-4 text-left">
              <DrawerTitle className="text-lg font-semibold truncate mb-1 text-left w-full block">
                {attachment.filename}
              </DrawerTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {attachment.mimeType}
                </Badge>
                <span>•</span>
                <span>{formatFileSize(attachment.size)}</span>
                <span>•</span>
                <span>From: {email.from.split('<')[0].trim()}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleDownload} variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
              <Button onClick={handleSave} size="sm" className="gap-2">
                <Save className="w-4 h-4" />
                {isCalendarInvite(attachment) ? "Save Invite" : "Save"}
              </Button>
              <DrawerClose asChild>
                <Button variant="ghost" size="sm">
                  <X className="w-4 h-4" />
                </Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>
        
        {/* Preview content */}
        <div className="flex-1 p-0 overflow-hidden bg-muted/20">
          <div className="w-full h-full">
            {renderPreview()}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default AttachmentViewer;