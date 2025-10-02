import React, { useState, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears, startOfDay, endOfDay, parseISO } from 'date-fns';
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
import { exportInvoicesToCSV } from '@/utils/csvExport';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  total_cents: number;
  subtotal_cents: number;
  tax_cents: number;
  currency: string;
  status: string;
  type: string;
  paid_at: string | null;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  line_items?: any;
}

interface FinancialMetrics {
  invoiceTotals: number;
  paidInvoices: number;
  paidInvoiceCount: number;
  receiptTotals: number;
  receiptCount: number;
}

type DateRange = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'custom';

interface FinancialDashboardProps {
  onShowPaidInvoices?: () => void;
  onShowReceipts?: () => void;
  onDateRangeChange?: (start: Date | null, end: Date | null) => void;
}

const FinancialDashboard = ({ onShowPaidInvoices, onShowReceipts, onDateRangeChange }: FinancialDashboardProps) => {
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

  useEffect(() => {
    const { start, end } = getDateRangeFilter();
    if (onDateRangeChange) {
      onDateRangeChange(start || null, end || null);
    }
  }, [dateRange, customStartDate, customEndDate]);

  const getDateRangeFilter = () => {
    const now = new Date();
    
    switch (dateRange) {
      case 'today':
        return {
          start: startOfDay(now),
          end: endOfDay(now)
        };
      case 'this_week':
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 })
        };
      case 'last_week':
        const lastWeekDate = new Date(now);
        lastWeekDate.setDate(now.getDate() - 7);
        return {
          start: startOfWeek(lastWeekDate, { weekStartsOn: 1 }),
          end: endOfWeek(lastWeekDate, { weekStartsOn: 1 })
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
      case 'this_year':
        return {
          start: startOfYear(now),
          end: endOfYear(now)
        };
      case 'last_year':
        const lastYear = subYears(now, 1);
        return {
          start: startOfYear(lastYear),
          end: endOfYear(lastYear)
        };
      case 'custom':
        return {
          start: customStartDate,
          end: customEndDate
        };
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
        
        // Receipt totals within date range (using issue_date)
        if (invoice.type === 'receipt' && invoice.issue_date) {
          const receiptDate = parseISO(invoice.issue_date);
          
          let includeInRange = true;
          if (start && receiptDate < start) includeInRange = false;
          if (end && receiptDate > end) includeInRange = false;
          
          if (includeInRange) {
            receiptTotals += invoice.total_cents;
            receiptCount += 1;
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

    try {
      const dateRangeLabel = dateRange === 'custom' && start && end 
        ? `${format(start, 'yyyy-MM-dd')}-to-${format(end, 'yyyy-MM-dd')}`
        : dateRange.replace('_', '-');
      
      exportInvoicesToCSV(paidInvoicesInRange, `paid-invoices-${dateRangeLabel}.csv`);
      
      toast({
        title: "Export Complete",
        description: `Exported ${paidInvoicesInRange.length} paid invoice(s) to CSV`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export invoices",
        variant: "destructive"
      });
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'GBP', // You might want to make this dynamic based on user preference
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6 mb-8">
      {/* Date Range Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
            <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="last_year">Last Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Custom Date Range Picker */}
      {dateRange === 'custom' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custom Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full sm:w-[200px] justify-start text-left font-normal",
                        !customStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, "PPP") : "Select start date"}
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
                        "w-full sm:w-[200px] justify-start text-left font-normal",
                        !customEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, "PPP") : "Select end date"}
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
              {metrics.paidInvoiceCount} invoice(s) - {dateRange.replace(/_/g, ' ')}
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
              {metrics.receiptCount} receipt(s) - {dateRange.replace(/_/g, ' ')}
            </p>
          </CardContent>
        </Card>
      </div>

    </div>
  );
};

export default FinancialDashboard;