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
    console.log('Starting send-invoice function');

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
    
    // Create payment link using the configured frontend URL (no HTML escaping needed here)
    const paymentLink = `${frontendUrl}/payment?invoice=${invoiceId}`;
    console.log('Payment link created:', paymentLink);
    console.log('Invoice ID:', invoiceId);
    console.log('Frontend URL used:', frontendUrl);

    // Prepare email content
    const emailSubject = `Invoice #${invoice.invoice_number || invoice.id.slice(0, 8)} from ${invoice.company_name || 'Your Company'}`;
    const emailContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invoice</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #2563eb;">Invoice from ${invoice.company_name || 'Your Company'}</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h2 style="margin-top: 0;">Invoice Details</h2>
            <p><strong>Invoice #:</strong> ${invoice.invoice_number || invoice.id.slice(0, 8)}</p>
            <p><strong>Issue Date:</strong> ${formatDate(invoice.issue_date)}</p>
            ${invoice.due_date ? `<p><strong>Due Date:</strong> ${formatDate(invoice.due_date)}</p>` : ''}
            <p><strong>Amount:</strong> <span style="font-size: 24px; font-weight: bold; color: #2563eb;">${formatCurrency(invoice.total_cents, invoice.currency)}</span></p>
          </div>

          <div style="margin-bottom: 30px;">
            <h3>Bill To:</h3>
            <p><strong>${invoice.customer_name}</strong><br>
            ${invoice.customer_email}<br>
            ${invoice.customer_address ? invoice.customer_address.replace(/\n/g, '<br>') : ''}</p>
          </div>

          <div style="margin-bottom: 30px;">
            <h3>Items:</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f8f9fa;">
                  <th style="padding: 12px; text-align: left; border: 1px solid #dee2e6;">Description</th>
                  <th style="padding: 12px; text-align: center; border: 1px solid #dee2e6;">Qty</th>
                  <th style="padding: 12px; text-align: right; border: 1px solid #dee2e6;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.line_items.map((item: any) => `
                  <tr>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">${item.description}</td>
                    <td style="padding: 12px; text-align: center; border: 1px solid #dee2e6;">${item.quantity}</td>
                    <td style="padding: 12px; text-align: right; border: 1px solid #dee2e6;">${formatCurrency(item.amount_cents, invoice.currency)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div style="text-align: right; margin-top: 20px; padding-top: 20px; border-top: 2px solid #dee2e6;">
              <p><strong>Subtotal:</strong> ${formatCurrency(invoice.subtotal_cents, invoice.currency)}</p>
              <p><strong>Tax:</strong> ${formatCurrency(invoice.tax_cents, invoice.currency)}</p>
              <p style="font-size: 18px;"><strong>Total:</strong> ${formatCurrency(invoice.total_cents, invoice.currency)}</p>
            </div>
          </div>

          ${invoice.notes ? `
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
              <h4 style="margin-top: 0;">Notes:</h4>
              <p style="margin-bottom: 0;">${invoice.notes.replace(/\n/g, '<br>')}</p>
            </div>
          ` : ''}

          <div style="text-align: center; margin: 40px 0;">
            <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
              <tr>
                <td style="background-color: #2563eb; border-radius: 8px;">
                  <a href="${paymentLink}" style="display: inline-block; color: #ffffff !important; padding: 15px 30px; text-decoration: none; font-weight: bold; font-size: 16px; font-family: Arial, sans-serif;">Pay Invoice Online</a>
                </td>
              </tr>
            </table>
            <p style="margin-top: 15px; font-size: 14px; color: #666;">
              Payment Link:<br>
              <span style="color: #2563eb; word-break: break-all; font-family: monospace;">${paymentLink}</span>
            </p>
          </div>

          <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #666; font-size: 14px;">
            <p>Thank you for your business!</p>
            ${invoice.company_name ? `<p>${invoice.company_name}</p>` : ''}
            ${invoice.company_email ? `<p>${invoice.company_email}</p>` : ''}
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
      .eq('id', invoiceId);

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