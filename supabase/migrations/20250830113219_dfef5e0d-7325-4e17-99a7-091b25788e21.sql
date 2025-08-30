
-- 1) Assistant chat sessions
CREATE TABLE IF NOT EXISTS public.assistant_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assistant_sessions ENABLE ROW LEVEL SECURITY;

-- Policies: users manage only their own sessions
CREATE POLICY "Users can view their own assistant sessions"
  ON public.assistant_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own assistant sessions"
  ON public.assistant_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own assistant sessions"
  ON public.assistant_sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own assistant sessions"
  ON public.assistant_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_assistant_sessions_updated_at
  BEFORE UPDATE ON public.assistant_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Helpful index
CREATE INDEX IF NOT EXISTS assistant_sessions_user_id_created_at_idx
  ON public.assistant_sessions (user_id, created_at DESC);



-- 2) Assistant messages within sessions
CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content text,
  tool_name text,
  tool_args jsonb,
  tool_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

-- Policies: only see messages from your sessions
CREATE POLICY "Users can view messages from their own sessions"
  ON public.assistant_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.assistant_sessions s
      WHERE s.id = assistant_messages.session_id
        AND s.user_id = auth.uid()
    )
  );

-- Insert: must belong to a session owned by user and user_id must match auth.uid()
CREATE POLICY "Users can insert messages into their own sessions"
  ON public.assistant_messages
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.assistant_sessions s
      WHERE s.id = session_id
        AND s.user_id = auth.uid()
    )
  );

-- Update: only update messages you own
CREATE POLICY "Users can update their own messages"
  ON public.assistant_messages
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Delete: only delete messages from your sessions
CREATE POLICY "Users can delete messages from their own sessions"
  ON public.assistant_messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.assistant_sessions s
      WHERE s.id = assistant_messages.session_id
        AND s.user_id = auth.uid()
    )
  );

-- Auto-update updated_at
CREATE TRIGGER update_assistant_messages_updated_at
  BEFORE UPDATE ON public.assistant_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS assistant_messages_session_id_created_at_idx
  ON public.assistant_messages (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS assistant_messages_user_id_created_at_idx
  ON public.assistant_messages (user_id, created_at DESC);
