
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { sessionId } = await req.json();
    if (!sessionId) throw new Error("Session ID is required");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // First, get the invoice to find the user's connected account
    const invoiceIdFromMetadata = sessionId; // This might need adjustment based on how you pass the data
    
    // Get invoice first
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from('invoices')
      .select('*')
      .eq('stripe_session_id', sessionId)
      .single();

    if (invoiceError) throw invoiceError;
    if (!invoice) throw new Error("Invoice not found");

    // Get user's stripe account using the invoice's user_id
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('stripe_account_id')
      .eq('user_id', invoice.user_id)
      .single();

    if (profileError) throw profileError;
    if (!profile?.stripe_account_id) throw new Error("User's Stripe account not found");

    const stripeAccountId = profile.stripe_account_id;

    // Retrieve checkout session from the connected account
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      stripeAccount: stripeAccountId
    });

    if (!session) throw new Error("Session not found");

    // Check if payment was successful
    if (session.payment_status === 'paid') {
      // Update invoice status
      const { error: updateError } = await supabaseClient
        .from('invoices')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: session.payment_intent as string,
        })
        .eq('id', invoice.id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          success: true,
          paid: true,
          invoice: {
            ...invoice,
            status: 'paid',
            paid_at: new Date().toISOString(),
          }
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: true,
          paid: false,
          invoice,
          payment_status: session.payment_status
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

  } catch (error) {
    console.error('Error verifying payment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
