/*
# Add RPC to list active restaurants that have at least one active branch

## Why
The customer signup page needs to show only restaurants that a customer can
actually order from — i.e. restaurants with `status = 'active'` that have at
least one branch with `status = 'active'`. The `restaurants` table now has an
anon SELECT policy for active restaurants, but we also need to filter by
"has at least one active branch" without exposing the entire `branches`
table to unauthenticated users.

## What changes
- Create `public.active_restaurants_with_branches()` — a SECURITY DEFINER
  function that returns `id, name` for all restaurants where
  `status = 'active'` AND there exists at least one branch with
  `status = 'active'` belonging to that restaurant.
- Grant EXECUTE to `anon` and `authenticated` so the signup page (anon) and
  any authenticated user can call it.
- Set a fixed `search_path` for security.

## Security notes
1. This function only returns `id` and `name` — the same public directory
   information already exposed by the `select_active_restaurants_anon` policy.
2. The "has at least one active branch" filter is computed server-side;
   the caller cannot see branch details.
3. SECURITY DEFINER runs with the function owner's privileges, bypassing
   RLS on `branches`. This is safe because the function only returns
   restaurant id+name, never branch data.
4. The function is `STABLE` and `LANGUAGE sql` — no side effects.
*/

CREATE OR REPLACE FUNCTION public.active_restaurants_with_branches()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.name
  FROM restaurants r
  WHERE r.status = 'active'
    AND EXISTS (
      SELECT 1 FROM branches b
      WHERE b.restaurant_id = r.id AND b.status = 'active'
    )
  ORDER BY r.name;
$$;

GRANT EXECUTE ON FUNCTION public.active_restaurants_with_branches() TO anon;
GRANT EXECUTE ON FUNCTION public.active_restaurants_with_branches() TO authenticated;
