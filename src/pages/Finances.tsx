import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, Receipt, Eye, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import InvoicePaymentBanner from '@/components/InvoicePaymentBanner';
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
  const [dateRangeStart, setDateRangeStart] = useState<Date | null>(null);
  const [dateRangeEnd, setDateRangeEnd] = useState<Date | null>(null);

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
        window.open(documentUrl, '_blank', 'width=1000,height=800,scrollbars=yes,resizable=yes,toolbar=no,menubar=no');
      } else {
        // If it's a PDF path in invoices bucket
        const pdfUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${receipt.pdf_path}`;
        window.open(pdfUrl, '_blank', 'width=1000,height=800,scrollbars=yes,resizable=yes,toolbar=no,menubar=no');
      }
    } else {
      toast({
        title: "No document",
        description: "No document is associated with this receipt",
        variant: "destructive"
      });
    }
  };

  const exportPaidInvoicesToCSV = () => {
    if (paidInvoices.length === 0) {
      toast({
        title: "No Data",
        description: "No paid invoices found to export",
        variant: "destructive"
      });
      return;
    }

    // Create CSV content for accounting software like Xero
    const headers = [
      'Invoice Number',
      'Customer Name', 
      'Customer Email',
      'Amount',
      'Currency',
      'Issue Date',
      'Due Date',
      'Paid Date',
      'Type',
      'Status'
    ];

    const csvContent = [
      headers.join(','),
      ...paidInvoices.map(invoice => [
        `"${invoice.invoice_number || invoice.id.slice(0, 8)}"`,
        `"${invoice.customer_name}"`,
        `"${invoice.customer_email}"`,
        (invoice.total_cents / 100).toFixed(2),
        invoice.currency.toUpperCase(),
        `"${new Date(invoice.issue_date).toLocaleDateString()}"`,
        invoice.due_date ? `"${new Date(invoice.due_date).toLocaleDateString()}"` : '""',
        invoice.paid_at ? `"${new Date(invoice.paid_at).toLocaleDateString()}"` : '""',
        `"${invoice.type}"`,
        `"${invoice.status}"`
      ].join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `paid-invoices-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Complete",
      description: `Exported ${paidInvoices.length} paid invoice(s) to CSV`,
    });
  };

  const exportReceiptsToCSV = () => {
    if (receipts.length === 0) {
      toast({
        title: "No Data",
        description: "No receipts found to export",
        variant: "destructive"
      });
      return;
    }

    // Create CSV content for accounting software like Xero
    const headers = [
      'Receipt ID',
      'Customer Name', 
      'Amount',
      'Currency',
      'Date',
      'Type',
      'Notes'
    ];

    const csvContent = [
      headers.join(','),
      ...receipts.map(receipt => [
        `"${receipt.id.slice(0, 8)}"`,
        `"${receipt.customer_name}"`,
        (receipt.total_cents / 100).toFixed(2),
        receipt.currency.toUpperCase(),
        `"${new Date(receipt.created_at).toLocaleDateString()}"`,
        `"${receipt.type}"`,
        `"${receipt.notes || ''}"`
      ].join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `receipts-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Complete",
      description: `Exported ${receipts.length} receipt(s) to CSV`,
    });
  };

  const filterByDateRange = (items: Invoice[], dateField: 'paid_at' | 'issue_date') => {
    if (!dateRangeStart && !dateRangeEnd) return items;
    
    return items.filter(item => {
      const date = item[dateField] ? new Date(item[dateField]!) : null;
      if (!date) return false;
      
      if (dateRangeStart && date < dateRangeStart) return false;
      if (dateRangeEnd && date > dateRangeEnd) return false;
      
      return true;
    });
  };

  const paidInvoices = filterByDateRange(
    invoices.filter(invoice => invoice.status === 'paid' && invoice.type !== 'receipt'),
    'paid_at'
  );
  
  const filteredReceipts = filterByDateRange(receipts, 'issue_date');

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
      <FinancialDashboard 
        onShowPaidInvoices={() => {
          setShowPaidInvoices(true);
          setShowReceipts(false);
        }}
        onShowReceipts={() => {
          setShowReceipts(true);
          setShowPaidInvoices(false);
        }}
        onDateRangeChange={(start, end) => {
          setDateRangeStart(start);
          setDateRangeEnd(end);
        }}
      />

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div></div>
        <div className="flex gap-2">
          <ReceiptUploadDialog onReceiptUploaded={fetchInvoices} />
        </div>
      </div>

      {/* Paid Invoices Section */}
      {showPaidInvoices && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Paid Invoices</CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportPaidInvoicesToCSV}
                disabled={paidInvoices.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {paidInvoices.length === 0 ? (
              <p className="text-muted-foreground">No paid invoices found.</p>
            ) : (
              <div className="space-y-2">
                {paidInvoices.map((invoice) => (
                  <div key={invoice.id} className="flex justify-between items-center p-3 border rounded">
                    <div className="flex-1">
                      <p className="font-medium">{invoice.customer_name}</p>
                      <p className="text-sm text-muted-foreground">{invoice.invoice_number}</p>
                      {invoice.paid_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Paid: {new Date(invoice.paid_at).toLocaleDateString()}
                        </p>
                      )}
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
            <div className="flex justify-between items-center">
              <CardTitle>Receipts</CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportReceiptsToCSV}
                disabled={receipts.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {filteredReceipts.length === 0 ? (
              <p className="text-muted-foreground">No receipts found for the selected period.</p>
            ) : (
              <div className="space-y-2">
                {filteredReceipts.map((receipt) => (
                  <div key={receipt.id} className="flex justify-between items-center p-3 border rounded">
                    <div className="flex-1">
                      <p className="font-medium">{receipt.customer_name}</p>
                      <p className="text-sm text-muted-foreground">Receipt</p>
                      {receipt.issue_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Date: {new Date(receipt.issue_date).toLocaleDateString()}
                        </p>
                      )}
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