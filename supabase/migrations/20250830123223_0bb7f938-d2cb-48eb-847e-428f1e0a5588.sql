-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job that runs every 30 seconds to cache emails
SELECT cron.schedule(
  'cache-emails-every-30s',
  '*/30 * * * * *', -- every 30 seconds
  $$
  DO $$
  DECLARE
    user_record RECORD;
    function_url TEXT;
    request_result JSONB;
  BEGIN
    -- Get the project URL from current database settings
    function_url := 'https://lmkpmnndrygjatnipfgd.supabase.co/functions/v1/cache-emails';
    
    -- Loop through all users with active Gmail connections
    FOR user_record IN 
      SELECT DISTINCT gc.user_id, gc.access_token
      FROM gmail_connections gc
      WHERE gc.is_active = true
    LOOP
      -- Call the cache-emails function for each user
      BEGIN
        SELECT net.http_post(
          url := function_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT raw_app_meta_data->>'provider_token' FROM auth.users WHERE id = user_record.user_id)
          ),
          body := jsonb_build_object(
            'maxResults', 100,
            'userId', user_record.user_id::text
          )
        ) INTO request_result;
        
        -- Log success (optional)
        RAISE NOTICE 'Cached emails for user: %', user_record.user_id;
        
      EXCEPTION WHEN OTHERS THEN
        -- Log error but continue with other users
        RAISE NOTICE 'Failed to cache emails for user %: %', user_record.user_id, SQLERRM;
      END;
    END LOOP;
  END $$;
  $$
);