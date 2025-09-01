
import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface StripeStatus {
  connected: boolean;
  charges_enabled: boolean;
}

const InvoicePaymentBanner: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stripeStatus, setStripeStatus] = useState<StripeStatus>({
    connected: false,
    charges_enabled: false
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      checkStripeStatus();
    }
  }, [user]);

  const checkStripeStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-stripe-status');
      
      if (error) throw error;
      
      setStripeStatus({
        connected: data.connected,
        charges_enabled: data.charges_enabled
      });
    } catch (error) {
      console.error('Error checking Stripe status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || (stripeStatus.connected && stripeStatus.charges_enabled)) {
    return null;
  }

  return (
    <Alert className="mb-6 border-yellow-200 bg-yellow-50">
      <AlertCircle className="h-4 w-4 text-yellow-600" />
      <AlertDescription className="flex items-center justify-between">
        <div className="text-yellow-800">
          {!stripeStatus.connected ? (
            <span>
              <strong>Payment setup required:</strong> Connect your Stripe account to accept payments for your invoices.
            </span>
          ) : (
            <span>
              <strong>Account setup incomplete:</strong> Complete your Stripe account setup to start accepting payments.
            </span>
          )}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => navigate('/account')}
          className="ml-4 gap-2 text-yellow-700 border-yellow-300 hover:bg-yellow-100"
        >
          <ExternalLink className="w-4 h-4" />
          Setup Payments
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default InvoicePaymentBanner;
