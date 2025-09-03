import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Send, Paperclip, Upload, Link } from 'lucide-react';
import AttachmentManager from '@/components/AttachmentManager';
import DocumentPicker from '@/components/DocumentPicker';
import { useAttachments } from '@/hooks/useAttachments';
import { convertFilesToBase64, ProcessedAttachment, validateAttachmentSize, calculateTotalSize, estimateEncodedSize } from '@/utils/attachmentProcessor';
import { useToast } from '@/hooks/use-toast';

interface ComposeFormData {
  to: string;
  subject: string;
  content: string;
  replyTo?: string;
  threadId?: string;
  attachments?: ProcessedAttachment[];
  documentAttachments?: any[];
  sendAsLinks?: boolean;
}

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  composeForm: ComposeFormData;
  onComposeFormChange: (form: ComposeFormData) => void;
  onSend: () => void;
  onCancel: () => void;
  onCancelSend?: () => void;
  sendingEmail: boolean;
  sendingProgress: string;
}

const ComposeDialog: React.FC<ComposeDialogProps> = ({
  open,
  onOpenChange,
  composeForm,
  onComposeFormChange,
  onSend,
  onCancel,
  onCancelSend,
  sendingEmail,
  sendingProgress
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileAttachments, setFileAttachments] = useState<ProcessedAttachment[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<any[]>([]);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [processingProgress, setProcessingProgress] = useState('');
  
  // Calculate size and validate
  const totalSize = calculateTotalSize(fileAttachments, selectedDocuments);
  const estimatedEncodedSize = estimateEncodedSize(totalSize);
  const isOverGmailLimit = estimatedEncodedSize > 25 * 1024 * 1024;
  const hasOversizedFiles = validateAttachmentSize(fileAttachments, 20).length > 0;

  const handleDocumentsSelected = (docs: any[]) => {
    setSelectedDocuments(docs);
    toast({
      description: `Added ${docs.length} document${docs.length > 1 ? 's' : ''} from storage`
    });
  };

  const handleFileSelect = async (files: File[]) => {
    try {
      // Validate file sizes first
      const oversizedFiles = files.filter(file => file.size > 20 * 1024 * 1024);
      if (oversizedFiles.length > 0) {
        toast({
          variant: "destructive",
          title: "Files Too Large",
          description: `${oversizedFiles.map(f => f.name).join(', ')} exceed 20MB limit`
        });
        // Filter out oversized files
        files = files.filter(file => file.size <= 20 * 1024 * 1024);
        if (files.length === 0) return;
      }

      setProcessingFiles(true);
      setProcessingProgress('Processing files...');

      const processedFiles = await convertFilesToBase64(files, (processed, total, currentFile) => {
        setProcessingProgress(`Processing ${currentFile} (${processed + 1}/${total})`);
      });
      
      setFileAttachments(prev => [...prev, ...processedFiles]);
      
      // Update parent form with all attachments
      const allAttachments = [...fileAttachments, ...processedFiles];
      onComposeFormChange({ 
        ...composeForm, 
        attachments: allAttachments 
      });
      
      toast({
        description: `Added ${processedFiles.length} file${processedFiles.length > 1 ? 's' : ''}`
      });
    } catch (error) {
      console.error('Error processing files:', error);
      toast({
        variant: "destructive",
        title: "Upload Error",
        description: "Failed to process selected files"
      });
    } finally {
      setProcessingFiles(false);
      setProcessingProgress('');
    }
  };

  const handleAddFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileSelect(files);
    }
    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const updateAttachments = () => {
    const allAttachments = [...fileAttachments];
    onComposeFormChange({ 
      ...composeForm, 
      attachments: allAttachments,
      documentAttachments: selectedDocuments 
    });
  };

  // Reset internal attachment state when parent form is reset
  React.useEffect(() => {
    if (composeForm.attachments?.length === 0 && fileAttachments.length > 0) {
      setFileAttachments([]);
    }
    if (composeForm.documentAttachments?.length === 0 && selectedDocuments.length > 0) {
      setSelectedDocuments([]);
    }
  }, [composeForm.attachments, composeForm.documentAttachments]);

  // Update parent form whenever attachments change
  React.useEffect(() => {
    updateAttachments();
  }, [fileAttachments, selectedDocuments]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
        accept="*/*"
      />
      
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

            {/* Attachments Section */}
            <div className="space-y-3">
              <AttachmentManager
                fileAttachments={fileAttachments}
                documentAttachments={selectedDocuments}
                onFileAttachmentsChange={setFileAttachments}
                onDocumentAttachmentsChange={setSelectedDocuments}
                onAddFiles={handleAddFiles}
                showAddButton={false}
              />

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddFiles}
                  disabled={processingFiles}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {processingFiles ? processingProgress : 'Upload Files'}
                </Button>
                
                <DocumentPicker
                  onDocumentsSelected={handleDocumentsSelected}
                  selectedDocuments={selectedDocuments}
                  multiple={true}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <Paperclip className="w-4 h-4" />
                      From Documents
                    </Button>
                  }
                />
              </div>

              {/* Send as links option when files are large */}
              {isOverGmailLimit && (
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                  <Checkbox
                    id="sendAsLinks"
                    checked={composeForm.sendAsLinks || false}
                    onCheckedChange={(checked) => 
                      onComposeFormChange({ ...composeForm, sendAsLinks: checked as boolean })
                    }
                  />
                  <Label htmlFor="sendAsLinks" className="text-sm cursor-pointer">
                    <Link className="w-4 h-4 inline mr-1" />
                    Send large files as download links instead
                  </Label>
                </div>
              )}
            </div>
            
            <div>
              <Label htmlFor="content">Message</Label>
              <Textarea
                id="content"
                value={composeForm.content}
                onChange={(e) => onComposeFormChange({ ...composeForm, content: e.target.value })}
                placeholder="Write your message here..."
                rows={12}
                className="min-h-[250px] resize-none text-base focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>
          
          <DrawerFooter>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={sendingEmail}
              >
                Cancel
              </Button>
              
              {sendingEmail && onCancelSend && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={onCancelSend}
                  size="sm"
                >
                  Cancel Send
                </Button>
              )}
              
              <Button
                type="button"
                onClick={onSend}
                disabled={sendingEmail || !composeForm.to.trim() || !composeForm.subject.trim() || (hasOversizedFiles && !composeForm.sendAsLinks)}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                {sendingEmail ? (sendingProgress || 'Sending...') : 'Send'}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default ComposeDialog;