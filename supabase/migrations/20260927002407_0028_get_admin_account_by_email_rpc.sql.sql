-- RPC to look up the super admin account by email.
-- Returns user ID, email confirmation status, and whether a password is set.
-- Used by the set-initial-password edge function instead of admin.listUsers(),
-- which may not surface users created via direct SQL INSERT.
CREATE OR REPLACE FUNCTION public.get_admin_account_by_email(p_email text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'user_id', u.id::text,
        'email', u.email,
        'email_confirmed', u.email_confirmed_at IS NOT NULL,
        'has_password', u.encrypted_password IS NOT NULL
      )
      FROM auth.users u
      WHERE lower(trim(u.email)) = lower(trim(p_email))
    ),
    'null'::jsonb
  );
$$;

-- Only the service role (used by edge functions) should be able to call this.
REVOKE EXECUTE ON FUNCTION public.get_admin_account_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_account_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_account_by_email(text) FROM authenticated;
