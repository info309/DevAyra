-- Add is_locked column to notes table
ALTER TABLE public.notes 
ADD COLUMN is_locked boolean NOT NULL DEFAULT false;