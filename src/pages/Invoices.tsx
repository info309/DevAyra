import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Eye, Send, CreditCard, Trash2, FileText, ArrowLeft, ChevronDown, Check, Loader2, Receipt, Download, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import InvoicePaymentBanner from '@/components/InvoicePaymentBanner';
import InvoiceComposeDrawer from '@/components/InvoiceComposeDrawer';
import GmailConnectionBanner from '@/components/GmailConnectionBanner';
import FinancialDashboard from '@/components/FinancialDashboard';
import ReceiptUploadDialog from '@/components/ReceiptUploadDialog';
import type { Database } from '@/integrations/supabase/types';

type Invoice = Database['public']['Tables']['invoices']['Row'];
type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];
type InvoiceUpdate = Database['public']['Tables']['invoices']['Update'];

interface LineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate_percent: number;
  amount_cents: number;
  [key: string]: any; // Index signature for Json compatibility
}

// Add interface for unit price display values to fix typing issues
interface LineItemDisplay extends LineItem {
  unit_price_display: string;
}

const Invoices = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<Invoice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPaidInvoices, setShowPaidInvoices] = useState(false);
  const [showReceipts, setShowReceipts] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemDisplay[]>([
    { description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0, unit_price_display: '0.00' }
  ]);

  const [formData, setFormData] = useState({
    type: 'quote' as 'quote' | 'invoice',
    company_name: '',
    company_email: '',
    company_address: '',
    customer_name: '',
    customer_email: '',
    customer_address: '',
    invoice_number: '',
    issue_date: new Date(),
    due_date: null as Date | null,
    currency: 'gbp',
    notes: '',
  });

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

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount_cents, 0);
    const tax = lineItems.reduce((sum, item) => sum + (item.amount_cents * item.tax_rate_percent / 100), 0);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { subtotal, tax, total } = calculateTotals();
      const invoiceData: InvoiceInsert = {
        user_id: user.id,
        ...formData,
        // Convert dates to ISO strings for database
        issue_date: formData.issue_date.toISOString(),
        due_date: formData.due_date ? formData.due_date.toISOString() : null,
        line_items: lineItems.map(({ unit_price_display, ...item }) => item) as any, // Remove display field and cast for JSONB
        subtotal_cents: Math.round(subtotal),
        tax_cents: Math.round(tax),
        total_cents: Math.round(total),
      };

      let invoiceId: string;

      if (editingInvoice) {
        const { error } = await supabase
          .from('invoices')
          .update(invoiceData as InvoiceUpdate)
          .eq('id', editingInvoice.id);
        if (error) throw error;
        console.log('Invoice updated successfully');
        invoiceId = editingInvoice.id;
      } else {
        const { data, error } = await supabase
          .from('invoices')
          .insert(invoiceData)
          .select()
          .single();
        if (error) throw error;
        console.log('Invoice created successfully');
        invoiceId = data.id;
      }

      // Auto-generate PDF for new invoices and updates
      try {
        const { error: pdfError } = await supabase.functions.invoke('generate-invoice-pdf', {
          body: { invoiceId }
        });
        if (pdfError) {
          console.error('PDF generation failed:', pdfError);
        } else {
          console.log('PDF generated successfully');
        }
      } catch (pdfError) {
        console.error('PDF generation error:', pdfError);
      }

      setIsCreateOpen(false);
      setEditingInvoice(null);
      resetForm();
      fetchInvoices();
    } catch (error) {
      console.error('Invoice save error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'quote',
      company_name: '',
      company_email: '',
      company_address: '',
      customer_name: '',
      customer_email: '',
      customer_address: '',
      invoice_number: '',
      issue_date: new Date(),
      due_date: null,
      currency: 'gbp',
      notes: '',
    });
    setLineItems([{ description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0, unit_price_display: '0.00' }]);
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setFormData({
      type: (invoice.type as 'quote' | 'invoice') || 'invoice',
      company_name: invoice.company_name || '',
      company_email: invoice.company_email || '',
      company_address: invoice.company_address || '',
      customer_name: invoice.customer_name,
      customer_email: invoice.customer_email,
      customer_address: invoice.customer_address || '',
      invoice_number: invoice.invoice_number || '',
      issue_date: new Date(invoice.issue_date),
      due_date: invoice.due_date ? new Date(invoice.due_date) : null,
      currency: invoice.currency,
      notes: invoice.notes || '',
    });
    const items = Array.isArray(invoice.line_items) ? invoice.line_items as LineItem[] : [];
    const displayItems = items.length ? items.map(item => ({
      ...item,
      unit_price_display: (item.unit_price_cents / 100).toFixed(2)
    })) : [{ description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0, unit_price_display: '0.00' }];
    setLineItems(displayItems);
    setIsCreateOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      console.log('Invoice deleted successfully');
      fetchInvoices();
    } catch (error) {
      console.error('Failed to delete invoice:', error);
    }
  };

  const handleSendInvoice = async (invoice: Invoice) => {
    try {
      // First ensure PDF exists
      if (!invoice.pdf_path) {
        toast({
          title: "Generating PDF...",
          description: "Please wait while we generate the invoice PDF.",
        });
        
        const { error: pdfError } = await supabase.functions.invoke('generate-invoice-pdf', {
          body: { invoiceId: invoice.id }
        });
        
        if (pdfError) {
          throw new Error(`Failed to generate PDF: ${pdfError.message}`);
        }
        
        // Refresh invoice data to get PDF path
        const { data: updatedInvoice, error: fetchError } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoice.id)
          .single();
          
        if (fetchError || !updatedInvoice?.pdf_path) {
          throw new Error("PDF generation failed");
        }
        
        setSendingInvoice(updatedInvoice);
      } else {
        setSendingInvoice(invoice);
      }
      
    } catch (error) {
      console.error('Error in handleSendInvoice:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to prepare invoice email. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleCreatePaymentLink = async (invoice: Invoice) => {
    try {
      const { data, error } = await supabase.functions.invoke('create-invoice-checkout', {
        body: { invoiceId: invoice.id }
      });

      if (error) throw error;

      // Open Stripe checkout in a new tab
      window.open(data.url, '_blank');
      
      console.log('Payment link created. Opening payment page...');
    } catch (error) {
      console.error('Payment link error:', error);
    }
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

  const handleGeneratePDF = async (invoice: Invoice) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { invoiceId: invoice.id }
      });

      if (error) throw error;

      if (data?.pdf_path) {
        // Open the generated PDF in a new tab
        const pdfUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${data.pdf_path}`;
        window.open(pdfUrl, '_blank');
        console.log('PDF generated and opened successfully');
      } else {
        console.error('No PDF path returned');
      }
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    }
  };

  const handleMarkAsPaid = async (invoice: Invoice) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ 
          status: 'paid',
          paid_at: new Date().toISOString()
        })
        .eq('id', invoice.id);

      if (error) throw error;
      
      console.log('Invoice marked as paid successfully');
      fetchInvoices();
    } catch (error) {
      console.error('Failed to mark invoice as paid:', error);
    }
  };

  const handleConvertToInvoice = async (quote: Invoice) => {
    try {
      // Convert to invoice and clear old PDF path
      const { error } = await supabase
        .from('invoices')
        .update({ 
          type: 'invoice',
          status: 'draft',
          pdf_path: null // Clear old PDF to force regeneration
        })
        .eq('id', quote.id);

      if (error) throw error;
      
      // Wait for database to update, then regenerate PDF with fresh data
      setTimeout(async () => {
        try {
          console.log('Regenerating PDF for converted invoice...');
          const { data, error: pdfError } = await supabase.functions.invoke('generate-invoice-pdf', {
            body: { invoiceId: quote.id }
          });
          
          if (pdfError) {
            console.error('PDF regeneration failed:', pdfError);
          } else {
            console.log('PDF regenerated successfully:', data);
          }
        } catch (pdfError) {
          console.error('PDF regeneration error:', pdfError);
        }
      }, 2000); // Increased wait time
      
      toast({
        title: "Success",
        description: "Quote converted to invoice successfully. New PDF is being generated.",
      });
      
      console.log('Quote converted to invoice successfully');
      fetchInvoices();
    } catch (error) {
      console.error('Failed to convert quote to invoice:', error);
      toast({
        title: "Error",
        description: "Failed to convert quote to invoice",
        variant: "destructive"
      });
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0, unit_price_display: '0.00' }]);
  };

  const updateLineItem = (index: number, field: keyof LineItemDisplay, value: any) => {
    const updatedItems = [...lineItems];
    
    if (field === 'unit_price_display') {
      // Handle display value updates for better typing experience
      updatedItems[index].unit_price_display = value;
      const parsedValue = parseFloat(value) || 0;
      updatedItems[index].unit_price_cents = Math.round(parsedValue * 100);
      // Recalculate amount
      updatedItems[index].amount_cents = updatedItems[index].quantity * updatedItems[index].unit_price_cents;
    } else {
      updatedItems[index] = { ...updatedItems[index], [field]: value };
      
      // Calculate amount_cents when quantity changes
      if (field === 'quantity') {
        updatedItems[index].amount_cents = updatedItems[index].quantity * updatedItems[index].unit_price_cents;
      }
    }
    
    setLineItems(updatedItems);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
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

  const handleDownloadReceipt = async (receipt: Invoice) => {
    if (!receipt.pdf_path) {
      toast({
        title: "No document",
        description: "No document is associated with this receipt",
        variant: "destructive"
      });
      return;
    }

    try {
      let downloadUrl: string;
      
      if (receipt.pdf_path.startsWith('documents/')) {
        downloadUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${receipt.pdf_path}`;
      } else {
        downloadUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${receipt.pdf_path}`;
      }

      // Create a temporary link element to trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `receipt_${receipt.customer_name}_${format(new Date(receipt.created_at), 'yyyy-MM-dd')}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Success",
        description: "Receipt download started",
      });
    } catch (error) {
      console.error('Failed to download receipt:', error);
      toast({
        title: "Error",
        description: "Failed to download receipt",
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
          <h1 className="text-2xl md:text-3xl font-bold">Invoices & Receipts</h1>
        </div>
      </div>

      <InvoicePaymentBanner />
      <GmailConnectionBanner />
      <FinancialDashboard />

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

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="text-sm text-muted-foreground">
          {invoices.filter(i => i.type === 'quote').length} quotes, {invoices.filter(i => i.type === 'invoice').length} invoices, {receipts.length} receipts
        </div>
        <div className="flex gap-2">
          <ReceiptUploadDialog onReceiptUploaded={fetchInvoices} />
          <Drawer open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DrawerTrigger asChild>
              <Button 
                onClick={() => { resetForm(); setEditingInvoice(null); }} 
                className="w-full sm:w-auto" 
                variant="outline"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Quote
              </Button>
            </DrawerTrigger>
            <DrawerTrigger asChild>
              <Button 
                onClick={() => { 
                  resetForm(); 
                  setFormData(prev => ({ ...prev, type: 'invoice' })); 
                  setEditingInvoice(null); 
                }} 
                className="w-full sm:w-auto" 
                style={{ backgroundColor: '#ff6d4d' }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Invoice
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[90vh]">
              <DrawerHeader>
                <DrawerTitle>
                  {editingInvoice 
                    ? `Edit ${editingInvoice.type === 'quote' ? 'Quote' : 'Invoice'}` 
                    : `Create New ${formData.type === 'quote' ? 'Quote' : 'Invoice'}`
                  }
                </DrawerTitle>
              </DrawerHeader>
              
              <div className="overflow-y-auto px-4 pb-4">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Document Type Selection */}
                  <div>
                    <Label htmlFor="type">Document Type *</Label>
                    <Select 
                      value={formData.type} 
                      onValueChange={(value: 'quote' | 'invoice') => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quote">Quote</SelectItem>
                        <SelectItem value="invoice">Invoice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                {/* Company Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="company_name">Company Name</Label>
                    <Input
                      id="company_name"
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="company_email">Company Email</Label>
                    <Input
                      id="company_email"
                      type="email"
                      value={formData.company_email}
                      onChange={(e) => setFormData({ ...formData, company_email: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="company_address">Company Address</Label>
                  <Textarea
                    id="company_address"
                    value={formData.company_address}
                    onChange={(e) => setFormData({ ...formData, company_address: e.target.value })}
                  />
                </div>

                {/* Customer Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customer_name">Customer Name *</Label>
                    <Input
                      id="customer_name"
                      required
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="customer_email">Customer Email *</Label>
                    <Input
                      id="customer_email"
                      type="email"
                      required
                      value={formData.customer_email}
                      onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="customer_address">Customer Address</Label>
                  <Textarea
                    id="customer_address"
                    value={formData.customer_address}
                    onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                  />
                </div>

                {/* Invoice Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="invoice_number">Invoice Number</Label>
                    <Input
                      id="invoice_number"
                      value={formData.invoice_number}
                      onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="issue_date">Issue Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !formData.issue_date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.issue_date ? format(formData.issue_date, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.issue_date}
                          onSelect={(date) => setFormData({ ...formData, issue_date: date || new Date() })}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label htmlFor="due_date">Due Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !formData.due_date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.due_date ? format(formData.due_date, "PPP") : <span>Pick a date (optional)</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.due_date || undefined}
                          onSelect={(date) => setFormData({ ...formData, due_date: date || null })}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gbp">GBP - British Pound</SelectItem>
                      <SelectItem value="usd">USD - US Dollar</SelectItem>
                      <SelectItem value="eur">EUR - Euro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Line Items */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <Label>Line Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Item
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {lineItems.map((item, index) => (
                      <div key={index} className="space-y-3 md:grid md:grid-cols-12 md:gap-2 md:items-end md:space-y-0 border-b pb-3 md:border-0 md:pb-0">
                        <div className="md:col-span-4">
                          <Label className="text-xs">Description</Label>
                          <Input
                            placeholder="Item description"
                            value={item.description}
                            onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:col-span-2">
                          <div>
                            <Label className="text-xs">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:col-span-2">
                          <div>
                            <Label className="text-xs">Unit Price (£)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_price_display}
                              onChange={(e) => updateLineItem(index, 'unit_price_display', e.target.value)}
                              onBlur={(e) => {
                                // Format the display value on blur
                                const parsedValue = parseFloat(e.target.value) || 0;
                                updateLineItem(index, 'unit_price_display', parsedValue.toFixed(2));
                              }}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:col-span-2">
                          <div>
                            <Label className="text-xs">Tax Rate (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.tax_rate_percent}
                              onChange={(e) => updateLineItem(index, 'tax_rate_percent', parseFloat(e.target.value || '0'))}
                            />
                          </div>
                        </div>
                        <div className="md:col-span-1 flex justify-center md:justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLineItem(index)}
                            disabled={lineItems.length === 1}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 text-right space-y-1">
                    <div>Subtotal: {formatCurrency(calculateTotals().subtotal, formData.currency)}</div>
                    <div>Tax: {formatCurrency(calculateTotals().tax, formData.currency)}</div>
                    <div className="text-lg font-bold">Total: {formatCurrency(calculateTotals().total, formData.currency)}</div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes or terms..."
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: '#ff6d4d' }}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {editingInvoice ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      editingInvoice ? `Update ${editingInvoice.type === 'quote' ? 'Quote' : 'Invoice'}` : `Create ${formData.type === 'quote' ? 'Quote' : 'Invoice'}`
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </DrawerContent>
        </Drawer>
        </div>
      </div>

      {/* Paid Invoices Section */}
      {showPaidInvoices && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Paid Invoices</CardTitle>
            <CardDescription>
              View and manage your paid invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paidInvoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No paid invoices yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paidInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">
                          {invoice.invoice_number || `INV-${invoice.id.slice(0, 8)}`}
                        </TableCell>
                        <TableCell>{invoice.customer_name}</TableCell>
                        <TableCell>
                          {format(new Date(invoice.created_at), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(invoice.total_cents, invoice.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">Paid</Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewInvoice(invoice)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleGeneratePDF(invoice)}>
                                <Download className="mr-2 h-4 w-4" />
                                Download PDF
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
            <CardDescription>
              View and manage your uploaded receipts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {receipts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No receipts uploaded yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map((receipt) => (
                      <TableRow key={receipt.id}>
                        <TableCell className="font-medium">
                          {receipt.customer_name}
                        </TableCell>
                        <TableCell>
                          {format(new Date(receipt.created_at), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(receipt.total_cents, receipt.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">Paid</Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewReceipt(receipt)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Receipt
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownloadReceipt(receipt)}>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDelete(receipt.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main invoices list - only show when no specific section is selected */}
      {!showPaidInvoices && !showReceipts && (
        <div className="grid gap-4">
          {loading && invoices.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-muted-foreground">Loading invoices...</div>
            </div>
          ) : (
          invoices.map((invoice) => (
          <Card key={invoice.id}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    <span className="truncate">{(invoice.type as string) === 'quote' ? 'Quote' : 'Invoice'} #{invoice.invoice_number || invoice.id.slice(0, 8)}</span>
                    <Badge variant={
                      invoice.status === 'paid' ? 'default' : 
                      invoice.status === 'sent' ? 'secondary' : 
                      'outline'
                    }>
                      {invoice.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {(invoice.type as string) === 'quote' ? 'Quote' : 'Invoice'}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="truncate">
                    {invoice.customer_name} • {formatCurrency(invoice.total_cents, invoice.currency)}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                  {invoice.type === 'quote' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleConvertToInvoice(invoice)} 
                      title="Convert to Invoice"
                      style={{ backgroundColor: '#ff6d4d', color: 'white' }}
                    >
                      <FileText className="w-4 h-4" />
                      <span className="ml-2 hidden sm:inline">Make Invoice</span>
                    </Button>
                  )}
                  {invoice.status === 'draft' && (
                    <Button variant="outline" size="sm" onClick={() => handleEdit(invoice)} title="Edit">
                      <Edit className="w-4 h-4" />
                      <span className="ml-2 hidden sm:inline">Edit</span>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleSendInvoice(invoice)} title="Send">
                    <Send className="w-4 h-4" />
                    <span className="ml-2 hidden sm:inline">Send</span>
                  </Button>
                  {invoice.type === 'invoice' && invoice.status !== 'paid' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" title="Payment Options">
                          <CreditCard className="w-4 h-4" />
                          <span className="ml-2 hidden sm:inline">Pay</span>
                          <ChevronDown className="w-4 h-4 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleCreatePaymentLink(invoice)}>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Pay by Card
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMarkAsPaid(invoice)}>
                          <Check className="w-4 h-4 mr-2" />
                          Mark as Already Paid
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleViewInvoice(invoice)} title="View">
                    <Eye className="w-4 h-4" />
                    <span className="ml-2 hidden sm:inline">View</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(invoice.id)} title="Delete" className="text-red-600 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                    <span className="ml-2 hidden sm:inline">Delete</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0">
                  <span>Issue Date: {new Date(invoice.issue_date).toLocaleDateString()}</span>
                  {invoice.due_date && (
                    <>
                      <span className="hidden sm:inline mx-2">•</span>
                      <span>Due: {new Date(invoice.due_date).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          ))
        )}
      </div>
      )}

      {/* Invoice Compose Drawer */}
      {sendingInvoice && (
        <InvoiceComposeDrawer
          isOpen={!!sendingInvoice}
          onClose={() => setSendingInvoice(null)}
          invoice={sendingInvoice}
        />
      )}
    </div>
  );
};

export default Invoices;
