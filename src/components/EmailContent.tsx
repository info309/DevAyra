import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Paperclip, ExternalLink, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  downloadUrl?: string;
}

interface EmailContentProps {
  content: string;
  attachments?: Attachment[];
  messageId: string;
}

const EmailContent: React.FC<EmailContentProps> = ({ content, attachments = [], messageId }) => {
  const { toast } = useToast();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleAttachmentDownload = (attachment: Attachment) => {
    if (attachment.downloadUrl) {
      // Open download URL in new tab
      window.open(attachment.downloadUrl, '_blank');
      toast({
        title: "Download Started",
        description: `Downloading ${attachment.filename}`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Download Unavailable",
        description: `Download link not available for ${attachment.filename}`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="border-b border-border pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {attachments.length} Attachment{attachments.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid gap-2">
            {attachments.map((attachment, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <Badge variant="secondary" className="text-xs font-mono">
                      {attachment.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                    </Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate text-foreground">{attachment.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAttachmentDownload(attachment)}
                  disabled={!attachment.downloadUrl}
                  className="flex-shrink-0"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Content */}
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <div 
          dangerouslySetInnerHTML={{ 
            __html: content || '<p class="text-muted-foreground italic">No content available</p>'
          }}
          style={{
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            maxWidth: '100%'
          }}
        />
      </div>
    </div>
  );
};

export default EmailContent;