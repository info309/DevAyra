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

    const { invoiceId } = await req.json();
    console.log('Invoice ID received:', invoiceId);
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

    // Prepare email content - simple version to avoid security filters
    const emailSubject = `Invoice from ${invoice.company_name || 'Your Company'}`;
    const emailContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invoice</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #2563eb; margin-bottom: 20px;">Thank you for your business!</h1>
          </div>
          
          <div style="font-size: 18px; line-height: 1.8; margin-bottom: 40px;">
            <p>Hi ${invoice.customer_name},</p>
            <p>Thanks for your business! Please click below to view your invoice.</p>
          </div>

          <div style="text-align: center; margin: 40px 0;">
            <a href="${paymentLink}" 
               style="
                 display: inline-block;
                 background-color: #2563eb;
                 color: #ffffff !important;
                 padding: 16px 32px;
                 text-decoration: none;
                 font-weight: bold;
                 font-size: 18px;
                 font-family: Arial, sans-serif;
                 border-radius: 8px;
                 border: none;
                 cursor: pointer;
                 text-align: center;
                 line-height: 1.4;
               ">
              📄 View Invoice
            </a>
          </div>
          
          <div style="text-align: center; margin-top: 40px; font-size: 14px; color: #666;">
            <p>If the button doesn't work, copy and paste this link:</p>
            <p><a href="${paymentLink}" style="color: #2563eb; word-break: break-all;">${paymentLink}</a></p>
          </div>

          <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #666; font-size: 14px;">
            ${invoice.company_name ? `<p>Best regards,<br>${invoice.company_name}</p>` : ''}
          </div>
        </body>
        </html>
    `;

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