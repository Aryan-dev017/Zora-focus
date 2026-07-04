// ─────────────────────────────────────────────────────────────────────────────
// components/Mascot.tsx  —  Owl Reflection Engine
//
// MASCOT SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
// States:
//   idle      🦉  Gentle breathing loop. Default state everywhere.
//   focus     🎧  Headphones. Shown during timer sessions.
//   success   🎉  Bounce + wiggle. Task complete / XP earned.
//   sad       😴  Slow droop animation. Streak broken / no tasks done.
//   reward    👍  Quick thumbs-up spring. XP milestone.
//
// Usage:
//   import { Mascot, MascotToast } from '@/components/Mascot';
//
//   // Floating (home screen, bottom-right)
//   <Mascot state="idle" size={80} floating />
//
//   // Full (focus screen, center-top)
//   <Mascot state="focus" size={80} />
//
//   // Contextual toast (tasks, stats — slides up briefly on event)
//   <MascotToast visible={show} emoji="🎉" title="Task done!" sub="+42 XP" />
//
// VIDEO SETUP:
//   Place MP4 files at:
//     assets/mascot/owl_idle.mp4
//     assets/mascot/owl_focus.mp4     (optional — falls back to 🎧)
//     assets/mascot/owl_success.mp4   (optional — falls back to 🎉)
//     assets/mascot/owl_sad.mp4       (optional — falls back to 😴)
//     assets/mascot/owl_reward.mp4    (optional — falls back to 👍)
//
//   Only owl_idle.mp4 is required. All others fall back to emoji.
//   Install expo-video:  npx expo install expo-video
//
// PERFORMANCE:
//   • Videos are loaded once and reused (no unmount/remount)
//   • State changes only swap the Animated wrapper style (no video reload)
//   • Container animations run on the UI thread (useAnimatedStyle)
//   • Emoji fallback has zero overhead when expo-video isn't installed
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withRepeat, withSequence, withDelay,
  Easing, cancelAnimation, FadeInUp, FadeOut,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

// ─── expo-video (graceful fallback if not installed) ──────────────────────────

let useVideoPlayer: any = null;
let VideoView:     any = null;
try {
  const v = require('expo-video');
  useVideoPlayer = v.useVideoPlayer;
  VideoView      = v.VideoView;
} catch {}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MascotState = 'idle' | 'focus' | 'success' | 'sad' | 'reward';

interface MascotProps {
  state:    MascotState;
  size?:    number;      // default 80
  floating?: boolean;   // positions absolute bottom-right (for home screen)
  onPress?: () => void;
}

// ─── State → emoji / gradient / video ────────────────────────────────────────

const STATE_META: Record<MascotState, {
  emoji:    string;
  gradA:    string;
  gradB:    string;
  videoFile: string | null;  // require() path or null
}> = {
  idle:    { emoji:'🦉', gradA:'rgba(123,110,246,0.22)', gradB:'rgba(123,110,246,0.06)', videoFile:'owl_idle'    },
  focus:   { emoji:'🎧', gradA:'rgba(123,110,246,0.30)', gradB:'rgba(123,110,246,0.10)', videoFile:'owl_focus'   },
  success: { emoji:'🎉', gradA:'rgba(245,200,66,0.30)',  gradB:'rgba(245,200,66,0.08)',  videoFile:'owl_success' },
  sad:     { emoji:'😴', gradA:'rgba(126,126,154,0.22)', gradB:'rgba(7,7,15,0.06)',      videoFile:'owl_sad'     },
  reward:  { emoji:'👍', gradA:'rgba(62,207,160,0.30)',  gradB:'rgba(62,207,160,0.08)',  videoFile:'owl_reward'  },
};

// Try to load video asset — returns require() result or null
function tryLoadAsset(name: string): any {
  try {
    const map: Record<string, any> = {
      owl_idle:    require('../assets/mascot/owl_idle.mp4'),
      owl_focus:   require('../assets/mascot/owl_focus.mp4'),
      owl_success: require('../assets/mascot/owl_success.mp4'),
      owl_sad:     require('../assets/mascot/owl_sad.mp4'),
      owl_reward:  require('../assets/mascot/owl_reward.mp4'),
    };
    return map[name] ?? null;
  } catch {
    return null;
  }
}

// ─── Video sub-component (only mounted when expo-video is available) ──────────
// Memoized so it never re-renders when parent state changes.

const MascotVideo = memo(({ asset, size }: { asset: any; size: number }) => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const player = useVideoPlayer(asset, (p: any) => {
    p.loop  = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width:size, height:size }}
      contentFit="contain"
      nativeControls={false}
    />
  );
});

// ─── Mascot ───────────────────────────────────────────────────────────────────

export const Mascot = memo(({ state, size = 80, floating = false, onPress }: MascotProps) => {
  const meta   = STATE_META[state];
  const asset  = tryLoadAsset(meta.videoFile ?? '');
  const canPlay= !!useVideoPlayer && !!VideoView && !!asset;

  // Shared animation values
  const scale  = useSharedValue(1);
  const rotate = useSharedValue(0);
  const transY = useSharedValue(0);

  useEffect(() => {
    // Reset first
    cancelAnimation(scale); cancelAnimation(rotate); cancelAnimation(transY);
    scale.value  = withTiming(1, { duration:200 });
    rotate.value = withTiming(0, { duration:200 });
    transY.value = withTiming(0, { duration:200 });

    switch (state) {
      case 'idle':
        // Gentle breathing: scale 1 → 1.06 → 1 over 4s
        scale.value = withRepeat(
          withSequence(
            withTiming(1.06, { duration:2000, easing:Easing.inOut(Easing.sin) }),
            withTiming(1,    { duration:2000, easing:Easing.inOut(Easing.sin) }),
          ), -1, true
        );
        break;

      case 'focus':
        // Slower, deeper breathe (in the zone)
        scale.value = withRepeat(
          withSequence(
            withTiming(1.04, { duration:3000, easing:Easing.inOut(Easing.sin) }),
            withTiming(1,    { duration:3000, easing:Easing.inOut(Easing.sin) }),
          ), -1, true
        );
        break;

      case 'success':
        // Bounce + wiggle then settle
        scale.value = withSequence(
          withSpring(1.25, { damping:5,  stiffness:500 }),
          withSpring(0.92, { damping:8,  stiffness:400 }),
          withSpring(1.12, { damping:8,  stiffness:400 }),
          withSpring(1,    { damping:12, stiffness:300 }),
        );
        rotate.value = withSequence(
          withTiming(12,  { duration:80 }),
          withTiming(-12, { duration:80 }),
          withTiming(8,   { duration:70 }),
          withTiming(-8,  { duration:70 }),
          withTiming(0,   { duration:80 }),
        );
        break;

      case 'sad':
        // Slow droop downward
        transY.value = withSequence(
          withTiming(6, { duration:1200, easing:Easing.inOut(Easing.quad) }),
          withTiming(2, { duration:1200, easing:Easing.inOut(Easing.quad) }),
        );
        scale.value = withTiming(0.93, { duration:800, easing:Easing.in(Easing.quad) });
        break;

      case 'reward':
        // Quick thumbs-up spring
        scale.value = withSequence(
          withSpring(1.2, { damping:6, stiffness:600 }),
          withSpring(1,   { damping:12 }),
        );
        transY.value = withSequence(
          withTiming(-8, { duration:200, easing:Easing.out(Easing.cubic) }),
          withTiming(0,  { duration:300, easing:Easing.bounce }),
        );
        break;
    }
  }, [state]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale:      scale.value  },
      { rotate:     `${rotate.value}deg` },
      { translateY: transY.value },
    ],
  }));

  const inner = (
    <Animated.View style={[containerStyle, floating && S.floatingInner]}>
      <LinearGradient
        colors={[meta.gradA, meta.gradB]}
        style={[S.bg, { width:size, height:size, borderRadius:size/2 }]}
      >
        {canPlay
          ? <MascotVideo asset={asset} size={size * 0.9}/>
          : <Text style={{ fontSize: size * 0.52 }}>{meta.emoji}</Text>
        }
      </LinearGradient>
    </Animated.View>
  );

  if (floating) {
    return (
      <View style={S.floatingWrap} pointerEvents="box-none">
        {onPress
          ? <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{inner}</TouchableOpacity>
          : inner
        }
      </View>
    );
  }

  return onPress
    ? <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{inner}</TouchableOpacity>
    : inner;
});

// ─── MascotToast ──────────────────────────────────────────────────────────────
// Contextual pop-up that slides up from bottom on completion/milestone events.
// Renders nothing when not visible (no layout cost).

interface MascotToastProps {
  visible: boolean;
  emoji:   string;
  title:   string;
  sub:     string;
}

export const MascotToast = memo(({ visible, emoji, title, sub }: MascotToastProps) => {
  const ty  = useSharedValue(120);
  const op  = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      ty.value = withSpring(0, { damping:18, stiffness:280 });
      op.value = withTiming(1, { duration:200 });
    } else {
      ty.value = withTiming(120, { duration:280, easing:Easing.in(Easing.quad) });
      op.value = withTiming(0,   { duration:220 });
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity:   op.value,
  }));

  return (
    <Animated.View style={[S.toast, style]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(123,110,246,0.22)','rgba(123,110,246,0.10)']}
        start={{x:0,y:0}} end={{x:1,y:1}}
        style={S.toastInner}
      >
        <Text style={S.toastEmoji}>{emoji}</Text>
        <View style={{ flex:1 }}>
          <Text style={S.toastTitle}>{title}</Text>
          <Text style={S.toastSub}>{sub}</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
});

// ─── MilestoneReaction ────────────────────────────────────────────────────────
// Inline mascot that pops up briefly when a milestone is hit (e.g. level up,
// all tasks done). Self-dismisses after `duration` ms.

interface MilestoneProps {
  visible:  boolean;
  message:  string;
  size?:    number;
  duration?: number;
}

export function MilestoneReaction({ visible, message, size = 48, duration = 2800 }: MilestoneProps) {
  const sc  = useSharedValue(0);
  const op  = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      sc.value = withSequence(
        withSpring(1.15, { damping:6, stiffness:500 }),
        withSpring(1,    { damping:12 }),
      );
      op.value = withTiming(1, { duration:200 });
      // Auto-hide
      const t = setTimeout(() => {
        op.value = withTiming(0, { duration:300 });
        sc.value = withTiming(0.8, { duration:300 });
      }, duration - 300);
      return () => clearTimeout(t);
    } else {
      sc.value = 0; op.value = 0;
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    opacity:   op.value,
    transform: [{ scale: sc.value }],
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[S.milestoneWrap, style]} pointerEvents="none">
      <Mascot state="success" size={size}/>
      <Text style={S.milestoneText}>{message}</Text>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  bg: {
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },

  // Floating (home screen)
  floatingWrap: {
    position: 'absolute',
    bottom:   90,
    right:    16,
    zIndex:   50,
  },
  floatingInner: {
    shadowColor:   '#7B6EF6',
    shadowOffset:  { width:0, height:6 },
    shadowOpacity: 0.40,
    shadowRadius:  14,
    elevation:     12,
  },

  // Toast
  toast: {
    position:      'absolute',
    bottom:        96,
    left:          16,
    right:         16,
    zIndex:        200,
  },
  toastInner: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
    borderRadius:  22,
    padding:       16,
    borderWidth:   1.5,
    borderColor:   'rgba(123,110,246,0.45)',
    shadowColor:   '#7B6EF6',
    shadowOffset:  { width:0, height:8 },
    shadowOpacity: 0.35,
    shadowRadius:  16,
    elevation:     12,
  },
  toastEmoji: { fontSize:36, flexShrink:0 },
  toastTitle: { fontFamily:'Fraunces_900Black',    fontSize:17, color:'#EEEDF8', letterSpacing:-0.3 },
  toastSub:   { fontFamily:'DM_Sans_500Medium',    fontSize:12, color:'#A99FF8', marginTop:2 },

  // Milestone inline reaction
  milestoneWrap: { alignItems:'center', gap:6, paddingVertical:8 },
  milestoneText: {
    fontFamily: 'Fraunces_900Black',
    fontSize: 14,
    color: 'EEEDF8',
    textAlign: 'center',
  },
});
