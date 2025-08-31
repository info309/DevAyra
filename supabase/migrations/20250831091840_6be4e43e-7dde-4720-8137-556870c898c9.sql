-- Add timezone preference to profiles table
ALTER TABLE public.profiles 
ADD COLUMN timezone TEXT DEFAULT 'GMT';