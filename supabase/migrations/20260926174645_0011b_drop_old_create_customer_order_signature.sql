
-- Drop the old create_customer_order function signature (without idempotency_key)
-- The new version with p_idempotency_key is the active one.
DROP FUNCTION IF EXISTS create_customer_order(uuid, jsonb, payment_method, text);
