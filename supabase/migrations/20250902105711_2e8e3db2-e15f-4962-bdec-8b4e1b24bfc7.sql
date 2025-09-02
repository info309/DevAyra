-- Make email-attachments bucket public so Gmail can fetch attachments directly
UPDATE storage.buckets 
SET public = true 
WHERE id = 'email-attachments';