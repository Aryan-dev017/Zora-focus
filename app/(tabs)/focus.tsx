// ─────────────────────────────────────────────────────────────────────────────
// app/(tabs)/focus.tsx  —  Owl Reflection Engine
//
// IMMERSIVE FOCUS ZONE — one screen, companion-mode
//
// Layout (top → bottom):
//   1. Mascot center-top (MP4 idle → 🎧 focus → 🎉 celebrate)
//   2. BIG SVG countdown ring + MM:SS
//   3. Selected task name + mode label under timer
//   4. Horizontal task switcher (swipe to pick which task to focus on)
//   5. Mode chips (Focus / Break / Long) + duration pills
//   6. Play/Pause + reset controls
//   7. Music strip at bottom: horizontal scrollable track chips + volume slider
//
// BEHAVIORS:
//   • Start → music fades in (0 → volume), background dims, mascot → 🎧
//   • Complete → task auto-ticked in Supabase, XP popup, mascot → 🎉, music fades out
//   • Volume slider controls active sound in real time
//   • AdMob rewarded ad shown before free track's first play (per session)
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Platform, Vibration, Alert, StatusBar,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withRepeat, withSequence,
  FadeIn, FadeInUp, FadeOut,
  Easing, cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle, Defs, LinearGradient as SvgGradient, Stop,
} from 'react-native-svg';
import { Audio } from 'expo-av';
import { useRevenueCat } from '../context/RevenueCatProvider';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  awardXP, logFocusSession,
  FOCUS_XP_PER_POMODORO, FOCUS_POMODORO_MINUTES,
} from '@/lib/Xp';
import {
  readLocalTasks,
  readLocalStreak,
  syncLocalStateToSupabase,
  writeLocalTasks,
  writeLocalStreak,
} from '@/lib/localState';
import { track as trackEvent } from '@/lib/Analytics';
import { XpCelebrationModal } from '@/components/XpCelebrationModal';

// ─── expo-video for mascot MP4 ────────────────────────────────────────────────

let useVideoPlayer: any = null;
let VideoView: any = null;
try {
  const v = require('expo-video');
  useVideoPlayer = v.useVideoPlayer;
  VideoView      = v.VideoView;
} catch {}

// ─── AdMob (platform-specific: native → real AdMob, web → safe no-op) ────────
//   showInterstitialAd() — shown after focus session complete (non-blocking, fire-and-forget)
//   showRewardedAd()     — shown before free music track plays
//                          tracks require 2 rewarded-ad watches to unlock per session
import { showInterstitialAd, showRewardedAd } from '@/lib/adMob';

// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  bg:      '#07070F',
  bgDim:   '#020207',   // dimmed background during session
  card:    '#111122',
  card2:   '#181828',
  accent:  '#7B6EF6',
  accentS: '#A89FF9',
  accentD: 'rgba(123,110,246,0.13)',
  gold:    '#F5C842',
  goldD:   'rgba(245,200,66,0.12)',
  green:   '#3ECFA0',
  greenD:  'rgba(62,207,160,0.12)',
  blue:    '#54AEFF',
  blueD:   'rgba(84,174,255,0.12)',
  teal:    '#2ECEC8',
  tealD:   'rgba(46,206,200,0.12)',
  txt:     '#EEEDF8',
  txt2:    '#7E7E9A',
  txt3:    '#3A3A54',
  border:  'rgba(255,255,255,0.055)',
  borderA: 'rgba(123,110,246,0.35)',
};

const { width: W, height: H } = Dimensions.get('window');

// ─── Data ─────────────────────────────────────────────────────────────────────

type TimerMode = 'focus' | 'break' | 'long';

interface TrackItem {
  id: string; emoji: string; name: string;
  subtitle: string; badge: string;
  category: 'binaural' | 'nature';
  color: string; colorDim: string;
  free: boolean; url: string;
}

interface FocusTask {
  id: string;
  name: string;
  done: boolean;
  category: string;
  xp_txn_id?: string | null;
  done_at?: string | null;
  [key: string]: any;
}

const ALL_TRACKS: TrackItem[] = [
  // FREE (ad-gated)
  { id:'n1', emoji:'🌧️', name:'Rain',       subtitle:'Steady shower',    badge:'∞',    category:'nature',  color:T.blue,    colorDim:T.blueD,
    free:true, url:'https://ilsyvemhdpdizdasubub.supabase.co/storage/v1/object/public/Music/dragon-studio-gentle-rain-07-437321.mp3' },
  { id:'n3', emoji:'🌊', name:'Ocean',       subtitle:'Deep rolling',     badge:'∞',    category:'nature',  color:'#0EA5E9', colorDim:'rgba(14,165,233,0.12)',
    free:true, url:'https://ilsyvemhdpdizdasubub.supabase.co/storage/v1/object/public/Music/dragon-studio-gentle-ocean-waves-499666.mp3' },
  { id:'b1', emoji:'🧠', name:'Alpha',       subtitle:'10Hz · Focus',     badge:'10Hz', category:'binaural',color:T.accent,  colorDim:T.accentD,
    free:true, url:'https://ilsyvemhdpdizdasubub.supabase.co/storage/v1/object/public/Music/10hz_alpha.mp3' },
  { id:'b2', emoji:'💜', name:'Theta',       subtitle:'6Hz · Deep',       badge:'6Hz',  category:'binaural',color:'#B06EFF', colorDim:'rgba(176,110,255,0.12)',
    free:true, url:'https://ilsyvemhdpdizdasubub.supabase.co/storage/v1/object/public/Music/6hz_deep_waves.mp3' },
  // PRO
  { id:'b3', emoji:'⚡', name:'Beta',        subtitle:'20Hz · Energy',    badge:'20Hz', category:'binaural',color:T.blue,    colorDim:T.blueD,    free:false, url:'' },
  { id:'b5', emoji:'🔮', name:'Gamma',       subtitle:'40Hz · Peak',      badge:'40Hz', category:'binaural',color:T.teal,    colorDim:T.tealD,    free:false, url:'' },
  { id:'n2', emoji:'🏞️', name:'River',       subtitle:'Gentle stream',    badge:'∞',    category:'nature',  color:T.teal,    colorDim:T.tealD,    free:false, url:'' },
  { id:'n4', emoji:'🌲', name:'Forest',      subtitle:'Rustling wind',    badge:'∞',    category:'nature',  color:T.green,   colorDim:T.greenD,   free:false, url:'' },
  { id:'n5', emoji:'☕', name:'Café',         subtitle:'Ambient chatter',  badge:'∞',    category:'nature',  color:T.gold,    colorDim:T.goldD,    free:false, url:'' },
  { id:'n6', emoji:'🔥', name:'Fireplace',   subtitle:'Crackling fire',   badge:'∞',    category:'nature',  color:'#FF7849', colorDim:'rgba(255,120,73,0.12)', free:false, url:'' },
];

const TIMER_MODES: Record<TimerMode, { label:string; color:string; mins:number }> = {
  focus: { label:'DEEP FOCUS',  color:T.accent, mins:25 },
  break: { label:'SHORT BREAK', color:T.green,  mins:5  },
  long:  { label:'LONG BREAK',  color:T.gold,   mins:15 },
};
const DURATIONS = [25, 45, 60, 90];

// ─── SVG Ring ─────────────────────────────────────────────────────────────────

const AnimCircle = Animated.createAnimatedComponent(Circle);
const RING_R     = 106;
const RING_C     = 2 * Math.PI * RING_R;
const RING_SIZE  = 246;

function TimerRing({ progress, arcColor }: { progress:number; arcColor:string }) {
  const offset = RING_C * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      style={{ transform:[{rotate:'-90deg'}] }}>
      <Defs>
        <SvgGradient id="fg2" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#A89FF9"/>
          <Stop offset="100%" stopColor="#5C52D4"/>
        </SvgGradient>
      </Defs>
      <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RING_R}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={14}/>
      <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RING_R}
        fill="none"
        stroke={arcColor === T.accent ? 'url(#fg2)' : arcColor}
        strokeWidth={14} strokeLinecap="round"
        strokeDasharray={RING_C} strokeDashoffset={offset}/>
    </Svg>
  );
}

// ─── Pulsing Play/Pause ───────────────────────────────────────────────────────

function PulsingPlayBtn({ isRunning, onPress }: { isRunning:boolean; onPress:()=>void }) {
  const glowSc = useSharedValue(1);
  const glowOp = useSharedValue(0);
  useEffect(() => {
    if (isRunning) {
      glowSc.value = withRepeat(withSequence(withTiming(1.4,{duration:1000,easing:Easing.out(Easing.sin)}),withTiming(1,{duration:1000,easing:Easing.in(Easing.sin)})),-1,false);
      glowOp.value = withRepeat(withSequence(withTiming(0.35,{duration:1000}),withTiming(0.08,{duration:1000})),-1,false);
    } else {
      cancelAnimation(glowSc); cancelAnimation(glowOp);
      glowSc.value = withTiming(1,{duration:300});
      glowOp.value = withTiming(0,{duration:300});
    }
  }, [isRunning]);
  const glowStyle = useAnimatedStyle(()=>({ transform:[{scale:glowSc.value}], opacity:glowOp.value }));
  return (
    <View style={{ alignItems:'center', justifyContent:'center' }}>
      <Animated.View style={[styles.glowRing, glowStyle]}/>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <LinearGradient colors={['#8B7EF8','#5C52D4']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.playBtn}>
          {isRunning
            ? <View style={{flexDirection:'row',gap:5}}>
                <View style={styles.pauseBar}/><View style={styles.pauseBar}/>
              </View>
            : <View style={styles.playTriangle}/>
          }
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ─── Mascot ───────────────────────────────────────────────────────────────────
//
// Place your MP4 at: assets/mascot/owl_idle.mp4
//   • Idle:     plays the MP4 in a loop (breathing animation on container)
//   • Focus:    switches to 🎧 emoji (headphones)
//   • Celebrate: switches to 🎉 emoji + bounce animation

type MascotState = 'idle' | 'focus' | 'celebrate' | 'reward';

function Mascot({ state, size }: { state: MascotState; size?: number }) {
  const breathe = useSharedValue(1);
  const bounce  = useSharedValue(1);
  const rotate  = useSharedValue(0);
  const hop     = useSharedValue(0);

  const sz = size ?? 80;

  // Idle — gentle breathing
  useEffect(() => {
    if (state === 'idle') {
      breathe.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration:2000, easing:Easing.inOut(Easing.sin) }),
          withTiming(1,    { duration:2000, easing:Easing.inOut(Easing.sin) }),
        ), -1, true
      );
    } else {
      cancelAnimation(breathe);
      breathe.value = withTiming(1, { duration:300 });
    }
  }, [state]);

  // Celebrate — bounce + wiggle
  useEffect(() => {
    if (state === 'celebrate') {
      bounce.value = withRepeat(
        withSequence(
          withSpring(1.2, { damping:6, stiffness:400 }),
          withSpring(1,   { damping:10 }),
        ), 4, false
      );
      rotate.value = withRepeat(
        withSequence(
          withTiming(8,  { duration:80 }),
          withTiming(-8, { duration:80 }),
          withTiming(0,  { duration:80 }),
        ), 5, false
      );
    } else {
      cancelAnimation(bounce); cancelAnimation(rotate);
      bounce.value = withTiming(1, { duration:200 });
      rotate.value = withTiming(0, { duration:200 });
    }
  }, [state]);

  // Reward — spring hop up and down (DJ / keep-it-up)
  useEffect(() => {
    if (state === 'reward') {
      hop.value = withRepeat(
        withSequence(
          withTiming(-10, { duration:350, easing:Easing.out(Easing.cubic) }),
          withTiming(0,   { duration:350, easing:Easing.in(Easing.cubic)  }),
        ), -1, false
      );
      // Slight tilt side to side
      rotate.value = withRepeat(
        withSequence(
          withTiming(6,  { duration:350 }),
          withTiming(-6, { duration:350 }),
        ), -1, true
      );
    } else {
      cancelAnimation(hop);
      hop.value = withTiming(0, { duration:200 });
    }
  }, [state]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale:      breathe.value * bounce.value },
      { translateY: hop.value },
      { rotate:     `${rotate.value}deg` },
    ],
  }));

  // emoji for non-idle states (also used as fallback when no video)
  const emoji = state === 'focus'    ? '🎧'
              : state === 'celebrate'? '🎉'
              : state === 'reward'   ? '👍'
              : null;

  if (emoji || !useVideoPlayer || !VideoView) {
    return (
      <Animated.View style={[styles.mascotWrap, { width:sz, height:sz }, containerStyle]}>
        <LinearGradient
          colors={state === 'celebrate' ? ['rgba(245,200,66,0.22)','rgba(245,200,66,0.06)'] :
                  state === 'focus'     ? ['rgba(123,110,246,0.22)','rgba(123,110,246,0.06)'] :
                  state === 'reward'    ? ['rgba(62,207,160,0.22)', 'rgba(62,207,160,0.06)']  :
                                         ['rgba(123,110,246,0.12)','rgba(123,110,246,0.03)']}
          style={[styles.mascotBg, { width:sz, height:sz, borderRadius:sz/2 }]}
        >
          <Text style={{ fontSize: sz * 0.52 }}>
            {emoji ?? '🦉'}
          </Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  // MP4 idle — expo-video installed
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const player = useVideoPlayer(
    require('../../assets/mascot/owl_idle.mp4'),
    (p: any) => { p.loop = true; p.muted = true; p.play(); }
  );

  return (
    <Animated.View style={[styles.mascotWrap, { width:sz, height:sz }, containerStyle]}>
      <VideoView player={player} style={{ width:sz, height:sz }}
        contentFit="contain" nativeControls={false}/>
    </Animated.View>
  );
}

// ─── XP Popup ─────────────────────────────────────────────────────────────────

function XpPopup({ xp, visible }: { xp:number; visible:boolean }) {
  const y  = useSharedValue(0);
  const op = useSharedValue(0);
  const sc = useSharedValue(0.6);

  useEffect(() => {
    if (visible) {
      sc.value = withSpring(1.1, { damping:8, stiffness:400 }, () => {
        sc.value = withSpring(1, { damping:12 });
      });
      op.value = withTiming(1, { duration:200 });
      y.value  = withTiming(-60, { duration:1200, easing:Easing.out(Easing.cubic) });
    } else {
      sc.value = 0.6; op.value = 0; y.value = 0;
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: y.value }, { scale: sc.value }],
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[styles.xpPopup, style]}>
      <Text style={styles.xpPopupText}>+{xp} XP ✨</Text>
    </Animated.View>
  );
}

// ─── Horizontal Task Switcher ─────────────────────────────────────────────────

const CAT_COLOR: Record<string,string> = {
  work:T.accent, health:T.green, study:T.blue, personal:T.teal, creative:'#FF6B9D',
};

function TaskSwitcher({
  tasks, selectedId, onSelect,
}: {
  tasks: FocusTask[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (tasks.length === 0) return (
    <TouchableOpacity onPress={()=>router.push('/(tabs)/tasks' as any)} style={styles.noTaskBtn}>
      <Feather name="plus-circle" size={16} color={T.txt3} />
      <Text style={styles.noTaskTxt}>Add tasks to focus on</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.taskSwitcherContent}
      style={styles.taskSwitcher}
    >
      {tasks.map(t => {
        const sel = t.id === selectedId;
        const col = CAT_COLOR[t.category] ?? T.accent;
        return (
          <TouchableOpacity
            key={t.id}
            onPress={() => onSelect(t.id)}
            activeOpacity={0.8}
            style={[
              styles.taskChip,
              sel && { borderColor: col, backgroundColor: col + '18' },
              t.done && { opacity:0.45 },
            ]}
          >
            <View style={[styles.taskChipDot, { backgroundColor: col }]}/>
            <Text style={[styles.taskChipTxt, sel && { color:T.txt }]} numberOfLines={1}>
              {t.name}
            </Text>
            {t.done && <Text style={{ fontSize:10 }}>✓</Text>}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Top tab toggle (Timer | Music) ──────────────────────────────────────────

function TopSeg({ active, onSwitch }: { active:'timer'|'music'; onSwitch:(t:'timer'|'music')=>void }) {
  const HALF    = (W - 40 - 8) / 2;
  const sliderX = useSharedValue(0);
  const sliderStyle = useAnimatedStyle(() => ({ transform:[{translateX:sliderX.value}] }));

  const press = (tab: 'timer'|'music') => {
    sliderX.value = withSpring(tab==='timer' ? 0 : HALF, { damping:18, stiffness:220 });
    onSwitch(tab);
  };

  return (
    <View style={segStyles.wrap}>
      <Animated.View style={[segStyles.pill, { width:HALF }, sliderStyle]}>
        <LinearGradient colors={['#8B7EF8','#5C52D4']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
      </Animated.View>
      {(['timer','music'] as const).map(tab => (
        <TouchableOpacity key={tab} style={segStyles.btn} onPress={()=>press(tab)} activeOpacity={0.8}>
          <Text style={segStyles.icon}>{tab==='timer' ? '⏱' : '🎵'}</Text>
          <Text style={[segStyles.label, active===tab && segStyles.labelActive]}>
            {tab==='timer' ? 'Timer' : 'Music'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const segStyles = StyleSheet.create({
  wrap:        { marginHorizontal:20, marginBottom:10, backgroundColor:T.card, borderRadius:20, borderWidth:1, borderColor:T.border, padding:4, flexDirection:'row', overflow:'hidden', position:'relative' },
  pill:        { position:'absolute', top:4, bottom:4, left:4, borderRadius:16, overflow:'hidden', zIndex:0 },
  btn:         { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:7, paddingVertical:13, borderRadius:16, zIndex:1 },
  icon:        { fontSize:17 },
  label:       { fontSize:14, fontWeight:'600', color:T.txt2, fontFamily:'DM_Sans_600SemiBold' },
  labelActive: { color:'#fff' },
});

// ─── Waveform animation (used in NowPlaying card) ─────────────────────────────

const WaveBar = ({ delay, height, color }: { delay:number; height:number; color:string }) => {
  const scale = useSharedValue(0.3);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1,   { duration:600 + delay*40, easing:Easing.inOut(Easing.sin) }),
        withTiming(0.3, { duration:600 + delay*40, easing:Easing.inOut(Easing.sin) }),
      ), -1, false
    );
    return () => cancelAnimation(scale);
  }, []);
  const style = useAnimatedStyle(() => ({ transform:[{scaleY:scale.value}] }));
  return <Animated.View style={[{ width:3, height, borderRadius:2, backgroundColor:color }, style]}/>;
};

const Waveform = ({ color, paused }: { color:string; paused:boolean }) => {
  const heights = [10, 16, 22, 14, 8, 18, 12];
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap:3, height:24 }}>
      {heights.map((h, i) =>
        paused
          ? <View key={i} style={{ width:3, height:h*0.3, borderRadius:2, backgroundColor:color, opacity:0.4 }}/>
          : <WaveBar key={i} delay={i} height={h} color={color}/>
      )}
    </View>
  );
};

// ─── Simplified Music Panel ────────────────────────────────────────────────────
//
// Structure:
//   1. NowPlaying card   — big centered card showing active track + waveform
//   2. Category toggle   — Binaural | Nature pill
//   3. Track grid        — 2-col grid, locked tracks have 🔒 overlay
//   4. Vol hint          — "Use volume buttons ↕ to adjust"

function MusicPanel({
  tracks, selectedId, onSelect, onToggle, isPlaying, isPro, adWatchCount,
}: {
  tracks:       TrackItem[];
  selectedId:   string | null;
  onSelect:     (t: TrackItem) => void;
  onToggle:     () => void;
  isPlaying:    boolean;
  isPro:        boolean;
  adWatchCount: Map<string, number>;
}) {
  const [cat, setCat] = useState<'all'|'binaural'|'nature'>('all');
  const selectedTrack = tracks.find(t => t.id === selectedId) ?? null;
  const visible = cat === 'all' ? tracks : tracks.filter(t => t.category === cat);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={mp.scroll}
    >
      {/* ── NOW PLAYING CARD ─────────────────────────────────── */}
      {selectedTrack ? (
        <Animated.View entering={FadeIn.duration(300)} style={[mp.nowCard, { borderColor: selectedTrack.color + '55' }]}>
          <LinearGradient
            colors={[selectedTrack.color + '18', 'transparent']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={mp.nowLeft}>
            <Text style={mp.nowEmoji}>{selectedTrack.emoji}</Text>
          </View>
          <View style={mp.nowInfo}>
            <Text style={[mp.nowName, { color: selectedTrack.color }]}>{selectedTrack.name}</Text>
            <Text style={mp.nowSub}>{selectedTrack.subtitle}</Text>
            <View style={{ marginTop: 6 }}>
              <Waveform color={selectedTrack.color} paused={!isPlaying}/>
            </View>
          </View>
          {/* ── PAUSE / RESUME BUTTON ── */}
          <TouchableOpacity
            onPress={onToggle}
            activeOpacity={0.8}
            style={[mp.pauseBtn, { borderColor: selectedTrack.color + '55', backgroundColor: selectedTrack.color + '18' }]}
          >
            {isPlaying ? (
              <View style={mp.pauseIconWrap}>
                <View style={[mp.pauseBar, { backgroundColor: selectedTrack.color }]}/>
                <View style={[mp.pauseBar, { backgroundColor: selectedTrack.color }]}/>
              </View>
            ) : (
              <View style={[mp.playTriangleIcon, { borderLeftColor: selectedTrack.color }]}/>
            )}
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <View style={mp.noTrackCard}>
          <View style={mp.noTrackIcon}>
            <Feather name="music" size={24} color={T.accentS} />
          </View>
          <Text style={mp.noTrackEmoji}>🎵</Text>
          <Text style={mp.noTrackTxt}>Pick a sound to focus with</Text>
          <Text style={mp.noTrackSub}>Music starts when you hit ▶</Text>
        </View>
      )}

      {/* ── CATEGORY TOGGLE ──────────────────────────────────── */}
      <View style={mp.catRow}>
        {([
          { key:'all',      label:'All' },
          { key:'binaural', label:'🧠 Binaural' },
          { key:'nature',   label:'🌿 Nature' },
        ] as const).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setCat(key)}
            activeOpacity={0.8}
            style={[mp.catPill, cat===key && mp.catPillActive]}
          >
            <Text style={[mp.catTxt, cat===key && mp.catTxtActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── TRACK GRID ───────────────────────────────────────── */}
      <View style={mp.grid}>
        {visible.map((t, i) => {
          const sel    = t.id === selectedId;
          const locked = !isPro && !t.free;
          const noUrl  = !t.url && !locked;
          return (
            <Animated.View
              key={t.id}
              entering={FadeInUp.delay(i * 40).duration(320).springify()}
              style={mp.trackWrap}
            >
              <TouchableOpacity
                onPress={() => onSelect(t)}
                activeOpacity={0.85}
                style={[
                  mp.trackCard,
                  sel && { borderColor: t.color, backgroundColor: t.colorDim },
                ]}
              >
                {/* Emoji + name */}
                <Text style={mp.trackEmoji}>{t.emoji}</Text>
                <Text style={[mp.trackName, sel && { color: t.color }]} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={mp.trackSub} numberOfLines={1}>{t.subtitle}</Text>

                {/* Badge (frequency / loop) */}
                <View style={[mp.badge, sel && { backgroundColor: t.color + '22', borderColor: t.color + '44' }]}>
                  <Text style={[mp.badgeTxt, { color: sel ? t.color : T.accentS }]}>{t.badge}</Text>
                </View>

                {/* Playing indicator */}
                {sel && isPlaying && (
                  <Animated.View entering={FadeIn.duration(200)} style={[mp.playDot, { backgroundColor: t.color }]}/>
                )}

                {/* Pro lock overlay (paid tracks) */}
                {locked && (
                  <View style={mp.lockOverlay}>
                    <LinearGradient
                      colors={['rgba(7,7,15,0.72)', 'rgba(7,7,15,0.85)']}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text style={mp.lockEmoji}>🔒</Text>
                    <Text style={mp.lockTxt}>Pro</Text>
                  </View>
                )}

                {/* Ad unlock overlay (free tracks, < 2 ads watched) */}
                {!locked && t.free && !isPro && !sel && (adWatchCount.get(t.id) ?? 0) < 2 && t.url && (
                  <View style={mp.lockOverlay}>
                    <LinearGradient
                      colors={['rgba(7,7,15,0.60)', 'rgba(7,7,15,0.78)']}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text style={mp.lockEmoji}>📺</Text>
                    <Text style={mp.lockTxt}>
                      {`Watch ${2 - (adWatchCount.get(t.id) ?? 0)} ad${2 - (adWatchCount.get(t.id) ?? 0) > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                )}

                {/* Coming soon (URL not set but free) */}
                {noUrl && (
                  <View style={[mp.lockOverlay, { backgroundColor:'rgba(7,7,15,0.6)' }]}>
                    <Text style={[mp.lockTxt, { color: T.txt3 }]}>Soon</Text>
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      {/* ── VOLUME HINT ──────────────────────────────────────── */}
      <View style={mp.volHint}>
        <Feather name="volume-2" size={14} color={T.txt3} />
        <Text style={mp.volHintTxt}>Use your phone&apos;s volume buttons to adjust</Text>
      </View>
    </ScrollView>
  );
}

const mp = StyleSheet.create({
  scroll:       { paddingHorizontal:20, paddingBottom:20, gap:16 },

  // Now playing
  nowCard:      { flexDirection:'row', alignItems:'center', gap:14, backgroundColor:T.card, borderRadius:24, borderWidth:1.5, padding:18, overflow:'hidden' },
  nowLeft:      { width:54, height:54, borderRadius:16, backgroundColor:'rgba(255,255,255,0.04)', alignItems:'center', justifyContent:'center', flexShrink:0 },
  nowEmoji:     { fontSize:28 },
  nowInfo:      { flex:1 },
  nowName:      { fontFamily:'DM_Sans_700Bold',    fontSize:15 },
  nowSub:       { fontFamily:'DM_Sans_400Regular', fontSize:11, color:T.txt2, marginTop:2 },
  nowBadge:     { alignSelf:'flex-start' },
  nowBadgeTxt:  { fontFamily:'DM_Sans_600SemiBold',fontSize:11 },

  // Pause / Resume button
  pauseBtn: {
    width:44, height:44, borderRadius:22,
    borderWidth:1.5,
    alignItems:'center', justifyContent:'center',
    flexShrink:0,
  },
  pauseIconWrap:    { flexDirection:'row', gap:4, alignItems:'center' },
  pauseBar:         { width:4, height:16, borderRadius:2 },
  playTriangleIcon: { width:0, height:0, marginLeft:3, borderTopWidth:8, borderBottomWidth:8, borderLeftWidth:14, borderTopColor:'transparent', borderBottomColor:'transparent' },

  // No track placeholder
  noTrackCard:  { alignItems:'center', justifyContent:'center', backgroundColor:T.card, borderRadius:24, borderWidth:1, borderColor:T.border, borderStyle:'dashed', paddingVertical:28, gap:6 },
  noTrackIcon:  { width:52, height:52, borderRadius:18, backgroundColor:'rgba(123,110,246,0.12)', alignItems:'center', justifyContent:'center' },
  noTrackEmoji: { fontSize:32 },
  noTrackTxt:   { fontFamily:'DM_Sans_600SemiBold', fontSize:14, color:T.txt2 },
  noTrackSub:   { fontFamily:'DM_Sans_400Regular',  fontSize:11, color:T.txt3 },

  // Category toggle
  catRow:       { flexDirection:'row', gap:8 },
  catPill:      { paddingHorizontal:16, paddingVertical:8, borderRadius:20, borderWidth:1.5, borderColor:T.border, backgroundColor:T.card2 },
  catPillActive:{ borderColor:T.accent, backgroundColor:T.accentD },
  catTxt:       { fontFamily:'DM_Sans_600SemiBold', fontSize:12, color:T.txt2 },
  catTxtActive: { color:T.accent },

  // Track grid — 2 columns
  grid:         { flexDirection:'row', flexWrap:'wrap', gap:10 },
  trackWrap:    { width:(W - 50) / 2 },
  trackCard:    { padding:14, borderRadius:20, backgroundColor:T.card2, borderWidth:1.5, borderColor:T.border, gap:6, overflow:'hidden', position:'relative' },
  trackEmoji:   { fontSize:28 },
  trackName:    { fontFamily:'DM_Sans_700Bold',    fontSize:13, color:T.txt },
  trackSub:     { fontFamily:'DM_Sans_400Regular', fontSize:10, color:T.txt2 },
  badge:        { alignSelf:'flex-start', paddingHorizontal:8, paddingVertical:3, borderRadius:6, borderWidth:1, borderColor:'transparent', backgroundColor:T.accentD, marginTop:2 },
  badgeTxt:     { fontFamily:'DM_Sans_600SemiBold', fontSize:10, letterSpacing:0.4, textTransform:'uppercase' },
  playDot:      { position:'absolute', top:10, right:10, width:8, height:8, borderRadius:4 },

  // Lock overlay
  lockOverlay:  { ...StyleSheet.absoluteFillObject, borderRadius:18, alignItems:'center', justifyContent:'center', gap:4 },
  lockEmoji:    { fontSize:20 },
  lockTxt:      { fontFamily:'DM_Sans_700Bold', fontSize:11, color:T.gold },

  // Volume hint
  volHint:      { alignItems:'center', justifyContent:'center', flexDirection:'row', gap:6, paddingVertical:8 },
  volHintTxt:   { fontFamily:'DM_Sans_400Regular', fontSize:11, color:T.txt3, textAlign:'center' },
});

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────

export default function FocusScreen() {
  const insets = useSafeAreaInsets();
  const { isPro } = useRevenueCat();  // live entitlement check

  // ── Tab
  const [focusTab,    setFocusTab]    = useState<'timer'|'music'>('timer');
  // ── Auth
  const [userId,      setUserId]      = useState('');
  // ── Timer
  const [timerMode,   setTimerMode]   = useState<TimerMode>('focus');
  const [timerDur,    setTimerDur]    = useState(25);
  const [timerLeft,   setTimerLeft]   = useState(25 * 60);
  const [isRunning,   setIsRunning]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ── Mascot & immersion
  const [mascotState, setMascotState] = useState<MascotState>('idle');
  const [showXpPopup, setShowXpPopup] = useState(false);
  const [sessionXp,   setSessionXp]   = useState(0);
  const [showCelebModal, setShowCelebModal] = useState(false);
  const [celebTotalXp,   setCelebTotalXp]   = useState(0);
  const bgDim = useSharedValue(0);
  // ── Tasks
  const [dailyTasks,   setDailyTasks]   = useState<FocusTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  // ── Audio
  const [selectedTrack, setSelectedTrack] = useState<TrackItem | null>(null);
  const [musicPlaying,  setMusicPlaying]  = useState(false);
  // Map<trackId, numberOfAdsWatched> — requires 2 watched ads to unlock per session
  const [adWatchCount,  setAdWatchCount]  = useState<Map<string,number>>(new Map());
  const soundRef = useRef<Audio.Sound | null>(null);
  // ── Sessions log
  const [sessions, setSessions] = useState<{ id:string; name:string; pts:number }[]>([]);

  const arcColor      = TIMER_MODES[timerMode].color;
  const timerProgress = timerLeft / (timerDur * 60);
  const timeStr = useMemo(() => {
    const m = Math.floor(timerLeft / 60);
    const s = timerLeft % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, [timerLeft]);

  const selectedTaskObj = dailyTasks.find(t => t.id === selectedTask) ?? null;
  const xpEarned = Math.floor((FOCUS_XP_PER_POMODORO / FOCUS_POMODORO_MINUTES) * timerDur);

  const loadLocalFocusData = useCallback(async () => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserId(user.id);
    const localSummary = await readLocalTasks();
    const tasks = localSummary.daily as FocusTask[];
    setDailyTasks(tasks);
    setSelectedTask((prev) => {
      const active = tasks.find((task) => task.id === prev && !task.done);
      if (active) return active.id;
      return tasks.find((task) => !task.done)?.id ?? tasks[0]?.id ?? null;
    });
  }, []);

  const syncFocusSessionProgress = useCallback(async (nextDailyTasks: FocusTask[]) => {
    const streakState = await readLocalStreak();
    const today = new Date().toISOString().split('T')[0];
    const nextStreak = streakState.lastCompletedDate === today
      ? streakState
      : { count: streakState.count + 1, lastCompletedDate: today };

    if (
      nextStreak.count !== streakState.count
      || nextStreak.lastCompletedDate !== streakState.lastCompletedDate
    ) {
      await writeLocalStreak(nextStreak);
    }

    if (userId) {
      const todayDone = nextDailyTasks.filter(
        (task) => task.done && task.done_at?.split('T')[0] === today
      ).length;

      syncLocalStateToSupabase(userId, {
        todayDone,
        todayTotal: nextDailyTasks.length,
      }, {
        count: nextStreak.count,
      });
    }
  }, [userId]);

  // ── Background dim style
  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${bgDim.value * 0.55})`,
  }));

  // ── Auth + load tasks
  useEffect(() => {
    // Configure audio session so hardware volume buttons control playback
    // - playsInSilentModeIOS: plays even when phone is silenced (user chose to play music)
    // - staysActiveInBackground: keeps playing when app is backgrounded
    // - NOT overriding volume via setVolumeAsync → hardware buttons work natively
    Audio.setAudioModeAsync({
      allowsRecordingIOS:      false,
      playsInSilentModeIOS:    true,
      staysActiveInBackground: true,
    }).catch(()=>{});
    loadLocalFocusData();
    return () => {
      soundRef.current?.unloadAsync();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadLocalFocusData]);

  useFocusEffect(useCallback(() => {
    loadLocalFocusData();
  }, [loadLocalFocusData]));

  // ── Load a track into expo-av
  // Volume is NOT set via setVolumeAsync — this lets hardware buttons control it naturally.
  // The sound plays at full amplitude; the user controls loudness with physical buttons.
  const loadTrack = useCallback(async (track: TrackItem) => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    if (!track.url) return;
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay:true, isLooping:true },
      );
      soundRef.current = sound;
      setMusicPlaying(true);
    } catch (e) {
      console.error('[Audio] load error:', e);
      setMusicPlaying(false);
    }
  }, []);

  // ── Stop cleanly (hardware volume controls loudness — we just stop playback)
  const fadeOutAndStop = useCallback(async () => {
    if (!soundRef.current) {
      if (!selectedTrack) {
        Alert.alert('Pick a track first', 'Choose a sound, then tap play to start a preview.');
        return;
      }
      await loadTrack(selectedTrack);
      return;
    }
    try {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
    } catch {}
    soundRef.current = null;
    setMusicPlaying(false);
  }, []);

  // ── Handle track selection from strip
  const handleTrackSelect = useCallback(async (track: TrackItem) => {
    if (selectedTrack?.id === track.id) return;

    if (!isPro && !track.free) {
      Alert.alert('Pro Feature 🔒', 'Upgrade to Zora Pro to unlock all tracks.', [
        { text:'Cancel', style:'cancel' },
        { text:'Go Pro', onPress:()=>router.push('/modal/paywall') },
      ]);
      return;
    }
    if (!track.url) {
      Alert.alert('Coming Soon', 'This track hasn\'t been uploaded yet. Check back later!');
      return;
    }

    // Free tracks require 2 rewarded ads watched per session to unlock
    // After 2 ads, user can freely pause/play that track
    const watchedCount = adWatchCount.get(track.id) ?? 0;
    if (track.free && watchedCount < 2) {
      const remaining = 2 - watchedCount;
      Alert.alert(
        remaining === 2 ? 'Watch 2 Ads to Unlock 🎵' : '1 More Ad to Unlock 🎵',
        remaining === 2
          ? 'Watch 2 short ads to play this track for free. Upgrade to Pro for instant access.'
          : 'Watch 1 more short ad to unlock this track.',
        [
          { text: 'Cancel', style: 'cancel' },
            {
              text: `Watch Ad (${watchedCount + 1}/2)`,
              onPress: async () => {
                const earned = await showRewardedAd();
                if (!earned) {
                  Alert.alert(
                    'Unlock incomplete',
                    'Finish the ad to unlock this track, or upgrade to Pro for instant access.'
                  );
                  return;
                }
                const newCount = watchedCount + 1;
                setAdWatchCount(prev => new Map([...prev, [track.id, newCount]]));
                trackEvent('music_ad_watched', { trackId: track.id, count: newCount });
              if (newCount < 2) {
                // Still need another ad — notify and wait
                Alert.alert('1 down, 1 to go! 🎵', 'Tap the track again to watch the final ad and start listening.');
                return;
              }
              // Both ads watched — proceed to load
              trackEvent('music_track_unlocked', { trackId: track.id, via: 'rewarded_ads' });
              setSelectedTrack(track);
              if (isRunning) await loadTrack(track);
            },
          },
        ]
      );
      return;
    }

    setSelectedTrack(track);
    trackEvent('music_track_selected', { trackId: track.id, trackName: track.name, free: track.free });

    // If timer is running — immediately swap music
    if (isRunning) {
      await loadTrack(track);
    }
  }, [selectedTrack, isPro, adWatchCount, isRunning, loadTrack]);

  // Volume is controlled by hardware buttons — no in-app volume handler needed

  // ── Toggle music pause/resume from the Music tab pause button
  const toggleNowPlaying = useCallback(async () => {
    if (!soundRef.current) {
      if (!selectedTrack) {
        Alert.alert('Pick a track first', 'Choose a sound, then tap play to start a preview.');
        return;
      }
      await loadTrack(selectedTrack);
      return;
    }
    if (musicPlaying) {
      try { await soundRef.current.pauseAsync(); } catch {}
      setMusicPlaying(false);
      if (selectedTrack) trackEvent('music_paused', { trackId: selectedTrack.id });
    } else {
      try { await soundRef.current.playAsync(); } catch {}
      setMusicPlaying(true);
      if (selectedTrack) trackEvent('music_resumed', { trackId: selectedTrack.id });
    }
  }, [loadTrack, musicPlaying, selectedTrack]);

  // ── Timer complete
  const handleComplete = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
    if (Platform.OS !== 'web') Vibration.vibrate([0,300,150,300,150,300]);

    // Immersion: undim, mascot celebrate, fade out music
    bgDim.value = withTiming(0, { duration:800 });
    setMascotState('celebrate');
    fadeOutAndStop();

    if (timerMode === 'focus' && userId) {
      // Award XP
      const xp = xpEarned;
      setSessionXp(xp);
      setShowXpPopup(true);
      setTimeout(() => setShowXpPopup(false), 2400);

      // Log focus session
      await logFocusSession(userId, timerDur);
      trackEvent('focus_session_completed', { mode: timerMode, duration: timerDur, xp: xpEarned });

      let nextDailyTasks = dailyTasks;

      // Auto-complete selected task
      if (selectedTask) {
        const task = dailyTasks.find(t => t.id === selectedTask);
        if (task && !task.done) {
          const txnId = await awardXP(
            userId,
            xp,
            `focus:${selectedTask}:${Date.now()}`,
            task.name ?? 'Focus session'
          );
          const localSummary = await readLocalTasks();
          const completedAt = new Date().toISOString();

          nextDailyTasks = localSummary.daily.map((item) =>
            item.id === selectedTask
              ? { ...item, done: true, done_at: completedAt, xp_txn_id: txnId }
              : item
          ) as FocusTask[];

          await writeLocalTasks(nextDailyTasks as any, localSummary.weekly as any);
          setDailyTasks(nextDailyTasks);
          setSelectedTask(nextDailyTasks.find((item) => !item.done)?.id ?? nextDailyTasks[0]?.id ?? null);
        } else {
          // No task selected — just award xp for the session
          await awardXP(userId, xp, `focus:session:${Date.now()}`, `${timerDur}min session`);
        }
      } else {
        await awardXP(userId, xp, `focus:session:${Date.now()}`, `${timerDur}min session`);
      }

      await syncFocusSessionProgress(nextDailyTasks);

      // Log session
      setSessions(prev => [{
        id: `s${Date.now()}`, name:`${timerDur}min ${timerMode}`, pts:xp,
      }, ...prev]);

      // Fetch fresh total XP then show celebration modal (replaces Alert)
      supabase.from('user_profiles').select('total_xp').eq('id',userId).single().then(({data}) => {
        setCelebTotalXp(data?.total_xp ?? xp);
        setShowCelebModal(true);
        // Show interstitial after XP modal renders (non-blocking, slight delay so modal appears first)
        if (!isPro) setTimeout(() => showInterstitialAd(), 500);
      });
    } else {
      setTimerLeft(timerDur * 60);
      setTimeout(() => setMascotState('idle'), 2000);
    }
  }, [timerMode, timerDur, userId, selectedTask, dailyTasks, xpEarned, fadeOutAndStop, syncFocusSessionProgress]);

  // ── Timer tick
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimerLeft(prev => {
          if (prev <= 1) { handleComplete(); return 0; }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning, handleComplete]);

  // ── Start / Pause
  const toggleTimer = useCallback(async () => {
    if (isRunning) {
      // Pause
      setIsRunning(false);
      bgDim.value = withTiming(0, { duration:500 });
      setMascotState('idle');
      if (soundRef.current) {
        try { await soundRef.current.pauseAsync(); } catch {}
        setMusicPlaying(false);
      }
    } else {
      // Start
      setIsRunning(true);
      bgDim.value = withTiming(1, { duration:800 });
      setMascotState('focus');
      // Auto-start music if a track is selected
      if (selectedTrack) {
        if (soundRef.current) {
          try { await soundRef.current.playAsync(); } catch {}
          setMusicPlaying(true);
        } else {
          await loadTrack(selectedTrack);
        }
      }
    }
  }, [isRunning, selectedTrack, loadTrack]);

  // ── Reset
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
    setTimerLeft(timerDur * 60);
    bgDim.value = withTiming(0, { duration:400 });
    setMascotState('idle');
    fadeOutAndStop();
  }, [timerDur, fadeOutAndStop]);

  // ── Mode / duration change
  const changeMode = (mode: TimerMode) => {
    resetTimer();
    setTimerMode(mode);
    const m = TIMER_MODES[mode].mins;
    setTimerDur(m); setTimerLeft(m * 60);
  };
  const changeDur = (d: number) => {
    if (isRunning) return;
    setTimerDur(d); setTimerLeft(d * 60);
  };

  const taskLabel = selectedTaskObj
    ? (selectedTaskObj.done ? `✓ ${selectedTaskObj.name}` : selectedTaskObj.name)
    : 'No task selected';

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content"/>

      {/* Dim overlay */}
      <Animated.View style={[StyleSheet.absoluteFill, bgStyle]} pointerEvents="none"/>

      {/* Ambient glow when running */}
      {isRunning && (
        <Animated.View
          entering={FadeIn.duration(800)}
          exiting={FadeOut.duration(600)}
          style={styles.ambientGlow}
        />
      )}

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>Session</Text>
          <Text style={styles.headerTitle}>Focus 🎯</Text>
        </View>
        {/* Mini player — visible on Timer tab whenever a track is selected */}
        {focusTab === 'timer' && selectedTrack && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.miniPlayer}>
            <Text style={{ fontSize:14 }}>{selectedTrack.emoji}</Text>
            <Text style={[styles.miniPlayerTxt, { color:selectedTrack.color }]} numberOfLines={1}>{selectedTrack.name}</Text>
            {/* Pulse dot — only when playing */}
            {musicPlaying && (
              <View style={[styles.miniDot, { backgroundColor:selectedTrack.color }]}/>
            )}
            {/* Tap to pause / resume without switching tabs */}
            <TouchableOpacity onPress={toggleNowPlaying} activeOpacity={0.75} style={styles.miniPauseBtn}>
              {musicPlaying ? (
                <View style={styles.miniPauseIconWrap}>
                  <View style={[styles.miniPauseBar, { backgroundColor:selectedTrack.color }]}/>
                  <View style={[styles.miniPauseBar, { backgroundColor:selectedTrack.color }]}/>
                </View>
              ) : (
                <View style={[styles.miniPlayTriangle, { borderLeftColor:selectedTrack.color }]}/>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* Tab toggle — always visible */}
      <TopSeg active={focusTab} onSwitch={(tab) => {
        setFocusTab(tab);
        if (tab === 'timer') {
          if (isRunning) {
            setMascotState('focus');
          } else if (musicPlaying) {
            // 🎧 Show focus mascot (DIFFERENT from music tab's 👍 reward mascot)
            setMascotState('focus');
            setTimeout(() => setMascotState('idle'), 2500);
          } else {
            setMascotState('idle');
          }
        }
      }}/>

      {/* ── TIMER TAB ─────────────────────────────────── */}
      {focusTab === 'timer' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
          scrollEnabled={true}
        >
          {/* Mascot — shown when running, celebrating, or briefly on tab-return (focus/reward) */}
          {(isRunning || mascotState === 'celebrate' || mascotState === 'focus' || mascotState === 'reward') && (
            <Animated.View
              entering={FadeIn.duration(400)}
              exiting={FadeOut.duration(300)}
              style={styles.mascotContainer}
            >
              <Mascot state={mascotState} size={80}/>
              <XpPopup xp={sessionXp} visible={showXpPopup}/>
            </Animated.View>
          )}

          <Animated.View entering={FadeInUp.delay(60).duration(360)} style={styles.modeRow}>
            {(['focus','break','long'] as TimerMode[]).map(mode => (
              <TouchableOpacity key={mode}
                style={[styles.modeChip, timerMode===mode && { borderColor:TIMER_MODES[mode].color, backgroundColor:`${TIMER_MODES[mode].color}18` }]}
                onPress={()=>changeMode(mode)} activeOpacity={0.8}>
                <Text style={[styles.modeChipTxt, timerMode===mode && { color:TIMER_MODES[mode].color }]}>
                  {mode==='focus' ? '🎯 Focus' : mode==='break' ? '☕ Break' : '🌿 Long'}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(100).duration(440)} style={styles.ringWrap}>
            <View style={styles.ringContainer}>
              <TimerRing progress={timerProgress} arcColor={arcColor}/>
              <View style={styles.ringCenter}>
                <Text style={styles.timerDisplay}>{timeStr}</Text>
                <Text style={styles.timerModeLabel}>
                  {timerLeft===0 ? 'DONE! 🎉' : TIMER_MODES[timerMode].label}
                </Text>
                <Text style={styles.timerTaskLabel} numberOfLines={1}>{taskLabel}</Text>
                {timerMode==='focus' && !isRunning && (
                  <View style={styles.xpPreviewPill}>
                    <Text style={styles.xpPreviewTxt}>+{xpEarned} XP on complete</Text>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(140).duration(360)} style={styles.durRow}>
            {DURATIONS.map(d => (
              <TouchableOpacity key={d}
                style={[styles.durPill, timerDur===d && { borderColor:T.accent, backgroundColor:T.accentD }]}
                onPress={()=>changeDur(d)} activeOpacity={0.8} disabled={isRunning}>
                <Text style={[styles.durPillTxt, timerDur===d && { color:T.accentS }]}>{d}m</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(180).duration(360)} style={styles.controls}>
            <TouchableOpacity style={styles.ctrlBtn} onPress={resetTimer} activeOpacity={0.8}>
              <Text style={{ color:T.txt2, fontSize:22 }}>↺</Text>
            </TouchableOpacity>
            <PulsingPlayBtn isRunning={isRunning} onPress={toggleTimer}/>
            <TouchableOpacity style={styles.ctrlBtn} onPress={()=>handleComplete()} activeOpacity={0.8}>
              <Text style={{ color:T.txt2, fontSize:20 }}>⏭</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(220).duration(360)} style={styles.taskSection}>
            <Text style={styles.taskSectionLabel}>Focus on</Text>
            <TaskSwitcher
              tasks={dailyTasks}
              selectedId={selectedTask}
              onSelect={id => { if (!isRunning) setSelectedTask(id); }}
            />
          </Animated.View>

          {sessions.length > 0 && (
            <Animated.View entering={FadeIn.duration(400)} style={styles.sessionLog}>
              <Text style={styles.sessionLogLabel}>Today&apos;s Sessions</Text>
              {sessions.slice(0,3).map(s => (
                <View key={s.id} style={styles.sessionRow}>
                  <View style={styles.sessionIcon}><Text style={{ fontSize:14 }}>✅</Text></View>
                  <Text style={styles.sessionName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.sessionPts}>+{s.pts} XP</Text>
                </View>
              ))}
            </Animated.View>
          )}
        </ScrollView>
      )}

      {/* ── MUSIC TAB ─────────────────────────────────── */}
      {focusTab === 'music' && (
        <>
          <MusicPanel
            tracks={ALL_TRACKS}
            selectedId={selectedTrack?.id ?? null}
            onSelect={handleTrackSelect}
            onToggle={toggleNowPlaying}
            isPlaying={musicPlaying}
            isPro={isPro}
            adWatchCount={adWatchCount}
          />

          {/* Music mascot removed — no image asset available */}
        </>
      )}

      {/* XP Celebration Modal — shown on focus session complete */}
      <XpCelebrationModal
        visible={showCelebModal}
        xpEarned={sessionXp}
        totalXp={celebTotalXp}
        onDone={() => {
          setShowCelebModal(false);
          setMascotState('idle');
          setTimerLeft(timerDur * 60);
        }}
      />
    </View>
  );

}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:         { flex:1, backgroundColor:T.bg },
  scroll:       { paddingHorizontal:20, paddingTop:8 },

  // Ambient glow
  ambientGlow: {
    position:'absolute', top:H*0.15, left:W/2-100,
    width:200, height:200, borderRadius:100,
    backgroundColor:'rgba(123,110,246,0.10)',
  },

  // Mascot
  mascotContainer: { alignItems:'center', justifyContent:'center', marginBottom:8, position:'relative' },
  mascotWrap:      { alignItems:'center', justifyContent:'center' },
  mascotBg: {
    width:80, height:80, borderRadius:40,
    alignItems:'center', justifyContent:'center',
  },
  mascotEmoji:  { fontSize:44 },
  mascotVideo:  { width:80, height:80 },

  // XP popup
  xpPopup: {
    position:'absolute', top:-10, alignSelf:'center',
    backgroundColor:'rgba(245,200,66,0.18)',
    borderRadius:20, borderWidth:1.5,
    borderColor:'rgba(245,200,66,0.50)',
    paddingHorizontal:18, paddingVertical:8,
  },
  xpPopupText: {
    fontFamily:'Fraunces_900Black', fontSize:20,
    color:'#F5C842', letterSpacing:-0.5,
  },

  // Mode chips
  modeRow:    { flexDirection:'row', gap:8, marginBottom:14 },
  modeChip:   { flex:1, paddingVertical:10, borderRadius:14, backgroundColor:T.card, borderWidth:1.5, borderColor:T.border, alignItems:'center' },
  modeChipTxt:{ fontSize:12, fontWeight:'600', color:T.txt2 },

  // Ring
  ringWrap:      { alignItems:'center', marginBottom:16 },
  ringContainer: { width:RING_SIZE, height:RING_SIZE, position:'relative' },
  ringCenter: {
    position:'absolute', inset:0,
    alignItems:'center', justifyContent:'center', gap:4,
  },
  timerDisplay: {
    fontFamily:'Fraunces_900Black',
    fontSize:58, fontWeight:'900', color:T.txt,
    letterSpacing:-4, lineHeight:62,
  },
  timerModeLabel: {
    fontSize:11, color:T.txt2, fontWeight:'600',
    letterSpacing:0.8, textTransform:'uppercase',
  },
  timerTaskLabel: {
    fontFamily:'DM_Sans_500Medium',
    fontSize:12, color:T.accentS,
    marginTop:2, maxWidth:180, textAlign:'center',
  },
  xpPreviewPill: {
    marginTop:6, backgroundColor:'rgba(245,200,66,0.12)',
    borderRadius:12, paddingHorizontal:10, paddingVertical:4,
    borderWidth:1, borderColor:'rgba(245,200,66,0.25)',
  },
  xpPreviewTxt: { fontSize:11, fontWeight:'700', color:'#F5C842', textAlign:'center' },

  // Duration
  durRow:      { flexDirection:'row', gap:8, marginBottom:20 },
  durPill:     { flex:1, paddingVertical:11, borderRadius:14, backgroundColor:T.card, borderWidth:1.5, borderColor:T.border, alignItems:'center' },
  durPillTxt:  { fontSize:13, fontWeight:'600', color:T.txt2 },

  // Controls
  controls: { flexDirection:'row', gap:14, alignItems:'center', justifyContent:'center', marginBottom:24 },
  ctrlBtn:  { width:54, height:54, borderRadius:27, backgroundColor:T.card, borderWidth:1, borderColor:T.border, alignItems:'center', justifyContent:'center' },
  glowRing: { position:'absolute', width:70, height:70, borderRadius:35, backgroundColor:T.accent },
  playBtn:  { width:72, height:72, borderRadius:36, alignItems:'center', justifyContent:'center' },
  pauseBar: { width:5, height:20, borderRadius:3, backgroundColor:'#fff' },
  playTriangle: { width:0, height:0, marginLeft:4, borderTopWidth:10, borderBottomWidth:10, borderLeftWidth:17, borderTopColor:'transparent', borderBottomColor:'transparent', borderLeftColor:'#fff' },

  // Task switcher
  taskSection:      { marginBottom:16 },
  taskSectionLabel: { fontFamily:'DM_Sans_600SemiBold', fontSize:10, color:T.txt2, letterSpacing:1.2, textTransform:'uppercase', marginBottom:8 },
  taskSwitcher:     { marginHorizontal:-20 },
  taskSwitcherContent: { paddingHorizontal:20, gap:8, flexDirection:'row', paddingRight:36 },
  taskChip: {
    flexDirection:'row', alignItems:'center', gap:6,
    paddingHorizontal:14, paddingVertical:9,
    borderRadius:20, borderWidth:1.5, borderColor:T.border,
    backgroundColor:T.card, flexShrink:0, maxWidth:180,
  },
  taskChipDot: { width:7, height:7, borderRadius:3.5, flexShrink:0 },
  taskChipTxt: { fontFamily:'DM_Sans_600SemiBold', fontSize:13, color:T.txt2 },
  noTaskBtn:   { flexDirection:'row', gap:8, paddingVertical:12, paddingHorizontal:16, borderRadius:20, borderWidth:1.5, borderColor:T.border, borderStyle:'dashed', alignItems:'center', justifyContent:'center' },
  noTaskTxt:   { fontFamily:'DM_Sans_500Medium', fontSize:13, color:T.txt3 },

  // Session log
  sessionLog:       { backgroundColor:T.card, borderRadius:20, borderWidth:1, borderColor:T.border, padding:16, gap:10, marginBottom:8 },
  sessionLogLabel:  { fontFamily:'DM_Sans_700Bold', fontSize:13, color:T.txt, marginBottom:4 },
  sessionRow:       { flexDirection:'row', alignItems:'center', gap:10 },
  sessionIcon:      { width:30, height:30, borderRadius:10, backgroundColor:T.accentD, alignItems:'center', justifyContent:'center', flexShrink:0 },
  sessionName:      { flex:1, fontFamily:'DM_Sans_500Medium', fontSize:12, color:T.txt2 },
  sessionPts:       { fontFamily:'DM_Sans_700Bold', fontSize:12, color:T.green },

  // Header
  header: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:20, paddingTop:14, paddingBottom:4, marginBottom:4,
  },
  headerSub:   { fontSize:11, color:T.txt2, letterSpacing:0.8, textTransform:'uppercase', fontWeight:'600', marginBottom:3 },
  headerTitle: { fontSize:26, fontWeight:'900', color:T.txt, letterSpacing:-0.5, fontFamily:'Fraunces_900Black' },

  // Mini player shown on Timer tab while music plays
  miniPlayer:    { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:T.card, borderRadius:16, borderWidth:1, borderColor:T.border, paddingHorizontal:10, paddingVertical:6 },
  miniPlayerTxt: { fontFamily:'DM_Sans_600SemiBold', fontSize:12, maxWidth:80 },
  miniDot:       { width:6, height:6, borderRadius:3, flexShrink:0 },
  miniPauseBtn:  { width:24, height:24, alignItems:'center', justifyContent:'center', marginLeft:2 },
  miniPauseIconWrap: { flexDirection:'row', gap:3, alignItems:'center' },
  miniPauseBar:  { width:3, height:12, borderRadius:2 },
  miniPlayTriangle: { width:0, height:0, marginLeft:2, borderTopWidth:6, borderBottomWidth:6, borderLeftWidth:10, borderTopColor:'transparent', borderBottomColor:'transparent' },

  // Floating music mascot (bottom-right when music is playing on Music tab)
  musicMascotWrap: {
    position:   'absolute',
    bottom:     100,
    right:      16,
    alignItems: 'center',
    gap:        6,
    zIndex:     60,
  },
  musicMascotGlow: {
    position:     'absolute',
    width:        72,
    height:       72,
    borderRadius: 36,
    opacity:      0.15,
    zIndex:       -1,
  },
  musicMascotLabel: {
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRadius:      12,
    borderWidth:       1.5,
    maxWidth:          120,
  },
  musicMascotLabelTxt: {
    fontFamily: 'DM_Sans_700Bold',
    fontSize:   11,
    textAlign:  'center',
  },
});
