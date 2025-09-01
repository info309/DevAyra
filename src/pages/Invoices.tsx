import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Eye, Send, CreditCard, Trash2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Invoice {
  id: string;
  invoice_number: string | null;
  company_name: string | null;
  company_email: string | null;
  company_address: string | null;
  customer_name: string;
  customer_email: string;
  customer_address: string | null;
  issue_date: string;
  due_date: string | null;
  currency: string;
  line_items: any[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  status: string;
  notes: string | null;
  pdf_path: string | null;
  stripe_session_id: string | null;
  created_at: string;
}

interface LineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate_percent: number;
  amount_cents: number;
}

const Invoices = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [formData, setFormData] = useState({
    company_name: '',
    company_email: '',
    company_address: '',
    customer_name: '',
    customer_email: '',
    customer_address: '',
    due_date: '',
    currency: 'usd',
    notes: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0 }
  ]);

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
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast({
        title: "Error",
        description: "Failed to fetch invoices",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateLineItem = (item: LineItem) => {
    const baseAmount = item.quantity * item.unit_price_cents;
    const taxAmount = Math.round(baseAmount * (item.tax_rate_percent / 100));
    return baseAmount + taxAmount;
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const newItems = [...lineItems];
    newItems[index] = { ...newItems[index], [field]: value };
    newItems[index].amount_cents = calculateLineItem(newItems[index]);
    setLineItems(newItems);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_price_cents), 0);
    const tax = lineItems.reduce((sum, item) => sum + Math.round((item.quantity * item.unit_price_cents) * (item.tax_rate_percent / 100)), 0);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const { subtotal, tax, total } = calculateTotals();
      const invoiceData = {
        user_id: user.id,
        ...formData,
        line_items: lineItems,
        subtotal_cents: subtotal,
        tax_cents: tax,
        total_cents: total,
        status: 'draft',
      };

      if (editingInvoice) {
        const { error } = await supabase
          .from('invoices')
          .update(invoiceData)
          .eq('id', editingInvoice.id);
        if (error) throw error;
        toast({ title: "Success", description: "Invoice updated successfully" });
      } else {
        const { error } = await supabase
          .from('invoices')
          .insert([invoiceData]);
        if (error) throw error;
        toast({ title: "Success", description: "Invoice created successfully" });
      }

      setIsCreateOpen(false);
      setEditingInvoice(null);
      resetForm();
      fetchInvoices();
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast({
        title: "Error",
        description: "Failed to save invoice",
        variant: "destructive"
      });
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
      due_date: '',
      currency: 'usd',
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
      due_date: invoice.due_date ? invoice.due_date.split('T')[0] : '',
      currency: invoice.currency,
      notes: invoice.notes || '',
    });
    setLineItems(invoice.line_items.length ? invoice.line_items : [{ description: '', quantity: 1, unit_price_cents: 0, tax_rate_percent: 0, amount_cents: 0 }]);
    setIsCreateOpen(true);
  };

  const handleGeneratePDF = async (invoiceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { invoiceId }
      });
      if (error) throw error;
      toast({ title: "Success", description: "PDF generated successfully" });
      fetchInvoices();
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error", 
        description: "Failed to generate PDF",
        variant: "destructive"
      });
    }
  };

  const handleSendInvoice = async (invoiceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-invoice', {
        body: { invoiceId }
      });
      if (error) throw error;
      toast({ title: "Success", description: "Invoice sent successfully" });
      fetchInvoices();
    } catch (error) {
      console.error('Error sending invoice:', error);
      toast({
        title: "Error",
        description: "Failed to send invoice",
        variant: "destructive"
      });
    }
  };

  const handleCreatePaymentLink = async (invoiceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('create-invoice-checkout', {
        body: { invoiceId }
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error creating payment link:', error);
      toast({
        title: "Error",
        description: "Failed to create payment link",
        variant: "destructive"
      });
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-background p-6 flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-heading font-bold">Invoices</h1>
            <p className="text-muted-foreground">Generate and manage client invoices</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setEditingInvoice(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingInvoice ? 'Edit Invoice' : 'Create New Invoice'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <h3 className="font-semibold">Company Information</h3>
                    <div>
                      <Label htmlFor="company_name">Company Name</Label>
                      <Input
                        id="company_name"
                        value={formData.company_name}
                        onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="company_email">Company Email</Label>
                      <Input
                        type="email"
                        id="company_email"
                        value={formData.company_email}
                        onChange={(e) => setFormData({...formData, company_email: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="company_address">Company Address</Label>
                      <Textarea
                        id="company_address"
                        value={formData.company_address}
                        onChange={(e) => setFormData({...formData, company_address: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-semibold">Customer Information</h3>
                    <div>
                      <Label htmlFor="customer_name">Customer Name *</Label>
                      <Input
                        id="customer_name"
                        required
                        value={formData.customer_name}
                        onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer_email">Customer Email *</Label>
                      <Input
                        type="email"
                        id="customer_email"
                        required
                        value={formData.customer_email}
                        onChange={(e) => setFormData({...formData, customer_email: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer_address">Customer Address</Label>
                      <Textarea
                        id="customer_address"
                        value={formData.customer_address}
                        onChange={(e) => setFormData({...formData, customer_address: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="due_date">Due Date</Label>
                    <Input
                      type="date"
                      id="due_date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency">Currency</Label>
                    <Select value={formData.currency} onValueChange={(value) => setFormData({...formData, currency: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="usd">USD</SelectItem>
                        <SelectItem value="eur">EUR</SelectItem>
                        <SelectItem value="gbp">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Line Items</h3>
                    <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Item
                    </Button>
                  </div>
                  {lineItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end p-4 border rounded">
                      <div>
                        <Label>Description</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          placeholder="Service/Product"
                        />
                      </div>
                      <div>
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 0)}
                          min="1"
                        />
                      </div>
                      <div>
                        <Label>Unit Price</Label>
                        <Input
                          type="number"
                          value={item.unit_price_cents / 100}
                          onChange={(e) => updateLineItem(index, 'unit_price_cents', Math.round((parseFloat(e.target.value) || 0) * 100))}
                          step="0.01"
                          min="0"
                        />
                      </div>
                      <div>
                        <Label>Tax Rate (%)</Label>
                        <Input
                          type="number"
                          value={item.tax_rate_percent}
                          onChange={(e) => updateLineItem(index, 'tax_rate_percent', parseFloat(e.target.value) || 0)}
                          step="0.01"
                          min="0"
                          max="100"
                        />
                      </div>
                      <div>
                        <Label>Total</Label>
                        <div className="font-medium">${(item.amount_cents / 100).toFixed(2)}</div>
                      </div>
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeLineItem(index)}
                          disabled={lineItems.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 text-right">
                  <div>Subtotal: {formatCurrency(calculateTotals().subtotal, formData.currency)}</div>
                  <div>Tax: {formatCurrency(calculateTotals().tax, formData.currency)}</div>
                  <div className="font-bold text-lg">Total: {formatCurrency(calculateTotals().total, formData.currency)}</div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Additional notes or terms..."
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingInvoice ? 'Update Invoice' : 'Create Invoice'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {invoices.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No invoices created yet</p>
                <p className="text-sm text-muted-foreground">Click "Create Invoice" to get started</p>
              </CardContent>
            </Card>
          ) : (
            invoices.map((invoice) => (
              <Card key={invoice.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Invoice #{invoice.invoice_number || invoice.id.slice(0, 8)}
                        <Badge className={getStatusColor(invoice.status)}>
                          {invoice.status}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        To: {invoice.customer_name} ({invoice.customer_email})
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Created: {new Date(invoice.created_at).toLocaleDateString()}
                        {invoice.due_date && ` • Due: ${new Date(invoice.due_date).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {formatCurrency(invoice.total_cents, invoice.currency)}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(invoice)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleGeneratePDF(invoice.id)}>
                      <FileText className="w-4 h-4 mr-2" />
                      Generate PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleSendInvoice(invoice.id)}>
                      <Send className="w-4 h-4 mr-2" />
                      Send Email
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleCreatePaymentLink(invoice.id)}>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Payment Link
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Invoices;