-- Revoke EXECUTE from PUBLIC (which includes anon) on create_customer_account.
-- SECURITY DEFINER functions default to PUBLIC execute; we must explicitly
-- revoke from PUBLIC and then grant only to authenticated.
REVOKE EXECUTE ON FUNCTION public.create_customer_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_account(uuid) TO authenticated;
