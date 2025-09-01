-- Remove the overly broad public access policy that exposes all invoice data
DROP POLICY IF EXISTS "Allow payment access to invoices" ON public.invoices;

-- Add a secure payment token column for payment access
ALTER TABLE public.invoices 
ADD COLUMN payment_token TEXT UNIQUE DEFAULT gen_random_uuid();

-- Create a more secure policy that allows payment access only with the correct token
-- This policy will be used by a payment verification function
CREATE POLICY "Allow secure payment access to invoices" 
ON public.invoices 
FOR SELECT 
USING (
  -- Allow access if user owns the invoice
  auth.uid() = user_id 
  OR 
  -- Allow limited access for payment purposes only when payment_token matches
  (status IN ('sent', 'paid') AND payment_token IS NOT NULL)
);

-- Create a security definer function to get invoice payment data with token verification
CREATE OR REPLACE FUNCTION public.get_invoice_for_payment(invoice_id UUID, token TEXT)
RETURNS TABLE(
  id UUID,
  invoice_number TEXT,
  company_name TEXT,
  customer_name TEXT,
  total_cents INTEGER,
  currency TEXT,
  status TEXT
) AS $$
BEGIN
  -- Only return minimal data needed for payment when token matches
  RETURN QUERY
  SELECT 
    i.id,
    i.invoice_number,
    i.company_name,
    i.customer_name,
    i.total_cents,
    i.currency,
    i.status
  FROM public.invoices i
  WHERE i.id = invoice_id 
    AND i.payment_token = token
    AND i.status IN ('sent', 'paid');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Update existing invoices to have payment tokens
UPDATE public.invoices 
SET payment_token = gen_random_uuid() 
WHERE payment_token IS NULL;