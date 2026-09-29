-- Create a SECURITY DEFINER RPC for customer self-signup.
-- This lets a brand-new user register as a customer (not a restaurant owner)
-- by creating a `customers` row tied to their auth.uid() and a chosen restaurant.
-- It enforces mutual exclusivity with restaurant_members (staff cannot be customers).

CREATE OR REPLACE FUNCTION public.create_customer_account(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_member int;
  v_existing_customer int;
  v_email text;
  v_full_name text;
  v_customer_id uuid;
BEGIN
  -- 1. Require authenticated user
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Reject users who already have an active restaurant membership
  SELECT count(*) INTO v_existing_member
  FROM restaurant_members
  WHERE user_id = v_user_id AND status = 'active';

  IF v_existing_member > 0 THEN
    RAISE EXCEPTION 'Restaurant staff cannot create a customer account';
  END IF;

  -- 3. Reject users who already have an active customer record
  SELECT count(*) INTO v_existing_customer
  FROM customers
  WHERE user_id = v_user_id AND status = 'active';

  IF v_existing_customer > 0 THEN
    RAISE EXCEPTION 'You already have a customer account';
  END IF;

  -- 4. Validate the restaurant exists and is active
  PERFORM 1 FROM restaurants WHERE id = p_restaurant_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected restaurant is not available';
  END IF;

  -- 5. Get the user's email and full_name
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  SELECT full_name INTO v_full_name FROM profiles WHERE id = v_user_id;

  -- 6. Create the customer record
  INSERT INTO customers (restaurant_id, user_id, full_name, email, status)
  VALUES (p_restaurant_id, v_user_id, v_full_name, v_email, 'active')
  RETURNING id INTO v_customer_id;

  -- 7. Return the created customer info
  RETURN jsonb_build_object(
    'customer_id', v_customer_id,
    'restaurant_id', p_restaurant_id
  );
END;
$function$;

-- Revoke execute from anon and authenticated — only allow it via the
-- Supabase client which sends the caller's JWT (RLS auth context).
-- Actually, this RPC uses auth.uid() so it must be callable by authenticated.
-- The SECURITY DEFINER is needed because `auth.users` is not readable by
-- authenticated users directly.
REVOKE EXECUTE ON FUNCTION public.create_customer_account(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_customer_account(uuid) TO authenticated;
