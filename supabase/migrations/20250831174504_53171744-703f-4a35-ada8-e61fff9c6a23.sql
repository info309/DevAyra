-- Update the user's timezone from GMT to Europe/London
-- GMT doesn't handle daylight saving time, but Europe/London does
UPDATE profiles 
SET timezone = 'Europe/London'
WHERE timezone = 'GMT';