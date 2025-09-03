import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Paperclip, Image as ImageIcon, Clock, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import IsolatedEmailRenderer from './IsolatedEmailRenderer';
import AttachmentViewer from './AttachmentViewer';

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

interface EmailContentProps {
  email: Email;
  onReply?: () => void;
  onSaveAttachment?: (attachment: Attachment, email: Email) => void;
}

const EmailContent: React.FC<EmailContentProps> = ({ email, onReply, onSaveAttachment }) => {
  const { toast } = useToast();
  const [selectedAttachment, setSelectedAttachment] = useState<{ attachment: Attachment; email: Email } | null>(null);

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

    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      const requestPayload = {
        messageId: email.id,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size
      };

      const { data, error } = await supabase.functions.invoke('save-attachment', { 
        body: requestPayload 
      });

      if (error) throw error;

      toast({
        title: "Attachment Saved", 
        description: `${attachment.filename} has been saved to your documents.`,
      });

      if (onSaveAttachment) {
        onSaveAttachment(attachment, email);
      }

    } catch (error: any) {
      console.error('❌ Save attachment error:', error);
      
      const errorMessage = error?.message || 'Unknown error occurred';
      
      toast({
        title: "Save Failed", 
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Email Content */}
      <div className="prose prose-sm max-w-none">
        <IsolatedEmailRenderer 
          content={email.content || email.snippet || ''} 
        />
      </div>

      {/* Attachments */}
      {email.attachments && email.attachments.length > 0 && (
        <div className="space-y-2">
          <Separator />
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4" />
            <span className="text-sm font-medium">
              {email.attachments.length} attachment{email.attachments.length > 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="grid gap-2">
            {email.attachments.map((attachment, index) => (
              <div key={index} className="flex items-center justify-between p-2 border rounded">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {attachment.mimeType.startsWith('image/') ? (
                    <ImageIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  ) : (
                    <Paperclip className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{attachment.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.size)} • {attachment.mimeType}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-1 flex-shrink-0">
                  {attachment.mimeType.startsWith('image/') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedAttachment({ attachment, email })}
                    >
                      <Eye className="w-3 h-3" />
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAttachmentSave(attachment, email)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachment Viewer Modal */}
      {selectedAttachment && (
        <AttachmentViewer
          attachment={selectedAttachment.attachment}
          email={selectedAttachment.email}
          isOpen={!!selectedAttachment}
          onClose={() => setSelectedAttachment(null)}
          onSave={(attachment, email) => handleAttachmentSave(attachment, email)}
        />
      )}
    </div>
  );
};

export default EmailContent;