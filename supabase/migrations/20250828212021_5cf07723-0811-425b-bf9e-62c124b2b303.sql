-- Make documents bucket public for font files access
UPDATE storage.buckets 
SET public = true 
WHERE id = 'documents';

-- Create RLS policy to allow public read access to font files
CREATE POLICY "Allow public read access to font files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents' 
  AND name LIKE '%fonts%' 
  OR name LIKE '%.otf' 
  OR name LIKE '%.ttf' 
  OR name LIKE '%.woff' 
  OR name LIKE '%.woff2'
);