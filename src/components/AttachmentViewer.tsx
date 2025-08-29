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
      setPreviewUrl(null);
      setTextContent(null);
      
      const { gmailApi } = await import('@/utils/gmailApi');
      const data = await gmailApi.downloadAttachment(email.id, attachment.attachmentId);
      
      console.log('AttachmentViewer: Downloaded response:', {
        hasData: !!data.data,
        dataType: typeof data.data,
        dataLength: data.data?.length || data.data?.byteLength || 'unknown',
        isUint8Array: data.data instanceof Uint8Array,
        isArrayBuffer: data.data instanceof ArrayBuffer,
        fullResponse: data
      });
      
      if (!data.data) {
        throw new Error('No data received from download');
      }
      
      // The data is already a Uint8Array from the Gmail API
      const uint8Data = data.data;
      
      console.log('AttachmentViewer: Using data directly:', {
        isUint8Array: uint8Data instanceof Uint8Array,
        dataLength: uint8Data.length,
        firstFewBytes: Array.from(uint8Data.slice(0, 10))
      });
      
      // Create blob from the binary data
      const blob = new Blob([uint8Data], { type: attachment.mimeType });
      console.log('AttachmentViewer: Created blob:', {
        size: blob.size,
        type: blob.type,
        dataSize: uint8Data.length
      });
      
      // For text files and calendar invites, read as text
      if (attachment.mimeType.startsWith('text/') || 
          attachment.mimeType.includes('plain') ||
          attachment.mimeType === 'text/calendar' ||
          attachment.mimeType === 'application/ics') {
        const text = await blob.text();
        console.log('AttachmentViewer: Text content length:', text.length);
        setTextContent(text);
      } else {
        // For images and PDFs, create object URL
        const url = URL.createObjectURL(blob);
        console.log('AttachmentViewer: Created object URL:', url);
        setPreviewUrl(url);
      }
      
    } catch (error) {
      console.error('AttachmentViewer: Error generating preview:', error);
      toast({
        title: "Preview Error",
        description: `Failed to load attachment preview: ${error.message}`,
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
    if (!attachment) return null;

    if (!isPreviewable(attachment)) {
      return (
        <div className="flex items-center justify-center h-full bg-background p-4">
          <div className="text-center max-w-sm">
            {getFileIcon()}
            <h3 className="text-lg font-medium mb-2 mt-4 break-words">{attachment.filename}</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              This file type cannot be previewed
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button onClick={handleDownload} variant="outline" className="gap-2 w-full sm:w-auto">
                <Download className="w-4 h-4" />
                Download
              </Button>
              <Button onClick={handleSave} className="gap-2 w-full sm:w-auto">
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
        <div className="flex items-center justify-center h-full bg-background p-4">
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
        <div className="w-full h-full bg-background p-2 sm:p-4 overflow-auto">
          <div className="max-w-4xl mx-auto">
            <pre className="whitespace-pre-wrap text-xs sm:text-sm font-mono bg-muted/30 p-2 sm:p-4 rounded-lg break-words overflow-x-auto">
              {textContent}
            </pre>
          </div>
        </div>
      );
    }

    // Image preview
    if (attachment.mimeType.startsWith('image/') && previewUrl) {
      return (
        <div className="w-full h-full bg-background overflow-auto flex items-center justify-center p-2 sm:p-4">
          <img
            src={previewUrl}
            alt={attachment.filename}
            className="max-w-full max-h-full object-contain rounded-lg"
            onError={(e) => {
              console.error('Failed to load image preview:', e);
              toast({
                title: "Image Error",
                description: "Failed to display image",
                variant: "destructive",
              });
              setPreviewUrl(null);
            }}
            onLoad={() => {
              console.log('AttachmentViewer: Image loaded successfully');
            }}
          />
        </div>
      );
    }

    // PDF preview
    if (attachment.mimeType.includes('pdf') && previewUrl) {
      return (
        <div className="w-full h-full bg-background">
          <object
            data={previewUrl}
            type="application/pdf"
            className="w-full h-full"
            title={`Preview of ${attachment.filename}`}
          >
            <iframe
              src={`${previewUrl}#view=FitH&pagemode=none&toolbar=1&navpanes=0&scrollbar=1`}
              className="w-full h-full border-0"
              title={`Preview of ${attachment.filename}`}
              onError={(e) => {
                console.error('Failed to load PDF preview:', e);
                toast({
                  title: "PDF Error", 
                  description: "Failed to display PDF",
                  variant: "destructive",
                });
                setPreviewUrl(null);
              }}
              onLoad={() => {
                console.log('AttachmentViewer: PDF loaded successfully');
              }}
            />
          </object>
        </div>
      );
    }

    // Fallback - show error or retry option
    return (
      <div className="flex items-center justify-center h-full bg-background p-4">
        <div className="text-center max-w-sm">
          {getFileIcon()}
          <h3 className="text-lg font-medium mb-2 mt-4 break-words">{attachment.filename}</h3>
          <p className="text-muted-foreground mb-4 text-sm">
            {previewUrl ? "Preview failed to load" : "Preview not available"}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            {!previewUrl && isPreviewable(attachment) && (
              <Button 
                onClick={generatePreview} 
                variant="outline" 
                className="gap-2 w-full sm:w-auto"
                disabled={loading}
              >
                <Eye className="w-4 h-4" />
                Retry Preview
              </Button>
            )}
            <Button onClick={handleDownload} variant="outline" className="gap-2 w-full sm:w-auto">
              <Download className="w-4 h-4" />
              Download
            </Button>
            <Button onClick={handleSave} className="gap-2 w-full sm:w-auto">
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
      <DrawerContent className="h-[90vh] sm:h-[95vh] w-full max-w-none mx-auto">
        {/* Header */}
        <DrawerHeader className="border-b px-2 sm:px-4 py-3 bg-background">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 pr-2 text-left">
              <DrawerTitle className="text-base sm:text-lg font-semibold mb-1 text-left w-full block break-words">
                {attachment.filename}
              </DrawerTitle>
              <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
                <Badge variant="secondary" className="text-xs max-w-32 truncate">
                  {attachment.mimeType}
                </Badge>
                <span className="hidden sm:inline">•</span>
                <span className="truncate">{formatFileSize(attachment.size)}</span>
                <span className="hidden sm:inline">•</span>
                <span className="truncate text-xs">From: {email.from.split('<')[0].trim()}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Button onClick={handleDownload} variant="outline" size="sm" className="gap-1 px-2 sm:px-3">
                <Download className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Download</span>
              </Button>
              <Button onClick={handleSave} size="sm" className="gap-1 px-2 sm:px-3">
                <Save className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{isCalendarInvite(attachment) ? "Save Invite" : "Save"}</span>
              </Button>
              <DrawerClose asChild>
                <Button variant="ghost" size="sm" className="px-2">
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