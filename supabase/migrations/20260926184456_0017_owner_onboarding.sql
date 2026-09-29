/*
# 0017: Owner onboarding — self-service restaurant + first branch creation

Creates a SECURITY DEFINER RPC `create_owner_workspace` that lets an
authenticated user with no existing membership and no customer record
create a restaurant, its first branch, and an owner membership row
atomically.

Security properties:
- All identity comes from auth.uid() — no user_id/role/restaurant_id/branch_id params
- Rejects users who already have an active restaurant_members row
- Rejects users who already have an active customer record (mutual exclusivity)
- Validates non-blank names with max length 120
- Owner membership: branch_id = NULL, role = 'owner', status = 'active'
- Atomic: all three inserts succeed or none do
- search_path = public, SECURITY DEFINER
- REVOKE FROM anon/PUBLIC, GRANT TO authenticated
*/

CREATE OR REPLACE FUNCTION public.create_owner_workspace(
  p_restaurant_name text,
  p_branch_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_existing_member int;
  v_existing_customer int;
  v_clean_restaurant_name text;
  v_clean_branch_name text;
BEGIN
  -- 1. Require authenticated user
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Reject users who already have an active restaurant membership
  SELECT count(*) INTO v_existing_member
  FROM restaurant_members
  WHERE user_id = v_user_id
    AND status = 'active';

  IF v_existing_member > 0 THEN
    RAISE EXCEPTION 'You already belong to a restaurant workspace';
  END IF;

  -- 3. Reject users who already have an active customer record (mutual exclusivity)
  SELECT count(*) INTO v_existing_customer
  FROM customers
  WHERE user_id = v_user_id
    AND status = 'active';

  IF v_existing_customer > 0 THEN
    RAISE EXCEPTION 'Customer accounts cannot create a restaurant workspace';
  END IF;

  -- 4. Validate restaurant name
  v_clean_restaurant_name := btrim(p_restaurant_name);
  IF v_clean_restaurant_name IS NULL OR length(v_clean_restaurant_name) = 0 THEN
    RAISE EXCEPTION 'Please enter your restaurant name';
  END IF;
  IF length(v_clean_restaurant_name) > 120 THEN
    RAISE EXCEPTION 'Restaurant name must be 120 characters or fewer';
  END IF;

  -- 5. Validate branch name
  v_clean_branch_name := btrim(p_branch_name);
  IF v_clean_branch_name IS NULL OR length(v_clean_branch_name) = 0 THEN
    RAISE EXCEPTION 'Please enter your first branch name';
  END IF;
  IF length(v_clean_branch_name) > 120 THEN
    RAISE EXCEPTION 'Branch name must be 120 characters or fewer';
  END IF;

  -- 6. Atomic creation: restaurant → branch → owner membership
  INSERT INTO restaurants (name)
  VALUES (v_clean_restaurant_name)
  RETURNING id INTO v_restaurant_id;

  INSERT INTO branches (restaurant_id, name)
  VALUES (v_restaurant_id, v_clean_branch_name)
  RETURNING id INTO v_branch_id;

  INSERT INTO restaurant_members (restaurant_id, branch_id, user_id, role, status)
  VALUES (v_restaurant_id, NULL, v_user_id, 'owner', 'active');

  -- 7. Return created IDs
  RETURN jsonb_build_object(
    'restaurant_id', v_restaurant_id,
    'branch_id', v_branch_id,
    'restaurant_name', v_clean_restaurant_name,
    'branch_name', v_clean_branch_name
  );
END;
$function$;

-- Revoke from anon and PUBLIC, grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.create_owner_workspace(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_owner_workspace(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_owner_workspace(text, text) TO authenticated;
