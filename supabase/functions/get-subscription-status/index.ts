import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error(`Authentication error: ${userError?.message || 'User not found'}`);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_type, status, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .single();

    if (subError) {
      console.error('Error fetching subscription:', subError);
      // Return free plan if no subscription found
      return new Response(
        JSON.stringify({ 
          plan_type: 'free',
          status: 'active',
          isPro: false,
          features: []
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Check if subscription is active and Pro
    const isPro = subscription.plan_type === 'pro' && 
                  (subscription.status === 'active' || subscription.status === 'trialing');

    // Get Pro features
    const proFeatures = isPro ? ['invoices', 'finances', 'documents', 'email-cleanup', 'meetings'] : [];

    return new Response(
      JSON.stringify({
        plan_type: subscription.plan_type,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        isPro,
        features: proFeatures
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error getting subscription status:', error);
    return new Response(
      JSON.stringify({ error: (error as Error)?.message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
