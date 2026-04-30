-- ============================================================
-- Watchlist alerts (1h / 15m / 1m before lot ends)
-- ============================================================

-- Dedupe table so each alert window fires at most once per (user, lot, window).
CREATE TABLE IF NOT EXISTS public.watchlist_alerts_sent (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  window_label TEXT NOT NULL CHECK (window_label IN ('1h','15m','1m')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, lot_id, window_label)
);
CREATE INDEX IF NOT EXISTS idx_wl_alerts_sent_lot ON public.watchlist_alerts_sent(lot_id);

-- Function: scan watched lots ending soon, insert notifications, mark sent.
CREATE OR REPLACE FUNCTION public.send_watchlist_ending_alerts()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_window TEXT;
  v_lower INTERVAL;
  v_upper INTERVAL;
  v_label TEXT;
  v_row RECORD;
BEGIN
  FOR v_window IN SELECT unnest(ARRAY['1h','15m','1m'])
  LOOP
    IF v_window = '1h' THEN
      v_lower := INTERVAL '59 minutes';
      v_upper := INTERVAL '60 minutes';
      v_label := 'in 1 hour';
    ELSIF v_window = '15m' THEN
      v_lower := INTERVAL '14 minutes';
      v_upper := INTERVAL '15 minutes';
      v_label := 'in 15 minutes';
    ELSE
      v_lower := INTERVAL '0 minutes';
      v_upper := INTERVAL '1 minute';
      v_label := 'in under a minute';
    END IF;

    FOR v_row IN
      SELECT
        w.user_id,
        w.lot_id,
        l.title AS lot_title,
        a.ends_at
      FROM public.watchlists w
      JOIN public.lots l ON l.id = w.lot_id
      JOIN public.auctions a ON a.id = l.auction_id
      LEFT JOIN public.watchlist_alerts_sent s
        ON s.user_id = w.user_id AND s.lot_id = w.lot_id AND s.window_label = v_window
      WHERE s.user_id IS NULL
        AND a.ends_at > NOW()
        AND a.ends_at - NOW() <= v_upper
        AND a.ends_at - NOW() > v_lower
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        v_row.user_id,
        'Ending ' || v_label || ': ' || v_row.lot_title,
        'A lot you''re watching ends ' || v_label || '. Tap to bid.',
        'watchlist_ending'
      );
      INSERT INTO public.watchlist_alerts_sent (user_id, lot_id, window_label)
      VALUES (v_row.user_id, v_row.lot_id, v_window);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.send_watchlist_ending_alerts() TO authenticated;

-- Schedule every minute (requires pg_cron).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'send-watchlist-alerts';

    PERFORM cron.schedule(
      'send-watchlist-alerts',
      '* * * * *',
      $cron$ SELECT public.send_watchlist_ending_alerts(); $cron$
    );
  END IF;
END $$;

-- ============================================================
-- Add display_in_leaderboard opt-in flag for Whales board
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_in_leaderboard BOOLEAN DEFAULT false;
