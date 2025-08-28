-- Add folder support to user_documents table
ALTER TABLE public.user_documents 
ADD COLUMN folder_id UUID REFERENCES public.user_documents(id) ON DELETE SET NULL;

-- Create index for folder queries
CREATE INDEX idx_user_documents_folder_id ON public.user_documents(folder_id);

-- Add folder type to distinguish between files and folders
ALTER TABLE public.user_documents 
ADD COLUMN is_folder BOOLEAN NOT NULL DEFAULT false;

-- Update existing records to be files (not folders)
UPDATE public.user_documents SET is_folder = false WHERE is_folder IS NULL;