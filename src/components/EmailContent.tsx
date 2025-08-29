import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Paperclip, Download, Image as ImageIcon, Clock } from 'lucide-react';
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
  onSaveAttachment?: (attachment: Attachment, email: Email) => void;
}

const EmailContent: React.FC<EmailContentProps> = ({ conversation, onSaveAttachment }) => {
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

  const handleAttachmentDownload = async (attachment: Attachment, email: Email) => {
    if (!attachment.attachmentId) {
      toast({
        variant: "destructive",
        title: "Download Unavailable", 
        description: `No attachment ID available for ${attachment.filename}`,
      });
      return;
    }

    try {
      // Import gmailApi here to avoid circular dependency
      const { gmailApi } = await import('@/utils/gmailApi');
      const data = await gmailApi.downloadAttachment(email.id, attachment.attachmentId);
      
      // Create blob and download
      const blob = new Blob([data.data], { type: attachment.mimeType });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Downloaded",
        description: `${attachment.filename} has been downloaded`
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Error",
        description: "Failed to download attachment",
        variant: "destructive"
      });
    }
  };

  const handleAttachmentSave = async (attachment: Attachment, email: Email) => {
    console.log('🔍 Starting attachment save:', { 
      filename: attachment.filename, 
      attachmentId: attachment.attachmentId,
      emailId: email.id,
      size: attachment.size,
      mimeType: attachment.mimeType
    });

    if (!attachment.attachmentId) {
      console.error('❌ No attachment ID available');
      toast({
        variant: "destructive",
        title: "Save Unavailable", 
        description: `No attachment ID available for ${attachment.filename}`,
      });
      return;
    }

    if (!attachment.filename || attachment.filename.trim() === '') {
      console.error('❌ Invalid filename');
      toast({
        variant: "destructive",
        title: "Invalid File", 
        description: "Attachment has no valid filename",
      });
      return;
    }

    try {
      console.log('📤 Calling save-attachment function...');
      const { supabase } = await import('@/integrations/supabase/client');
      
      const requestPayload = {
        messageId: email.id,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        emailSubject: email.subject,
        description: `Email attachment from ${email.from}`,
        category: 'email_attachment',
        tags: ['email', 'attachment']
      };
      
      console.log('📋 Request payload:', requestPayload);
      
      const { data, error } = await supabase.functions.invoke('save-attachment', {
        body: requestPayload
      });

      console.log('📥 Save function response:', { data, error });

      if (error) {
        console.error('❌ Save function error:', error);
        throw new Error(error.message || 'Unknown error from save function');
      }

      if (!data || !data.success) {
        console.error('❌ Save function returned no data or success=false:', data);
        throw new Error(data?.error || 'Save function failed');
      }

      console.log('✅ Save successful:', data);
      toast({
        title: "Saved Successfully",
        description: `${attachment.filename} saved to your documents`
      });
    } catch (error) {
      console.error('❌ Save failed with error:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        if (error.message.includes('base64')) {
          errorMessage = 'File encoding error - please try again';
        } else if (error.message.includes('authentication')) {
          errorMessage = 'Authentication failed - please refresh and try again';
        } else if (error.message.includes('storage')) {
          errorMessage = 'Storage error - please check your quota and try again';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Save Failed", 
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const sortedEmails = [...conversation.emails].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  console.log('EmailContent received conversation with emails:', conversation.emails.length);
  conversation.emails.forEach((email, index) => {
    console.log(`Email ${index + 1} attachments:`, email.attachments?.length || 0, email.attachments);
  });

  return (
    <div className="space-y-6 w-full min-w-0 overflow-hidden">
      {sortedEmails.map((email, emailIndex) => {
        const regularAttachments = email.attachments?.filter(att => !att.mimeType.startsWith('image/') || att.filename.includes('.')) || [];
        const inlineImages = email.attachments?.filter(att => att.mimeType.startsWith('image/') && !att.filename.includes('.')) || [];

        console.log(`Email ${email.id} - Regular attachments: ${regularAttachments.length}, Inline images: ${inlineImages.length}`);

        return (
          <div key={email.id} className="space-y-4 w-full min-w-0 overflow-hidden">
            {/* Email Header */}
            <div className="flex items-start justify-between p-4 bg-accent/30 rounded-lg w-full min-w-0 overflow-hidden">
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 mb-1 w-full min-w-0 overflow-hidden">
                  <p className="font-medium text-sm truncate">
                    {email.from.split('<')[0].trim() || email.from}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-muted-foreground w-full min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1 min-w-0">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{formatDate(email.date)}</span>
                  </div>
                  <span className="truncate">To: {email.to.split('<')[0].trim() || email.to}</span>
                </div>
              </div>
            </div>

            {/* Regular Attachments */}
            {regularAttachments.length > 0 && (
              <div className="border-b border-border pb-4 w-full min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {regularAttachments.length} Attachment{regularAttachments.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid gap-2 w-full min-w-0">
                  {regularAttachments.map((attachment, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors w-full min-w-0 overflow-hidden"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                        <div className="flex-shrink-0">
                          <Badge variant="secondary" className="text-xs font-mono">
                            {attachment.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                          </Badge>
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="text-sm font-medium truncate text-foreground">{attachment.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.size)}
                          </p>
                        </div>
                      </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAttachmentSave(attachment, email)}
                            disabled={!attachment.attachmentId}
                            className="flex-shrink-0"
                            title="Save to Documents"
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAttachmentDownload(attachment, email)}
                            disabled={!attachment.attachmentId}
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
              <div className="border-b border-border pb-4 w-full min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {inlineImages.length} Image{inlineImages.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid gap-2 w-full min-w-0">
                  {inlineImages.map((image, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors w-full min-w-0 overflow-hidden"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                        <div className="flex-shrink-0">
                          <Badge variant="outline" className="text-xs font-mono">
                            {image.mimeType.split('/')[1]?.toUpperCase() || 'IMG'}
                          </Badge>
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="text-sm font-medium truncate text-foreground">{image.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(image.size)}
                          </p>
                        </div>
                      </div>
                       <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAttachmentSave(image, email)}
                            className="flex-shrink-0"
                            title="Save to Documents"
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAttachmentDownload(image, email)}
                            disabled={!image.attachmentId}
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
            <div className="space-y-4 w-full min-w-0 overflow-hidden">
              <IsolatedEmailRenderer 
                content={email.content || ''}
                className="w-full min-w-0"
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