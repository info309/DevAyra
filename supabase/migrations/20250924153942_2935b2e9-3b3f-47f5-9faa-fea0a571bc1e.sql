-- Drop the existing incorrect storage policies
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;

-- Create corrected storage policies for the documents bucket
-- The path structure is: receipts/{user_id}/filename
-- So we need to check (storage.foldername(name))[2] for the user_id

CREATE POLICY "Users can upload their own documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'documents' 
  AND (
    -- For receipts path: receipts/{user_id}/filename
    (name LIKE 'receipts/%' AND auth.uid()::text = (storage.foldername(name))[2])
    OR
    -- For general documents: {user_id}/filename
    (name NOT LIKE 'receipts/%' AND auth.uid()::text = (storage.foldername(name))[1])
  )
);

CREATE POLICY "Users can view their own documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'documents' 
  AND (
    -- For receipts path: receipts/{user_id}/filename
    (name LIKE 'receipts/%' AND auth.uid()::text = (storage.foldername(name))[2])
    OR
    -- For general documents: {user_id}/filename
    (name NOT LIKE 'receipts/%' AND auth.uid()::text = (storage.foldername(name))[1])
  )
);

CREATE POLICY "Users can update their own documents" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'documents' 
  AND (
    -- For receipts path: receipts/{user_id}/filename
    (name LIKE 'receipts/%' AND auth.uid()::text = (storage.foldername(name))[2])
    OR
    -- For general documents: {user_id}/filename
    (name NOT LIKE 'receipts/%' AND auth.uid()::text = (storage.foldername(name))[1])
  )
);

CREATE POLICY "Users can delete their own documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'documents' 
  AND (
    -- For receipts path: receipts/{user_id}/filename
    (name LIKE 'receipts/%' AND auth.uid()::text = (storage.foldername(name))[2])
    OR
    -- For general documents: {user_id}/filename
    (name NOT LIKE 'receipts/%' AND auth.uid()::text = (storage.foldername(name))[1])
  )
);