/*
# 0018: Owner membership concurrency hardening

Adds a partial UNIQUE index on restaurant_members(user_id)
WHERE status = 'active', preventing the same user from having
multiple active memberships at the database level.

This is the final concurrency backstop for create_owner_workspace:
even if two concurrent RPC calls pass the pre-check, only one INSERT
succeeds; the other gets a unique_violation that the RPC catches
and returns as a clean error.

Inactive/invited/suspended memberships remain unrestricted —
the partial index only covers status = 'active'.
*/

-- 1. Add partial unique index: one active membership per user
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_members_one_active_per_user
  ON public.restaurant_members (user_id)
  WHERE status = 'active';

-- 2. Recreate create_owner_workspace with unique_violation handling
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

  -- 2. Reject users who already have an active restaurant membership (fast-path check)
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

  -- 6. Atomic creation: restaurant -> branch -> owner membership
  --    Wrap only the membership INSERT in an exception block so we can
  --    catch the concurrent-insert unique_violation on the partial index
  --    without swallowing unrelated errors from restaurant/branch creation.
  INSERT INTO restaurants (name)
  VALUES (v_clean_restaurant_name)
  RETURNING id INTO v_restaurant_id;

  INSERT INTO branches (restaurant_id, name)
  VALUES (v_restaurant_id, v_clean_branch_name)
  RETURNING id INTO v_branch_id;

  BEGIN
    INSERT INTO restaurant_members (restaurant_id, branch_id, user_id, role, status)
    VALUES (v_restaurant_id, NULL, v_user_id, 'owner', 'active');
  EXCEPTION WHEN unique_violation THEN
    -- Another concurrent request created the active membership first.
    -- The restaurant and branch we just created are orphaned, but that
    -- is acceptable: they have no members and no data, and the owner
    -- can contact support if needed. The critical invariant — one
    -- active membership per user — is preserved.
    RAISE EXCEPTION 'You already belong to a restaurant workspace';
  END;

  -- 7. Return created IDs
  RETURN jsonb_build_object(
    'restaurant_id', v_restaurant_id,
    'branch_id', v_branch_id,
    'restaurant_name', v_clean_restaurant_name,
    'branch_name', v_clean_branch_name
  );
END;
$function$;

-- 3. Re-grant (CREATE OR REPLACE preserves grants, but be explicit)
REVOKE EXECUTE ON FUNCTION public.create_owner_workspace(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_owner_workspace(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_owner_workspace(text, text) TO authenticated;
