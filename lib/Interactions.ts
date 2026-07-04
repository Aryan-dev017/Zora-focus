// ─────────────────────────────────────────────────────────────────────────────
// lib/interactions.ts  —  Owl Reflection Engine
//
// MICRO-INTERACTION SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
//
// Exports:
//   Hooks
//     useHaptics()           — typed haptic feedback (light/medium/heavy/success/error/streak)
//     usePressScale(config?) — returns handlers + animatedStyle for button press effect
//     useXpPopup()           — manages floating +XP animation state
//     useStreakAnimation()   — detects streak changes, fires correct celebration
//
//   Components
//     <XpBurst xp amount visible onDone/>   — floating +XP label that shoots up
//     <StreakBadge streak prevStreak/>       — streak chip with retained/new/broken states
//     <ParticleBurst visible color/>        — 8 dot burst from center on complete
//
//   Constants
//     SPRING_QUICK, SPRING_BOUNCY, SPRING_GENTLE  — reusable spring configs
//     HAPTIC_PATTERNS                              — named vibration sequences
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useEffect, useCallback, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withSequence, withDelay, withRepeat,
  Easing, cancelAnimation, runOnJS,
} from 'react-native-reanimated';

// expo-haptics — graceful fallback if not installed
let Haptics: any = null;
try {
  Haptics = require('expo-haptics');
} catch {}

// ─────────────────────────────────────────────────────────────────────────────
// SPRING PRESETS
// ─────────────────────────────────────────────────────────────────────────────

export const SPRING_QUICK   = { damping:18, stiffness:400, mass:0.8 } as const;
export const SPRING_BOUNCY  = { damping:8,  stiffness:500, mass:0.9 } as const;
export const SPRING_GENTLE  = { damping:20, stiffness:180, mass:1.0 } as const;
export const SPRING_SNAP    = { damping:14, stiffness:600, mass:0.7 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// HAPTIC PATTERNS
// Vibration fallback when expo-haptics not available
// ─────────────────────────────────────────────────────────────────────────────

export type HapticType =
  | 'light'       // tap, chip select
  | 'medium'      // button press, task toggle
  | 'heavy'       // important action
  | 'success'     // task complete, XP earned
  | 'error'       // validation fail, shake
  | 'streak_new'  // first streak day
  | 'streak_keep' // streak retained
  | 'xp_gained'   // XP milestone
  | 'level_up';   // level up

export const VIBRATION_FALLBACKS: Record<HapticType, number[]> = {
  light:       [0, 40],
  medium:      [0, 80],
  heavy:       [0, 120],
  success:     [0, 80, 60, 80],
  error:       [0, 60, 40, 60, 40, 60],
  streak_new:  [0, 60, 40, 100, 40, 160],
  streak_keep: [0, 60, 50, 60],
  xp_gained:   [0, 50, 30, 80],
  level_up:    [0, 80, 60, 120, 60, 200],
};

// ─────────────────────────────────────────────────────────────────────────────
// useHaptics — typed haptic feedback with Vibration fallback
// ─────────────────────────────────────────────────────────────────────────────

export function useHaptics() {
  const trigger = useCallback((type: HapticType) => {
    if (Platform.OS === 'web') return;

    if (Haptics) {
      try {
        switch (type) {
          case 'light':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
          case 'medium':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
          case 'heavy':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
          case 'success':
          case 'streak_keep':
          case 'xp_gained':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
          case 'error':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
          case 'streak_new':
          case 'level_up':
            // Double success pulse for bigger moments
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setTimeout(() =>
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 200);
            break;
        }
        return;
      } catch {}
    }
    // Vibration fallback
    Vibration.vibrate(VIBRATION_FALLBACKS[type] ?? [0, 80]);
  }, []);

  return { trigger };
}

// ─────────────────────────────────────────────────────────────────────────────
// usePressScale — reusable button press scale effect
//
// Usage:
//   const { pressHandlers, animatedStyle } = usePressScale();
//   <Animated.View style={animatedStyle}>
//     <TouchableOpacity {...pressHandlers}>...</TouchableOpacity>
//   </Animated.View>
// ─────────────────────────────────────────────────────────────────────────────

interface PressScaleConfig {
  scale?:   number;  // how far to compress (default 0.96)
  spring?:  typeof SPRING_QUICK;
  haptic?:  HapticType | null;  // null = no haptic
}

export function usePressScale(config: PressScaleConfig = {}) {
  const {
    scale  = 0.96,
    spring = SPRING_QUICK,
    haptic = 'light',
  } = config;

  const sc      = useSharedValue(1);
  const haptics = useHaptics();

  const onPressIn = useCallback(() => {
    sc.value = withSpring(scale, spring);
    if (haptic) haptics.trigger(haptic);
  }, [scale, haptic]);

  const onPressOut = useCallback(() => {
    sc.value = withSpring(1, spring);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sc.value }],
  }));

  return { pressHandlers: { onPressIn, onPressOut }, animatedStyle };
}

// ─────────────────────────────────────────────────────────────────────────────
// useXpPopup — manages XP float animation state
//
// Returns:
//   showXp(amount)  — trigger the popup with an XP value
//   xpAmount        — current displayed amount
//   visible         — whether popup is visible
// ─────────────────────────────────────────────────────────────────────────────

export function useXpPopup() {
  const [xpAmount, setXpAmount]  = useState(0);
  const [visible,  setVisible]   = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showXp = useCallback((amount: number) => {
    if (timer.current) clearTimeout(timer.current);
    setXpAmount(amount);
    setVisible(true);
    timer.current = setTimeout(() => setVisible(false), 2200);
  }, []);

  return { showXp, xpAmount, visible };
}

// ─────────────────────────────────────────────────────────────────────────────
// useStreakAnimation — detects streak changes and fires correct haptic/animation
//
// Returns:
//   streakEvent     — 'none' | 'new' | 'keep' | 'broken'
//   clearEvent      — call after showing the animation
// ─────────────────────────────────────────────────────────────────────────────

export type StreakEvent = 'none' | 'new' | 'keep' | 'broken';

export function useStreakAnimation(streak: number) {
  const haptics  = useHaptics();
  const prevRef  = useRef(streak);
  const [event, setEvent] = useState<StreakEvent>('none');

  useEffect(() => {
    const prev = prevRef.current;
    if (streak === prev) return;

    if (streak === 0 && prev > 0) {
      // Streak broken
      setEvent('broken');
      haptics.trigger('error');
    } else if (streak === 1 && prev === 0) {
      // First ever streak day — big celebration
      setEvent('new');
      haptics.trigger('streak_new');
    } else if (streak > prev) {
      // Streak extended
      setEvent('keep');
      haptics.trigger('streak_keep');
    }

    prevRef.current = streak;
  }, [streak]);

  const clearEvent = useCallback(() => setEvent('none'), []);
  return { streakEvent: event, clearEvent };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
// Note: React components are in components/MicroInteractions.tsx
// to avoid mixing hooks-only files with JSX.
// Import from there:
//   import { XpBurst, StreakBadge, ParticleBurst, PressableScale } from '@/components/MicroInteractions';
// ─────────────────────────────────────────────────────────────────────────────