/*
# Super Admin + Owner Signup Approval System

## Purpose
Adds a gatekeeper system: only emails approved by the Super Admin can create
Restaurant Owner accounts. Customers continue to sign up freely.

## New Tables
- `owner_signup_requests`
  - `id` (uuid PK)
  - `email` (text, normalized lowercase, NOT NULL)
  - `status` (enum: pending/approved/rejected, default pending)
  - `created_at` (timestamptz, default now)
  - `approved_at` (timestamptz, nullable)
  - `rejected_at` (timestamptz, nullable)
  - `reviewed_by` (uuid, nullable, references auth.users)

## New Functions
- `is_super_admin()` — returns true if the authenticated user's email matches
  the designated super admin email (ahmedsamysaid00@gmail.com).
- `submit_owner_signup_request(p_email text)` — SECURITY DEFINER. Inserts a
  new pending request with normalized email. Prevents duplicates.
- `review_owner_signup_request(p_request_id uuid, p_action text)` — SECURITY DEFINER.
  Only the super admin can call. Sets status to approved/rejected.

## Modified Functions
- `create_owner_workspace` — now checks that the caller's email has an approved
  owner_signup_requests record before allowing restaurant creation.

## Security (RLS)
- `owner_signup_requests`:
  - INSERT: anon + authenticated (anyone can submit a request)
  - SELECT: only super admin
  - UPDATE: only super admin
  - DELETE: only super admin
*/

-- ─── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'owner_request_status') THEN
    CREATE TYPE owner_request_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

-- ─── is_super_admin() function (must exist before RLS policies reference it) ──
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(trim(email)) = 'ahmedsamysaid00@gmail.com'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ─── owner_signup_requests table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS owner_signup_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  status      owner_request_status NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_signup_pending_email
  ON owner_signup_requests (lower(trim(email)))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_owner_signup_status
  ON owner_signup_requests (status, created_at DESC);

-- ─── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE owner_signup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_insert_owner_request" ON owner_signup_requests;
CREATE POLICY "anyone_insert_owner_request"
  ON owner_signup_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "super_admin_select_owner_requests" ON owner_signup_requests;
CREATE POLICY "super_admin_select_owner_requests"
  ON owner_signup_requests FOR SELECT
  TO authenticated
  USING (is_super_admin());

DROP POLICY IF EXISTS "super_admin_update_owner_requests" ON owner_signup_requests;
CREATE POLICY "super_admin_update_owner_requests"
  ON owner_signup_requests FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admin_delete_owner_requests" ON owner_signup_requests;
CREATE POLICY "super_admin_delete_owner_requests"
  ON owner_signup_requests FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- ─── submit_owner_signup_request(p_email) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_owner_signup_request(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clean_email text;
  v_existing_id uuid;
BEGIN
  v_clean_email := lower(trim(p_email));
  IF v_clean_email IS NULL OR v_clean_email = '' THEN
    RAISE EXCEPTION 'Please enter a valid email address';
  END IF;

  SELECT id INTO v_existing_id
  FROM owner_signup_requests
  WHERE lower(trim(email)) = v_clean_email AND status = 'pending';

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_pending');
  END IF;

  PERFORM 1 FROM owner_signup_requests
  WHERE lower(trim(email)) = v_clean_email AND status = 'approved';

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already_approved');
  END IF;

  INSERT INTO owner_signup_requests (email, status)
  VALUES (v_clean_email, 'pending');

  RETURN jsonb_build_object('status', 'pending');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_owner_signup_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_owner_signup_request(text) TO anon, authenticated;

-- ─── review_owner_signup_request(p_request_id, p_action) ──────────────────────
CREATE OR REPLACE FUNCTION public.review_owner_signup_request(
  p_request_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_request owner_signup_requests%ROWTYPE;
  v_new_status owner_request_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only the Super Admin can review requests';
  END IF;

  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action. Use approve or reject.';
  END IF;

  SELECT * INTO v_request
  FROM owner_signup_requests
  WHERE id = p_request_id;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'This request has already been reviewed';
  END IF;

  IF p_action = 'approve' THEN
    v_new_status := 'approved';
    UPDATE owner_signup_requests
    SET status = v_new_status,
        approved_at = now(),
        reviewed_by = v_user_id
    WHERE id = p_request_id;
  ELSE
    v_new_status := 'rejected';
    UPDATE owner_signup_requests
    SET status = v_new_status,
        rejected_at = now(),
        reviewed_by = v_user_id
    WHERE id = p_request_id;
  END IF;

  RETURN jsonb_build_object(
    'id', p_request_id,
    'status', v_new_status::text
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.review_owner_signup_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_owner_signup_request(uuid, text) TO authenticated;

-- ─── Modify create_owner_workspace: add approval check ─────────────────────────
CREATE OR REPLACE FUNCTION public.create_owner_workspace(p_restaurant_name text, p_branch_name text)
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
v_user_email text;
v_is_approved boolean;
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

-- 4. NEW: Check that the caller's email has an approved owner signup request
SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
v_user_email := lower(trim(v_user_email));

SELECT EXISTS (
  SELECT 1 FROM owner_signup_requests
  WHERE lower(trim(email)) = v_user_email
  AND status = 'approved'
) INTO v_is_approved;

IF NOT v_is_approved THEN
RAISE EXCEPTION 'Your email has not been approved for restaurant owner signup. Please contact the platform administrator.';
END IF;

-- 5. Validate restaurant name
v_clean_restaurant_name := btrim(p_restaurant_name);
IF v_clean_restaurant_name IS NULL OR length(v_clean_restaurant_name) = 0 THEN
RAISE EXCEPTION 'Please enter your restaurant name';
END IF;
IF length(v_clean_restaurant_name) > 120 THEN
RAISE EXCEPTION 'Restaurant name must be 120 characters or fewer';
END IF;

-- 6. Validate branch name
v_clean_branch_name := btrim(p_branch_name);
IF v_clean_branch_name IS NULL OR length(v_clean_branch_name) = 0 THEN
RAISE EXCEPTION 'Please enter your first branch name';
END IF;
IF length(v_clean_branch_name) > 120 THEN
RAISE EXCEPTION 'Branch name must be 120 characters or fewer';
END IF;

-- 7. Atomic creation: restaurant -> branch -> owner membership
BEGIN
INSERT INTO restaurants (name)
VALUES (v_clean_restaurant_name)
RETURNING id INTO v_restaurant_id;

INSERT INTO branches (restaurant_id, name)
VALUES (v_restaurant_id, v_clean_branch_name)
RETURNING id INTO v_branch_id;

INSERT INTO restaurant_members (restaurant_id, branch_id, user_id, role, status)
VALUES (v_restaurant_id, NULL, v_user_id, 'owner', 'active');
EXCEPTION WHEN unique_violation THEN
RAISE EXCEPTION 'You already belong to a restaurant workspace';
END;

-- 8. Return created IDs
RETURN jsonb_build_object(
'restaurant_id', v_restaurant_id,
'branch_id', v_branch_id,
'restaurant_name', v_clean_restaurant_name,
'branch_name', v_clean_branch_name
);
END;
$function$;
