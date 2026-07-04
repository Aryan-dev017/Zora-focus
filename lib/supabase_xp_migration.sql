-- ─────────────────────────────────────────────────────────────────────────────
-- supabase_xp_migration.sql  —  Owl Reflection Engine
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New columns on user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS daily_xp_earned        INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_xp_goal          INTEGER   DEFAULT 500,
  ADD COLUMN IF NOT EXISTS tasks_completed_today  INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasks_total_today      INTEGER   DEFAULT 5,
  ADD COLUMN IF NOT EXISTS habits_completed_today INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS habits_total_today     INTEGER   DEFAULT 5,
  ADD COLUMN IF NOT EXISTS focus_minutes_today    INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS focus_goal_minutes     INTEGER   DEFAULT 120,
  ADD COLUMN IF NOT EXISTS last_active_date       DATE      DEFAULT CURRENT_DATE;

-- 2. xp_transactions
CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_amount  INTEGER     NOT NULL CHECK (xp_amount > 0),
  ref        TEXT        NOT NULL,
  label      TEXT        DEFAULT '',
  type       TEXT        DEFAULT 'task' CHECK (type IN ('task','habit','focus','bonus')),
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  date       DATE        GENERATED ALWAYS AS (awarded_at::DATE) STORED
);
CREATE INDEX IF NOT EXISTS idx_xp_txn_user_date ON public.xp_transactions(user_id, date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_txn_ref ON public.xp_transactions(user_id, ref);

ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own txns"    ON public.xp_transactions;
DROP POLICY IF EXISTS "Users insert own txns" ON public.xp_transactions;
DROP POLICY IF EXISTS "Users delete own txns" ON public.xp_transactions;
CREATE POLICY "Users see own txns"    ON public.xp_transactions FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "Users insert own txns" ON public.xp_transactions FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users delete own txns" ON public.xp_transactions FOR DELETE USING (auth.uid()=user_id);

-- 3. add_xp RPC
CREATE OR REPLACE FUNCTION public.add_xp(user_id UUID, xp_amount INTEGER) RETURNS VOID AS $$
DECLARE new_xp INTEGER; new_level INTEGER;
BEGIN
  UPDATE public.user_profiles SET total_xp=total_xp+xp_amount, updated_at=NOW()
  WHERE id=user_id RETURNING total_xp INTO new_xp;
  new_level := CASE WHEN new_xp>=10000 THEN 5 WHEN new_xp>=4000 THEN 4 WHEN new_xp>=1500 THEN 3 WHEN new_xp>=500 THEN 2 ELSE 1 END;
  UPDATE public.user_profiles SET level=new_level WHERE id=user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. subtract_xp RPC
CREATE OR REPLACE FUNCTION public.subtract_xp(user_id UUID, xp_amount INTEGER) RETURNS VOID AS $$
DECLARE new_xp INTEGER; new_level INTEGER;
BEGIN
  UPDATE public.user_profiles SET total_xp=GREATEST(total_xp-xp_amount,0), updated_at=NOW()
  WHERE id=user_id RETURNING total_xp INTO new_xp;
  new_level := CASE WHEN new_xp>=10000 THEN 5 WHEN new_xp>=4000 THEN 4 WHEN new_xp>=1500 THEN 3 WHEN new_xp>=500 THEN 2 ELSE 1 END;
  UPDATE public.user_profiles SET level=new_level WHERE id=user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. update_daily_xp RPC (resets counters at midnight automatically)
CREATE OR REPLACE FUNCTION public.update_daily_xp(user_id UUID, xp_delta INTEGER) RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles SET
    daily_xp_earned        = CASE WHEN last_active_date<CURRENT_DATE THEN 0 ELSE daily_xp_earned END,
    tasks_completed_today  = CASE WHEN last_active_date<CURRENT_DATE THEN 0 ELSE tasks_completed_today END,
    habits_completed_today = CASE WHEN last_active_date<CURRENT_DATE THEN 0 ELSE habits_completed_today END,
    focus_minutes_today    = CASE WHEN last_active_date<CURRENT_DATE THEN 0 ELSE focus_minutes_today END,
    last_active_date       = CURRENT_DATE
  WHERE id=user_id;
  UPDATE public.user_profiles SET daily_xp_earned=GREATEST(daily_xp_earned+xp_delta,0), updated_at=NOW() WHERE id=user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. log_focus_session RPC
CREATE OR REPLACE FUNCTION public.log_focus_session(user_id UUID, duration_minutes INTEGER) RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles SET
    focus_minutes_today = CASE WHEN last_active_date<CURRENT_DATE THEN 0 ELSE focus_minutes_today END,
    last_active_date    = CURRENT_DATE
  WHERE id=user_id;
  UPDATE public.user_profiles SET focus_minutes_today=focus_minutes_today+duration_minutes, updated_at=NOW() WHERE id=user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. update_streak RPC
CREATE OR REPLACE FUNCTION public.update_streak(user_id UUID) RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles SET
    current_streak = CASE
      WHEN last_active_date=CURRENT_DATE THEN current_streak
      WHEN last_active_date=CURRENT_DATE-INTERVAL '1 day' THEN current_streak+1
      ELSE 1 END,
    longest_streak = GREATEST(longest_streak, CASE
      WHEN last_active_date=CURRENT_DATE-INTERVAL '1 day' THEN current_streak+1
      ELSE 1 END),
    total_days     = CASE WHEN last_active_date<CURRENT_DATE THEN total_days+1 ELSE total_days END,
    last_active_date = CURRENT_DATE,
    updated_at       = NOW()
  WHERE id=user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Leaderboard view (all-time)
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT p.id, p.display_name, p.avatar_url, p.total_xp, p.level, p.current_streak, p.daily_xp_earned,
  RANK() OVER (ORDER BY p.total_xp DESC) AS rank
FROM public.user_profiles p WHERE p.onboarding_completed=TRUE;

-- 9. Today's leaderboard
CREATE OR REPLACE VIEW public.leaderboard_today AS
SELECT u.user_id, p.display_name, p.avatar_url,
  SUM(u.xp_amount)::INTEGER AS xp_today,
  RANK() OVER (ORDER BY SUM(u.xp_amount) DESC) AS rank_today
FROM public.xp_transactions u
JOIN public.user_profiles p ON p.id=u.user_id
WHERE u.date=CURRENT_DATE
GROUP BY u.user_id, p.display_name, p.avatar_url;

-- 10. Weekly XP per-day (for stats chart)
CREATE OR REPLACE FUNCTION public.get_weekly_xp(user_id UUID)
RETURNS TABLE(day DATE, xp_earned INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT d.day::DATE, COALESCE(SUM(t.xp_amount)::INTEGER,0) AS xp_earned
  FROM generate_series(CURRENT_DATE-6, CURRENT_DATE, '1 day'::INTERVAL) d(day)
  LEFT JOIN public.xp_transactions t ON t.user_id=get_weekly_xp.user_id AND t.date=d.day::DATE
  GROUP BY d.day ORDER BY d.day ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Usage: supabase.rpc('get_weekly_xp', { user_id })  →  [{day, xp_earned}, ...]