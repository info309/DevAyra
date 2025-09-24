-- Add type field to invoices table to support quotes
ALTER TABLE public.invoices 
ADD COLUMN type text NOT NULL DEFAULT 'invoice';

-- Add constraint to ensure only valid types
ALTER TABLE public.invoices 
ADD CONSTRAINT invoices_type_check CHECK (type IN ('quote', 'invoice'));