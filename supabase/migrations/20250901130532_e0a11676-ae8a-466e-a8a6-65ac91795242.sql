
-- 1) Invoices table for one-off payments via Stripe, with PDF storage paths
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  invoice_number TEXT, -- optional, we can generate/display in UI
  -- Company details (stored on each invoice for immutability)
  company_name TEXT,
  company_email TEXT,
  company_address TEXT,
  company_logo_path TEXT, -- path in storage (invoices bucket)
  -- Client details
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_address TEXT,
  -- Dates
  issue_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date TIMESTAMPTZ,
  -- Money and currency
  currency TEXT NOT NULL DEFAULT 'usd',
  line_items JSONB NOT NULL DEFAULT '[]', -- [{ description, quantity, unit_price_cents, tax_rate_percent, amount_cents }]
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  -- Lifecycle & notes
  status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | paid | overdue | canceled
  notes TEXT,
  -- Artifacts & payments
  pdf_path TEXT, -- storage path in invoices bucket
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  paid_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security and policies (users manage only their own invoices)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own invoices"
  ON public.invoices
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Keep updated_at fresh
CREATE TRIGGER set_timestamp_invoices
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- 2) Public storage bucket for invoice PDFs (and optional logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;
