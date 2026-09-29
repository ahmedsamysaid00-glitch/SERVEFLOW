/*
# Fix reset_test_data grants — revoke anon execute

The previous migration granted EXECUTE to authenticated but anon still
inherited access. This explicitly revokes from anon and ensures only
authenticated can call it. The function's internal is_super_admin() check
is the real security gate, but defense-in-depth requires anon cannot call it.
*/

REVOKE EXECUTE ON FUNCTION public.reset_test_data(boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_test_data(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_test_data(boolean) TO authenticated;
