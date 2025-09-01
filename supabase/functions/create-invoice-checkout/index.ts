
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

    const { invoiceId } = await req.json();
    if (!invoiceId) throw new Error("Invoice ID is required");

    // Fetch invoice details
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invoiceError) throw invoiceError;
    if (!invoice) throw new Error("Invoice not found");

    // Get the user's Stripe account ID
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('stripe_account_id, stripe_charges_enabled')
      .eq('user_id', invoice.user_id)
      .single();

    if (profileError) throw profileError;
    if (!profile?.stripe_account_id) {
      throw new Error("User must connect their Stripe account first");
    }
    if (!profile.stripe_charges_enabled) {
      throw new Error("User's Stripe account is not yet enabled for charges");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Check if customer exists on the connected account
    const customers = await stripe.customers.list({ 
      email: invoice.customer_email, 
      limit: 1 
    }, {
      stripeAccount: profile.stripe_account_id
    });
    
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Get frontend URL from environment variable
    const frontendUrl = Deno.env.get("FRONTEND_URL");
    if (!frontendUrl) {
      throw new Error("FRONTEND_URL is not configured");
    }

    // Create checkout session on the connected account
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : invoice.customer_email,
      line_items: [
        {
          price_data: {
            currency: invoice.currency,
            product_data: { 
              name: `Invoice #${invoice.invoice_number || invoice.id.slice(0, 8)}`,
              description: `From ${invoice.company_name || 'Company'}`,
            },
            unit_amount: invoice.total_cents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${frontendUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payment-cancel`,
      metadata: {
        invoice_id: invoiceId,
        user_id: invoice.user_id,
      },
    }, {
      stripeAccount: profile.stripe_account_id
    });

    // Update invoice with Stripe session ID
    const { error: updateError } = await supabaseClient
      .from('invoices')
      .update({ 
        stripe_session_id: session.id,
        status: 'sent'
      })
      .eq('id', invoiceId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
