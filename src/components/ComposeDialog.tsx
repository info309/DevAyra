import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Send } from 'lucide-react';

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
                disabled={sendingEmail || !composeForm.to.trim() || !composeForm.subject.trim()}
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