import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle, Download, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Quote {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string;
  total_cents: number;
  currency: string;
  status: string;
  company_name: string;
  issue_date?: string;
  due_date?: string;
  pdf_path?: string;
  type?: string;
}

const Quote = () => {
  const [searchParams] = useSearchParams();
  const quoteId = searchParams.get("quote");
  const token = searchParams.get("token");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchQuote = async () => {
      if (!quoteId || !token) {
        console.log('No quote ID or token provided');
        setLoading(false);
        return;
      }

      console.log('Fetching quote with ID:', quoteId, 'and token:', token);

      try {
        // Use the secure function to get quote data with token verification
        const { data, error } = await supabase
          .rpc('get_invoice_for_payment', {
            invoice_id: quoteId,
            token: token
          });

        console.log('Supabase RPC response:', { data, error });

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
        
        if (!data || data.length === 0) {
          console.log('No quote data returned - invalid token or quote not found');
          setQuote(null);
        } else {
          console.log('Quote data found:', data[0]);
          setQuote(data[0]);
        }
      } catch (error: any) {
        console.error('Error fetching quote:', error);
        toast({
          title: "Error",
          description: `Failed to load quote details: ${error.message}`,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [quoteId, token, toast]);

  const handleRequestInvoice = async () => {
    if (!quote) return;

    setRequesting(true);
    try {
      // Convert the quote to an invoice
      const { error } = await supabase
        .from('invoices')
        .update({ 
          type: 'invoice',
          status: 'draft'
        })
        .eq('id', quote.id);

      if (error) throw error;
      
      // Wait a moment for the database to update, then regenerate PDF
      setTimeout(async () => {
        try {
          const { error: pdfError } = await supabase.functions.invoke('generate-invoice-pdf', {
            body: { invoiceId: quote.id }
          });
          if (pdfError) {
            console.error('PDF regeneration failed:', pdfError);
          } else {
            console.log('PDF regenerated for invoice');
            // Update local state to reflect the new PDF
            setQuote(prev => prev ? { ...prev, type: 'invoice', pdf_path: null } : null);
          }
        } catch (pdfError) {
          console.error('PDF regeneration error:', pdfError);
        }
      }, 1000);
      
      toast({
        title: "Success",
        description: "Your request has been sent! The quote has been converted to an invoice and the company will send you a payment link shortly.",
      });
      
      // Update the local state to show the converted status
      setQuote(prev => prev ? { ...prev, type: 'invoice' } : null);
      
    } catch (error: any) {
      console.error('Failed to request invoice:', error);
      toast({
        title: "Error",
        description: "Failed to process your request. Please try again or contact the company directly.",
        variant: "destructive"
      });
    } finally {
      setRequesting(false);
    }
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

  const handleGeneratePDF = async () => {
    if (!quote) return;

    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { invoiceId: quote.id }
      });

      if (error) throw error;

      if (data?.pdf_path) {
        // Update local state with PDF path
        setQuote(prev => prev ? { ...prev, pdf_path: data.pdf_path } : null);
        
        // Open the generated PDF in a new tab
        const pdfUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${data.pdf_path}`;
        window.open(pdfUrl, '_blank');
        
        toast({
          title: "Success",
          description: "PDF generated and opened successfully",
        });
      }
    } catch (error: any) {
      console.error('Failed to generate PDF:', error);
      toast({
        title: "Error", 
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleViewPDF = () => {
    if (!quote?.pdf_path) return;
    
    const pdfUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${quote.pdf_path}`;
    window.open(pdfUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!quoteId || !token || !quote) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Invalid Quote Link</CardTitle>
            <CardDescription>
              The quote link is invalid or expired. Please contact the sender for a new quote link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isConverted = quote.type === 'invoice';

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Quote Details</h1>
          <p className="text-muted-foreground">
            Please review your quote details below
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Quote #{quote.invoice_number || quote.id.slice(0, 8)}
              {quote.pdf_path && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full ml-auto">
                  PDF Available
                </span>
              )}
              {isConverted && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full ml-2">
                  Converted to Invoice
                </span>
              )}
            </CardTitle>
            <CardDescription>
              From {quote.company_name}
              {quote.issue_date && ` • Issued ${formatDate(quote.issue_date)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Quote For:</p>
                <p className="font-medium">{quote.customer_name}</p>
                {quote.customer_email && (
                  <p className="text-sm text-muted-foreground">{quote.customer_email}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-muted-foreground">Amount Quoted:</p>
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(quote.total_cents, quote.currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PDF Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Quote Document
            </CardTitle>
            <CardDescription>
              View or download the PDF version of this quote
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {quote.pdf_path ? (
                <>
                  <Button 
                    variant="outline" 
                    onClick={handleViewPDF}
                    className="flex-1"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View PDF
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleViewPDF}
                    className="flex-1"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>
                </>
              ) : (
                <Button 
                  onClick={handleGeneratePDF}
                  disabled={generatingPdf}
                  className="w-full"
                  variant="outline"
                >
                  {generatingPdf ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Generate PDF
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quote Action Section */}
        {isConverted ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                Quote Converted to Invoice
              </CardTitle>
              <CardDescription>
                Great! Your quote has been converted to an invoice. The company will send you a payment link shortly.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">
                You'll receive an email with payment instructions once the invoice is ready. Thank you for choosing to proceed with this quote!
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-center text-blue-600">Ready to Proceed?</CardTitle>
              <CardDescription className="text-center">
                If you're happy with this quote and would like to proceed with the project, click the button below.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <Button 
                onClick={handleRequestInvoice}
                disabled={requesting}
                className="w-full"
                size="lg"
              >
                {requesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    Request Invoice & Proceed
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                This will convert your quote to an invoice and notify the company. They'll send you payment instructions shortly.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Quote;