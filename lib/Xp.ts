// ─────────────────────────────────────────────────────────────────────────────
// lib/Xp.ts  —  Owl Reflection Engine
//
// XP is decided automatically by the Eisenhower Matrix:
//   Priority (high/mid/low) × Urgency (urgent/normal/low)
//
//  ┌─────────────────┬───────────────┬──────────────────┐
//  │                 │ URGENT        │ NOT URGENT       │
//  ├─────────────────┼───────────────┼──────────────────┤
//  │ HIGH PRIORITY   │  240 XP  (S)  │  160 XP  (A)     │
//  │ MID  PRIORITY   │  140 XP  (B)  │   90 XP  (C)     │
//  │ LOW  PRIORITY   │   80 XP  (D)  │   40 XP  (E)     │
//  └─────────────────┴───────────────┴──────────────────┘
//
// Category multiplier: work×1.20  study×1.15  health×1.10  creative×1.10  personal×1.0
// Section multiplier:  weekly×1.5  daily×1.0
// Streak bonus:        scales from 0% → +10% over 7–30 days
//
// Supabase writes:
//   awardXP   → INSERT xp_transactions + add_xp RPC + update_daily_xp RPC
//   revokeXP  → DELETE xp_transactions + subtract_xp RPC + update_daily_xp RPC
//
// IMPORTANT: awardXP does NOT touch streak.
//   Streak is managed separately by the app's local-first task/focus flow and
//   then synced back into user_profiles so it only increments once per day.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

// ─── Exported types ───────────────────────────────────────────────────────────

export type XpPriority = 'high' | 'mid' | 'low';
export type XpUrgency  = 'urgent' | 'normal' | 'low';
export type XpSection  = 'daily' | 'weekly';
export type XpCategory = 'work' | 'health' | 'study' | 'personal' | 'creative';
export type XpTier     = 'S' | 'A' | 'B' | 'C' | 'D' | 'E';

export interface XpBreakdown {
  tier:         XpTier;
  tierLabel:    string;
  base:         number;
  withCategory: number;
  withSection:  number;
  streakBonus:  number;
  total:        number;
}

export interface UserXpState {
  totalXp:           number;
  dailyXpEarned:     number;
  dailyXpGoal:       number;
  tasksToday:        number;
  tasksTotalToday:   number;
  habitsToday:       number;
  habitsTotalToday:  number;
  focusMinutesToday: number;
  focusGoalMinutes:  number;
  currentStreak:     number;
  longestStreak:     number;
  level:             number;
}

// ─── Lookup tables ────────────────────────────────────────────────────────────

const BASE_XP: Record<XpPriority, Record<XpUrgency, number>> = {
  high: { urgent: 240, normal: 160, low: 120 },
  mid:  { urgent: 140, normal:  90, low:  60 },
  low:  { urgent:  80, normal:  40, low:  25 },
};

const TIER_MAP: Record<XpPriority, Record<XpUrgency, XpTier>> = {
  high: { urgent:'S', normal:'A', low:'A' },
  mid:  { urgent:'B', normal:'C', low:'C' },
  low:  { urgent:'D', normal:'E', low:'E' },
};

export const TIER_META: Record<XpTier, { label:string; color:string; bg:string }> = {
  S: { label:'Critical',  color:'#F26B6B', bg:'rgba(242,107,107,0.14)' },
  A: { label:'Important', color:'#7B6EF6', bg:'rgba(123,110,246,0.14)' },
  B: { label:'Do Soon',   color:'#F5C842', bg:'rgba(245,200,66,0.14)'  },
  C: { label:'Normal',    color:'#54AEFF', bg:'rgba(84,174,255,0.12)'  },
  D: { label:'Low',       color:'#3ECFA0', bg:'rgba(62,207,160,0.12)'  },
  E: { label:'Optional',  color:'#7E7E9A', bg:'rgba(255,255,255,0.06)' },
};

const CAT_MULT: Record<XpCategory, number> = {
  work:1.20, study:1.15, health:1.10, creative:1.10, personal:1.00,
};

const SECTION_MULT: Record<XpSection, number> = {
  daily:  1.0,
  weekly: 1.5,
};

const STREAK_THRESHOLD = 7;
const STREAK_FULL      = 30;
const STREAK_BONUS_PCT = 0.10;

// ─── Core XP calculation ──────────────────────────────────────────────────────

export function computeXP(
  priority: XpPriority,
  urgency:  XpUrgency,
  section:  XpSection  = 'daily',
  category: XpCategory = 'work',
): number {
  const base         = BASE_XP[priority][urgency];
  const withCategory = Math.round(base * CAT_MULT[category]);
  return Math.round(withCategory * SECTION_MULT[section]);
}

export function computeXpBreakdown(
  priority: XpPriority,
  urgency:  XpUrgency,
  section:  XpSection  = 'daily',
  category: XpCategory = 'work',
  streak:   number     = 0,
): XpBreakdown {
  const tier         = TIER_MAP[priority][urgency];
  const tierLabel    = TIER_META[tier].label;
  const base         = BASE_XP[priority][urgency];
  const withCategory = Math.round(base * CAT_MULT[category]);
  const withSection  = Math.round(withCategory * SECTION_MULT[section]);
  const bonusPct     = getStreakBonusPct(streak);
  const streakBonus  = Math.round(withSection * bonusPct);
  const total        = withSection + streakBonus;
  return { tier, tierLabel, base, withCategory, withSection, streakBonus, total };
}

// ─── Streak bonus helpers ─────────────────────────────────────────────────────

export function getStreakBonusPct(streakDays: number): number {
  if (streakDays < STREAK_THRESHOLD) return 0;
  const progress = Math.min(streakDays, STREAK_FULL) / STREAK_FULL;
  return STREAK_BONUS_PCT * progress;
}

export function applyStreakBonus(baseXp: number, streakDays: number): number {
  return baseXp + Math.round(baseXp * getStreakBonusPct(streakDays));
}

export function streakBonusLabel(streakDays: number): string {
  const pct = getStreakBonusPct(streakDays);
  return pct === 0 ? '' : `+${Math.round(pct * 100)}% streak`;
}

// ─── Supabase XP persistence ──────────────────────────────────────────────────

/**
 * Award XP for completing a task or focus session.
 * - Inserts into xp_transactions (unique ref prevents double-awarding)
 * - Calls add_xp RPC → increments total_xp + auto-levels user
 * - Calls update_daily_xp RPC → increments daily_xp_earned
 *
 * Does NOT touch streak — call supabase.rpc('touch_streak') separately
 * so streak only increments once per day no matter how many tasks are done.
 *
 * Returns transaction UUID for later revocation, or null on error/duplicate.
 */
export async function awardXP(
  userId: string,
  xp:     number,
  ref:    string,   // unique e.g. "task:uuid123"
  label?: string,   // human label e.g. task name
): Promise<string | null> {
  if (!userId || xp <= 0) return null;

  try {
    // 1. Insert transaction row (unique index on (user_id, ref) prevents doubles)
    const { data, error } = await supabase
      .from('xp_transactions')
      .insert({
        user_id:    userId,
        xp_amount:  xp,
        ref,
        label:      label ?? ref,
        type:       'task',
        awarded_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') return null; // duplicate ref — already awarded
      console.error('[XP] awardXP insert error:', error.message);
      return null;
    }

    // 2. Increment total_xp + auto-level (single RPC call)
    await supabase.rpc('add_xp', { user_id: userId, xp_amount: xp });

    // 3. Increment today's daily_xp_earned (for home ring + streak)
    await supabase.rpc('update_daily_xp', { user_id: userId, xp_delta: xp });

    return data?.id ?? null;

  } catch (e) {
    console.error('[XP] awardXP error:', e);
    return null;
  }
}

/**
 * Revoke XP when a task is un-completed or deleted while done.
 * - Deletes the xp_transactions row by ID
 * - Decrements total_xp via subtract_xp RPC
 * - Decrements daily_xp_earned via update_daily_xp RPC
 */
export async function revokeXP(
  userId: string,
  txnId:  string,
  xp:     number,
): Promise<void> {
  if (!userId || !txnId || xp <= 0) return;
  try {
    await supabase.from('xp_transactions').delete().eq('id', txnId);
    await supabase.rpc('subtract_xp',    { user_id: userId, xp_amount: xp });
    await supabase.rpc('update_daily_xp', { user_id: userId, xp_delta: -xp });
  } catch (e) {
    console.error('[XP] revokeXP error:', e);
  }
}

/**
 * Sync today's task counts into user_profiles.
 * Called after every toggle so the Tasks ring on the home screen stays live.
 */
export async function syncDailyTaskProgress(
  userId:         string,
  tasksCompleted: number,
  tasksTotal:     number,
): Promise<void> {
  if (!userId) return;
  try {
    await supabase
      .from('user_profiles')
      .update({
        tasks_completed_today: tasksCompleted,
        tasks_total_today:     Math.max(tasksTotal, 1),
        updated_at:            new Date().toISOString(),
      })
      .eq('id', userId);
  } catch (e) {
    console.error('[XP] syncDailyTaskProgress error:', e);
  }
}

/**
 * Sync today's habit counts into user_profiles.
 * Called after every habit toggle so the Habits ring stays live.
 */
export async function syncDailyHabitProgress(
  userId:          string,
  habitsCompleted: number,
  habitsTotal:     number,
): Promise<void> {
  if (!userId) return;
  try {
    await supabase
      .from('user_profiles')
      .update({
        habits_completed_today: habitsCompleted,
        habits_total_today:     Math.max(habitsTotal, 1),
        updated_at:             new Date().toISOString(),
      })
      .eq('id', userId);
  } catch (e) {
    console.error('[XP] syncDailyHabitProgress error:', e);
  }
}

/**
 * Log a completed focus session → drives the Focus ring on the home screen.
 */
export async function logFocusSession(
  userId:  string,
  minutes: number,
): Promise<void> {
  if (!userId || minutes <= 0) return;
  try {
    await supabase.rpc('log_focus_session', {
      user_id:          userId,
      duration_minutes: minutes,
    });
  } catch (e) {
    console.error('[XP] logFocusSession error:', e);
  }
}

/**
 * Load all XP + ring data for the home screen in one query.
 */
export async function loadUserXpState(userId: string): Promise<UserXpState | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(`
        total_xp, daily_xp_earned, daily_xp_goal,
        tasks_completed_today, tasks_total_today,
        habits_completed_today, habits_total_today,
        focus_minutes_today, focus_goal_minutes,
        current_streak, longest_streak, level
      `)
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;
    const d = data as any;

    return {
      totalXp:           d.total_xp            ?? 0,
      dailyXpEarned:     d.daily_xp_earned      ?? 0,
      dailyXpGoal:       d.daily_xp_goal        ?? 500,
      tasksToday:        d.tasks_completed_today ?? 0,
      tasksTotalToday:   d.tasks_total_today     ?? 5,
      habitsToday:       d.habits_completed_today ?? 0,
      habitsTotalToday:  d.habits_total_today    ?? 5,
      focusMinutesToday: d.focus_minutes_today   ?? 0,
      focusGoalMinutes:  d.focus_goal_minutes    ?? 120,
      currentStreak:     d.current_streak        ?? 0,
      longestStreak:     d.longest_streak        ?? 0,
      level:             d.level                 ?? 1,
    };
  } catch (e) {
    console.error('[XP] loadUserXpState error:', e);
    return null;
  }
}

// ─── Level helpers (L1–L10) ───────────────────────────────────────────────────

export interface LevelDef {
  level:    number;
  label:    string;
  emoji:    string;
  color:    string;
  minXp:    number;
  xpToNext: number | null;
}

export const LEVELS: LevelDef[] = [
  { level:1,  label:'Seedling',   emoji:'🌱', color:'#7E7E9A', minXp:0,    xpToNext:750  },
  { level:2,  label:'Sprout',     emoji:'🌿', color:'#3ECFA0', minXp:750,  xpToNext:800  },
  { level:3,  label:'Apprentice', emoji:'📚', color:'#54AEFF', minXp:1550, xpToNext:850  },
  { level:4,  label:'Focused',    emoji:'🎯', color:'#2ECEC8', minXp:2400, xpToNext:900  },
  { level:5,  label:'Dedicated',  emoji:'⚡', color:'#7B6EF6', minXp:3300, xpToNext:950  },
  { level:6,  label:'Scholar',    emoji:'🔭', color:'#A99FF8', minXp:4250, xpToNext:1000 },
  { level:7,  label:'Expert',     emoji:'🔮', color:'#FF6B9D', minXp:5250, xpToNext:1050 },
  { level:8,  label:'Virtuoso',   emoji:'🦅', color:'#F5C842', minXp:6300, xpToNext:1100 },
  { level:9,  label:'Sage',       emoji:'🌟', color:'#F26B6B', minXp:7400, xpToNext:1150 },
  { level:10, label:'Master',     emoji:'👑', color:'#F5C842', minXp:8550, xpToNext:null },
];

export function getLevelInfo(totalXp: number): LevelDef {
  return [...LEVELS].reverse().find(l => totalXp >= l.minXp) ?? LEVELS[0];
}

export function getNextLevel(totalXp: number): LevelDef | null {
  const current = getLevelInfo(totalXp);
  return LEVELS.find(l => l.level === current.level + 1) ?? null;
}

export function getLevelProgress(totalXp: number): number {
  const current = getLevelInfo(totalXp);
  const next    = getNextLevel(totalXp);
  if (!next) return 1;
  return (totalXp - current.minXp) / (next.minXp - current.minXp);
}

export function xpToNextLevel(totalXp: number): number {
  const next = getNextLevel(totalXp);
  return next ? next.minXp - totalXp : 0;
}

export const FOCUS_XP_PER_POMODORO  = 100;
export const FOCUS_POMODORO_MINUTES = 25;
