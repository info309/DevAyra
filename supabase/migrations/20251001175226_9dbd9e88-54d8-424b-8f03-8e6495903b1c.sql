-- Create email_cleanup_analysis table to store analysis results
CREATE TABLE public.email_cleanup_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  sender_email TEXT NOT NULL,
  sender_domain TEXT NOT NULL,
  sender_name TEXT,
  email_count INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  has_unsubscribe_header BOOLEAN DEFAULT false,
  user_opened_count INTEGER NOT NULL DEFAULT 0,
  user_replied_count INTEGER NOT NULL DEFAULT 0,
  contains_important_keywords BOOLEAN DEFAULT false,
  important_keywords TEXT[],
  recommended_action TEXT NOT NULL DEFAULT 'review',
  first_email_date TIMESTAMP WITH TIME ZONE,
  last_email_date TIMESTAMP WITH TIME ZONE,
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_cleanup_analysis ENABLE ROW LEVEL SECURITY;

-- RLS policy for email_cleanup_analysis
CREATE POLICY "Users can manage their own cleanup analysis"
ON public.email_cleanup_analysis
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create cleanup_rules table for user-defined rules
CREATE TABLE public.cleanup_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  rule_name TEXT NOT NULL,
  sender_pattern TEXT,
  domain_pattern TEXT,
  action TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cleanup_rules ENABLE ROW LEVEL SECURITY;

-- RLS policy for cleanup_rules
CREATE POLICY "Users can manage their own cleanup rules"
ON public.cleanup_rules
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create cleanup_history table to track cleanup actions
CREATE TABLE public.cleanup_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  sender_email TEXT,
  sender_domain TEXT,
  emails_affected INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.cleanup_history ENABLE ROW LEVEL SECURITY;

-- RLS policy for cleanup_history
CREATE POLICY "Users can manage their own cleanup history"
ON public.cleanup_history
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add indexes for better performance
CREATE INDEX idx_email_cleanup_analysis_user_id ON public.email_cleanup_analysis(user_id);
CREATE INDEX idx_email_cleanup_analysis_sender_domain ON public.email_cleanup_analysis(sender_domain);
CREATE INDEX idx_cleanup_rules_user_id ON public.cleanup_rules(user_id);
CREATE INDEX idx_cleanup_history_user_id ON public.cleanup_history(user_id);

-- Add trigger for updating updated_at on email_cleanup_analysis
CREATE TRIGGER update_email_cleanup_analysis_updated_at
BEFORE UPDATE ON public.email_cleanup_analysis
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updating updated_at on cleanup_rules
CREATE TRIGGER update_cleanup_rules_updated_at
BEFORE UPDATE ON public.cleanup_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();