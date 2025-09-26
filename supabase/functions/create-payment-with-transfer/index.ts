import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentRequest {
  amount_cents: number; // Amount to charge the client in cents
  currency?: string; // Default: 'usd'
  connected_account_id: string; // Stripe account ID of the user who will receive funds
  application_fee_cents?: number; // Optional platform fee in cents
  client_email: string; // Client's email address
  description?: string; // Payment description
  metadata?: Record<string, string>; // Optional metadata
}

/**
 * Serverless function to create a PaymentIntent that charges a client
 * and transfers funds directly to a connected Stripe account.
 * 
 * This allows your platform users to receive payments directly while
 * optionally taking a platform fee.
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
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

    // Authenticate the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header required");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    // Parse request body
    const body: PaymentRequest = await req.json();
    const {
      amount_cents,
      currency = 'usd',
      connected_account_id,
      application_fee_cents,
      client_email,
      description = 'Payment via your platform',
      metadata = {}
    } = body;

    // Validate required fields
    if (!amount_cents || amount_cents <= 0) {
      throw new Error("Valid amount_cents is required");
    }
    if (!connected_account_id) {
      throw new Error("connected_account_id is required");
    }
    if (!client_email) {
      throw new Error("client_email is required");
    }

    // Verify the connected account belongs to the authenticated user
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.stripe_account_id || profile.stripe_account_id !== connected_account_id) {
      throw new Error("Invalid connected account ID");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Create PaymentIntent with transfer to connected account
    const paymentIntentData: any = {
      amount: amount_cents,
      currency: currency,
      description: description,
      receipt_email: client_email,
      metadata: {
        ...metadata,
        platform_user_id: user.id,
        connected_account_id: connected_account_id,
      },
      // This is key: transfer_data sends funds directly to the connected account
      transfer_data: {
        destination: connected_account_id,
      },
    };

    // Add application fee if specified
    if (application_fee_cents && application_fee_cents > 0) {
      paymentIntentData.application_fee_amount = application_fee_cents;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    console.log(`Created PaymentIntent ${paymentIntent.id} for ${amount_cents} cents to account ${connected_account_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        payment_intent: {
          id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
          transfer_destination: connected_account_id,
          application_fee: application_fee_cents || 0,
        },
        message: "Payment created successfully. Funds will be transferred directly to the connected account.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error creating payment with transfer:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: (error as Error)?.message || 'Unknown error' 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});