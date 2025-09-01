-- Remove the overly broad public policy
DROP POLICY IF EXISTS "Allow public access to invoices for payment" ON public.invoices;

-- Create a more secure policy for payment access
CREATE POLICY "Allow payment access to invoices" 
ON public.invoices 
FOR SELECT 
USING (status IN ('sent', 'paid'));