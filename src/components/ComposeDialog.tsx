import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Send, X } from 'lucide-react';

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
  initialData: ComposeFormData;
  onSubmit: (formData: ComposeFormData) => Promise<void>;
  sending: boolean;
}

const ComposeDialog: React.FC<ComposeDialogProps> = ({
  open,
  onOpenChange,
  initialData,
  onSubmit,
  sending
}) => {
  const [composeForm, setComposeForm] = useState<ComposeFormData>(initialData);

  useEffect(() => {
    setComposeForm(initialData);
  }, [initialData]);

  const handleSubmit = async () => {
    await onSubmit(composeForm);
  };

  const handleInputChange = (field: keyof ComposeFormData, value: string) => {
    setComposeForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCancel = () => {
    onOpenChange(false);
    setComposeForm({ to: '', subject: '', content: '' });
  };

  return (
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
              onChange={(e) => handleInputChange('to', e.target.value)}
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
              onChange={(e) => handleInputChange('subject', e.target.value)}
              placeholder="Email subject"
              className="text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          
          <div>
            <Label htmlFor="content">Message</Label>
            <Textarea
              id="content"
              value={composeForm.content}
              onChange={(e) => handleInputChange('content', e.target.value)}
              placeholder="Write your message here..."
              rows={15}
              className="min-h-[300px] resize-none text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>
        
        <DrawerFooter>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={sending}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={sending || !composeForm.to.trim() || !composeForm.subject.trim()}
            >
              {sending ? (
                'Sending...'
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </>
              )}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default ComposeDialog;