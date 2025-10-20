-- Add meeting_type and meet_space_id columns to meetings table
-- meeting_type: 'virtual' or 'physical'
-- meet_space_id: Google Meet space ID for virtual meetings

ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS meeting_type TEXT DEFAULT 'virtual' CHECK (meeting_type IN ('virtual', 'physical'));

ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS meet_space_id TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.meetings.meeting_type IS 'Type of meeting: virtual or physical';
COMMENT ON COLUMN public.meetings.meet_space_id IS 'Google Meet space ID (for virtual meetings)';


