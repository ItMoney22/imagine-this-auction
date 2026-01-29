-- AI Auctioneer + Notifier Schema
-- Migration: 20250927_ai_auctioneer_notifications.sql

-- Add notification preferences to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS notification_prefs jsonb
DEFAULT '{"email":true,"push":true,"sms":false,"quiet_hours":[22,7]}'::jsonb;

-- Create user interests table for recommendation engine
CREATE TABLE IF NOT EXISTS user_interests (
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    tag text NOT NULL,
    weight integer DEFAULT 1,
    last_seen timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, tag)
);

-- Add AI-generated hype copy to lots table
ALTER TABLE lots
ADD COLUMN IF NOT EXISTS hype_copy jsonb;

-- Add embedding support (with feature flag)
-- Only run if USE_EMBEDDINGS environment variable is true
-- ALTER TABLE lots ADD COLUMN IF NOT EXISTS embedding vector(768);
-- CREATE INDEX IF NOT EXISTS lots_embedding_idx ON lots USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create notifications queue table
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('email', 'push', 'sms')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    priority integer DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
    subject text,
    content jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    scheduled_for timestamptz DEFAULT now(),
    sent_at timestamptz,
    error_message text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notifications_type_status ON notifications(type, status);
CREATE INDEX IF NOT EXISTS idx_user_interests_tag ON user_interests(tag);
CREATE INDEX IF NOT EXISTS idx_user_interests_weight ON user_interests(weight DESC);

-- Create notification batches table for tracking daily digests
CREATE TABLE IF NOT EXISTS notification_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_type text NOT NULL CHECK (batch_type IN ('daily_digest', 'lot_alert', 'ending_soon')),
    user_count integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    started_at timestamptz,
    completed_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Create user device tokens for push notifications
CREATE TABLE IF NOT EXISTS user_device_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    token text NOT NULL,
    device_type text NOT NULL CHECK (device_type IN ('web', 'ios', 'android')),
    user_agent text,
    is_active boolean DEFAULT true,
    last_used timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, token)
);

-- Create lot interactions for recommendation scoring
CREATE TABLE IF NOT EXISTS lot_interactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    lot_id uuid REFERENCES lots(id) ON DELETE CASCADE,
    interaction_type text NOT NULL CHECK (interaction_type IN ('view', 'bid', 'watchlist', 'share')),
    duration_seconds integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, lot_id, interaction_type, created_at)
);

CREATE INDEX IF NOT EXISTS idx_lot_interactions_user_type ON lot_interactions(user_id, interaction_type);
CREATE INDEX IF NOT EXISTS idx_lot_interactions_lot ON lot_interactions(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_interactions_created ON lot_interactions(created_at DESC);

-- Add RLS policies
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_interests
CREATE POLICY "Users can manage their own interests" ON user_interests
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all notifications" ON notifications
    FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for notification_batches (admin only)
CREATE POLICY "Admin can manage notification batches" ON notification_batches
    FOR ALL USING (EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    ));

-- RLS Policies for user_device_tokens
CREATE POLICY "Users can manage their own device tokens" ON user_device_tokens
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for lot_interactions
CREATE POLICY "Users can manage their own interactions" ON lot_interactions
    FOR ALL USING (auth.uid() = user_id);

-- Create functions for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_user_interests_updated_at
    BEFORE UPDATE ON user_interests
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Create function to upsert user interests
CREATE OR REPLACE FUNCTION upsert_user_interest(
    p_user_id uuid,
    p_tag text,
    p_weight_increment integer DEFAULT 1
)
RETURNS void AS $$
BEGIN
    INSERT INTO user_interests (user_id, tag, weight, last_seen)
    VALUES (p_user_id, p_tag, p_weight_increment, now())
    ON CONFLICT (user_id, tag)
    DO UPDATE SET
        weight = user_interests.weight + p_weight_increment,
        last_seen = now(),
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user recommendations
CREATE OR REPLACE FUNCTION get_user_recommendations(
    p_user_id uuid,
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    lot_id uuid,
    score numeric,
    reasons text[]
) AS $$
BEGIN
    RETURN QUERY
    WITH user_tags AS (
        SELECT tag, weight
        FROM user_interests
        WHERE user_id = p_user_id
        ORDER BY weight DESC, last_seen DESC
        LIMIT 20
    ),
    lot_scores AS (
        SELECT
            l.id as lot_id,
            COALESCE(
                (SELECT SUM(ut.weight)
                 FROM user_tags ut
                 WHERE ut.tag = ANY(
                     ARRAY[l.category, l.brand] ||
                     COALESCE(l.tags, ARRAY[]::text[])
                 )
                ), 0
            ) as tag_score,
            CASE
                WHEN l.status = 'published' THEN 10
                WHEN l.status = 'live' THEN 20
                ELSE 0
            END as status_score,
            CASE
                WHEN l.ends_at < now() + interval '24 hours' THEN 15
                WHEN l.ends_at < now() + interval '72 hours' THEN 10
                ELSE 5
            END as urgency_score
        FROM lots l
        WHERE l.status IN ('published', 'live')
        AND l.ends_at > now()
    )
    SELECT
        ls.lot_id,
        (ls.tag_score + ls.status_score + ls.urgency_score)::numeric as score,
        ARRAY['tag_match', 'status_boost', 'urgency']::text[] as reasons
    FROM lot_scores ls
    WHERE ls.tag_score > 0 OR ls.status_score > 0
    ORDER BY score DESC, ls.lot_id
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create feature flags table
CREATE TABLE IF NOT EXISTS feature_flags (
    flag_name text PRIMARY KEY,
    enabled boolean DEFAULT false,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Insert default feature flags
INSERT INTO feature_flags (flag_name, enabled, description) VALUES
    ('USE_EMBEDDINGS', false, 'Enable vector embeddings for AI recommendations'),
    ('SMS_ENABLED', false, 'Enable SMS notifications via Twilio'),
    ('COPYWRITER_ENABLED', true, 'Enable AI copywriter for generating hype copy'),
    ('PUSH_NOTIFICATIONS', true, 'Enable web push notifications')
ON CONFLICT (flag_name) DO NOTHING;

-- Grant permissions
GRANT ALL ON user_interests TO authenticated;
GRANT ALL ON notifications TO authenticated;
GRANT ALL ON notification_batches TO authenticated;
GRANT ALL ON user_device_tokens TO authenticated;
GRANT ALL ON lot_interactions TO authenticated;
GRANT ALL ON feature_flags TO authenticated;

-- Grant service role permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

COMMENT ON TABLE user_interests IS 'Tracks user interests for AI recommendation engine';
COMMENT ON TABLE notifications IS 'Queue for email, push, and SMS notifications';
COMMENT ON TABLE notification_batches IS 'Tracks batch notification jobs';
COMMENT ON TABLE user_device_tokens IS 'Stores device tokens for push notifications';
COMMENT ON TABLE lot_interactions IS 'Tracks user interactions for recommendation scoring';
COMMENT ON COLUMN lots.hype_copy IS 'AI-generated marketing copy in JSON format';
COMMENT ON COLUMN users.notification_prefs IS 'User notification preferences and quiet hours';