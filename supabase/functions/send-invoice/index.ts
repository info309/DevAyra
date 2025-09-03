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
    console.log('Starting send-invoice function v1.1');

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    console.log('Getting user from auth header');
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    console.log('User authenticated:', user.email);

    const { invoiceId, customMessage } = await req.json();
    console.log('Invoice ID received:', invoiceId);
    console.log('Custom message provided:', !!customMessage);
    console.log('Invoice ID type:', typeof invoiceId);
    console.log('Invoice ID length:', invoiceId ? invoiceId.length : 'null');
    if (!invoiceId) throw new Error("Invoice ID is required");

    // Fetch invoice details
    console.log('Fetching invoice from database');
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .single();

    if (invoiceError) {
      console.error('Invoice fetch error:', invoiceError);
      throw invoiceError;
    }
    if (!invoice) throw new Error("Invoice not found");
    console.log('Invoice found:', invoice.id);

    // Check if user has Gmail connection
    console.log('Checking Gmail connection');
    const { data: gmailConnection, error: gmailError } = await supabaseClient
      .from('gmail_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (gmailError || !gmailConnection) {
      throw new Error("Gmail connection required to send invoices. Please connect your Gmail account first.");
    }
    console.log('Gmail connection found for:', gmailConnection.email_address);

    const formatCurrency = (cents: number, currency: string) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(cents / 100);
    };

    const formatDate = (date: string) => {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    // Get frontend URL from environment variable with detailed logging
    const frontendUrl = Deno.env.get("FRONTEND_URL");
    console.log('FRONTEND_URL from environment:', frontendUrl);
    if (!frontendUrl) {
      console.error('FRONTEND_URL is not configured in secrets');
      throw new Error("FRONTEND_URL is not configured. Please add it to your Supabase Edge Function secrets.");
    }
    
    // Create secure payment link with token (remove trailing slash to avoid double slash)
    const cleanFrontendUrl = frontendUrl.endsWith('/') ? frontendUrl.slice(0, -1) : frontendUrl;
    const paymentLink = `${cleanFrontendUrl}/payment?invoice=${invoiceId}&token=${invoice.payment_token}`;
    console.log('Payment link created:', paymentLink);
    console.log('Invoice ID:', invoiceId);
    console.log('Frontend URL used:', frontendUrl);

    // Prepare email content - HTML with custom message and embedded button
    const emailSubject = `Invoice from ${invoice.company_name || 'Your Company'}`;
    
    // Use custom message if provided, otherwise use default
    const messageContent = customMessage || `Hi ${invoice.customer_name},

Thank you for your business with ${invoice.company_name || 'our company'}!

Your invoice is ready for viewing and payment.`;

    const emailContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #2563eb; margin-bottom: 10px;">Invoice Ready</h1>
  </div>
  
  <div style="white-space: pre-line; margin: 20px 0;">${messageContent}</div>
  
  <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #2563eb;">
    <strong>Invoice Details:</strong><br>
    Invoice Number: ${invoice.invoice_number || invoice.id.slice(0,8)}<br>
    Amount Due: ${formatCurrency(invoice.total_cents, invoice.currency)}
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${paymentLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; font-size: 16px;">Pay Invoice</a>
  </div>
  
</body>
</html>`;

    console.log('Sending email via Gmail API');
    console.log('To:', invoice.customer_email);
    console.log('Subject:', emailSubject);

    // Call Gmail API to send email
    const gmailResponse = await supabaseClient.functions.invoke('gmail-api', {
      body: {
        action: 'sendEmail',
        to: invoice.customer_email,
        subject: emailSubject,
        content: emailContent
      },
      headers: {
        Authorization: authHeader
      }
    });

    if (gmailResponse.error) {
      console.error('Gmail API error:', gmailResponse.error);
      throw new Error(`Failed to send email via Gmail: ${gmailResponse.error.message}`);
    }

    console.log('Email sent successfully via Gmail');

    // Update invoice status
    const { error: updateError } = await supabaseClient
      .from('invoices')
      .update({ status: 'sent' })
      .eq('id', invoiceId)
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Invoice sent successfully" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error sending invoice:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});