import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { gmailApi } from '@/utils/gmailApi';

interface InvoiceComposeProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: {
    id: string;
    invoice_number?: string;
    customer_name: string;
    customer_email: string;
    company_name?: string;
    payment_token: string;
    pdf_path?: string;
  };
}

export default function InvoiceComposeDrawer({ isOpen, onClose, invoice }: InvoiceComposeProps) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  
  // Pre-populate email fields
  const [to, setTo] = useState(invoice.customer_email);
  const [subject, setSubject] = useState(`Invoice from ${invoice.company_name || 'Your Company'}`);
  
  // Create payment link
  const invoiceLink = `https://ayra.app/payment?invoice=${invoice.id}&token=${invoice.payment_token}`;
  
  // Pre-populate HTML content with clickable payment link
  const [content, setContent] = useState(`Hi ${invoice.customer_name},

Thanks for your business! Please find your invoice attached.

You can view and pay your invoice online by clicking the link below:

${invoiceLink}

Best regards,
${invoice.company_name || 'Your Company'}`);

  const handleSend = async () => {
    if (!to || !subject || !content) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive"
      });
      return;
    }

    setSending(true);
    
    try {
      // Send email using gmailApi (without PDF attachment since it's on payment page)
      const response = await gmailApi.sendEmail(
        to,
        subject,
        content,
        undefined, // threadId
        [], // file attachments
        [], // no document attachments - PDF is on payment page
        false // sendAsLinks
      );

      if (response.error) {
        throw new Error(response.error);
      }

      toast({
        title: "Invoice Sent",
        description: `Invoice email sent successfully to ${invoice.customer_name}.`,
      });

      onClose();
    } catch (error) {
      console.error('Error sending invoice email:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send invoice email. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-h-[90vh] flex flex-col">
        <DrawerHeader className="flex-shrink-0">
          <DrawerTitle>Send Invoice Email</DrawerTitle>
          <DrawerDescription>
            Send invoice {invoice.invoice_number || invoice.id} to {invoice.customer_name}
          </DrawerDescription>
        </DrawerHeader>
        
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4 pb-4">
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="content">Message</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Email content..."
                rows={12}
                className="min-h-[200px]"
              />
              <p className="text-xs text-muted-foreground">
                The invoice PDF will be available on the payment page for customers to view.
              </p>
            </div>
          </div>
        </ScrollArea>

        <DrawerFooter className="flex-shrink-0">
          <div className="flex gap-2">
            <Button 
              onClick={handleSend} 
              disabled={sending}
              className="flex-1"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Sending..." : "Send Invoice"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}