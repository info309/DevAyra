import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Paperclip, Download, Image as ImageIcon, Clock, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import IsolatedEmailRenderer from './IsolatedEmailRenderer';

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

interface Conversation {
  id: string;
  subject: string;
  participants: string[];
  lastDate: string;
  unreadCount: number;
  messageCount: number;
  emails: Email[];
}

interface EmailContentProps {
  conversation: Conversation;
}

const EmailContent: React.FC<EmailContentProps> = ({ conversation }) => {
  const { toast } = useToast();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handleAttachmentDownload = (attachment: Attachment) => {
    if (attachment.downloadUrl) {
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

  const handleAttachmentPreview = (attachment: Attachment) => {
    if (attachment.downloadUrl) {
      window.open(attachment.downloadUrl, '_blank');
      toast({
        title: "Opening Preview",
        description: `Previewing ${attachment.filename}`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Preview Unavailable", 
        description: `Preview not available for ${attachment.filename}`,
      });
    }
  };

  // Sort emails by date (oldest first for conversation thread)
  const sortedEmails = [...conversation.emails].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <div className="space-y-6 p-6">
      {sortedEmails.map((email, emailIndex) => {
        const regularAttachments = email.attachments?.filter(att => !att.mimeType.startsWith('image/') || att.filename.includes('.')) || [];
        const inlineImages = email.attachments?.filter(att => att.mimeType.startsWith('image/') && !att.filename.includes('.')) || [];

        return (
          <div key={email.id} className="space-y-4">
            {/* Email Header */}
            <div className="flex items-start justify-between p-4 bg-accent/30 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-sm">
                    {email.from.split('<')[0].trim() || email.from}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(email.date)}</span>
                  </div>
                  <span>To: {email.to.split('<')[0].trim() || email.to}</span>
                </div>
              </div>
            </div>

            {/* Regular Attachments */}
            {regularAttachments.length > 0 && (
              <div className="border-b border-border pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {regularAttachments.length} Attachment{regularAttachments.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid gap-2">
                  {regularAttachments.map((attachment, index) => (
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
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAttachmentPreview(attachment)}
                          disabled={!attachment.downloadUrl}
                          className="flex-shrink-0"
                          title="Preview document"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAttachmentDownload(attachment)}
                          disabled={!attachment.downloadUrl}
                          className="flex-shrink-0"
                          title="Download attachment"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inline Images */}
            {inlineImages.length > 0 && (
              <div className="border-b border-border pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {inlineImages.length} Image{inlineImages.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid gap-2">
                  {inlineImages.map((image, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          <Badge variant="outline" className="text-xs font-mono">
                            {image.mimeType.split('/')[1]?.toUpperCase() || 'IMG'}
                          </Badge>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate text-foreground">{image.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(image.size)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAttachmentPreview(image)}
                          disabled={!image.downloadUrl}
                          className="flex-shrink-0"
                          title="Preview image"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAttachmentDownload(image)}
                          disabled={!image.downloadUrl}
                          className="flex-shrink-0"
                          title="Download image"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Email Content */}
            <div className="space-y-4">
              <IsolatedEmailRenderer 
                content={email.content || ''}
                className="w-full"
              />
            </div>

            {/* Separator between emails in thread */}
            {emailIndex < sortedEmails.length - 1 && (
              <Separator className="my-6" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default EmailContent;