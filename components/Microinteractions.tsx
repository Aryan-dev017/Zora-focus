// ─────────────────────────────────────────────────────────────────────────────
// components/MicroInteractions.tsx  —  Owl Reflection Engine
//
// MICRO-INTERACTION COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
//
// <PressableScale>      Drop-in replacement for TouchableOpacity with spring press.
// <XpBurst>             Floating "+XP ✨" that shoots up and fades — use over any card.
// <StreakBadge>         Streak chip that plays new/retain/broken animation inline.
// <ParticleBurst>       8 dots explode outward from center on task/focus complete.
// <CompletionFlash>     Full-screen white flash (50ms) on session complete.
//
// WHERE TO USE EACH:
//   PressableScale      Every button, chip, card tap across all screens.
//   XpBurst             Tasks (above task card), Focus (above timer ring), Profile (above hero).
//   StreakBadge         Tasks header streak chip, Home streak chip, Profile streak card.
//   ParticleBurst       Tasks (on task complete), Focus (on session complete).
//   CompletionFlash     Focus screen only — on handleComplete().
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, memo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  type TouchableOpacityProps, type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withSequence, withDelay, withRepeat,
  FadeIn, FadeOut, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  usePressScale, SPRING_QUICK, SPRING_BOUNCY,
  type HapticType, type StreakEvent,
} from '@/lib/Interactions';

// ─────────────────────────────────────────────────────────────────────────────
// PressableScale — drop-in for TouchableOpacity with spring press effect
//
// Usage:
//   <PressableScale onPress={...} haptic="medium" scaleDown={0.95}>
//     <View style={styles.button}>...</View>
//   </PressableScale>
// ─────────────────────────────────────────────────────────────────────────────

interface PressableScaleProps extends TouchableOpacityProps {
  scaleDown?: number;
  haptic?:    HapticType | null;
  style?:     ViewStyle | ViewStyle[];
}

export const PressableScale = memo(({
  children, scaleDown = 0.96, haptic = 'light', style, ...rest
}: PressableScaleProps) => {
  const { pressHandlers, animatedStyle } = usePressScale({ scale: scaleDown, haptic });

  return (
    <Animated.View style={[animatedStyle, style]}>
      <TouchableOpacity
        activeOpacity={1}
        {...pressHandlers}
        {...rest}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// XpBurst — floating "+XX XP ✨" that animates up and fades out
//
// Renders as absolute-positioned, pointerEvents="none".
// Place inside a `position:'relative'` parent (the card or ring container).
//
// Usage:
//   <View style={{ position:'relative' }}>
//     <YourCard/>
//     <XpBurst xp={xpBreak.total} visible={justCompleted} color="#F5C842"/>
//   </View>
// ─────────────────────────────────────────────────────────────────────────────

interface XpBurstProps {
  xp:      number;
  visible: boolean;
  color?:  string;
  large?:  boolean;  // larger font for focus screen
}

export const XpBurst = memo(({ xp, visible, color = '#F5C842', large = false }: XpBurstProps) => {
  const y  = useSharedValue(0);
  const op = useSharedValue(0);
  const sc = useSharedValue(0.5);

  useEffect(() => {
    if (visible) {
      // Pop in from below, float up, fade
      y.value  = 0;
      op.value = 0;
      sc.value = 0.5;

      sc.value = withSpring(1, SPRING_BOUNCY);
      op.value = withSequence(
        withTiming(1, { duration:140 }),
        withDelay(680, withTiming(0, { duration:380 })),
      );
      y.value  = withTiming(-56, { duration:1100, easing:Easing.out(Easing.cubic) });
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    opacity:   op.value,
    transform: [{ translateY: y.value }, { scale: sc.value }],
  }));

  return (
    <Animated.View style={[S.xpBurstWrap, style]} pointerEvents="none">
      <View style={[S.xpBurstPill, { borderColor: color + '55', backgroundColor: color + '18' }]}>
        <Text style={[S.xpBurstTxt, { color }, large && S.xpBurstLarge]}>
          +{xp} XP ✨
        </Text>
      </View>
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// StreakBadge — streak chip with three animation states:
//   'new'    → scale bounce + gold glow pulse (first streak day)
//   'keep'   → brief green flash + scale up (streak extended)
//   'broken' → shake + grey fade (streak broken)
//
// Usage (in Tasks header):
//   <StreakBadge streak={streak} streakEvent={streakEvent} onAnimDone={clearEvent}/>
// ─────────────────────────────────────────────────────────────────────────────

interface StreakBadgeProps {
  streak:       number;
  streakEvent:  StreakEvent;
  onAnimDone?:  () => void;
}

export const StreakBadge = memo(({ streak, streakEvent, onAnimDone }: StreakBadgeProps) => {
  const sc      = useSharedValue(1);
  const shakeX  = useSharedValue(0);
  const glowOp  = useSharedValue(0);
  const bgColor = useSharedValue(0);  // 0 = normal, 1 = flash

  const [localColor, setLocalColor] = useState('#F5C842');

  useEffect(() => {
    if (streakEvent === 'none') return;

    if (streakEvent === 'new') {
      setLocalColor('#F5C842');
      sc.value    = withSequence(
        withSpring(1.3, SPRING_BOUNCY),
        withSpring(0.9, { damping:10 }),
        withSpring(1,   SPRING_QUICK),
      );
      glowOp.value = withSequence(
        withTiming(1, { duration:200 }),
        withRepeat(
          withSequence(
            withTiming(0.2, { duration:400 }),
            withTiming(1,   { duration:400 }),
          ), 3, true
        ),
        withTiming(0, { duration:300 }),
      );
    }

    if (streakEvent === 'keep') {
      setLocalColor('#3ECFA0');
      sc.value    = withSequence(
        withSpring(1.18, SPRING_BOUNCY),
        withSpring(1,    SPRING_QUICK),
      );
      // Restore color after pulse
      setTimeout(() => setLocalColor('#F5C842'), 600);
    }

    if (streakEvent === 'broken') {
      setLocalColor('#7E7E9A');
      shakeX.value = withSequence(
        withTiming(-8,  { duration:60 }),
        withTiming(8,   { duration:60 }),
        withTiming(-6,  { duration:55 }),
        withTiming(6,   { duration:55 }),
        withTiming(-3,  { duration:50 }),
        withTiming(0,   { duration:50 }),
      );
      setTimeout(() => setLocalColor('#7E7E9A'), 400);
    }

    const t = setTimeout(() => {
      onAnimDone?.();
    }, 800);
    return () => clearTimeout(t);
  }, [streakEvent]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale:      sc.value },
      { translateX: shakeX.value },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOp.value,
  }));

  if (streak === 0) return null;

  return (
    <Animated.View style={[S.streakBadgeWrap, containerStyle]}>
      {/* Glow ring — visible on new/keep */}
      <Animated.View style={[
        S.streakGlow,
        { borderColor: localColor },
        glowStyle,
      ]}/>

      <View style={[S.streakBadge, { borderColor: localColor + '44', backgroundColor: localColor + '14' }]}>
        <Text style={S.streakFire}>🔥</Text>
        <Text style={[S.streakCount, { color: localColor }]}>{streak}d</Text>
      </View>
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ParticleBurst — 8 dots explode outward from center
// Place inside `position:'relative'` parent, aligned to center.
//
// Usage:
//   <View style={{ position:'relative', alignItems:'center', justifyContent:'center' }}>
//     <YourContent/>
//     <ParticleBurst visible={justCompleted} color="#7B6EF6"/>
//   </View>
// ─────────────────────────────────────────────────────────────────────────────

interface ParticleBurstProps {
  visible: boolean;
  color?:  string;
  count?:  number;
  radius?: number;
}

const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]; // degrees

export const ParticleBurst = memo(({ visible, color = '#7B6EF6', count = 8, radius = 50 }: ParticleBurstProps) => {
  const particles = ANGLES.slice(0, count).map((angle) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const dist = useSharedValue(0);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const op   = useSharedValue(0);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const sc   = useSharedValue(1);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (visible) {
        dist.value = 0; op.value = 0; sc.value = 1;
        dist.value = withTiming(radius, { duration:500, easing:Easing.out(Easing.cubic) });
        op.value   = withSequence(
          withTiming(1, { duration:80 }),
          withDelay(200, withTiming(0, { duration:280 })),
        );
        sc.value   = withSequence(
          withSpring(1.4, SPRING_BOUNCY),
          withTiming(0.5, { duration:300 }),
        );
      } else {
        dist.value = 0; op.value = 0;
      }
    }, [visible]);

    const rad = (angle * Math.PI) / 180;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const style = useAnimatedStyle(() => ({
      opacity:   op.value,
      transform: [
        { translateX: Math.cos(rad) * dist.value },
        { translateY: Math.sin(rad) * dist.value },
        { scale:      sc.value },
      ],
    }));

    return { style, angle };
  });

  if (!visible) return null;

  return (
    <View style={S.particleWrap} pointerEvents="none">
      {particles.map(({ style }, i) => (
        <Animated.View
          key={i}
          style={[S.particle, { backgroundColor: color }, style]}
        />
      ))}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// CompletionFlash — quick white flash overlay for session complete
// Self-dismisses after 120ms. No props needed beyond visible.
//
// Usage:
//   <CompletionFlash visible={sessionJustCompleted}/>
// ─────────────────────────────────────────────────────────────────────────────

export const CompletionFlash = memo(({ visible }: { visible: boolean }) => {
  const op = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      op.value = withSequence(
        withTiming(0.28, { duration:60 }),
        withTiming(0,    { duration:180 }),
      );
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({ opacity: op.value }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, S.flashOverlay, style]}
      pointerEvents="none"
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// StreakFirstDayToast — full celebration for earning the very first streak day
// Shows mascot success + message + particles. Only shown when streak goes 0→1.
// ─────────────────────────────────────────────────────────────────────────────

import { Mascot } from '@/components/Mascot';

interface StreakFirstDayProps {
  visible:  boolean;
  onDone?:  () => void;
}

export const StreakFirstDayToast = memo(({ visible, onDone }: StreakFirstDayProps) => {
  const ty = useSharedValue(120);
  const op = useSharedValue(0);
  const sc = useSharedValue(0.8);

  useEffect(() => {
    if (visible) {
      ty.value = withSpring(0,   { damping:16, stiffness:280 });
      op.value = withTiming(1,   { duration:220 });
      sc.value = withSpring(1,   SPRING_BOUNCY);
      const t  = setTimeout(() => {
        op.value = withTiming(0, { duration:300 });
        ty.value = withTiming(120, { duration:280 });
        setTimeout(() => onDone?.(), 300);
      }, 3200);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    opacity:   op.value,
    transform: [{ translateY: ty.value }, { scale: sc.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[S.firstDayWrap, style]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(245,200,66,0.22)','rgba(245,200,66,0.08)']}
        start={{x:0,y:0}} end={{x:1,y:1}}
        style={S.firstDayCard}
      >
        <Mascot state="success" size={52}/>
        <View style={{ flex:1 }}>
          <Text style={S.firstDayTitle}>🔥 Streak Started!</Text>
          <Text style={S.firstDaySub}>Your 1-day streak is now live. Come back tomorrow to keep it!</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // XP Burst
  xpBurstWrap: {
    position:      'absolute',
    top:           0,
    left:          0,
    right:         0,
    alignItems:    'center',
    zIndex:        100,
  },
  xpBurstPill: {
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderRadius:      20,
    borderWidth:       1.5,
  },
  xpBurstTxt:  { fontFamily:'Fraunces_900Black',   fontSize:16, letterSpacing:-0.3 },
  xpBurstLarge:{ fontSize:22 },

  // Streak badge
  streakBadgeWrap: { position:'relative', alignItems:'center', justifyContent:'center' },
  streakGlow: {
    position:     'absolute',
    width:        '130%',
    aspectRatio:  1,
    borderRadius: 50,
    borderWidth:  2,
    opacity:      0,
  },
  streakBadge: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            5,
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderRadius:   20,
    borderWidth:    1.5,
  },
  streakFire:  { fontSize:14 },
  streakCount: { fontFamily:'DM_Sans_700Bold', fontSize:13 },

  // Particle burst
  particleWrap: {
    position:       'absolute',
    alignItems:     'center',
    justifyContent: 'center',
    width:          0,
    height:         0,
    zIndex:         50,
  },
  particle: {
    position:     'absolute',
    width:        8,
    height:       8,
    borderRadius: 4,
  },

  // Completion flash
  flashOverlay: { backgroundColor:'#FFFFFF' },

  // First day toast
  firstDayWrap: {
    position:      'absolute',
    bottom:        96,
    left:          16,
    right:         16,
    zIndex:        200,
  },
  firstDayCard: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            16,
    borderRadius:   24,
    padding:        18,
    borderWidth:    1.5,
    borderColor:    'rgba(245,200,66,0.55)',
    shadowColor:    '#F5C842',
    shadowOffset:   { width:0, height:8 },
    shadowOpacity:  0.35,
    shadowRadius:   16,
    elevation:      12,
  },
  firstDayTitle: { fontFamily:'Fraunces_900Black', fontSize:17, color:'#EEEDF8', letterSpacing:-0.3 },
  firstDaySub:   { fontFamily:'DM_Sans_400Regular', fontSize:12, color:'rgba(238,237,248,0.75)', marginTop:4 },
});