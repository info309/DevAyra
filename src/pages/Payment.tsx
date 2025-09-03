import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CreditCard, FileText, Download, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string;
  total_cents: number;
  currency: string;
  status: string;
  company_name: string;
  pdf_path?: string;
  issue_date?: string;
  due_date?: string;
}

const Payment = () => {
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get("invoice");
  const token = searchParams.get("token");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!invoiceId || !token) {
        console.log('No invoice ID or token provided');
        setLoading(false);
        return;
      }

      console.log('Fetching invoice with ID:', invoiceId, 'and token:', token);

      try {
        // Use the secure function to get invoice data with token verification
        const { data, error } = await supabase
          .rpc('get_invoice_for_payment', {
            invoice_id: invoiceId,
            token: token
          });

        console.log('Supabase response:', { data, error });

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
        
        if (!data || data.length === 0) {
          console.log('No invoice data returned - invalid token or invoice not found');
          setInvoice(null);
        } else {
          console.log('Invoice data found:', data[0]);
          setInvoice(data[0]);
        }
      } catch (error: any) {
        console.error('Error fetching invoice:', error);
        toast({
          title: "Error",
          description: `Failed to load invoice details: ${error.message}`,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [invoiceId, token, toast]);

  const handlePayment = async () => {
    if (!invoice) return;

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-invoice-checkout", {
        body: { invoiceId: invoice.id },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error: any) {
      toast({
        title: "Payment Error",
        description: error.message || "Failed to initiate payment",
        variant: "destructive",
      });
      setProcessing(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!invoice?.pdf_path) return;
    
    const supabaseUrl = 'https://lmkpmnndrygjatnipfgd.supabase.co';
    const pdfUrl = `${supabaseUrl}/storage/v1/object/public/invoices/${invoice.pdf_path}`;
    
    // Open PDF in new tab for viewing/downloading
    window.open(pdfUrl, '_blank');
  };

  const formatCurrency = (cents: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!invoiceId || !token || !invoice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Invalid Payment Link</CardTitle>
            <CardDescription>
              The payment link is invalid or expired. Please contact the invoice sender for a new payment link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (invoice.status === "paid") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-green-600">Already Paid</CardTitle>
            <CardDescription>
              This invoice has already been paid. Thank you!
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Invoice Payment</h1>
          <p className="text-muted-foreground">
            Please review your invoice details below and proceed with payment
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice #{invoice.invoice_number || invoice.id.slice(0, 8)}
            </CardTitle>
            <CardDescription>
              From {invoice.company_name}
              {invoice.issue_date && ` • Issued ${formatDate(invoice.issue_date)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Bill To:</p>
                <p className="font-medium">{invoice.customer_name}</p>
                {invoice.customer_email && (
                  <p className="text-sm text-muted-foreground">{invoice.customer_email}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-muted-foreground">Amount Due:</p>
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(invoice.total_cents, invoice.currency)}
                </p>
              </div>
            </div>

            {invoice.due_date && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  <strong>Due Date:</strong> {formatDate(invoice.due_date)}
                </p>
              </div>
            )}

            {/* PDF Download Section */}
            {invoice.pdf_path && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Invoice Document</p>
                    <p className="text-sm text-muted-foreground">View or download the full invoice PDF</p>
                  </div>
                  <Button
                    onClick={handleDownloadPdf}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    View PDF
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment
            </CardTitle>
            <CardDescription>
              Click below to pay securely with Stripe
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handlePayment}
              disabled={processing}
              className="w-full"
              size="lg"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pay {formatCurrency(invoice.total_cents, invoice.currency)}
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground mt-4 text-center">
              Payments are processed securely by Stripe. Your payment information is never stored on our servers.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Payment;