import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, Receipt, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import InvoicePaymentBanner from '@/components/InvoicePaymentBanner';
import GmailConnectionBanner from '@/components/GmailConnectionBanner';
import FinancialDashboard from '@/components/FinancialDashboard';
import ReceiptUploadDialog from '@/components/ReceiptUploadDialog';
import type { Database } from '@/integrations/supabase/types';

type Invoice = Database['public']['Tables']['invoices']['Row'];

const Finances = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaidInvoices, setShowPaidInvoices] = useState(false);
  const [showReceipts, setShowReceipts] = useState(false);

  useEffect(() => {
    if (user) {
      fetchInvoices();
    }
  }, [user]);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const allInvoices = data || [];
      setInvoices(allInvoices.filter(invoice => invoice.type !== 'receipt'));
      setReceipts(allInvoices.filter(invoice => invoice.type === 'receipt'));
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  };

  const handleViewInvoice = (invoice: Invoice) => {
    const token = invoice.payment_token;
    if (invoice.type === 'quote') {
      // Redirect to quote page
      window.open(`/quote?quote=${invoice.id}&token=${token}`, '_blank');
    } else {
      // Redirect to payment/invoice page
      window.open(`/payment?invoice=${invoice.id}&token=${token}`, '_blank');
    }
  };

  const handleViewReceipt = (receipt: Invoice) => {
    if (receipt.pdf_path) {
      // If it's a document stored in storage
      if (receipt.pdf_path.startsWith('documents/')) {
        const documentUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${receipt.pdf_path}`;
        window.open(documentUrl, '_blank');
      } else {
        // If it's a PDF path in invoices bucket
        const pdfUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${receipt.pdf_path}`;
        window.open(pdfUrl, '_blank');
      }
    } else {
      toast({
        title: "No document",
        description: "No document is associated with this receipt",
        variant: "destructive"
      });
    }
  };

  const paidInvoices = invoices.filter(invoice => invoice.status === 'paid' && invoice.type !== 'receipt');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold">Finances</h1>
        </div>
      </div>

      <InvoicePaymentBanner />
      <GmailConnectionBanner />
      <FinancialDashboard />

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="text-sm text-muted-foreground">
          {invoices.filter(i => i.type === 'quote').length} quotes, {invoices.filter(i => i.type === 'invoice').length} invoices, {receipts.length} receipts
        </div>
        <div className="flex gap-2">
          <ReceiptUploadDialog onReceiptUploaded={fetchInvoices} />
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => {
            setShowPaidInvoices(true);
            setShowReceipts(false);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Paid Invoices</CardTitle>
            <FileText className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paidInvoices.length}</div>
            <p className="text-xs text-muted-foreground">
              Total: {formatCurrency(paidInvoices.reduce((sum, inv) => sum + inv.total_cents, 0), 'gbp')}
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => {
            setShowReceipts(true);
            setShowPaidInvoices(false);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Receipts</CardTitle>
            <Receipt className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{receipts.length}</div>
            <p className="text-xs text-muted-foreground">
              Total: {formatCurrency(receipts.reduce((sum, rec) => sum + rec.total_cents, 0), 'gbp')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Paid Invoices Section */}
      {showPaidInvoices && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Paid Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {paidInvoices.length === 0 ? (
              <p className="text-muted-foreground">No paid invoices found.</p>
            ) : (
              <div className="space-y-2">
                {paidInvoices.map((invoice) => (
                  <div key={invoice.id} className="flex justify-between items-center p-3 border rounded">
                    <div>
                      <p className="font-medium">{invoice.customer_name}</p>
                      <p className="text-sm text-muted-foreground">{invoice.invoice_number}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(invoice.total_cents, invoice.currency)}</p>
                        <p className="text-sm text-muted-foreground">Paid</p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewInvoice(invoice)}
                        title="View Invoice"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Receipts Section */}
      {showReceipts && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {receipts.length === 0 ? (
              <p className="text-muted-foreground">No receipts found.</p>
            ) : (
              <div className="space-y-2">
                {receipts.map((receipt) => (
                  <div key={receipt.id} className="flex justify-between items-center p-3 border rounded">
                    <div>
                      <p className="font-medium">{receipt.customer_name}</p>
                      <p className="text-sm text-muted-foreground">Receipt</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(receipt.total_cents, receipt.currency)}</p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewReceipt(receipt)}
                        title="View Receipt"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Finances;