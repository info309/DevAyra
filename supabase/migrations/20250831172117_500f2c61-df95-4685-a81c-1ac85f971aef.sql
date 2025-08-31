-- Fix the Meeting with Brian to the correct Monday date (September 1, 2025)
UPDATE calendar_events 
SET start_time = '2025-09-01T15:00:00+00:00',
    end_time = '2025-09-01T16:00:00+00:00',
    updated_at = now()
WHERE id = 'f93a6323-1aee-4ceb-bbb3-8bbdcbbfc491' 
AND user_id = '7edab01f-672c-4363-966b-431e2a683c29' 
AND title = 'Meeting with Brian';