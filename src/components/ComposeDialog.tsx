import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Send, FolderOpen, Paperclip, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import DocumentPicker from '@/components/DocumentPicker';
import { DocumentAttachment } from '@/utils/attachmentProcessor';

interface ComposeFormData {
  to: string;
  subject: string;
  content: string;
  replyTo?: string;
  threadId?: string;
}

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  composeForm: ComposeFormData;
  onComposeFormChange: (form: ComposeFormData) => void;
  documentAttachments: DocumentAttachment[];
  onDocumentAttachmentsChange: (attachments: DocumentAttachment[]) => void;
  onSend: () => void;
  onCancel: () => void;
  sendingEmail: boolean;
  sendingProgress: string;
}

const ComposeDialog: React.FC<ComposeDialogProps> = ({
  open,
  onOpenChange,
  composeForm,
  onComposeFormChange,
  documentAttachments,
  onDocumentAttachmentsChange,
  onSend,
  onCancel,
  sendingEmail,
  sendingProgress
}) => {
  const removeDocumentAttachment = (id: string) => {
    const newAttachments = documentAttachments.filter(doc => doc.id !== id);
    onDocumentAttachmentsChange(newAttachments);
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[95vh] flex flex-col">
          <DrawerHeader>
            <DrawerTitle>Compose Email</DrawerTitle>
          </DrawerHeader>
          
          <div className="flex-1 px-4 space-y-4 overflow-y-auto">
            <div>
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                value={composeForm.to}
                onChange={(e) => onComposeFormChange({ ...composeForm, to: e.target.value })}
                placeholder="recipient@example.com"
                autoComplete="email"
                className="text-base focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={composeForm.subject}
                onChange={(e) => onComposeFormChange({ ...composeForm, subject: e.target.value })}
                placeholder="Email subject"
                className="text-base focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            
            <div>
              <Label htmlFor="content">Message</Label>
              <Textarea
                id="content"
                value={composeForm.content}
                onChange={(e) => onComposeFormChange({ ...composeForm, content: e.target.value })}
                placeholder="Write your message here..."
                rows={15}
                className="min-h-[300px] resize-none text-base focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            
            {/* Document Attachments */}
            {documentAttachments.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Attachments</span>
                  <Badge variant="secondary">{documentAttachments.length}</Badge>
                </div>
                <div className="space-y-2">
                  {documentAttachments.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-2 bg-accent rounded-lg">
                      <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.file_size ? (doc.file_size / (1024 * 1024)).toFixed(2) + ' MB' : 'Unknown size'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocumentAttachment(doc.id)}
                        className="flex-shrink-0 p-1 h-6 w-6"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <DrawerFooter>
            <div className="flex gap-2 justify-end">
              {/* Add Documents Button */}
              <DocumentPicker
                onDocumentsSelected={(documents) => {
                  onDocumentAttachmentsChange(documents);
                }}
                selectedDocuments={documentAttachments as any}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Add Documents {documentAttachments.length > 0 && `(${documentAttachments.length})`}
                  </Button>
                }
              />
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={onCancel}
              >
                Cancel
              </Button>
              
              <Button 
                variant="default"
                size="sm"
                onClick={onSend}
                disabled={sendingEmail || !composeForm.to || !composeForm.subject}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                {sendingEmail ? (sendingProgress || 'Sending...') : 
                 `Send${documentAttachments.length > 0 ? ` (${documentAttachments.length})` : ''}`}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default ComposeDialog;