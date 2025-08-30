-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a simple cron job that calls the cache-emails function every 30 seconds
SELECT cron.schedule(
  'auto-cache-emails',
  '*/30 * * * * *', -- every 30 seconds
  $$
  SELECT net.http_post(
    url := 'https://lmkpmnndrygjatnipfgd.supabase.co/functions/v1/auto-cache-emails',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxta3Btbm5kcnlnamF0bmlwZmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzc3MTQsImV4cCI6MjA3MTk1MzcxNH0.lUFp3O--gVkDEyjcUgNXJY1JB8gQEgLzr8Rqqm8QZQA"}'::jsonb
  ) as request_id;
  $$
);