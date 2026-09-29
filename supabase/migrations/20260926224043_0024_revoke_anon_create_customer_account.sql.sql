-- Revoke EXECUTE on create_customer_account from anon.
-- This SECURITY DEFINER function uses auth.uid() so anon cannot use it,
-- but we explicitly revoke to satisfy the security linter.
REVOKE EXECUTE ON FUNCTION public.create_customer_account(uuid) FROM anon;
