-- First let's check if we need to modify the invoices table to better support receipts
-- Looking at the current structure, receipts are already stored in the invoices table with type='receipt'
-- We should ensure the pdf_path column can store the document path for receipts
-- The current structure should work, but let's make sure we have proper indexing

-- Add index for better performance when filtering by type
CREATE INDEX IF NOT EXISTS idx_invoices_type_user_id ON public.invoices(user_id, type);

-- Add index for created_at for better sorting performance  
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at DESC);