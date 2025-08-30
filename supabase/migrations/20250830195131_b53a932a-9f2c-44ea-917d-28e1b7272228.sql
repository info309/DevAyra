-- Add Google Calendar sync fields to calendar_events table
ALTER TABLE public.calendar_events 
ADD COLUMN external_id TEXT,
ADD COLUMN calendar_id TEXT DEFAULT 'primary',
ADD COLUMN is_synced BOOLEAN DEFAULT FALSE;

-- Create index for external_id for efficient syncing
CREATE INDEX idx_calendar_events_external_id ON public.calendar_events(external_id);

-- Create index for sync status and user_id for efficient queries
CREATE INDEX idx_calendar_events_sync_user ON public.calendar_events(user_id, is_synced);