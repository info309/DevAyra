-- Fix security vulnerability: Remove overly permissive RLS policy that exposes full invoice data
-- This policy currently allows anyone with a payment token to see all invoice fields
-- We'll remove it and rely on the secure get_invoice_for_payment function instead

DROP POLICY IF EXISTS "Allow secure payment access to invoices" ON public.invoices;

-- Create a more restrictive policy that only allows authenticated users to see their own invoices
-- Payment processing will use the secure get_invoice_for_payment function instead
DROP POLICY IF EXISTS "Users can only view their own invoices" ON public.invoices;
CREATE POLICY "Users can only view their own invoices" 
ON public.invoices 
FOR SELECT 
USING (auth.uid() = user_id);

-- Keep the existing policy for all operations for authenticated users
-- This ensures users can still manage their own invoices
-- The existing "Users can manage their own invoices" policy already handles INSERT, UPDATE, DELETE