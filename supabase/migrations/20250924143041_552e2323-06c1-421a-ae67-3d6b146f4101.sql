-- Allow viewing draft invoices/quotes so users can preview before sending
CREATE OR REPLACE FUNCTION public.get_invoice_for_payment(invoice_id uuid, token text)
 RETURNS TABLE(id uuid, invoice_number text, company_name text, customer_name text, customer_email text, total_cents integer, currency text, status text, pdf_path text, issue_date timestamp with time zone, due_date timestamp with time zone, type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Return invoice data including PDF path and type when token matches
  -- Now allows draft, sent, and paid status so users can preview before sending
  RETURN QUERY
  SELECT 
    i.id,
    i.invoice_number,
    i.company_name,
    i.customer_name,
    i.customer_email,
    i.total_cents,
    i.currency,
    i.status,
    i.pdf_path,
    i.issue_date,
    i.due_date,
    i.type
  FROM public.invoices i
  WHERE i.id = invoice_id 
    AND i.payment_token = token
    AND i.status IN ('draft', 'sent', 'paid');
END;
$function$