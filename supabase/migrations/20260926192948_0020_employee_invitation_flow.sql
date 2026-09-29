/*
# 0020: Employee invitation flow

Allows an owner to invite employees (manager/kitchen/cashier) to their
restaurant. The RPC creates an 'invited' restaurant_members row.

Schema changes (additive only):
  - restaurant_members.invite_email text  (nullable, for users not yet signed up)
  - restaurant_members.user_id relaxed to nullable (so invitations can exist
    before the invitee has an auth account)

When the invitee signs up, a trigger on auth.users (handle_new_user) already
creates a profiles row. A new trigger links any pending invitation matching
the new user's email to their new user_id and marks it active.

The RPC:
  - Derives caller identity from auth.uid()
  - Verifies caller is an active owner
  - Rejects owner role (cannot invite another owner)
  - Validates branch belongs to caller's restaurant
  - Rejects duplicate active/invited memberships for same email/user
  - Creates restaurant_members with status = 'invited'
  - If invitee already has an auth account, sets user_id immediately
  - If not, stores invite_email and leaves user_id NULL
*/

-- 1. Add invite_email column and relax user_id to nullable
ALTER TABLE public.restaurant_members ADD COLUMN IF NOT EXISTS invite_email text;
ALTER TABLE public.restaurant_members ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add a partial unique index on invite_email to prevent duplicate invitations
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_members_one_invite_per_email
  ON public.restaurant_members (invite_email, restaurant_id)
  WHERE invite_email IS NOT NULL
    AND status IN ('invited', 'active');

-- 3. Trigger: when a new user signs up, link pending invitations by email
CREATE OR REPLACE FUNCTION public.link_pending_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.restaurant_members
  SET user_id = NEW.id,
      invite_email = NULL
  WHERE invite_email = NEW.email
    AND user_id IS NULL
    AND status = 'invited';
  RETURN NEW;
END;
$function$;

-- Drop old trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created_link_invitations ON auth.users;
CREATE TRIGGER on_auth_user_created_link_invitations
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_pending_invitations();

-- 4. Revoke execute on the trigger function from anon/PUBLIC
REVOKE EXECUTE ON FUNCTION public.link_pending_invitations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.link_pending_invitations() FROM PUBLIC;

-- 5. Create the employee invitation RPC
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

  -- 8. Check if invitee already has an auth account (look up auth.users by email)
  SELECT id INTO v_invitee_id
  FROM auth.users
  WHERE email = v_clean_email
  LIMIT 1;

  -- 9. Reject if invitee already has an active membership in this restaurant
  IF v_invitee_id IS NOT NULL THEN
    SELECT count(*) INTO v_existing_membership
    FROM restaurant_members
    WHERE user_id = v_invitee_id
      AND restaurant_id = v_restaurant_id
      AND status = 'active';

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

-- 13. Revoke from anon/PUBLIC, grant to authenticated
REVOKE EXECUTE ON FUNCTION public.create_employee_invitation(text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_employee_invitation(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_employee_invitation(text, text, text, uuid) TO authenticated;

-- 14. Update the insert_members RLS with_check to also cover invited memberships
-- The existing policy already allows owners to INSERT (with_check: is_restaurant_member).
-- The RPC bypasses RLS (SECURITY DEFINER), so direct client INSERTs are still gated
-- by the existing policy. No RLS change needed — the RPC is the secure path.
