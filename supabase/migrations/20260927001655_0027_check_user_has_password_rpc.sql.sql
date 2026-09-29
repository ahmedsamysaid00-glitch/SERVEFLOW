-- RPC to check whether a user already has a password set.
-- Used by the set-initial-password edge function to ensure
-- the initial password can only be set once (when no password exists).
CREATE OR REPLACE FUNCTION public.check_user_has_password(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = p_user_id
    AND encrypted_password IS NOT NULL
  );
$$;

-- Only the service role (used by edge functions) should be able to call this.
-- The anon and authenticated roles must NOT be able to call it.
REVOKE EXECUTE ON FUNCTION public.check_user_has_password(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_user_has_password(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_user_has_password(uuid) FROM authenticated;
