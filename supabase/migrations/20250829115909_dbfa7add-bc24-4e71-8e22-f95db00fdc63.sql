-- Add thumbnail_path column to user_documents table
ALTER TABLE public.user_documents 
ADD COLUMN thumbnail_path text;