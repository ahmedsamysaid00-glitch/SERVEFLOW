-- Fix: gen_salt requires explicit text casts for the algorithm parameter
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
  p_email := lower(trim(p_email));

  SELECT id, encrypted_password IS NOT NULL
  INTO v_user_id, v_has_password
  FROM auth.users
  WHERE lower(trim(email)) = p_email;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account not found.');
  END IF;

  IF v_has_password THEN
    RETURN jsonb_build_object('success', false, 'error', 'A password is already set for this account.');
  END IF;

  v_hash := crypt(p_password, gen_salt('bf'::text, 10));

  UPDATE auth.users
  SET encrypted_password = v_hash,
      updated_at = now()
  WHERE id = v_user_id AND encrypted_password IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password could not be set.');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Password set successfully.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_initial_admin_password(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_initial_admin_password(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_initial_admin_password(text, text) FROM authenticated;
