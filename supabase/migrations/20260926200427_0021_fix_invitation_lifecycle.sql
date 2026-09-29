/*
# 0021: Fix invitation lifecycle — activate on signup + idempotent invite

Two bugs were found in the invitation flow:

1. link_pending_invitations() set user_id but never changed status from
   'invited' to 'active'. The invited user would sign up, get linked to
   the membership, but loadContext() queries `.eq('status', 'active')`
   so the membership was invisible — the user saw Onboarding instead of
   their Manager/Kitchen/Cashier dashboard.

   Fix: set status = 'active' when linking.

2. create_employee_invitation rejected existing auth users who already
   had an active membership in the restaurant, but it did NOT handle the
   case where the user already exists in auth.users AND already has an
   'invited' membership row. The duplicate-invite check on invite_email
   handled new emails, but if the user already had a user_id-linked
   invited row, the email check wouldn't catch it.

   Fix: also check for existing 'invited' membership by user_id.

No schema changes. No RLS changes. Only function updates.
*/

-- 1. Fix link_pending_invitations to set status = 'active'
CREATE OR REPLACE FUNCTION public.link_pending_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.restaurant_members
  SET user_id = NEW.id,
      invite_email = NULL,
      status = 'active'
  WHERE invite_email = NEW.email
    AND user_id IS NULL
    AND status = 'invited';
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.link_pending_invitations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.link_pending_invitations() FROM PUBLIC;

-- 2. Fix create_employee_invitation to also check for existing invited membership by user_id
CREATE OR REPLACE FUNCTION public.create_employee_invitation(
  p_email text,
  p_full_name text,
  p_role text,
  p_branch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_restaurant_id uuid;
  v_branch_valid int;
  v_existing_membership int;
  v_existing_invite int;
  v_invitee_id uuid;
  v_clean_email text;
  v_clean_name text;
  v_role member_role;
BEGIN
  -- 1. Require authenticated user
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Derive caller's restaurant from auth.uid() — must be an active owner
  SELECT restaurant_id INTO v_restaurant_id
  FROM restaurant_members
  WHERE user_id = v_caller_id
    AND role = 'owner'
    AND status = 'active';

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Only restaurant owners can invite employees';
  END IF;

  -- 3. Reject owner role — cannot invite another owner
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot invite another owner';
  END IF;

  -- 4. Validate role is one of manager/kitchen/cashier
  IF p_role NOT IN ('manager', 'kitchen', 'cashier') THEN
    RAISE EXCEPTION 'Invalid role. Must be manager, kitchen, or cashier';
  END IF;

  v_role := p_role::member_role;

  -- 5. Validate branch belongs to caller's restaurant
  SELECT count(*) INTO v_branch_valid
  FROM branches
  WHERE id = p_branch_id
    AND restaurant_id = v_restaurant_id;

  IF v_branch_valid = 0 THEN
    RAISE EXCEPTION 'Selected branch does not belong to your restaurant';
  END IF;

  -- 6. Validate email
  v_clean_email := lower(btrim(p_email));
  IF v_clean_email IS NULL OR length(v_clean_email) = 0 THEN
    RAISE EXCEPTION 'Please enter an email address';
  END IF;
  IF v_clean_email !~* '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address';
  END IF;
  IF length(v_clean_email) > 255 THEN
    RAISE EXCEPTION 'Email must be 255 characters or fewer';
  END IF;

  -- 7. Validate full name
  v_clean_name := btrim(p_full_name);
  IF v_clean_name IS NULL OR length(v_clean_name) = 0 THEN
    RAISE EXCEPTION 'Please enter the employee''s full name';
  END IF;
  IF length(v_clean_name) > 120 THEN
    RAISE EXCEPTION 'Name must be 120 characters or fewer';
  END IF;

  -- 8. Check if invitee already has an auth account
  SELECT id INTO v_invitee_id
  FROM auth.users
  WHERE email = v_clean_email
  LIMIT 1;

  -- 9. Reject if invitee already has an active OR invited membership in this restaurant
  IF v_invitee_id IS NOT NULL THEN
    SELECT count(*) INTO v_existing_membership
    FROM restaurant_members
    WHERE user_id = v_invitee_id
      AND restaurant_id = v_restaurant_id
      AND status IN ('active', 'invited');

    IF v_existing_membership > 0 THEN
      RAISE EXCEPTION 'This person is already a member of your restaurant';
    END IF;
  END IF;

  -- 10. Reject if there's already a pending invitation for this email in this restaurant
  SELECT count(*) INTO v_existing_invite
  FROM restaurant_members
  WHERE invite_email = v_clean_email
    AND restaurant_id = v_restaurant_id
    AND status = 'invited';

  IF v_existing_invite > 0 THEN
    RAISE EXCEPTION 'An invitation has already been sent to this email';
  END IF;

  -- 11. Create the invitation membership (atomic block)
  BEGIN
    INSERT INTO restaurant_members (
      restaurant_id, branch_id, user_id, role, status, invite_email
    )
    VALUES (
      v_restaurant_id, p_branch_id, v_invitee_id, v_role, 'invited', v_clean_email
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'An invitation has already been sent to this email';
  END;

  -- 12. Return success info
  RETURN jsonb_build_object(
    'restaurant_id', v_restaurant_id,
    'branch_id', p_branch_id,
    'email', v_clean_email,
    'full_name', v_clean_name,
    'role', p_role,
    'status', 'invited',
    'has_account', v_invitee_id IS NOT NULL
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_employee_invitation(text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_employee_invitation(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_employee_invitation(text, text, text, uuid) TO authenticated;
