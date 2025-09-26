
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StripeStatus {
  connected: boolean;
  charges_enabled: boolean;
  details_submitted: boolean;
  payouts_enabled: boolean;
  account_id?: string;
}

const StripeConnectionCard: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stripeStatus, setStripeStatus] = useState<StripeStatus>({
    connected: false,
    charges_enabled: false,
    details_submitted: false,
    payouts_enabled: false
  });
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (user) {
      checkStripeStatus();
    }
    
    // Check for success parameter when returning from Stripe OAuth
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('stripe_connected') === 'true') {
      toast({
        title: "Success!",
        description: "Your Stripe account has been connected successfully.",
      });
      // Remove the parameter from URL
      window.history.replaceState({}, '', window.location.pathname);
      // Refresh status after successful connection
      setTimeout(() => checkStripeStatus(), 1000);
    }
  }, [user]);

  const checkStripeStatus = async () => {
    try {
      setChecking(true);
      const { data, error } = await supabase.functions.invoke('get-stripe-status');
      
      if (error) throw error;
      
      setStripeStatus(data);
    } catch (error) {
      console.error('Error checking Stripe status:', error);
      toast({
        title: "Error",
        description: "Failed to check Stripe connection status.",
        variant: "destructive",
      });
    } finally {
      setChecking(false);
    }
  };

  const handleConnectStripe = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-onboarding', {
        headers: {
          Authorization: `Bearer ${await supabase.auth.getSession().then(s => s.data.session?.access_token)}`,
        },
      });

      if (error) throw error;
      
      if (data?.url) {
        // Redirect to Stripe OAuth page in the same window
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating Stripe OAuth URL:', error);
      toast({
        title: "Error",
        description: error.message === 'User already has a connected Stripe account' 
          ? "You already have a connected Stripe account."
          : "Failed to create Stripe connection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (enabled: boolean) => {
    return enabled ? "default" : "secondary";
  };

  const getStatusIcon = (enabled: boolean) => {
    return enabled ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />;
  };

  if (checking) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Stripe Payment Processing
          </CardTitle>
          <CardDescription>Checking connection status...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-20 bg-muted/50 rounded"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Stripe Payment Processing
        </CardTitle>
        <CardDescription>
          Login to your existing Stripe account or create a new one to accept payments for your invoices
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {!stripeStatus.connected ? (
            <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Connect your existing Stripe account or create a new one to start accepting payments.
                </div>
              <Button 
                onClick={handleConnectStripe} 
                disabled={loading}
                className="gap-2"
              >
                {loading ? (
                  "Redirecting to Stripe..."
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    Login to Stripe Account
                  </>
                )}
              </Button>
              <div className="text-xs text-muted-foreground">
                Don't have a Stripe account? You can create one during the login process.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="font-medium">Stripe account connected</span>
              </div>
              
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Account details submitted</span>
                  <Badge variant={getStatusColor(stripeStatus.details_submitted)} className="gap-1">
                    {getStatusIcon(stripeStatus.details_submitted)}
                    {stripeStatus.details_submitted ? 'Complete' : 'Pending'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Charges enabled</span>
                  <Badge variant={getStatusColor(stripeStatus.charges_enabled)} className="gap-1">
                    {getStatusIcon(stripeStatus.charges_enabled)}
                    {stripeStatus.charges_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Payouts enabled</span>
                  <Badge variant={getStatusColor(stripeStatus.payouts_enabled)} className="gap-1">
                    {getStatusIcon(stripeStatus.payouts_enabled)}
                    {stripeStatus.payouts_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </div>

              {!stripeStatus.charges_enabled && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="text-sm text-yellow-800">
                    <strong>Action required:</strong> Complete your account setup in Stripe to start accepting payments.
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={checkStripeStatus}
                  disabled={checking}
                >
                  Refresh Status
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleConnectStripe}
                  disabled={loading}
                >
                  Update Account
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StripeConnectionCard;
