-- Drop the existing check constraint
ALTER TABLE public.invoices DROP CONSTRAINT invoices_type_check;

-- Add the updated check constraint that includes 'receipt'
ALTER TABLE public.invoices ADD CONSTRAINT invoices_type_check 
CHECK (type = ANY (ARRAY['quote'::text, 'invoice'::text, 'receipt'::text]));