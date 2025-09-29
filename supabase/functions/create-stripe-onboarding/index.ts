
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

  const url = new URL(req.url);
  const path = url.pathname;
  const isCallback = url.searchParams.has('code');

  console.log('Request path:', path);
  console.log('Full URL:', req.url);
  console.log('Search params:', url.searchParams.toString());
  console.log('Is callback:', isCallback);
  console.log('Has code param:', url.searchParams.has('code'));
  console.log('Environment check - STRIPE_CLIENT_ID exists:', !!Deno.env.get("STRIPE_CLIENT_ID"));

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Handle OAuth callback from Stripe
    if (isCallback) {
      console.log('Processing callback...');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state'); // Contains user_id
      
      if (!code || !state) {
        console.error('Missing code or state:', { code: !!code, state: !!state });
        return new Response(
          JSON.stringify({ error: 'Missing authorization code or state' }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      console.log('Exchanging code for token...');
      const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

      // Exchange authorization code for account access
      const response = await stripe.oauth.token({
        grant_type: 'authorization_code',
        code: code,
      });

      const accountId = response.stripe_user_id;
      const userId = state; // We passed user_id as state

      console.log('Updating profile for user:', userId, 'with account:', accountId);

      // Update user profile with Stripe account ID
      const { error: updateError } = await supabaseClient
        .from('profiles')
        .update({ 
          stripe_account_id: accountId,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Profile update error:', updateError);
        throw updateError;
      }

      console.log('Redirecting to success page...');
      // Redirect back to account page with success
      const origin = req.headers.get("origin") || Deno.env.get("FRONTEND_URL");
      const baseUrl = origin?.endsWith('/') ? origin.slice(0, -1) : origin;
      return Response.redirect(`${baseUrl}/account?stripe_connected=true`);
    }

    // Handle initial OAuth URL generation - only check auth for non-callback requests
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    // Check if user already has a Stripe account (we'll allow reconnection for updates)
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .single();

    // Generate Stripe Connect OAuth URL
    const clientId = Deno.env.get("STRIPE_CLIENT_ID");
    if (!clientId) throw new Error("STRIPE_CLIENT_ID is not set");

    const origin = req.headers.get("origin") || Deno.env.get("FRONTEND_URL");
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/create-stripe-onboarding`;
    
    const oauthUrl = `https://connect.stripe.com/oauth/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `scope=read_write&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${user.id}`;

    return new Response(
      JSON.stringify({ url: oauthUrl }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error creating Stripe onboarding:', error);
    return new Response(
      JSON.stringify({ error: (error as Error)?.message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
