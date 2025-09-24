import React, { useState, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import { CalendarIcon, Download, TrendingUp, FileText, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  total_cents: number;
  currency: string;
  status: string;
  type: string;
  paid_at: string | null;
  issue_date: string;
  due_date: string | null;
}

interface FinancialMetrics {
  invoiceTotals: number;
  paidInvoices: number;
  paidInvoiceCount: number;
  receiptTotals: number;
  receiptCount: number;
}

type DateRange = 'this_week' | 'this_month' | 'last_month' | 'all_time' | 'custom';

interface FinancialDashboardProps {
  onShowPaidInvoices?: () => void;
  onShowReceipts?: () => void;
}

const FinancialDashboard = ({ onShowPaidInvoices, onShowReceipts }: FinancialDashboardProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<FinancialMetrics>({
    invoiceTotals: 0,
    paidInvoices: 0,
    paidInvoiceCount: 0,
    receiptTotals: 0,
    receiptCount: 0
  });
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    if (user) {
      fetchFinancialData();
    }
  }, [user, dateRange, customStartDate, customEndDate]);

  const getDateRangeFilter = () => {
    const now = new Date();
    
    switch (dateRange) {
      case 'this_week':
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 })
        };
      case 'this_month':
        return {
          start: startOfMonth(now),
          end: endOfMonth(now)
        };
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        return {
          start: startOfMonth(lastMonth),
          end: endOfMonth(lastMonth)
        };
      case 'custom':
        return {
          start: customStartDate,
          end: customEndDate
        };
      case 'all_time':
      default:
        return { start: null, end: null };
    }
  };

  const fetchFinancialData = async () => {
    try {
      setLoading(true);
      
      // Fetch all invoices
      const { data: allInvoices, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setInvoices(allInvoices || []);

      // Calculate metrics
      let invoiceTotals = 0;
      let paidInvoices = 0;
      let paidInvoiceCount = 0;
      let receiptTotals = 0;
      let receiptCount = 0;

      const { start, end } = getDateRangeFilter();

      allInvoices?.forEach(invoice => {
        // Invoice totals (all invoices regardless of date)
        if (invoice.type === 'invoice') {
          invoiceTotals += invoice.total_cents;
        }
        
        // Receipt totals (all receipts regardless of date)
        if (invoice.type === 'receipt') {
          receiptTotals += invoice.total_cents;
          receiptCount += 1;
        }
        
        // Paid invoices within date range
        if (invoice.status === 'paid' && invoice.paid_at) {
          const paidDate = parseISO(invoice.paid_at);
          
          let includeInRange = true;
          if (start && paidDate < start) includeInRange = false;
          if (end && paidDate > end) includeInRange = false;
          
          if (includeInRange && invoice.type === 'invoice') {
            paidInvoices += invoice.total_cents;
            paidInvoiceCount += 1;
          }
        }
      });

      setMetrics({
        invoiceTotals,
        paidInvoices,
        paidInvoiceCount,
        receiptTotals,
        receiptCount
      });
    } catch (error) {
      console.error('Error fetching financial data:', error);
      toast({
        title: "Error",
        description: "Failed to load financial data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const { start, end } = getDateRangeFilter();
    
    // Filter paid invoices based on date range
    const paidInvoicesInRange = invoices.filter(invoice => {
      if (invoice.status !== 'paid' || !invoice.paid_at) return false;
      
      const paidDate = parseISO(invoice.paid_at);
      let includeInRange = true;
      if (start && paidDate < start) includeInRange = false;
      if (end && paidDate > end) includeInRange = false;
      
      return includeInRange;
    });

    if (paidInvoicesInRange.length === 0) {
      toast({
        title: "No Data",
        description: "No paid invoices found in the selected date range",
        variant: "destructive"
      });
      return;
    }

    // Create CSV content
    const headers = [
      'Invoice Number',
      'Customer Name', 
      'Customer Email',
      'Amount',
      'Currency',
      'Issue Date',
      'Due Date',
      'Paid Date',
      'Type'
    ];

    const csvContent = [
      headers.join(','),
      ...paidInvoicesInRange.map(invoice => [
        `"${invoice.invoice_number || invoice.id.slice(0, 8)}"`,
        `"${invoice.customer_name}"`,
        `"${invoice.customer_email}"`,
        (invoice.total_cents / 100).toFixed(2),
        invoice.currency.toUpperCase(),
        `"${format(parseISO(invoice.issue_date), 'yyyy-MM-dd')}"`,
        invoice.due_date ? `"${format(parseISO(invoice.due_date), 'yyyy-MM-dd')}"` : '""',
        invoice.paid_at ? `"${format(parseISO(invoice.paid_at), 'yyyy-MM-dd')}"` : '""',
        `"${invoice.type}"`
      ].join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    const dateRangeLabel = dateRange === 'custom' && start && end 
      ? `${format(start, 'yyyy-MM-dd')}-to-${format(end, 'yyyy-MM-dd')}`
      : dateRange.replace('_', '-');
    
    link.setAttribute('download', `paid-invoices-${dateRangeLabel}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Complete",
      description: `Exported ${paidInvoicesInRange.length} paid invoice(s) to CSV`,
    });
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'GBP', // You might want to make this dynamic based on user preference
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6 mb-8">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={onShowPaidInvoices}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Invoices</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {loading ? '...' : formatCurrency(metrics.paidInvoices)}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.paidInvoiceCount} invoice(s) - {dateRange.replace('_', ' ')}
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={onShowReceipts}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receipts</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {loading ? '...' : formatCurrency(metrics.receiptTotals)}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.receiptCount} receipt(s) - All time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Custom Date Range Picker */}
      {dateRange === 'custom' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custom Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal",
                        !customStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, "PPP") : "Start"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customStartDate}
                      onSelect={setCustomStartDate}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal",
                        !customEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, "PPP") : "End"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customEndDate}
                      onSelect={setCustomEndDate}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FinancialDashboard;