/*
# Allow anon to SELECT active restaurants for customer signup

## Why
The customer signup page needs to show a list of active restaurants so the
new user can pick which restaurant they want to order from. The existing
`select_restaurants_for_signup` policy is scoped to `TO authenticated` only.
During signup the user has NOT yet authenticated — they are browsing as
`anon`. As a result the restaurant picker returns zero rows and no
restaurants are displayed.

## What changes
- Add a new SELECT policy `select_active_restaurants_anon` on `restaurants`
  scoped to `TO anon` that allows reading rows where `status = 'active'`.
- This only exposes `id` and `name` (and any other columns the anon role
  already has GRANT SELECT on — the table-level GRANT already includes anon).
- The existing `authenticated` policy is untouched.
- RLS remains enabled. No data is modified. No other tables are affected.

## Security notes
1. Restaurant name and ID are public information — they are the storefront
   listing. Exposing active restaurants to unauthenticated visitors is the
   same as a public restaurant directory.
2. The policy restricts to `status = 'active'` only — inactive/draft
   restaurants remain invisible.
3. No INSERT/UPDATE/DELETE permissions are granted to anon.
4. The `create_customer_account` RPC remains `authenticated`-only (it uses
   `auth.uid()` internally), so anon still cannot create customer accounts.
*/

DROP POLICY IF EXISTS "select_active_restaurants_anon" ON restaurants;
CREATE POLICY "select_active_restaurants_anon"
  ON restaurants FOR SELECT
  TO anon
  USING (status = 'active');
