/*
# Add is_owner_email_approved RPC

## Purpose
Provides a safe, side-effect-free way for the signup page to check if an email
has been approved for restaurant owner signup. The existing RLS on
owner_signup_requests blocks non-admin users from SELECTing the table, so
the frontend cannot check approval status directly.

## New Functions
- `is_owner_email_approved(p_email text)` — SECURITY DEFINER. Returns true
  if the given email has an approved owner_signup_requests record.
  Callable by anon and authenticated. Only returns a boolean — does not
  expose the full list of approved emails.

## Security
- SECURITY DEFINER with locked search_path.
- Only returns true/false for a single email — no list exposure.
- Email is normalized (lower + trim) before comparison.
*/

CREATE OR REPLACE FUNCTION public.is_owner_email_approved(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM owner_signup_requests
    WHERE lower(trim(email)) = lower(trim(p_email))
    AND status = 'approved'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_owner_email_approved(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_email_approved(text) TO anon, authenticated;
