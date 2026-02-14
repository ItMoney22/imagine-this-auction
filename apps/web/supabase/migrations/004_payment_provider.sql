-- Migrate legacy Stripe payment tracking to provider-agnostic payment events

ALTER TABLE stripe_events RENAME TO payment_events;

ALTER INDEX idx_stripe_events_processed RENAME TO idx_payment_events_processed;

ALTER TABLE payment_events RENAME COLUMN data TO payload;

ALTER TABLE payment_events
    ADD COLUMN provider TEXT DEFAULT 'legacy-stripe' NOT NULL,
    ADD COLUMN provider_event_id TEXT;

UPDATE payment_events SET provider_event_id = COALESCE(provider_event_id, id);

ALTER TABLE payment_events
    ALTER COLUMN provider_event_id SET NOT NULL;

ALTER TABLE payment_events
    ALTER COLUMN provider SET DEFAULT 'paymentcloud';

ALTER TABLE payment_events
    ALTER COLUMN processed_at SET DEFAULT NULL;

DROP POLICY IF EXISTS "Admin access to stripe events" ON payment_events;
CREATE POLICY "Admin access to payment events" ON payment_events
    FOR ALL USING (get_user_role() = 'admin');

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_provider_event_id
    ON payment_events(provider_event_id);

-- Drop old function to allow parameter rename
DROP FUNCTION IF EXISTS add_wallet_credits(UUID, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION add_wallet_credits(
    user_uuid UUID,
    credit_amount INTEGER,
    provider_event_identifier TEXT,
    purchase_description TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    current_balance INTEGER;
    new_balance INTEGER;
    event_provider TEXT;
BEGIN
    SELECT provider
    INTO event_provider
    FROM payment_events
    WHERE provider_event_id = provider_event_identifier
    ORDER BY created_at DESC
    LIMIT 1;

    IF event_provider IS NULL THEN
        event_provider := 'paymentcloud';
    END IF;

    current_balance := get_wallet_balance(user_uuid);
    new_balance := current_balance + credit_amount;

    INSERT INTO wallet_ledger (
        user_id,
        transaction_type,
        amount,
        balance_after,
        description,
        reference_id,
        reference_type,
        metadata
    ) VALUES (
        user_uuid,
        'purchase',
        credit_amount,
        new_balance,
        purchase_description,
        NULL,
        'payment_event',
        jsonb_build_object(
            'provider_event_id', provider_event_identifier,
            'provider', event_provider
        )
    );

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
