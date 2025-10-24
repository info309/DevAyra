import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionQuery } from './useSubscriptionQuery';

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
  const { data, isLoading, error } = useSubscriptionQuery(user?.id);

  // Default free subscription for non-authenticated users
  const defaultSubscription: SubscriptionStatus = {
    plan_type: 'free',
    status: 'active',
    isPro: false,
    features: [],
    loading: false,
  };

  const subscription: SubscriptionStatus = user
    ? {
        ...(data || {
          plan_type: 'free',
          status: 'active',
          isPro: false,
          features: [],
        }),
        loading: isLoading,
      }
    : defaultSubscription;

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
