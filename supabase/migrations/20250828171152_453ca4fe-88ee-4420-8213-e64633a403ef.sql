-- Create user_documents table for document management
CREATE TABLE public.user_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  source_type TEXT DEFAULT 'upload' CHECK (source_type IN ('upload', 'email_attachment')),
  source_email_id TEXT, -- Gmail message ID if from email
  source_email_subject TEXT, -- Subject of source email for context
  category TEXT,
  tags TEXT[],
  description TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_file_path UNIQUE (user_id, file_path)
);

-- Enable Row Level Security
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_documents
CREATE POLICY "Users can manage their own documents" 
ON public.user_documents 
FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_documents_updated_at
BEFORE UPDATE ON public.user_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_user_documents_user_id ON public.user_documents(user_id);
CREATE INDEX idx_user_documents_source_type ON public.user_documents(source_type);
CREATE INDEX idx_user_documents_category ON public.user_documents(category);
CREATE INDEX idx_user_documents_tags ON public.user_documents USING GIN(tags);
CREATE INDEX idx_user_documents_created_at ON public.user_documents(created_at DESC);