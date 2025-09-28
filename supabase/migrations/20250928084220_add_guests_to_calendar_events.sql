-- Add guests column to calendar_events table
ALTER TABLE calendar_events 
ADD COLUMN guests TEXT;
