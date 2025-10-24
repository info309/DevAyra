import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionData {
  plan_type: 'free' | 'pro';
  status: string;
  isPro: boolean;
  features: string[];
  current_period_end?: string;
  cancel_at_period_end?: boolean;
}

export const useSubscriptionQuery = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['subscription', userId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-subscription-status');

      if (error) {
        console.error('Error fetching subscription status:', error);
        throw error;
      }

      return data as SubscriptionData;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
    gcTime: 10 * 60 * 1000, // 10 minutes - cache time (previously cacheTime)
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    retry: 1,
  });
};
