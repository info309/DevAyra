import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StripeConnectButtonProps {
  onSuccess?: () => void;
  className?: string;
}

/**
 * Simple button component that redirects users to Stripe OAuth to connect their existing Stripe account
 * or create a new Standard account if they don't have one.
 */
export const StripeConnectButton: React.FC<StripeConnectButtonProps> = ({ 
  onSuccess, 
  className 
}) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleConnectStripe = async () => {
    setLoading(true);
    
    try {
      // Get current user session for authentication
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error("Please log in to connect your Stripe account");
      }

      // Call our serverless function to generate Stripe OAuth URL
      const { data, error } = await supabase.functions.invoke('create-stripe-onboarding', {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        // Redirect to Stripe OAuth in the same window
        // Stripe will redirect back to our callback URL after user connects their account
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error('Error creating Stripe OAuth URL:', error);
      toast({
        title: "Connection Error",
        description: error?.message || "Failed to connect to Stripe. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleConnectStripe} 
      disabled={loading}
      className={`gap-2 ${className || ''}`}
    >
      {loading ? (
        "Redirecting to Stripe..."
      ) : (
        <>
          <CreditCard className="w-4 h-4" />
          Connect your Stripe account
          <ExternalLink className="w-4 h-4" />
        </>
      )}
    </Button>
  );
};