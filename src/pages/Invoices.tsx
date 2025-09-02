import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Plus, Edit, Eye, Send, CreditCard, Trash2, FileText, ArrowLeft, ChevronDown, Check } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import InvoicePaymentBanner from '@/components/InvoicePaymentBanner';
import GmailConnectionBanner from '@/components/GmailConnectionBanner';
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

const Invoices = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0 }
  ]);

  const [formData, setFormData] = useState({
    company_name: '',
    company_email: '',
    company_address: '',
    customer_name: '',
    customer_email: '',
    customer_address: '',
    invoice_number: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
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
      setInvoices(data || []);
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
    if (!user) return;

    try {
      const { subtotal, tax, total } = calculateTotals();
      const invoiceData: InvoiceInsert = {
        user_id: user.id,
        ...formData,
        // Convert empty strings to null for timestamp fields
        due_date: formData.due_date || null,
        line_items: lineItems as any, // Cast to any for JSONB compatibility
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
    }
  };

  const resetForm = () => {
    setFormData({
      company_name: '',
      company_email: '',
      company_address: '',
      customer_name: '',
      customer_email: '',
      customer_address: '',
      invoice_number: '',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: '',
      currency: 'gbp',
      notes: '',
    });
    setLineItems([{ description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0 }]);
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setFormData({
      company_name: invoice.company_name || '',
      company_email: invoice.company_email || '',
      company_address: invoice.company_address || '',
      customer_name: invoice.customer_name,
      customer_email: invoice.customer_email,
      customer_address: invoice.customer_address || '',
      invoice_number: invoice.invoice_number || '',
      issue_date: invoice.issue_date.split('T')[0],
      due_date: invoice.due_date ? invoice.due_date.split('T')[0] : '',
      currency: invoice.currency,
      notes: invoice.notes || '',
    });
    const items = Array.isArray(invoice.line_items) ? invoice.line_items as LineItem[] : [];
    setLineItems(items.length ? items : [{ description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0 }]);
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

  const handleSendInvoice = (invoice: Invoice) => {
    // Simple email content to avoid security filters
    const subject = `Invoice from ${invoice.company_name || 'Your Company'}`;
    
    // Create invoice viewing link with production domain
    const invoiceLink = `https://ayra.app/payment?invoice=${invoice.id}&token=${invoice.payment_token}`;
    
    const simpleBody = `Hi ${invoice.customer_name},

Thanks for your business! Please click the link below to view your invoice.

${invoiceLink}

Best regards,
${invoice.company_name || 'Your Company'}`;

    // Navigate to mailbox with compose draft
    navigate('/mailbox', { 
      state: { 
        composeDraft: { 
          to: invoice.customer_email, 
          subject, 
          content: simpleBody 
        } 
      } 
    });
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

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0 }]);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updatedItems = [...lineItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // Calculate amount_cents when quantity or unit_price_cents changes
    if (field === 'quantity' || field === 'unit_price_cents') {
      updatedItems[index].amount_cents = updatedItems[index].quantity * updatedItems[index].unit_price_cents;
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

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
          </Button>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">Invoices</h1>
        <p className="text-muted-foreground">Create and manage your invoices</p>
      </div>

      <InvoicePaymentBanner />
      <GmailConnectionBanner />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="text-sm text-muted-foreground">
          {invoices.length} total invoice{invoices.length !== 1 ? 's' : ''}
        </div>
        <Drawer open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DrawerTrigger asChild>
            <Button 
              onClick={() => { resetForm(); setEditingInvoice(null); }} 
              className="w-full sm:w-auto" 
              style={{ backgroundColor: '#ff6d4d' }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Invoice
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>{editingInvoice ? 'Edit Invoice' : 'Create New Invoice'}</DrawerTitle>
            </DrawerHeader>
            
            <div className="overflow-y-auto px-4 pb-4">
              <form onSubmit={handleSubmit} className="space-y-6">
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
                    <Input
                      id="issue_date"
                      type="date"
                      required
                      value={formData.issue_date}
                      onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="due_date">Due Date</Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    />
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
                              value={(item.unit_price_cents / 100).toFixed(2)}
                              onChange={(e) => updateLineItem(index, 'unit_price_cents', Math.round(parseFloat(e.target.value || '0') * 100))}
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
                  <Button type="submit" style={{ backgroundColor: '#ff6d4d' }}>
                    {editingInvoice ? 'Update Invoice' : 'Create Invoice'}
                  </Button>
                </div>
              </form>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="grid gap-4">
        {invoices.map((invoice) => (
          <Card key={invoice.id}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    <span className="truncate">Invoice #{invoice.invoice_number || invoice.id.slice(0, 8)}</span>
                    <Badge variant={
                      invoice.status === 'paid' ? 'default' : 
                      invoice.status === 'sent' ? 'secondary' : 
                      'outline'
                    }>
                      {invoice.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="truncate">
                    {invoice.customer_name} • {formatCurrency(invoice.total_cents, invoice.currency)}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
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
                  {invoice.status !== 'paid' && (
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
                  <Button variant="outline" size="sm" onClick={() => handleGeneratePDF(invoice)} title="PDF">
                    <FileText className="w-4 h-4" />
                    <span className="ml-2 hidden sm:inline">PDF</span>
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
        ))}
      </div>
    </div>
  );
};

export default Invoices;
