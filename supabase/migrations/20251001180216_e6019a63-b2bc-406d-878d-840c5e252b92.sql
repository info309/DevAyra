-- Add AI summary column to email_cleanup_analysis
ALTER TABLE email_cleanup_analysis 
ADD COLUMN ai_summary text;

-- Add unsubscribe_url column to store the unsubscribe link
ALTER TABLE email_cleanup_analysis 
ADD COLUMN unsubscribe_url text;