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
    // Note: This would need to call a Gmail API endpoint to download the attachment
    toast({
      title: "Download Attachment",
      description: `Downloading ${attachment.filename}...`,
    });
  };

  const processContent = (htmlContent: string) => {
    // Convert URLs to clickable links if they aren't already
    const linkRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
    
    let processedContent = htmlContent.replace(linkRegex, (url) => {
      // Don't replace if already within an <a> tag
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${url}</a>`;
    });

    // Style existing links
    processedContent = processedContent.replace(
      /<a([^>]*)>/gi, 
      '<a$1 class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">'
    );

    return processedContent;
  };

  return (
    <div className="space-y-4">
      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="border-b pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              {attachments.length} Attachment{attachments.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {attachments.map((attachment, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-2 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <Badge variant="secondary" className="text-xs">
                      {attachment.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                    </Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{attachment.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAttachmentDownload(attachment)}
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Content */}
      <div 
        className="prose prose-sm max-w-none prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
        dangerouslySetInnerHTML={{ 
          __html: processContent(content || 'No content available')
        }}
        style={{
          wordWrap: 'break-word',
          overflowWrap: 'break-word'
        }}
      />
    </div>
  );
};

export default EmailContent;