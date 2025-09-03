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
  };
}

export default function InvoiceComposeDrawer({ isOpen, onClose, invoice }: InvoiceComposeProps) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  
  // Pre-populate email fields
  const [to, setTo] = useState(invoice.customer_email);
  const [subject, setSubject] = useState(`Invoice #${invoice.invoice_number || invoice.id.slice(0,8)} from ${invoice.company_name || 'Your Company'}`);
  
  const handleSend = async () => {
    setSending(true);
    
    try {
      // Use the send-invoice edge function which handles status updates and correct domain
      const { data, error } = await supabase.functions.invoke('send-invoice', {
        body: { invoiceId: invoice.id }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Success",
        description: "Invoice email sent successfully!",
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
              <Label>Invoice Details</Label>
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">To:</span>
                  <span className="text-sm font-medium">{invoice.customer_email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Invoice:</span>
                  <span className="text-sm font-medium">#{invoice.invoice_number || invoice.id.slice(0,8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Amount:</span>
                  <span className="text-sm font-medium">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: (invoice.currency || 'USD').toUpperCase(),
                    }).format((invoice.total_cents || 0) / 100)}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Email Preview</Label>
              <div className="p-4 border rounded-lg bg-background">
                <div className="text-sm space-y-2">
                  <p><strong>Subject:</strong> Invoice from {invoice.company_name || 'Your Company'}</p>
                  <div className="pt-2 border-t">
                    <p>Hi {invoice.customer_name},</p>
                    <p>Thanks for your business! Please click below to view your invoice.</p>
                    <div className="my-3 p-2 bg-primary text-primary-foreground rounded text-center">
                      📄 View Invoice
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A professional email with payment link will be sent automatically.
                    </p>
                  </div>
                </div>
              </div>
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