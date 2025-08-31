-- Add last_error column to gmail_connections table for error tracking
ALTER TABLE public.gmail_connections 
ADD COLUMN last_error text;