-- 017_local_delivery_step1_enum.sql
-- Local Delivery tracking — STEP 1 of 2.
-- Enum additions must commit before any migration references the new value,
-- so this file runs alone, BEFORE step 2.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'driver';
