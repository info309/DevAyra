import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Send, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SimpleAttachment {
  name: string;
  size: number;
  type: string;
  data: string; // base64
}

interface SimpleComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (data: {
    to: string;
    subject: string;
    content: string;
    attachments: SimpleAttachment[];
  }) => void;
  sendingEmail: boolean;
  sendingProgress: string;
}

const SimpleComposeDialog: React.FC<SimpleComposeDialogProps> = ({
  open,
  onOpenChange,
  onSend,
  sendingEmail,
  sendingProgress
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    to: '',
    subject: '',
    content: ''
  });
  const [attachments, setAttachments] = useState<SimpleAttachment[]>([]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    console.log('Processing', files.length, 'files...');
    
    try {
      const newAttachments: SimpleAttachment[] = [];
      
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          toast({
            variant: "destructive",
            title: "File Too Large",
            description: `${file.name} is over 10MB limit`
          });
          continue;
        }

        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // Remove data:type;base64, prefix
          };
          reader.readAsDataURL(file);
        });

        newAttachments.push({
          name: file.name,
          size: file.size,
          type: file.type,
          data: base64
        });
      }

      setAttachments(prev => [...prev, ...newAttachments]);
      console.log('Successfully added', newAttachments.length, 'attachments');
      
      toast({
        description: `Added ${newAttachments.length} file(s)`
      });
      
    } catch (error) {
      console.error('File processing error:', error);
      toast({
        variant: "destructive",
        title: "Upload Error",
        description: "Failed to process files"
      });
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    toast({ description: "Attachment removed" });
  };

  const handleSend = () => {
    if (!formData.to.trim() || !formData.subject.trim()) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please fill in recipient and subject"
      });
      return;
    }

    console.log('Sending email with:', {
      ...formData,
      attachmentCount: attachments.length,
      totalSize: attachments.reduce((sum, att) => sum + att.size, 0)
    });

    onSend({
      ...formData,
      attachments
    });
  };

  const handleCancel = () => {
    setFormData({ to: '', subject: '', content: '' });
    setAttachments([]);
    onOpenChange(false);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
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
                value={formData.to}
                onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
                placeholder="recipient@example.com"
                className="text-base focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Email subject"
                className="text-base focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            {/* Attachments */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Attachments ({attachments.length})</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                  disabled={sendingEmail}
                >
                  <Upload className="w-4 h-4" />
                  Add Files
                </Button>
              </div>
              
              {attachments.length > 0 && (
                <div className="space-y-2">
                  {attachments.map((attachment, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{attachment.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {Math.round(attachment.size / 1024)}KB
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttachment(index)}
                        disabled={sendingEmail}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div>
              <Label htmlFor="content">Message</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
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
                onClick={handleCancel}
                disabled={sendingEmail}
              >
                Cancel
              </Button>
              
              <Button
                type="button"
                onClick={handleSend}
                disabled={sendingEmail || !formData.to.trim() || !formData.subject.trim()}
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

export default SimpleComposeDialog;