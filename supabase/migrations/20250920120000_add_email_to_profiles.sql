-- Add email column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN email TEXT;

-- Update existing profiles with email from auth.users
UPDATE public.profiles 
SET email = au.email
FROM auth.users au
WHERE public.profiles.user_id = au.id;

-- Create index on email for better performance
CREATE INDEX idx_profiles_email ON public.profiles(email);
