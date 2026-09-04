-- 015_ai_quick_listing_enums.sql
-- Enum values for the AI Quick Listing & Product Presentation feature.
--
-- This is deliberately a SEPARATE migration from 016. PostgreSQL allows
-- `ALTER TYPE ... ADD VALUE` inside a transaction (PG 12+), but the new value
-- cannot be *used* by other statements in that same transaction. Splitting the
-- enum change out means 016 can reference 'ai_spend'/'ai_refund' freely.
--
-- Run 015 first, then 016.

ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'ai_spend';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'ai_refund';
