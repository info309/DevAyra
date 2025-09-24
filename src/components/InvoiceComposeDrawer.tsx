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
import { supabase } from '@/integrations/supabase/client';

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
    currency?: string;
    total_cents?: number;
    type?: string;
  };
}

export default function InvoiceComposeDrawer({ isOpen, onClose, invoice }: InvoiceComposeProps) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const documentType = (invoice.type || 'invoice') === 'quote' ? 'quote' : 'invoice';
  const documentTypeCapitalized = documentType.charAt(0).toUpperCase() + documentType.slice(1);
  
  const [customMessage, setCustomMessage] = useState(`Hi ${invoice.customer_name},

Thank you for your business with ${invoice.company_name || 'our company'}!

Your ${documentType} is ready for viewing${documentType === 'invoice' ? ' and payment' : ''}. Please click the "${documentType === 'invoice' ? 'Pay Invoice' : 'View Quote'}" button below to proceed.

If you have any questions about this ${documentType}, please don't hesitate to contact us.

Best regards,
${invoice.company_name || 'Your Company'}`);

  const handleSend = async () => {
    setSending(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('send-invoice', {
        body: { 
          invoiceId: invoice.id,
          customMessage: customMessage.trim()
        }
      });

      if (error) {
        throw new Error(error.message);
      }

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
          <DrawerTitle>Send {documentTypeCapitalized} Email</DrawerTitle>
          <DrawerDescription>
            Send {documentType} {invoice.invoice_number || invoice.id} to {invoice.customer_name}
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="flex-1 px-4 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customMessage">Email Message</Label>
              <Textarea
                id="customMessage"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Enter your custom message..."
                rows={8}
                className="min-h-[150px]"
              />
              <p className="text-xs text-muted-foreground">
                Customize the message that will be sent to {invoice.customer_name}. The "{documentType === 'invoice' ? 'Pay Invoice' : 'View Quote'}" button will be added automatically.
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">{documentTypeCapitalized} Details</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">{documentTypeCapitalized} Number</p>
                  <p>{invoice.invoice_number || invoice.id.slice(0,8)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p>{new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: (invoice.currency || 'USD').toUpperCase(),
                  }).format((invoice.total_cents || 0) / 100)}</p>
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <p className="text-blue-800">
                The email will include a "{documentType === 'invoice' ? 'Pay Invoice' : 'View Quote'}" button where {invoice.customer_name} can view {documentType === 'invoice' ? 'and pay the invoice' : 'the quote'} securely.
              </p>
            </div>
          </div>
        </div>

        <DrawerFooter className="flex-shrink-0">
          <div className="flex gap-2">
            <Button 
              onClick={handleSend} 
              disabled={sending}
              className="flex-1"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Sending..." : `Send ${documentTypeCapitalized}`}
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