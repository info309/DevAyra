-- Allow public access to invoices for payment processing
CREATE POLICY "Allow public access to invoices for payment" 
ON public.invoices 
FOR SELECT 
USING (true);