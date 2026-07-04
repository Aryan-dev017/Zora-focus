// ─────────────────────────────────────────────────────────────────────────────
// lib/localState.ts  —  Owl Reflection Engine
//
// Shared helpers that read from AsyncStorage (local-first task + streak data).
// Used by home.tsx, stats.tsx, and tasks.tsx to compute derived values WITHOUT
// going to Supabase for task/streak data.
//
// Also exports syncLocalStateToSupabase() which writes local counts back to
// user_profiles so that loadUserXpState() returns accurate values everywhere.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ─── Storage keys (must match tasks.tsx) ─────────────────────────────────────

export const TASKS_KEY  = 'tasks_data';
export const STREAK_KEY = 'streak_data';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocalTask {
  id:          string;
  section:     'daily' | 'weekly';
  name:        string;
  done:        boolean;
  done_at:     string | null;
  category:    string;
  urgency:     string;
  importance:  string;
  xp_txn_id:   string | null;
  [key: string]: any;
}

export interface StreakData {
  count:             number;
  lastCompletedDate: string | null; // "YYYY-MM-DD"
}

export interface LocalTaskSummary {
  daily:     LocalTask[];
  weekly:    LocalTask[];
  allTasks:  LocalTask[];
  // Today's daily tasks
  todayDone:     number;
  todayTotal:    number;
  todayDonePct:  number;          // 0–1
  // Top 3 undone daily tasks (for home screen)
  top3:          LocalTask[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0];

/** Read all tasks from AsyncStorage and compute derived summary values. */
export async function readLocalTasks(): Promise<LocalTaskSummary> {
  try {
    const raw = await AsyncStorage.getItem(TASKS_KEY);
    if (!raw) return empty();
    const all: LocalTask[] = JSON.parse(raw);
    const today  = todayStr();
    const daily  = all.filter(t => t.section === 'daily');
    const weekly = all.filter(t => t.section === 'weekly');

    // Daily tasks that were completed today (not an old day)
    const todayDailyDone = daily.filter(t => {
      if (!t.done || !t.done_at) return false;
      return t.done_at.split('T')[0] === today;
    });

    const todayDone  = todayDailyDone.length;
    const todayTotal = daily.length;

    // Top 3 for home screen: undone first, then done
    const top3 = [
      ...daily.filter(t => !t.done),
      ...daily.filter(t => t.done),
    ].slice(0, 3);

    return {
      daily, weekly, allTasks: all,
      todayDone, todayTotal,
      todayDonePct: todayTotal > 0 ? todayDone / todayTotal : 0,
      top3,
    };
  } catch {
    return empty();
  }
}

/** Read streak from AsyncStorage. Resets if missed 2+ days. */
export async function readLocalStreak(): Promise<StreakData> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    if (!raw) return { count: 0, lastCompletedDate: null };
    const s: StreakData = JSON.parse(raw);
    if (s.lastCompletedDate) {
      const last     = new Date(s.lastCompletedDate);
      const today    = new Date(todayStr());
      const diffDays = Math.round((today.getTime() - last.getTime()) / 86400000);
      if (diffDays >= 2) {
        const reset = { count: 0, lastCompletedDate: null };
        await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(reset));
        return reset;
      }
    }
    return s;
  } catch {
    return { count: 0, lastCompletedDate: null };
  }
}

/** Persist the combined daily + weekly task payload used across the app. */
export async function writeLocalTasks(
  daily: LocalTask[],
  weekly: LocalTask[],
): Promise<void> {
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify([...daily, ...weekly]));
}

/** Persist the local streak payload used by tasks/home/stats/focus. */
export async function writeLocalStreak(data: StreakData): Promise<void> {
  await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

/** Clear cached task + streak state on sign-out to avoid cross-account leakage. */
export async function clearLocalTaskAndStreakState(): Promise<void> {
  await AsyncStorage.multiRemove([TASKS_KEY, STREAK_KEY]);
}

// ─── Sync local counts → Supabase user_profiles ───────────────────────────────
//
// Called after every task toggle and after streak update.
// Writes tasks_completed_today, tasks_total_today, current_streak, longest_streak
// so that loadUserXpState() returns accurate values on home + stats screens.
//
// Fire-and-forget: always call without await so it never blocks UI.

export function syncLocalStateToSupabase(
  userId:     string,
  tasksInfo:  { todayDone: number; todayTotal: number },
  streakInfo: { count: number },
): void {
  supabase
    .from('user_profiles')
    .update({
      tasks_completed_today: tasksInfo.todayDone,
      tasks_total_today:     tasksInfo.todayTotal,
      current_streak:        streakInfo.count,
      // Longest streak: use DB MAX — only update if local is higher
    })
    .eq('id', userId)
    .then(({ error }) => {
      if (error) console.warn('[localState] sync failed:', error.message);
    });

  // Separately update longest_streak with MAX semantics
  supabase.rpc('update_longest_streak', {
    p_user_id: userId,
    p_streak:  streakInfo.count,
  }).then(() => {},() => {});
}

// ─── Private ──────────────────────────────────────────────────────────────────

function empty(): LocalTaskSummary {
  return {
    daily: [], weekly: [], allTasks: [],
    todayDone: 0, todayTotal: 0, todayDonePct: 0,
    top3: [],
  };
}
