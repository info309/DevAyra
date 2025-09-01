import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invoiceDetails, setInvoiceDetails] = useState<any>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      verifyPayment(sessionId);
    } else {
      setLoading(false);
    }
  }, [searchParams]);

  const verifyPayment = async (sessionId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('verify-invoice-payment', {
        body: { sessionId }
      });
      
      if (error) throw error;
      
      if (data?.invoice) {
        setInvoiceDetails(data.invoice);
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div>Processing payment verification...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-green-600">Payment Successful!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {invoiceDetails ? (
            <>
              <div className="space-y-2">
                <p className="font-semibold">
                  Invoice #{invoiceDetails.invoice_number || invoiceDetails.id.slice(0, 8)}
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(invoiceDetails.total_cents, invoiceDetails.currency)}
                </p>
                <p className="text-muted-foreground">
                  Payment has been processed successfully
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>From: {invoiceDetails.company_name || 'Company'}</p>
                <p>Invoice Date: {new Date(invoiceDetails.issue_date).toLocaleDateString()}</p>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Your payment has been processed successfully. You will receive a confirmation email shortly.
            </p>
          )}
          
          <div className="pt-4">
            <Button onClick={() => navigate('/')} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccess;