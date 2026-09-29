/*
# Revoke public/anon execute on trigger function

The protect_customer_immutable_fields function is a trigger function
called only by the BEFORE UPDATE trigger on the customers table.
It should never be called directly via the REST API.
Revoke execute from anon and PUBLIC to close the advisory.
*/

REVOKE EXECUTE ON FUNCTION protect_customer_immutable_fields() FROM anon;
REVOKE EXECUTE ON FUNCTION protect_customer_immutable_fields() FROM PUBLIC;
