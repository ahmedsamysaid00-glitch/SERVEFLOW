/*
# Final Security Gate: Revoke anon EXECUTE on SECURITY DEFINER functions

The Supabase database linter flagged that both SECURITY DEFINER functions
are callable by the anon (unauthenticated) role. Even though the
functions validate auth.uid() internally and will reject unauthenticated
calls, allowing anon to execute SECURITY DEFINER functions is an
unnecessary attack surface.

This migration explicitly revokes EXECUTE from anon and PUBLIC on both
functions, keeping the grant only for authenticated.
*/

REVOKE EXECUTE ON FUNCTION create_cashier_order(jsonb, uuid, numeric, numeric, payment_method, text) FROM anon;
REVOKE EXECUTE ON FUNCTION create_cashier_order(jsonb, uuid, numeric, numeric, payment_method, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION close_cashier_shift(uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION close_cashier_shift(uuid, numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_cashier_order(jsonb, uuid, numeric, numeric, payment_method, text) TO authenticated;
GRANT EXECUTE ON FUNCTION close_cashier_shift(uuid, numeric) TO authenticated;
