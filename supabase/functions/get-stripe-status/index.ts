
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
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
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the user from the JWT token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error(`Authentication error: ${userError?.message || 'User not found'}`);
    }

    // Now use service role for database operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get user profile with Stripe account ID using service role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id, stripe_charges_enabled, stripe_details_submitted, stripe_payouts_enabled')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      throw new Error(`Profile query error: ${profileError.message}`);
    }

    if (!profile?.stripe_account_id) {
      return new Response(
        JSON.stringify({ 
          connected: false,
          charges_enabled: false,
          details_submitted: false,
          payouts_enabled: false
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Get current account status from Stripe
    const account = await stripe.accounts.retrieve(profile.stripe_account_id);

    const updatedStatus = {
      stripe_charges_enabled: account.charges_enabled,
      stripe_details_submitted: account.details_submitted,
      stripe_payouts_enabled: account.payouts_enabled,
    };

    // Update profile with latest status using service role
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updatedStatus)
      .eq('user_id', user.id);

    if (updateError) console.error('Error updating profile:', updateError);

    return new Response(
      JSON.stringify({
        connected: true,
        charges_enabled: account.charges_enabled,
        details_submitted: account.details_submitted,
        payouts_enabled: account.payouts_enabled,
        account_id: profile.stripe_account_id
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error getting Stripe status:', error);
    return new Response(
      JSON.stringify({ error: (error as Error)?.message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
