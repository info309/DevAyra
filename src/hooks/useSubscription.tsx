import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SubscriptionStatus {
  plan_type: 'free' | 'pro';
  status: string;
  isPro: boolean;
  features: string[];
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  loading: boolean;
}

export const useSubscription = () => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionStatus>({
    plan_type: 'free',
    status: 'active',
    isPro: false,
    features: [],
    loading: true,
  });

  useEffect(() => {
    if (!user) {
      setSubscription({
        plan_type: 'free',
        status: 'active',
        isPro: false,
        features: [],
        loading: false,
      });
      return;
    }

    const fetchSubscriptionStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-subscription-status');

        if (error) {
          console.error('Error fetching subscription status:', error);
          setSubscription((prev) => ({ ...prev, loading: false }));
          return;
        }

        setSubscription({
          ...data,
          loading: false,
        });
      } catch (error) {
        console.error('Error:', error);
        setSubscription((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchSubscriptionStatus();
  }, [user]);

  const canAccessFeature = (featureName: string): boolean => {
    if (subscription.plan_type === 'free') {
      // Free features
      const freeFeatures = ['assistant', 'mailbox', 'contacts', 'calendar', 'notes', 'account'];
      return freeFeatures.includes(featureName);
    }
    return true; // Pro users can access everything
  };

  const upgradeUrl = '/subscription/upgrade';

  return {
    ...subscription,
    canAccessFeature,
    upgradeUrl,
  };
};
