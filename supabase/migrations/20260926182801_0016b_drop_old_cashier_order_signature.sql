/*
# 0016b: Drop old 6-arg create_cashier_order signature

The original 6-argument version (without p_idempotency_key) is still
present. We need exactly ONE authoritative signature (the 7-arg version
from 0016). Drop the old one to prevent ambiguity.
*/
DROP FUNCTION IF EXISTS public.create_cashier_order(jsonb, uuid, numeric, numeric, payment_method, text);
