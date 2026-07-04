-- Shared sync helpers expected by the app but missing from the checked-in SQL.
-- Run in Supabase Dashboard -> SQL Editor after supabase_xp_migration.sql.

-- 1. Keep the repo-tracked longest streak helper in sync with localState.ts
CREATE OR REPLACE FUNCTION public.update_longest_streak(
  p_user_id UUID,
  p_streak INTEGER
) RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles
  SET
    longest_streak = GREATEST(COALESCE(longest_streak, 0), GREATEST(COALESCE(p_streak, 0), 0)),
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Home screen streak strip: last 7 days with activity/no-activity flags
CREATE OR REPLACE FUNCTION public.get_weekly_streak_days(
  p_user_id UUID
) RETURNS TABLE(day DATE, has_activity BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.day::DATE,
    EXISTS (
      SELECT 1
      FROM public.xp_transactions t
      WHERE t.user_id = p_user_id
        AND t.date = d.day::DATE
    ) AS has_activity
  FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::INTERVAL) AS d(day)
  ORDER BY d.day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Stats screen monthly chart: weekly buckets for the current month
CREATE OR REPLACE FUNCTION public.get_monthly_xp(
  user_id UUID
) RETURNS TABLE(week TEXT, xp_earned INTEGER) AS $$
BEGIN
  RETURN QUERY
  WITH month_weeks AS (
    SELECT DISTINCT date_trunc('week', d.day)::DATE AS week_start
    FROM generate_series(
      date_trunc('month', CURRENT_DATE)::DATE,
      CURRENT_DATE::DATE,
      '1 week'::INTERVAL
    ) AS d(day)
  )
  SELECT
    to_char(w.week_start, 'Mon DD') AS week,
    COALESCE(SUM(t.xp_amount)::INTEGER, 0) AS xp_earned
  FROM month_weeks w
  LEFT JOIN public.xp_transactions t
    ON t.user_id = get_monthly_xp.user_id
   AND t.date >= w.week_start
   AND t.date < (w.week_start + INTERVAL '7 day')::DATE
  GROUP BY w.week_start
  ORDER BY w.week_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
