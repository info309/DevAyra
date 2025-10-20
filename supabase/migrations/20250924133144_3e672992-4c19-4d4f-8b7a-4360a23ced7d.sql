-- Add type field to invoices table to support quotes
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'invoice';

-- Update any rows that might have invalid type values
UPDATE public.invoices 
SET type = 'invoice' 
WHERE type NOT IN ('quote', 'invoice');

-- Add constraint to ensure only valid types
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invoices_type_check' 
    AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices 
    ADD CONSTRAINT invoices_type_check CHECK (type IN ('quote', 'invoice'));
  END IF;
END $$;