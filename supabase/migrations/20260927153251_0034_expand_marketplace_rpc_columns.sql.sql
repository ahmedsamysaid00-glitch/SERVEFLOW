/*
# Marketplace: expand active_restaurants_with_branches RPC

The marketplace home page needs restaurant logo, phone, and email.
The existing RPC only returned id and name. Replacing it to also return
logo_url, phone, and email so the marketplace UI can show richer cards.
*/

DROP FUNCTION IF EXISTS public.active_restaurants_with_branches();

CREATE FUNCTION public.active_restaurants_with_branches()
RETURNS TABLE(id uuid, name text, logo_url text, phone text, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT r.id, r.name, r.logo_url, r.phone, r.email
FROM restaurants r
WHERE r.status = 'active'
AND EXISTS (
  SELECT 1 FROM branches b
  WHERE b.restaurant_id = r.id AND b.status = 'active'
)
ORDER BY r.name;
$function$;

-- Re-grant execute to authenticated (DROP removed grants)
GRANT EXECUTE ON FUNCTION public.active_restaurants_with_branches() TO authenticated;
