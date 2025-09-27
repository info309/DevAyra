import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DollarSign, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Example component showing how to create a payment that transfers funds
 * directly to a connected Stripe account with optional platform fee.
 * 
 * In a real app, you'd typically collect payment details from a form
 * and process the payment with Stripe Elements on the client side.
 */
export const PaymentExample: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    clientEmail: '',
    description: 'Payment for services',
    platformFee: '',
  });
  const { toast } = useToast();

  const handleCreatePayment = async () => {
    setLoading(true);
    
    try {
      // Get current user session
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error("Please log in first");
      }

      // Get user's Stripe account ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_account_id')
        .eq('user_id', session.data.session.user.id)
        .single();

      if (!profile?.stripe_account_id) {
        throw new Error("Please connect your Stripe account first");
      }

      // Calculate amounts in cents
      const amountCents = Math.round(parseFloat(paymentData.amount) * 100);
      const platformFeeCents = paymentData.platformFee 
        ? Math.round(parseFloat(paymentData.platformFee) * 100)
        : undefined;

      // Call our payment creation function
      const { data, error } = await supabase.functions.invoke('create-payment-with-transfer', {
        body: {
          amount_cents: amountCents,
          currency: 'usd',
          connected_account_id: profile.stripe_account_id,
          application_fee_cents: platformFeeCents,
          client_email: paymentData.clientEmail,
          description: paymentData.description,
          metadata: {
            created_via: 'payment_example_component',
          },
        },
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Payment Created!",
          description: `Payment Intent ${data.payment_intent.id} created successfully. Client secret: ${data.payment_intent.client_secret}`,
        });
        
        console.log('Payment Intent created:', data.payment_intent);
        // In a real app, you'd use this client_secret with Stripe Elements to collect payment
      }
    } catch (error: any) {
      console.error('Error creating payment:', error);
      toast({
        title: "Payment Creation Failed",
        description: error?.message || "Failed to create payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Create Payment with Transfer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="amount">Amount (USD)</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            placeholder="99.99"
            value={paymentData.amount}
            onChange={(e) => setPaymentData(prev => ({ ...prev, amount: e.target.value }))}
          />
        </div>
        
        <div>
          <Label htmlFor="clientEmail">Client Email</Label>
          <Input
            id="clientEmail"
            type="email"
            placeholder="client@example.com"
            value={paymentData.clientEmail}
            onChange={(e) => setPaymentData(prev => ({ ...prev, clientEmail: e.target.value }))}
          />
        </div>
        
        <div>
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            placeholder="Payment for services"
            value={paymentData.description}
            onChange={(e) => setPaymentData(prev => ({ ...prev, description: e.target.value }))}
          />
        </div>
        
        <div>
          <Label htmlFor="platformFee">Platform Fee (USD) - Optional</Label>
          <Input
            id="platformFee"
            type="number"
            step="0.01"
            placeholder="2.99"
            value={paymentData.platformFee}
            onChange={(e) => setPaymentData(prev => ({ ...prev, platformFee: e.target.value }))}
          />
        </div>
        
        <Button 
          onClick={handleCreatePayment} 
          disabled={loading || !paymentData.amount || !paymentData.clientEmail}
          className="w-full gap-2"
        >
          {loading ? (
            "Creating Payment..."
          ) : (
            <>
              <Send className="w-4 h-4" />
              Create Payment Intent
            </>
          )}
        </Button>
        
        <p className="text-xs text-muted-foreground">
          This creates a PaymentIntent that transfers funds directly to your connected Stripe account.
          In a real app, use the returned client_secret with Stripe Elements to collect payment from your client.
        </p>
      </CardContent>
    </Card>
  );
};