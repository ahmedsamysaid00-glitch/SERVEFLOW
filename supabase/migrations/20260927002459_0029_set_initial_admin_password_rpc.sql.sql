-- RPC to set the initial password for the super admin account.
-- Uses bcrypt (same algorithm GoTrue uses) via pgcrypto's crypt().
-- SECURITY DEFINER so the edge function (service role) can update auth.users.
-- Only works when the user currently has NO password (one-time use).
CREATE OR REPLACE FUNCTION public.set_initial_admin_password(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_has_password boolean;
  v_hash text;
BEGIN
  -- Normalize email
  p_email := lower(trim(p_email));

  -- Find the user
  SELECT id, encrypted_password IS NOT NULL
  INTO v_user_id, v_has_password
  FROM auth.users
  WHERE lower(trim(email)) = p_email;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account not found.');
  END IF;

  -- Only allow setting password if none exists (one-time)
  IF v_has_password THEN
    RETURN jsonb_build_object('success', false, 'error', 'A password is already set for this account.');
  END IF;

  -- Generate bcrypt hash (cost factor 10, same as GoTrue default)
  v_hash := crypt(p_password, gen_salt('bf', 10));

  -- Update the user's password
  UPDATE auth.users
  SET encrypted_password = v_hash,
      updated_at = now()
  WHERE id = v_user_id AND encrypted_password IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password could not be set. It may have been set by another request.');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Password set successfully.');
END;
$$;

-- Only the service role (used by edge functions) should be able to call this.
REVOKE EXECUTE ON FUNCTION public.set_initial_admin_password(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_initial_admin_password(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_initial_admin_password(text, text) FROM authenticated;
