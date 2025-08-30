-- Create a table to cache emails locally for faster assistant searches
CREATE TABLE public.cached_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  content TEXT,
  snippet TEXT,
  date_sent TIMESTAMP WITH TIME ZONE NOT NULL,
  is_unread BOOLEAN DEFAULT false,
  has_attachments BOOLEAN DEFAULT false,
  attachment_info JSONB,
  labels TEXT[],
  email_type TEXT DEFAULT 'inbox', -- 'inbox', 'sent', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, gmail_message_id)
);

-- Enable RLS
ALTER TABLE public.cached_emails ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own cached emails"
ON public.cached_emails
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create indexes for fast searching
CREATE INDEX idx_cached_emails_user_date ON public.cached_emails(user_id, date_sent DESC);
CREATE INDEX idx_cached_emails_user_sender ON public.cached_emails(user_id, sender_email, sender_name);
CREATE INDEX idx_cached_emails_user_subject ON public.cached_emails(user_id, subject);
CREATE INDEX idx_cached_emails_user_content ON public.cached_emails USING gin(to_tsvector('english', content));
CREATE INDEX idx_cached_emails_user_search ON public.cached_emails USING gin(to_tsvector('english', subject || ' ' || sender_name || ' ' || content));

-- Create trigger for updated_at
CREATE TRIGGER update_cached_emails_updated_at
BEFORE UPDATE ON public.cached_emails
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();