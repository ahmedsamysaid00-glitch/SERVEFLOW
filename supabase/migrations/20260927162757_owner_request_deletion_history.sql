/*
# Owner Request Deletion History

## Purpose
Add a "deleted" status to owner_signup_requests so that when an owner's
account/restaurant is deleted through the approved deletion flow, the
request remains as permanent history instead of disappearing.

## Changes
1. Add 'deleted' to the owner_request_status enum
2. Add deleted_at (timestamptz) column
3. Add deleted_by (uuid) column referencing auth.users ON DELETE SET NULL
4. Add original_restaurant_name (text) column to preserve restaurant name
   for historical display after the restaurant row is deleted

## Safety
- No existing data is modified
- No tables dropped
- No RLS policies changed
- No existing statuses removed
- reviewed_by FK already uses ON DELETE SET NULL (safe)
*/

-- 1. Add 'deleted' to the enum
ALTER TYPE owner_request_status ADD VALUE IF NOT EXISTS 'deleted';

-- 2. Add deletion tracking columns
ALTER TABLE owner_signup_requests
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_restaurant_name text;

-- 3. Add index for filtering by status (including deleted)
CREATE INDEX IF NOT EXISTS idx_owner_signup_requests_status
  ON owner_signup_requests (status);
