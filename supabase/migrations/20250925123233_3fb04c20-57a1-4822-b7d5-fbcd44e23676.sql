-- Clear old test Stripe account data from profiles table
UPDATE public.profiles 
SET 
  stripe_account_id = NULL,
  stripe_payouts_enabled = false,
  stripe_details_submitted = false,
  stripe_charges_enabled = false,
  updated_at = now()
WHERE stripe_account_id IS NOT NULL;