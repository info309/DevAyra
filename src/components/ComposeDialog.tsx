import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Send, Upload, FolderOpen } from 'lucide-react';
import AttachmentManager from '@/components/AttachmentManager';
import DocumentPicker from '@/components/DocumentPicker';
import { ProcessedAttachment, DocumentAttachment } from '@/utils/attachmentProcessor';

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
  fileAttachments: ProcessedAttachment[];
  documentAttachments: DocumentAttachment[];
  onFileAttachmentsChange: (attachments: ProcessedAttachment[]) => void;
  onDocumentAttachmentsChange: (attachments: DocumentAttachment[]) => void;
  onSend: () => void;
  onCancel: () => void;
  onAddFiles: () => void;
  sendingEmail: boolean;
  sendingProgress: string;
}

const ComposeDialog: React.FC<ComposeDialogProps> = ({
  open,
  onOpenChange,
  composeForm,
  onComposeFormChange,
  fileAttachments,
  documentAttachments,
  onFileAttachmentsChange,
  onDocumentAttachmentsChange,
  onSend,
  onCancel,
  onAddFiles,
  sendingEmail,
  sendingProgress
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddFilesMenu, setShowAddFilesMenu] = React.useState(false);
  const addFilesMenuRef = useRef<HTMLDivElement>(null);

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      console.log('Processing files for attachment:', files.map(f => f.name));
      const { convertFilesToBase64 } = await import('@/utils/attachmentProcessor');
      try {
        const processedFiles = await convertFilesToBase64(files);
        console.log('Files processed successfully:', processedFiles.map(f => ({ 
          name: f.name, 
          size: f.size, 
          hasContent: !!f.content,
          contentLength: f.content?.length 
        })));
        onFileAttachmentsChange([...fileAttachments, ...processedFiles]);
      } catch (error) {
        console.error('Error processing files:', error);
      }
    }
    // Reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  const totalAttachments = fileAttachments.length + documentAttachments.length;

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
            
            <AttachmentManager
              fileAttachments={fileAttachments}
              documentAttachments={documentAttachments}
              onFileAttachmentsChange={onFileAttachmentsChange}
              onDocumentAttachmentsChange={onDocumentAttachmentsChange}
              onAddFiles={() => setShowAddFilesMenu(true)}
            />
          </div>
          
          <DrawerFooter>
            <div className="flex gap-2 justify-end">
              {/* Add Files Button with Dropdown */}
              <div className="relative" ref={addFilesMenuRef}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddFilesMenu(!showAddFilesMenu)}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Add Files
                </Button>
                
                {/* Dropdown Menu */}
                {showAddFilesMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-background border border-border rounded-lg shadow-lg z-50">
                    <div className="p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          fileInputRef.current?.click();
                          setShowAddFilesMenu(false);
                        }}
                        className="w-full justify-start gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        From Device
                      </Button>
                      
                      <DocumentPicker
                        onDocumentsSelected={(documents) => {
                          onDocumentAttachmentsChange(documents);
                          setShowAddFilesMenu(false);
                        }}
                        selectedDocuments={documentAttachments as any}
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            className="w-full justify-start gap-2"
                          >
                            <FolderOpen className="w-4 h-4" />
                            From Documents
                          </Button>
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
              
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
                 `Send${totalAttachments > 0 ? ` (${totalAttachments})` : ''}`}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
    </>
  );
};

export default ComposeDialog;