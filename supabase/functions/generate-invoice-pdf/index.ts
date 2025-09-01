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
    // Use service role key to bypass RLS for invoice access
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { invoiceId } = await req.json();
    if (!invoiceId) throw new Error("Invoice ID is required");

    // Fetch invoice details
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .single();

    if (invoiceError) throw invoiceError;
    if (!invoice) throw new Error("Invoice not found");

    // Generate PDF content (simple HTML to PDF conversion)
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

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
        .company-info { flex: 1; }
        .invoice-info { text-align: right; }
        .invoice-title { font-size: 28px; font-weight: bold; color: #333; margin-bottom: 10px; }
        .invoice-number { font-size: 16px; color: #666; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #eee; padding-bottom: 5px; }
        .billing-info { display: flex; justify-content: space-between; }
        .billing-box { flex: 1; margin-right: 20px; }
        .billing-box:last-child { margin-right: 0; }
        .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        .table th { background-color: #f8f9fa; font-weight: bold; }
        .table .amount { text-align: right; }
        .totals { margin-top: 20px; text-align: right; }
        .totals .line { margin-bottom: 8px; }
        .totals .total { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; }
        .notes { margin-top: 40px; padding: 20px; background-color: #f8f9fa; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-info">
          <h1>${invoice.company_name || 'Your Company'}</h1>
          ${invoice.company_email ? `<p>Email: ${invoice.company_email}</p>` : ''}
          ${invoice.company_address ? `<div><pre>${invoice.company_address}</pre></div>` : ''}
        </div>
        <div class="invoice-info">
          <div class="invoice-title">INVOICE</div>
          <div class="invoice-number">#${invoice.invoice_number || invoice.id.slice(0, 8)}</div>
          <p>Date: ${formatDate(invoice.issue_date)}</p>
          ${invoice.due_date ? `<p>Due Date: ${formatDate(invoice.due_date)}</p>` : ''}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Bill To</div>
        <div class="billing-info">
          <div class="billing-box">
            <strong>${invoice.customer_name}</strong><br>
            ${invoice.customer_email}<br>
            ${invoice.customer_address ? `<pre>${invoice.customer_address}</pre>` : ''}
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Items</div>
        <table class="table">
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align: center;">Quantity</th>
              <th style="text-align: right;">Unit Price</th>
              <th style="text-align: right;">Tax Rate</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.line_items.map((item: any) => `
              <tr>
                <td>${item.description}</td>
                <td style="text-align: center;">${item.quantity}</td>
                <td class="amount">${formatCurrency(item.unit_price_cents, invoice.currency)}</td>
                <td class="amount">${item.tax_rate_percent}%</td>
                <td class="amount">${formatCurrency(item.amount_cents, invoice.currency)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="totals">
        <div class="line">Subtotal: ${formatCurrency(invoice.subtotal_cents, invoice.currency)}</div>
        <div class="line">Tax: ${formatCurrency(invoice.tax_cents, invoice.currency)}</div>
        <div class="total">Total: ${formatCurrency(invoice.total_cents, invoice.currency)}</div>
      </div>

      ${invoice.notes ? `
        <div class="notes">
          <div class="section-title">Notes</div>
          <pre>${invoice.notes}</pre>
        </div>
      ` : ''}

      <div style="margin-top: 60px; text-align: center; color: #666; font-size: 12px;">
        <p>Thank you for your business!</p>
      </div>
    </body>
    </html>
    `;

    // For now, we'll store the HTML content and simulate PDF generation
    // In a production environment, you would use a service like Puppeteer or similar
    const fileName = `invoice-${invoice.id.slice(0, 8)}-${Date.now()}.html`;
    const filePath = `invoices/${user.id}/${fileName}`;

    // Store the HTML file in storage
    const { error: uploadError } = await supabaseClient.storage
      .from('invoices')
      .upload(filePath, new Blob([htmlContent], { type: 'text/html' }), {
        contentType: 'text/html',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Update invoice with PDF path
    const { error: updateError } = await supabaseClient
      .from('invoices')
      .update({ pdf_path: filePath })
      .eq('id', invoiceId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdf_path: filePath,
        message: "PDF generated successfully" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error generating PDF:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});