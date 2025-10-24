-- Clear invalid Stripe customer ID to allow fresh checkout
UPDATE subscriptions 
SET stripe_customer_id = NULL 
WHERE user_id = '8a4f006f-ae19-4d48-8dd8-99860819334b' 
AND stripe_customer_id = 'cus_TIIAY4PfKxO66u';