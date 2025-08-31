
-- 1) Track last successful email sync
ALTER TABLE public.gmail_connections
ADD COLUMN IF NOT EXISTS last_email_sync_at timestamptz;

-- 2) Ensure upserts on cached_emails are deterministic (no duplicates)
-- This index supports ON CONFLICT (user_id, gmail_message_id)
CREATE UNIQUE INDEX IF NOT EXISTS cached_emails_user_msg_unique
ON public.cached_emails (user_id, gmail_message_id);
