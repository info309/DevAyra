
-- 1) Ensure profiles.display_name is sourced from Auth metadata on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  meta jsonb := NEW.raw_user_meta_data;
  resolved_name text;
BEGIN
  resolved_name := COALESCE(
    meta ->> 'display_name',
    meta ->> 'name',
    meta ->> 'full_name',
    meta ->> 'given_name',
    meta ->> 'first_name',
    split_part(NEW.email, '@', 1),
    NEW.email
  );

  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, resolved_name);

  RETURN NEW;
END;
$$;

-- Create (or replace) trigger for new Auth users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- 2) Keep profiles.display_name in sync when Auth metadata or email changes
CREATE OR REPLACE FUNCTION public.sync_profile_name_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  meta jsonb := NEW.raw_user_meta_data;
  resolved_name text;
BEGIN
  resolved_name := COALESCE(
    meta ->> 'display_name',
    meta ->> 'name',
    meta ->> 'full_name',
    meta ->> 'given_name',
    meta ->> 'first_name',
    split_part(NEW.email, '@', 1),
    NEW.email
  );

  UPDATE public.profiles
  SET display_name = resolved_name,
      updated_at = now()
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF raw_user_meta_data, email ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_profile_name_from_auth();

-- 3) Backfill existing profiles from current Auth users
-- 3a) Insert missing profile rows
INSERT INTO public.profiles (user_id, display_name)
SELECT au.id,
       COALESCE(
         au.raw_user_meta_data ->> 'display_name',
         au.raw_user_meta_data ->> 'name',
         au.raw_user_meta_data ->> 'full_name',
         au.raw_user_meta_data ->> 'given_name',
         au.raw_user_meta_data ->> 'first_name',
         split_part(au.email, '@', 1),
         au.email
       )
FROM auth.users au
LEFT JOIN public.profiles p ON p.user_id = au.id
WHERE p.user_id IS NULL;

-- 3b) Update all existing profile rows to reflect current Auth names
UPDATE public.profiles p
SET display_name = COALESCE(
      au.raw_user_meta_data ->> 'display_name',
      au.raw_user_meta_data ->> 'name',
      au.raw_user_meta_data ->> 'full_name',
      au.raw_user_meta_data ->> 'given_name',
      au.raw_user_meta_data ->> 'first_name',
      split_part(au.email, '@', 1),
      au.email
    ),
    updated_at = now()
FROM auth.users au
WHERE p.user_id = au.id;
