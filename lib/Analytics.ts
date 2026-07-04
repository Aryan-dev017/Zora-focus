import { Platform } from 'react-native';
import { ENV } from './env';

let PostHog: any = null;
let posthogClient: any = null;

try {
  PostHog = require('posthog-react-native').PostHog;
} catch {}

let Sentry: any = null;

try {
  Sentry = require('@sentry/react-native');
} catch {}

const POSTHOG_API_KEY = ENV.posthogApiKey;
const POSTHOG_HOST = ENV.posthogHost;

export function initAnalytics(): void {
  if (!PostHog || !POSTHOG_API_KEY) return;

  try {
    posthogClient = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      captureAppLifecycle: true,
      captureDeepLinks: true,
      sessionReplay: false,
    });
    console.log('[PostHog] Initialized');
  } catch (e) {
    console.warn('[PostHog] Init failed:', e);
  }
}

export function identify(
  userId: string,
  traits?: {
    level?: number;
    streak?: number;
    total_xp?: number;
    isPro?: boolean;
    display_name?: string;
    username?: string;
    [key: string]: any;
  }
): void {
  try {
    posthogClient?.identify(userId, traits);
  } catch {}

  try {
    Sentry?.setUser({ id: userId, ...traits });
  } catch {}
}

export function track(
  event: AnalyticsEvent,
  properties?: Record<string, any>
): void {
  try {
    posthogClient?.capture(event, {
      platform: Platform.OS,
      ...properties,
    });
  } catch {}
}

export function screen(screenName: string, properties?: Record<string, any>): void {
  try {
    posthogClient?.screen(screenName, properties);
  } catch {}
}

export function resetAnalytics(): void {
  try {
    posthogClient?.reset();
    Sentry?.setUser(null);
  } catch {}
}

export function captureError(error: Error, context?: Record<string, any>): void {
  try {
    if (context) {
      Sentry?.withScope((scope: any) => {
        Object.entries(context).forEach(([key, value]) => scope.setExtra(key, value));
        Sentry?.captureException(error);
      });
    } else {
      Sentry?.captureException(error);
    }
  } catch {}

  console.error('[Error]', error.message, context);
}

export type AnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'user_signed_in'
  | 'user_signed_out'
  | 'user_registered'
  | 'task_added'
  | 'task_completed'
  | 'task_uncompleted'
  | 'task_deleted'
  | 'daily_goal_reached'
  | 'focus_session_started'
  | 'focus_session_completed'
  | 'focus_session_cancelled'
  | 'focus_mode_changed'
  | 'music_track_selected'
  | 'music_track_unlocked'
  | 'music_ad_watched'
  | 'music_paused'
  | 'music_resumed'
  | 'xp_earned'
  | 'level_up'
  | 'streak_started'
  | 'streak_extended'
  | 'streak_broken'
  | 'paywall_opened'
  | 'paywall_dismissed'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_failed'
  | 'restore_completed'
  | 'profile_updated'
  | 'username_set'
  | 'avatar_changed';
