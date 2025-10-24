import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import ayraIcon from '@/assets/ayra-icon.png';

const SubscriptionUpgrade = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isPro, loading: subscriptionLoading } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [priceId, setPriceId] = useState<string>('');

  useEffect(() => {
    // Fetch the price ID from subscription_plans
    const fetchPriceId = async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('stripe_price_id')
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching price:', error);
      } else if (data) {
        setPriceId(data.stripe_price_id);
      }
    };

    fetchPriceId();
  }, []);

  const handleUpgrade = async () => {
    if (!priceId || priceId === 'price_placeholder') {
      toast({
        title: "Configuration Required",
        description: "Please configure your Stripe price ID in the database first.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { priceId },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: "Error",
        description: "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (subscriptionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isPro) {
    navigate('/dashboard');
    return null;
  }

  const proFeatures = [
    'Generate professional invoices and quotes',
    'Track finances and upload receipts',
    'Store and organize unlimited documents',
    'Advanced email cleanup and organization',
    'Schedule online meetings with clients',
    'All personal tools included',
    'Priority email support',
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-heading font-bold">Ayra</h1>
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
            <img src={ayraIcon} alt="Ayra" className="w-16 h-16" />
          </div>
          <h2 className="text-4xl font-heading mb-4">
            Upgrade to Ayra Pro
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Unlock all professional tools to supercharge your productivity and business management
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Free Plan */}
          <Card>
            <CardHeader>
              <CardTitle>Personal</CardTitle>
              <CardDescription>Perfect for personal use</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-heading">Free</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>AI Assistant</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Gmail Integration</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Contacts Management</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Calendar & Events</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Notes</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Pro Plan */}
          <Card className="border-primary shadow-lg relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold">
                Recommended
              </span>
            </div>
            <CardHeader>
              <CardTitle>Ayra Pro</CardTitle>
              <CardDescription>For professionals and businesses</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-heading">£18</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-3">
                {proFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleUpgrade}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Upgrade to Pro'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="bg-muted/50 p-6 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            Cancel anytime. No hidden fees. All prices in GBP.
          </p>
        </div>
      </main>
    </div>
  );
};

export default SubscriptionUpgrade;
