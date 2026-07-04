// ─────────────────────────────────────────────────────────────────────────────
// app/(tabs)/tasks.tsx  —  Owl Reflection Engine
//
// XP is determined automatically — user never sets it:
//   Urgency × Importance → Tier (S/A/B/C) → Base XP
//   × Category multiplier → Multiplied XP
//   + Streak bonus (10% at 30-day streak cap)
//
// Go Premium banner above tab bar → paywall modal
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Dimensions,
  ActivityIndicator, Modal, Pressable,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay, withSequence, withRepeat,
  FadeInUp, FadeIn, LinearTransition,
  Easing, interpolate, runOnJS,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readLocalTasks, readLocalStreak, syncLocalStateToSupabase } from '@/lib/localState';

// ─── AdMob ────────────────────────────────────────────────────────────────────
// Interstitial shown when user completes ALL daily tasks (daily goal reached)
// Not shown to Pro users

let InterstitialAd_t: any = null;
let AdEventType_t: any    = null;
let TestIds_t: any        = null;
try {
  const ads = require('react-native-google-mobile-ads');
  InterstitialAd_t = ads.InterstitialAd;
  AdEventType_t    = ads.AdEventType;
  TestIds_t        = ads.TestIds;
} catch {}

const INTERSTITIAL_ID_TASKS = __DEV__
  ? (TestIds_t?.INTERSTITIAL ?? 'ca-app-pub-3940256099942544/1033173712')
  : 'ca-app-pub-3821213948228348/7547711977';

function showTasksInterstitial(): void {
  if (!InterstitialAd_t || !AdEventType_t) return;
  try {
    const ad = InterstitialAd_t.createForAdRequest(INTERSTITIAL_ID_TASKS, {
      requestNonPersonalizedAdsOnly: true,
    });
    const unsub = ad.addAdEventListener('loaded', () => {
      try { unsub(); ad.show(); } catch {}
    });
    ad.addAdEventListener(AdEventType_t.ERROR, () => {
      try { unsub(); } catch {}
    });
    ad.load();
  } catch {}
}
import { useStreakAnimation, useXpPopup, useHaptics } from '@/lib/Interactions';
import { StreakBadge, XpBurst, StreakFirstDayToast } from '@/components/Microinteractions';
import { XpCelebrationModal } from '@/components/XpCelebrationModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { useRevenueCat } from '../context/RevenueCatProvider';
import { supabase } from '@/lib/supabase';
import {
  computeXpBreakdown as calculateXp,
  TIER_META,
  type XpUrgency,
  type XpCategory,
  XpPriority,
} from '@/lib/Xp';
import { awardXP, revokeXP, getLevelInfo, getNextLevel, xpToNextLevel, getLevelProgress } from '@/lib/Xp';



const { width: W } = Dimensions.get('window');
const FREE_LIMIT = 5;
// ─── Design tokens ────────────────────────────────────────────────────────────
const TIER_COLOR = {
  S: '#F26B6B',
  A: '#7B6EF6',
  B: '#F5C842',
  C: '#54AEFF',
  D: '#3ECFA0',
  E: '#7E7E9A',
};

const TIER_BG = {
  S: 'rgba(242,107,107,0.14)',
  A: 'rgba(123,110,246,0.14)',
  B: 'rgba(245,200,66,0.14)',
  C: 'rgba(84,174,255,0.12)',
  D: 'rgba(62,207,160,0.12)',
  E: 'rgba(255,255,255,0.06)',
};
const T = {
  bg:'#07070F', card:'#111122', card2:'#181830',
  accent:'#7B6EF6', accentL:'#A99FF8', accentD:'rgba(123,110,246,0.14)',
  gold:'#F5C842', goldD:'rgba(245,200,66,0.13)',
  green:'#3ECFA0', greenD:'rgba(62,207,160,0.12)',
  red:'#F26B6B', redD:'rgba(242,107,107,0.13)',
  blue:'#54AEFF', blueD:'rgba(84,174,255,0.12)',
  teal:'#2ECEC8', rose:'#FF6B9D', roseD:'rgba(255,107,157,0.12)',
  txt:'#EEEDF8', txt2:'#7E7E9A', txt3:'#3A3A54',
  border:'rgba(255,255,255,0.055)', borderA:'rgba(123,110,246,0.22)',
};

// ─── Icons ────────────────────────────────────────────────────────────────────

type IP = { size?:number; color?:string; sw?:number };

const IcoCheckCircle = ({size=22,color=T.green,sw=1.8}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw}/>
    <Path d="M8 12.5L10.5 15L16 9" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);
const IcoCircle  = ({size=22,color=T.txt3,sw=1.8}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw}/>
  </Svg>
);
const IcoClock   = ({size=13,color=T.txt2,sw=1.7}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw}/>
    <Path d="M12 7v5l3 3" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);
const IcoStar    = ({size=13,color=T.gold,sw=1.7}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);
const IcoZap     = ({size=15,color=T.gold,sw=1.8}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);
const IcoTarget  = ({size=15,color=T.rose,sw=1.8}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw}/>
    <Circle cx="12" cy="12" r="6"  stroke={color} strokeWidth={sw}/>
    <Circle cx="12" cy="12" r="2"  stroke={color} strokeWidth={sw}/>
  </Svg>
);
const IcoRepeat  = ({size=13,color=T.teal,sw=1.7}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);
const IcoTrash   = ({size=16,color=T.red,sw=1.7}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  </Svg>
);
const IcoChevron = ({size=16,color=T.txt2,sw=2}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);
const IcoPlus    = ({size=18,color='#fff',sw=2}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  </Svg>
);
const IcoFilter  = ({size=16,color=T.txt2,sw=1.8}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);
const IcoLock    = ({size=14,color=T.gold,sw=1.8}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="11" width="18" height="11" rx="3" stroke={color} strokeWidth={sw}/>
    <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  </Svg>
);
const IcoCrown   = ({size=18,color=T.gold,sw=1.8}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M2 20h20M4 20L2 8l5 5 5-8 5 8 5-5-2 12" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);
const IcoFire    = ({size=13,color=T.gold,sw=1.7}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

// ─── Data types ───────────────────────────────────────────────────────────────
type Importance = 'important' | 'not_important';

const mapImportanceToPriority = (importance: Importance): XpPriority => {
  return importance === 'important' ? 'high' : 'low';
};

type UserStats = {
  total_xp: number;
  daily_xp_earned: number;
  daily_xp_goal: number;
  tasks_completed_today: number;
  tasks_total_today: number;
  habits_completed_today: number;
  habits_total_today: number;
  focus_minutes_today: number;
  focus_goal_minutes: number;
  current_streak: number;
  longest_streak: number;
  level: number;
};

interface Task {
  id:          string;
  user_id?:    string;
  name:        string;
  section:     'daily' | 'weekly';   // which board
  time:        string;               // display label
  urgency:     XpUrgency;
  importance:  Importance;
  category:    XpCategory;
  done:        boolean;
  done_at?:    string | null;
  recurring?:  boolean;
  subtasks?:   number;
  subtasksDone?: number;
  xp_txn_id?:  string | null;       // xp_transactions.id for revocation
}

const CAT_META: Record<XpCategory,{color:string;bg:string}> = {
  work:     {color:T.accent, bg:T.accentD},
  health:   {color:T.green,  bg:T.greenD},
  study:    {color:T.blue,   bg:T.blueD},
  personal: {color:T.teal,   bg:'rgba(46,206,200,0.12)'},
  creative: {color:T.rose,   bg:T.roseD},
};

// Tasks are loaded from Supabase — no hardcoded data

// ─────────────────────────────────────────────────────────────────────────────
// REACTIVE XP BAR
// ─────────────────────────────────────────────────────────────────────────────

function XpBar({current,total,color,milestone,mountDelay=0}:{
  current:number;total:number;color:string;milestone?:string;mountDelay?:number;
}) {
  const pct      = Math.min(current/Math.max(total,1), 1);
  const barPct   = useSharedValue(0);
  const capLeft  = useSharedValue(0);
  const glowOp   = useSharedValue(0);
  const glowSc   = useSharedValue(1);
  const floatY   = useSharedValue(0);
  const floatOp  = useSharedValue(0);
  const prevPct  = useRef(0);
  const firstRender = useRef(true);
  const [floatLabel, setFloatLabel] = useState('');
  const [floatCol,   setFloatCol]   = useState(T.gold);

  useEffect(() => {
    barPct.value  = withDelay(mountDelay+180, withSpring(pct,{damping:20,stiffness:110}));
    capLeft.value = withDelay(mountDelay+180, withSpring(pct,{damping:20,stiffness:110}));
    if (pct>=1) glowOp.value = withDelay(mountDelay+1000, withRepeat(withSequence(withTiming(1,{duration:380}),withTiming(0.2,{duration:520})),-1,true));
    prevPct.current = pct;
  }, []);

  useEffect(() => {
    if (firstRender.current) { firstRender.current=false; return; }
    const gained = pct > prevPct.current;
    const diff   = Math.abs(current - Math.round(prevPct.current*total));
    setFloatLabel(gained ? `+${diff} XP` : `-${diff} XP`);
    setFloatCol(gained ? T.gold : T.red);
    barPct.value  = withSpring(pct,{damping:gained?14:20,stiffness:gained?130:200,mass:0.9});
    capLeft.value = withSpring(pct,{damping:14,stiffness:130});
    floatOp.value = 0; floatY.value = 0;
    floatOp.value = withSequence(withTiming(1,{duration:140}),withDelay(480,withTiming(0,{duration:280})));
    floatY.value  = withTiming(-26,{duration:700,easing:Easing.out(Easing.cubic)});
    if (pct>=1 && gained) {
      glowSc.value = withSequence(withSpring(1.4,{damping:7,stiffness:260}),withSpring(1,{damping:12}));
      glowOp.value = withRepeat(withSequence(withTiming(1,{duration:340}),withTiming(0.2,{duration:480})),-1,true);
    } else if (!gained && pct<1) {
      glowOp.value=withTiming(0,{duration:200}); glowSc.value=withSpring(1);
    }
    prevPct.current=pct;
  }, [current]);

  const fillS  = useAnimatedStyle(()=>({width:`${barPct.value*100}%` as any}));
  const capS   = useAnimatedStyle(()=>({opacity:glowOp.value,transform:[{scale:glowSc.value}],left:`${capLeft.value*100}%` as any}));
  const floatS = useAnimatedStyle(()=>({opacity:floatOp.value,transform:[{translateY:floatY.value}]}));

  return (
    <View style={xS.wrap}>
      <View style={xS.row}>
        <View style={xS.left}>
          <IcoStar size={12} color={color}/>
          <Text style={[xS.cur,{color}]}>{current} XP</Text>
          {pct>=1&&milestone&&(
            <Animated.View style={{transform:[{scale:glowSc}]}}>
              <Text style={xS.milestone}>{milestone}</Text>
            </Animated.View>
          )}
        </View>
        <View style={xS.rightG}>
          <Animated.Text style={[xS.float,{color:floatCol},floatS]}>{floatLabel}</Animated.Text>
          <Text style={xS.total}>{total} XP</Text>
        </View>
      </View>
      <View style={xS.track}>
        <Animated.View style={[xS.fillWrap,fillS]}>
          <LinearGradient colors={[color+'AA',color]} start={{x:0,y:0}} end={{x:1,y:0}} style={{flex:1}}/>
        </Animated.View>
        <Animated.View style={[xS.cap,{backgroundColor:color},capS]}/>
      </View>
      <Text style={[xS.pctTxt,{color:color+'AA'}]}>{Math.round(pct*100)}% complete</Text>
    </View>
  );
}

const xS = StyleSheet.create({
  wrap:     {gap:5},
  row:      {flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  left:     {flexDirection:'row',alignItems:'center',gap:5},
  rightG:   {flexDirection:'row',alignItems:'center',gap:6,position:'relative'},
  cur:      {fontFamily:'DM_Sans_700Bold',fontSize:12},
  milestone:{fontFamily:'DM_Sans_700Bold',fontSize:10,color:T.gold,marginLeft:2},
  total:    {fontFamily:'DM_Sans_400Regular',fontSize:11,color:T.txt3},
  float:    {position:'absolute',right:38,bottom:0,fontFamily:'DM_Sans_700Bold',fontSize:12,zIndex:20},
  track:    {height:6,backgroundColor:'rgba(255,255,255,0.07)',borderRadius:4,overflow:'visible',position:'relative'},
  fillWrap: {height:6,borderRadius:4,overflow:'hidden'},
  cap:      {position:'absolute',top:-5,width:16,height:16,borderRadius:8,marginLeft:-8},
  pctTxt:   {fontFamily:'DM_Sans_500Medium',fontSize:10,marginTop:1},
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK ROW — shows auto-calculated XP tier badge + streak bonus
// ─────────────────────────────────────────────────────────────────────────────

function TaskRow({task,streak,onToggle,onDelete,delay,isActive,onActivate}:{
  task:Task; streak:number; onToggle:()=>void; onDelete:()=>void; delay:number;
  isActive:boolean; onActivate:()=>void;
}) {
  const priority  = mapImportanceToPriority(task.importance);
  const xpBreak   = calculateXp(priority, task.urgency, task.section ?? 'daily', task.category, streak);
  const tierColor = TIER_COLOR[xpBreak.tier];
  const cm        = CAT_META[task.category];

  const rowSc      = useSharedValue(1);
  const checkSc    = useSharedValue(task.done ? 1 : 0);
  const rowOp      = useSharedValue(1);
  const xpPopSc    = useSharedValue(1);
  const stripeSc   = useSharedValue(1);
  const floatXpY   = useSharedValue(0);
  const floatXpOp  = useSharedValue(0);
  const activeGlow = useSharedValue(isActive ? 1 : 0);
  const prevDone   = useRef(task.done);

  useEffect(() => {
    activeGlow.value = withTiming(isActive ? 1 : 0, { duration:200 });
  }, [isActive]);

  useEffect(() => {
    const justCompleted = task.done && !prevDone.current;
    checkSc.value = withSpring(task.done ? 1 : 0, { damping:10, stiffness:320 });
    xpPopSc.value = withSequence(withSpring(1.18,{damping:8,stiffness:420}), withSpring(1,{damping:12}));
    if (justCompleted) {
      stripeSc.value = withSequence(
        withSpring(1.8, { damping:6, stiffness:600 }),
        withSpring(1,   { damping:10 })
      );
      floatXpY.value  = 0;
      floatXpOp.value = 0;
      floatXpOp.value = withSequence(
        withTiming(1, { duration:120 }),
        withDelay(500, withTiming(0, { duration:300 }))
      );
      floatXpY.value = withTiming(-44, { duration:800, easing:Easing.out(Easing.cubic) });
    }
    prevDone.current = task.done;
  }, [task.done]);

  const handleToggle  = () => {
    rowSc.value = withSequence(withSpring(0.97,{damping:14,stiffness:500}), withSpring(1,{damping:12}));
    onToggle();
  };
  const handleDelete  = () => {
    rowOp.value = withTiming(0, {duration:200}, () => runOnJS(onDelete)());
    rowSc.value = withTiming(0.88, {duration:200});
  };

  const rowStyle       = useAnimatedStyle(()=>({ transform:[{scale:rowSc.value}], opacity:rowOp.value }));
  const checkStyle     = useAnimatedStyle(()=>({ transform:[{scale:checkSc.value}], opacity:checkSc.value }));
  const xpStyle        = useAnimatedStyle(()=>({ transform:[{scale:xpPopSc.value}] }));
  const stripeStyle    = useAnimatedStyle(()=>({ transform:[{scaleX:stripeSc.value}] }));
  const floatStyle     = useAnimatedStyle(()=>({ opacity:floatXpOp.value, transform:[{translateY:floatXpY.value}] }));
  const cardBorderStyle= useAnimatedStyle(()=>({
    borderColor:     `rgba(123,110,246,${isActive ? 0.55 * activeGlow.value : 0.055})`,
    backgroundColor: isActive ? `rgba(123,110,246,${0.07 * activeGlow.value})` : T.card2,
  }));

  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(360).springify()}
      layout={LinearTransition.springify()}
      style={rowStyle}
    >
      {/* Floating +XP */}
      <Animated.View style={[S.floatXpWrap, floatStyle]} pointerEvents="none">
        <Text style={S.floatXpTxt}>+{xpBreak.total} XP ✨</Text>
      </Animated.View>

      {/* Full card tap = set active instantly */}
      <TouchableOpacity onPress={onActivate} activeOpacity={0.92}>
        <Animated.View style={[S.taskCard, cardBorderStyle]}>
          <Animated.View style={[S.stripe, {backgroundColor:tierColor}, stripeStyle]}/>
          <View style={S.taskBody}>
            <View style={S.taskTop}>
              <TouchableOpacity
                onPress={(e)=>{ e.stopPropagation?.(); handleToggle(); }}
                activeOpacity={0.7} style={S.checkBtn}
                hitSlop={{top:8,bottom:8,left:8,right:8}}
              >
                {task.done && (
                  <Animated.View style={[StyleSheet.absoluteFill, checkStyle]}>
                    <IcoCheckCircle size={22} color={T.green}/>
                  </Animated.View>
                )}
                <View style={{opacity:task.done?0:1}}><IcoCircle size={22} color={T.txt3}/></View>
              </TouchableOpacity>
              <Text style={[S.taskName, task.done && S.taskDone]} numberOfLines={2}>{task.name}</Text>
              <TouchableOpacity
                onPress={(e)=>{ e.stopPropagation?.(); handleDelete(); }}
                style={S.delBtn} activeOpacity={0.7}
              >
                <IcoTrash size={15} color={T.txt3}/>
              </TouchableOpacity>
            </View>
            <View style={S.metaRow}>
              <View style={S.chip}>
                <IcoClock size={12}/>
                <Text style={S.chipTxt}>{task.time ?? 'Today'}</Text>
              </View>
              {task.recurring && (
                <View style={[S.chip,{backgroundColor:'rgba(46,206,200,0.10)',borderColor:'rgba(46,206,200,0.22)',borderWidth:1}]}>
                  <IcoRepeat size={12} color={T.teal}/>
                  <Text style={[S.chipTxt,{color:T.teal}]}>Recurring</Text>
                </View>
              )}
              <View style={[S.chip,{backgroundColor:TIER_BG[xpBreak.tier],borderColor:tierColor+'44',borderWidth:1}]}>
                <Text style={[S.chipTxt,{color:tierColor}]}>{xpBreak.tierLabel}</Text>
              </View>
              <View style={[S.chip,{backgroundColor:cm.bg}]}>
                <Text style={[S.chipTxt,{color:cm.color}]}>{task.category}</Text>
              </View>
            </View>
            {task.subtasks !== undefined && (
              <View style={S.subRow}>
                <View style={S.subTrack}>
                  <View style={[S.subFill,{width:`${((task.subtasksDone??0)/task.subtasks)*100}%` as any,backgroundColor:task.done?T.green:T.accent}]}/>
                </View>
                <Text style={S.subTxt}>{task.subtasksDone}/{task.subtasks}</Text>
              </View>
            )}
            <Animated.View style={[S.xpRow, xpStyle]}>
              <IcoStar size={12} color={task.done ? T.gold : T.txt3}/>
              <Text style={[S.xpTxt, {color:task.done ? T.gold : T.txt3}]}>+{xpBreak.total} XP</Text>
              <Text style={S.xpBase}>
                ({xpBreak.tier}: {xpBreak.withSection}{xpBreak.streakBonus>0?` +🔥${xpBreak.streakBonus}`:''})</Text>
              {task.done && (
                <Animated.View entering={FadeIn.duration(260)} style={S.earnedBadge}>
                  <Text style={S.earnedTxt}>Earned!</Text>
                </Animated.View>
              )}
            </Animated.View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK SECTION
// ─────────────────────────────────────────────────────────────────────────────

interface SectionProps {
  title:string;subtitle:string;icon:React.ReactNode;accentColor:string;
  tasks:Task[];streak:number;milestone?:string;
  onToggle:(id:string)=>void;onDelete:(id:string)=>void;
  onAddPress:()=>void;isPro:boolean;startDelay:number;
  activeTaskId:string|null;onActivate:(id:string)=>void;
}

function TaskSection({
  title,subtitle,icon,accentColor,tasks,streak,milestone,
  onToggle,onDelete,onAddPress,isPro,startDelay,
  activeTaskId,onActivate,
}:SectionProps) {
  const [collapsed,setCollapsed]=useState(false);
  const [filter,setFilter]=useState<'all'|'active'|'done'>('all');
  const chevRot=useSharedValue(0);

  const handleCollapse=()=>{
    setCollapsed(c=>!c);
    chevRot.value=withSpring(collapsed?0:-90,{damping:14,stiffness:260});
  };
  const chevStyle=useAnimatedStyle(()=>({transform:[{rotate:`${chevRot.value}deg`}]}));

  // XP totals — computed from formula, not from task.xp field
  const xpTotal = tasks.reduce((a,t)=>{
  const p = mapImportanceToPriority(t.importance);
  return a + calculateXp(p, t.urgency, 'daily', t.category, streak).total;
},0);
  const xpCurrent = tasks.filter(t=>t.done).reduce((a,t)=>{
  const p = mapImportanceToPriority(t.importance);
  return a + calculateXp(p, t.urgency, 'daily', t.category, streak).total;
},0);
  const doneCount = tasks.filter(t=>t.done).length;
  const filtered  = tasks.filter(t=>filter==='active'?!t.done:filter==='done'?t.done:true);
  const atLimit   = !isPro && tasks.length>=FREE_LIMIT;

  return (
    <Animated.View entering={FadeInUp.delay(startDelay).duration(440)} style={S.section}>
      <View style={[S.sectionCard,{borderColor:accentColor+'33'}]}>
        <LinearGradient colors={[accentColor+'12','transparent']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill} pointerEvents="none"/>

        <TouchableOpacity onPress={handleCollapse} activeOpacity={0.8} style={S.sectionTop}>
          <View style={[S.sectionIcon,{backgroundColor:accentColor+'18',borderColor:accentColor+'33'}]}>
            {icon}
          </View>
          <View style={{flex:1}}>
            <Text style={S.sectionTitle}>{title}</Text>
            <Text style={S.sectionSub}>{subtitle}</Text>
          </View>
          <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
            <View style={[S.countBadge,{backgroundColor:accentColor+'20',borderColor:accentColor+'40'}]}>
              <Text style={[S.countTxt,{color:accentColor}]}>{doneCount}/{tasks.length}</Text>
            </View>
            <Animated.View style={chevStyle}><IcoChevron/></Animated.View>
          </View>
        </TouchableOpacity>

        {/* Reactive XP bar */}
        <View style={{marginBottom:12}}>
          <XpBar current={xpCurrent} total={xpTotal} color={accentColor}
            milestone={xpCurrent>=xpTotal?(milestone??'🏆 Complete!'):undefined}
            mountDelay={startDelay}
          />
        </View>

        {/* Streak bonus notice */}
        {streak>0&&(
          <Animated.View entering={FadeIn.duration(300)} style={S.streakNotice}>
            <Text style={{fontSize:14}}>🔥</Text>
            <Text style={S.streakNoticeTxt}>
              {streak}-day streak · +{Math.round(Math.min(streak,30)/30*10)}% bonus on all XP
            </Text>
          </Animated.View>
        )}

        {/* Filter pills */}
        <View style={{flexDirection:'row',gap:6,marginTop:8}}>
          {(['all','active','done'] as const).map(f=>(
            <TouchableOpacity key={f} onPress={()=>setFilter(f)}
              style={[S.filterPill,filter===f&&{backgroundColor:accentColor+'22',borderColor:accentColor+'55'}]}>
              <Text style={[S.filterTxt,{color:filter===f?accentColor:T.txt3}]}>
                {f.charAt(0).toUpperCase()+f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {!collapsed&&(
        <View style={S.taskList}>
          {filtered.map((t,i)=>(
            <TaskRow
              key={t.id} task={t} streak={streak}
              onToggle={()=>onToggle(t.id)}
              onDelete={()=>onDelete(t.id)}
              delay={startDelay+80+i*48}
              isActive={activeTaskId===t.id}
              onActivate={()=>onActivate(t.id)}
            />
          ))}
          {filtered.length===0&&(
            <Animated.View entering={FadeIn.duration(280)} style={S.empty}>
              {tasks.length===0 ? (
                <>
                  <Text style={{fontSize:32}}>📋</Text>
                  <Text style={S.emptyTxt}>No tasks yet</Text>
                  <Text style={{fontFamily:'DM_Sans_400Regular',fontSize:11,color:T.txt3,textAlign:'center',marginTop:2}}>Tap the button below to add your first {title.toLowerCase().includes('weekly')?'goal':'task'}</Text>
                </>
              ) : (
                <>
                  <Text style={{fontSize:26}}>✨</Text>
                  <Text style={S.emptyTxt}>All clear!</Text>
                </>
              )}
            </Animated.View>
          )}
          <TouchableOpacity
            onPress={atLimit?()=>router.push('/modal/paywall'):onAddPress}
            activeOpacity={0.85}
            style={[S.addBtn,atLimit&&S.addBtnLocked]}
          >
            {atLimit
              ?<><IcoLock size={14} color={T.gold}/><Text style={[S.addTxt,{color:T.gold}]}>Unlock more · Go Pro</Text></>
              :<><IcoPlus size={14} color={accentColor} sw={2.2}/><Text style={[S.addTxt,{color:accentColor}]}>Add {title.toLowerCase().includes('weekly')?'weekly goal':'daily task'}</Text></>
            }
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// ADD TASK SHEET — no XP field, user picks urgency + importance + category
// ─────────────────────────────────────────────────────────────────────────────

function AddTaskSheet({visible,onClose,onAdd,section,streak}:{
  visible:boolean;onClose:()=>void;
  onAdd:(t:Partial<Task>)=>void;section:'daily'|'weekly';streak:number;
}) {
  const [name,       setName]       = useState('');
  const [urgency,    setUrgency]    = useState<XpUrgency>('normal');
  const [importance, setImportance] = useState<Importance>('important');
  const [category,   setCategory]  = useState<XpCategory>('work');
  const ty=useSharedValue(600); const oop=useSharedValue(0);

  useEffect(()=>{setName('');},[visible]);
  useEffect(()=>{
    oop.value=withTiming(visible?1:0,{duration:220});
    ty.value=withSpring(visible?0:600,{damping:20,stiffness:260});
  },[visible]);

  const sheetS   = useAnimatedStyle(()=>({transform:[{translateY:ty.value}]}));
  const overlayS = useAnimatedStyle(()=>({opacity:oop.value}));

  const priority = mapImportanceToPriority(importance);

const preview = calculateXp(
  priority,
  urgency,
  section,
  category,
  streak
);

  const handleAdd=()=>{
    if(!name.trim()) return;
    onAdd({name:name.trim(),urgency,importance,category});
    setName(''); onClose();
  };

  if(!visible) return null;

  const URGENCY_OPTS:  {val:XpUrgency;    label:string}[] = [{val:'urgent',label:'🔴 Urgent'},{val:'normal',label:'🟢 Not Urgent'}];
  const IMPORT_OPTS: {val: Importance; label:string}[] = [
  {val:'important',label:'⭐ Important'},
  {val:'not_important',label:'📌 Not Important'}
];
  const CATEGORY_OPTS: XpCategory[] = ['work','health','study','personal','creative'];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[S.overlay,overlayS]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose}/>
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={S.sheetKAV} pointerEvents="box-none">
        <Animated.View style={[S.sheet,sheetS]}>
          <View style={S.sheetHandle}/>
          <Text style={S.sheetTitle}>{section==='daily'?'⚡ Daily Task':'🎯 Weekly Goal'}</Text>

          <TextInput style={S.sheetInput} value={name} onChangeText={setName}
            placeholder="Task name…" placeholderTextColor={T.txt3} autoFocus/>

          {/* Urgency picker */}
          <Text style={S.sheetLabel}>Urgency</Text>
          <View style={S.row}>
            {URGENCY_OPTS.map(o=>(
              <TouchableOpacity key={o.val} onPress={()=>setUrgency(o.val)}
                style={[S.pill, urgency===o.val&&{backgroundColor:'rgba(242,107,107,0.12)',borderColor:T.red}]}>
                <Text style={[S.pillTxt,{color:urgency===o.val?T.red:T.txt3}]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Importance picker */}
          <Text style={S.sheetLabel}>Importance</Text>
          <View style={S.row}>
            {IMPORT_OPTS.map(o=>(
              <TouchableOpacity key={o.val} onPress={()=>setImportance(o.val)}
                style={[S.pill, importance===o.val&&{backgroundColor:T.accentD,borderColor:T.accent}]}>
                <Text style={[S.pillTxt,{color:importance===o.val?T.accentL:T.txt3}]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Category picker */}
          <Text style={S.sheetLabel}>Category</Text>
          <View style={S.row}>
            {CATEGORY_OPTS.map(c=>{
              const cm=CAT_META[c];
              return (
                <TouchableOpacity key={c} onPress={()=>setCategory(c)}
                  style={[S.pill,category===c&&{backgroundColor:cm.bg,borderColor:cm.color}]}>
                  <Text style={[S.pillTxt,{color:category===c?cm.color:T.txt3}]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* XP Preview — live calculation */}
          <View style={S.xpPreview}>
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <View style={[S.tierDot,{backgroundColor:TIER_COLOR[preview.tier]}]}/>
              <Text style={[S.tierLabel,{color:TIER_COLOR[preview.tier]}]}>
                Tier {preview.tier} — {preview.tierLabel}
              </Text>
            </View>
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <Text style={S.xpPreviewNum}>+{preview.total} XP</Text>
              {preview.streakBonus>0&&(
                <Text style={S.xpPreviewBonus}>+🔥{preview.streakBonus} streak bonus</Text>
              )}
            </View>
          </View>

          <TouchableOpacity onPress={handleAdd} activeOpacity={0.85}>
            <LinearGradient colors={['#8B7EF8','#5C4FD4']} start={{x:0,y:0}} end={{x:1,y:0}} style={S.saveBtn}>
              <IcoPlus size={18} color="#fff"/><Text style={S.saveBtnTxt}>Add Task</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MASCOT TOAST — appears briefly only on task complete / XP earned
// Slides up from bottom, holds 2s, slides back down
// ─────────────────────────────────────────────────────────────────────────────

interface MascotToastProps {
  visible: boolean;
  emoji: string;
  title: string;
  sub: string;
}

function MascotToast({ visible, emoji, title, sub }: MascotToastProps) {
  const ty   = useSharedValue(120);
  const op   = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      ty.value = withSpring(0, { damping:18, stiffness:280 });
      op.value = withTiming(1, { duration:200 });
    } else {
      ty.value = withTiming(120, { duration:300, easing:Easing.in(Easing.quad) });
      op.value = withTiming(0,   { duration:250 });
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity:   op.value,
  }));

  return (
    <Animated.View style={[S.mascotToast, style]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(123,110,246,0.22)','rgba(123,110,246,0.10)']}
        start={{x:0,y:0}} end={{x:1,y:1}}
        style={S.mascotToastInner}
      >
        <Text style={S.mascotToastEmoji}>{emoji}</Text>
        <View style={{flex:1}}>
          <Text style={S.mascotToastTitle}>{title}</Text>
          <Text style={S.mascotToastSub}>{sub}</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GO PREMIUM BANNER
// ─────────────────────────────────────────────────────────────────────────────

function GoPremiumBanner() {
  const scale=useSharedValue(1);
  const shimX=useSharedValue(-W);

  useEffect(()=>{
    shimX.value=withRepeat(withTiming(W+200,{duration:2400,easing:Easing.inOut(Easing.quad)}),-1);
    scale.value=withRepeat(withSequence(withSpring(1.014,{damping:8,stiffness:100}),withSpring(1,{damping:10})),-1,true);
  },[]);

  const handlePress=()=>{
    scale.value=withSequence(withSpring(0.96),withSpring(1.04),withSpring(1));
    router.push('/modal/paywall');
  };

  const btnS  = useAnimatedStyle(()=>({transform:[{scale:scale.value}]}));
  const shimS = useAnimatedStyle(()=>({transform:[{translateX:shimX.value}]}));

  return (
    <Animated.View style={[S.premiumWrap,btnS]}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1}>
        <LinearGradient colors={['#1A1535','#0F0F22']} start={{x:0,y:0}} end={{x:1,y:1}} style={S.premiumCard}>
          <View style={S.premiumBorder}/>
          <Animated.View style={[S.shimmerStrip,shimS]}>
            <LinearGradient colors={['transparent','rgba(245,200,66,0.09)','transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={{flex:1}}/>
          </Animated.View>
          <View style={{flexDirection:'row',alignItems:'center',gap:12,flex:1}}>
            <View style={S.crownBox}><IcoCrown size={20} color={T.gold}/></View>
            <View style={{flex:1}}>
              <Text style={S.premiumTitle}>Go Premium</Text>
              <Text style={S.premiumSub}>Unlimited tasks · Streak multipliers · 3-day trial</Text>
            </View>
          </View>
          <LinearGradient colors={[T.gold,'#E8A800']} start={{x:0,y:0}} end={{x:1,y:1}} style={S.premiumPill}>
            <Text style={S.premiumPillTxt}>Try Free</Text>
          </LinearGradient>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { isPro } = useRevenueCat();  // live entitlement check

  const [userId,       setUserId]       = useState<string|null>(null);
  const [streak,       setStreak]       = useState(0);
  const [dailyTasks,   setDailyTasks]   = useState<Task[]>([]);
  const [weeklyTasks,  setWeeklyTasks]  = useState<Task[]>([]);
  const [sheet,        setSheet]        = useState<null|'daily'|'weekly'>(null);
  const [loading,      setLoading]      = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string|null>(null);
  const [celebXp,       setCelebXp]      = useState(0);
  const [celebTotalXp,  setCelebTotalXp] = useState(0);
  const [showCelebModal,setShowCelebModal] = useState(false);

  // Mascot toast — only visible on complete or XP earned
  const [toast, setToast] = useState({ visible:false, emoji:'🎉', title:'', sub:'' });
  const toastTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const showToast = (emoji:string, title:string, sub:string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible:true, emoji, title, sub });
    toastTimer.current = setTimeout(()=>setToast(t=>({...t,visible:false})), 2200);
  };

  // Micro-interactions
  const { streakEvent, clearEvent } = useStreakAnimation(streak);
  const { showXp, xpAmount, visible: xpBurstVisible } = useXpPopup();
  const haptics = useHaptics();
  const prevStreakRef = useRef(streak);
  const [showFirstDayToast, setShowFirstDayToast] = useState(false);
  const [lastEarnedXp, setLastEarnedXp] = useState(0);

  // ─────────────────────────────────────────────────────────────────────────
  // LOCAL-FIRST ARCHITECTURE
  // Tasks → AsyncStorage ("tasks_data")
  // Streak → AsyncStorage ("streak_data")
  // XP → Supabase only (awardXP / revokeXP)
  // ─────────────────────────────────────────────────────────────────────────

  // ── Storage helpers ──────────────────────────────────────────────────────

  const TASKS_KEY  = 'tasks_data';
  const STREAK_KEY = 'streak_data';

  const loadTasks = useCallback(async (): Promise<{daily:Task[];weekly:Task[]}> => {
    try {
      const raw = await AsyncStorage.getItem(TASKS_KEY);
      if (!raw) return { daily:[], weekly:[] };
      const all: Task[] = JSON.parse(raw);
      return {
        daily:  all.filter(t => t.section === 'daily'),
        weekly: all.filter(t => t.section === 'weekly'),
      };
    } catch {
      return { daily:[], weekly:[] };
    }
  }, []);

  const saveTasks = useCallback(async (daily: Task[], weekly: Task[]) => {
    try {
      await AsyncStorage.setItem(TASKS_KEY, JSON.stringify([...daily, ...weekly]));
    } catch {}
  }, []);

  // ── Streak helpers ───────────────────────────────────────────────────────

  interface StreakData {
    count:             number;
    lastCompletedDate: string | null; // ISO date "YYYY-MM-DD"
  }

  const todayStr = (): string => new Date().toISOString().split('T')[0];

  const loadStreak = useCallback(async (): Promise<StreakData> => {
    try {
      const raw = await AsyncStorage.getItem(STREAK_KEY);
      if (!raw) return { count:0, lastCompletedDate:null };
      const s: StreakData = JSON.parse(raw);
      // If last completion was 2+ days ago, streak is broken
      if (s.lastCompletedDate) {
        const last  = new Date(s.lastCompletedDate);
        const today = new Date(todayStr());
        const diffDays = Math.round((today.getTime() - last.getTime()) / 86400000);
        if (diffDays >= 2) {
          const reset: StreakData = { count:0, lastCompletedDate:null };
          await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(reset));
          return reset;
        }
      }
      return s;
    } catch {
      return { count:0, lastCompletedDate:null };
    }
  }, []);

  const updateStreakOnTaskComplete = useCallback(async (current: StreakData): Promise<StreakData> => {
    const today = todayStr();
    // Already recorded today — don't increment again
    if (current.lastCompletedDate === today) return current;
    const updated: StreakData = {
      count:             current.count + 1,
      lastCompletedDate: today,
    };
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(updated));
    return updated;
  }, []);

  // ── Load on every screen focus (local only, instant) ─────────────────────

  useFocusEffect(useCallback(() => {
    let mounted = true;
    (async () => {
      // Get userId from Supabase auth (no DB query needed for tasks)
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      setUserId(user.id);

      // Load tasks from local storage
      const { daily, weekly } = await loadTasks();
      if (!mounted) return;

      // Daily reset: mark all daily tasks as undone if it's a new day
      const today = todayStr();
      let needsSave = false;
      const resetDaily = daily.map(t => {
        if (t.done && t.done_at) {
          const doneDay = t.done_at.split('T')[0];
          if (doneDay !== today) {
            needsSave = true;
            return { ...t, done:false, done_at:null, xp_txn_id:null };
          }
        }
        return t;
      });
      if (needsSave) {
        setDailyTasks(resetDaily);
        setWeeklyTasks(weekly);
        await saveTasks(resetDaily, weekly);
      } else {
        setDailyTasks(daily);
        setWeeklyTasks(weekly);
      }

      // Load streak from local storage
      const s = await loadStreak();
      if (!mounted) return;
      setStreak(s.count);
      prevStreakRef.current = s.count;

      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [loadTasks, saveTasks, loadStreak]));

  // ── Toggle a task: local-first + XP to Supabase ──────────────────────────

  const toggleTask = useCallback(async (id: string, section: 'daily'|'weekly') => {
    const tasks = section === 'daily' ? dailyTasks : weeklyTasks;
    const setT  = section === 'daily' ? setDailyTasks : setWeeklyTasks;
    const task  = tasks.find(t => t.id === id);
    if (!task || !userId) return;

    const nowDone  = !task.done;
    const priority = mapImportanceToPriority(task.importance);
    const xpBreak  = calculateXp(priority, task.urgency, section, task.category, streak);
    const doneAt   = nowDone ? new Date().toISOString() : null;

    // 1. Optimistic UI — instant, never resets on tab switch
    const updatedTask = { ...task, done:nowDone, done_at:doneAt };
    setT(prev => {
      const next = prev.map(t => t.id === id ? updatedTask : t);
      // Persist to AsyncStorage immediately
      const otherSection = section === 'daily' ? weeklyTasks : dailyTasks;
      const [d, w] = section === 'daily' ? [next, otherSection] : [otherSection, next];
      saveTasks(d, w);
      return next;
    });

    if (nowDone) {
      // 2. Award XP in Supabase
      const txnId = await awardXP(userId, xpBreak.total, `task:${id}:${Date.now()}`, task.name);
      if (txnId) {
        // Save txnId locally so we can revoke if untoggled
        setT(prev => {
          const next = prev.map(t => t.id === id ? { ...t, xp_txn_id:txnId } : t);
          const otherSection = section === 'daily' ? weeklyTasks : dailyTasks;
          const [d, w] = section === 'daily' ? [next, otherSection] : [otherSection, next];
          saveTasks(d, w);
          return next;
        });
      }

      // 3. Update streak locally (idempotent — only increments once per day)
      const currentStreakData = await loadStreak();
      const newStreakData     = await updateStreakOnTaskComplete(currentStreakData);
      setStreak(newStreakData.count);

      // 4. First-day streak celebration
      if (currentStreakData.count === 0 && newStreakData.count === 1) {
        setShowFirstDayToast(true);
      }
      prevStreakRef.current = newStreakData.count;

      // 4b. Sync local task counts + streak → Supabase user_profiles
      //     (fire-and-forget — keeps home/stats rings accurate)
      const localSummary = await readLocalTasks();
      syncLocalStateToSupabase(userId, {
        todayDone:  localSummary.todayDone,
        todayTotal: localSummary.todayTotal,
      }, { count: newStreakData.count });

      // 5. Show feedback: XP burst + toast + celebration modal
      showToast('🎉', 'Task complete!', `+${xpBreak.total} XP earned`);
      setLastEarnedXp(xpBreak.total);
      showXp(xpBreak.total);
      haptics.trigger('success');

      // 6. XP celebration modal — fetch fresh total from Supabase
      supabase.from('user_profiles').select('total_xp').eq('id', userId).single()
        .then(({ data }) => {
          setCelebXp(xpBreak.total);
          setCelebTotalXp(data?.total_xp ?? xpBreak.total);
          setShowCelebModal(true);
        });

      // 7. Interstitial ad when user hits their daily goal (all daily tasks done)
      //    Only for free users — Pro users get an ad-free experience
      if (!isPro && section === 'daily') {
        // Re-read local tasks to check if ALL daily tasks are now done
        readLocalTasks().then(summary => {
          const allDone = summary.todayDone > 0 && summary.todayDone >= summary.todayTotal;
          if (allDone) {
            // Small delay so XP modal renders first
            setTimeout(() => showTasksInterstitial(), 600);
          }
        });
      }

    } else if (task.xp_txn_id) {
      // Untoggling — revoke XP in Supabase
      await revokeXP(userId, task.xp_txn_id, xpBreak.total);
      setT(prev => {
        const next = prev.map(t => t.id === id ? { ...t, xp_txn_id:null } : t);
        const otherSection = section === 'daily' ? weeklyTasks : dailyTasks;
        const [d, w] = section === 'daily' ? [next, otherSection] : [otherSection, next];
        saveTasks(d, w);
        return next;
      });
      // Sync updated task counts (one fewer completed) to Supabase
      readLocalTasks().then(s => {
        const streakCount = streak; // streak doesn't change on untoggle
        syncLocalStateToSupabase(userId, {
          todayDone:  Math.max(0, s.todayDone - 1),
          todayTotal: s.todayTotal,
        }, { count: streakCount });
      });
    }
  }, [userId, streak, dailyTasks, weeklyTasks, loadStreak, updateStreakOnTaskComplete, saveTasks]);

  const toggleDaily  = (id: string) => toggleTask(id, 'daily');
  const toggleWeekly = (id: string) => toggleTask(id, 'weekly');

  // ── Delete: remove locally + revoke XP ──────────────────────────────────

  const deleteTask = useCallback(async (id: string, section: 'daily'|'weekly') => {
    const tasks = section === 'daily' ? dailyTasks : weeklyTasks;
    const setT  = section === 'daily' ? setDailyTasks : setWeeklyTasks;
    const task  = tasks.find(t => t.id === id);
    if (!task) return;

    setT(prev => {
      const next = prev.filter(t => t.id !== id);
      const otherSection = section === 'daily' ? weeklyTasks : dailyTasks;
      const [d, w] = section === 'daily' ? [next, otherSection] : [otherSection, next];
      saveTasks(d, w);
      return next;
    });

    if (task.done && task.xp_txn_id && userId) {
      const p = mapImportanceToPriority(task.importance);
      const x = calculateXp(p, task.urgency, section, task.category, streak);
      await revokeXP(userId, task.xp_txn_id, x.total);
    }
  }, [userId, streak, dailyTasks, weeklyTasks, saveTasks]);

  const deleteDaily  = (id: string) => deleteTask(id, 'daily');
  const deleteWeekly = (id: string) => deleteTask(id, 'weekly');

  // ── Add task: local-only, instant ────────────────────────────────────────

  const addTask = (section: 'daily'|'weekly') => (partial: Partial<Task>) => {
    const list = section === 'daily' ? dailyTasks : weeklyTasks;
    if (!isPro && list.length >= FREE_LIMIT) { router.push('/modal/paywall'); return; }
    if (!userId) return;

    const newTask: Task = {
      id:         `local_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      user_id:    userId,
      section,
      name:       partial.name ?? 'New task',
      time:       section === 'daily' ? 'Today' : 'This week',
      urgency:    partial.urgency    ?? 'normal',
      importance: partial.importance ?? 'important',
      category:   partial.category   ?? 'work',
      done:       false,
      done_at:    null,
      xp_txn_id:  null,
    };

    if (section === 'daily') {
      setDailyTasks(prev => {
        const next = [...prev, newTask];
        saveTasks(next, weeklyTasks);
        return next;
      });
    } else {
      setWeeklyTasks(prev => {
        const next = [...prev, newTask];
        saveTasks(dailyTasks, next);
        return next;
      });
    }
  };


  const dailyXpTotal = dailyTasks.reduce((a,t)=>{
  const p = mapImportanceToPriority(t.importance);
  return a + calculateXp(p, t.urgency, 'daily', t.category, streak).total;
},0);
  const weeklyXpTotal = weeklyTasks.reduce((a,t)=>{
  const p = mapImportanceToPriority(t.importance);
  return a + calculateXp(p, t.urgency, 'weekly', t.category, streak).total;
},0);
  const totalEarned = [...dailyTasks,...weeklyTasks]
  .filter(t=>t.done)
  .reduce((a,t)=>{
    const p = mapImportanceToPriority(t.importance);
    return a + calculateXp(p, t.urgency, 'daily', t.category, streak).total;
  },0);

  if (loading) return (
    <View style={[S.root,{justifyContent:'center',alignItems:'center',paddingTop:insets.top}]}>
      <ActivityIndicator color="#7B6EF6" size="large"/>
    </View>
  );

  return (
    <View style={[S.root,{paddingTop:insets.top}]}>
      <View style={S.orb1}/><View style={S.orb2}/>

      <Animated.View entering={FadeInUp.delay(0).duration(440)} style={S.header}>
        <View>
          <Text style={S.headerSub}>YOUR BOARD</Text>
          <Text style={S.headerTitle}>Tasks</Text>
        </View>
        <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
          <View style={S.xpChip}>
            <IcoZap size={13} color={T.gold}/>
            <Text style={S.xpChipTxt}>{totalEarned} XP today</Text>
            {streak > 0 && (
              <StreakBadge
                streak={streak}
                streakEvent={streakEvent}
                onAnimDone={clearEvent}
              />
            )}
          </View>
          <TouchableOpacity style={S.filterBtn}><IcoFilter size={16}/></TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView
        style={{flex:1}}
        contentContainerStyle={[S.scrollContent,{paddingBottom:insets.bottom+150}]}
        showsVerticalScrollIndicator={false}
      >
        {/* XpBurst floats above the daily section on task complete */}
        <View style={{ position:'relative' }}>
          <XpBurst xp={lastEarnedXp} visible={xpBurstVisible} color="#F5C842"/>
          <TaskSection
          title="Daily Tasks"
          subtitle={new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}
          icon={<IcoZap size={18} color={T.gold}/>}
          accentColor={T.gold}
          tasks={dailyTasks}
          streak={streak}
          milestone="🏆 Daily Complete!"
          onToggle={toggleDaily}
          onDelete={deleteDaily}
          onAddPress={()=>setSheet('daily')}
          isPro={isPro}
          startDelay={80}
          activeTaskId={activeTaskId}
          onActivate={setActiveTaskId}
        />

        <View style={{height:1,backgroundColor:T.border,marginVertical:18,marginHorizontal:4}}/>

        <TaskSection
          title="Weekly Goals"
          subtitle={`Week of ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}`}
          icon={<IcoTarget size={18} color={T.accent}/>}
          accentColor={T.accent}
          tasks={weeklyTasks}
          streak={streak}
          milestone="🏆 Week Complete!"
          onToggle={toggleWeekly}
          onDelete={deleteWeekly}
          onAddPress={()=>setSheet('weekly')}
          isPro={isPro}
          startDelay={200}
          activeTaskId={activeTaskId}
          onActivate={setActiveTaskId}
        />
        </View>{/* closes XpBurst position:relative wrapper */}
      </ScrollView>

      {/* Sticky premium banner */}
      <View style={[S.premiumContainer,{paddingBottom:insets.bottom+78}]}>
        <GoPremiumBanner/>
      </View>

      {/* Mascot toast — only appears on task complete / XP earned */}
      <MascotToast
        visible={toast.visible}
        emoji={toast.emoji}
        title={toast.title}
        sub={toast.sub}
      />

      {/* First-day streak celebration — only shown when streak goes 0→1 */}
      <StreakFirstDayToast
        visible={showFirstDayToast}
        onDone={()=>setShowFirstDayToast(false)}
      />

      {/* Big XP celebration modal — full screen on task complete */}
      <XpCelebrationModal
        visible={showCelebModal}
        xpEarned={celebXp}
        totalXp={celebTotalXp}
        onDone={()=>setShowCelebModal(false)}
      />

      <AddTaskSheet
        visible={sheet!==null} section={sheet??'daily'} streak={streak}
        onClose={()=>setSheet(null)}
        onAdd={sheet?addTask(sheet):()=>{}}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:          {flex:1,backgroundColor:T.bg},
  orb1:          {position:'absolute',top:-60,right:-60,width:240,height:240,borderRadius:120,backgroundColor:'rgba(245,200,66,0.06)'},
  orb2:          {position:'absolute',top:480,left:-80,width:200,height:200,borderRadius:100,backgroundColor:'rgba(123,110,246,0.07)'},
  header:        {flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingTop:16,paddingBottom:8},
  headerSub:     {fontFamily:'DM_Sans_500Medium',fontSize:10,color:T.txt2,letterSpacing:1.5,marginBottom:3},
  headerTitle:   {fontFamily:'Fraunces_900Black',fontSize:30,color:T.txt,letterSpacing:-1,lineHeight:34},
  xpChip:        {flexDirection:'row',alignItems:'center',gap:5,backgroundColor:T.goldD,borderWidth:1,borderColor:'rgba(245,200,66,0.25)',borderRadius:20,paddingHorizontal:10,paddingVertical:5},
  xpChipTxt:     {fontFamily:'DM_Sans_700Bold',fontSize:12,color:T.gold},
  streakMini:    {flexDirection:'row',alignItems:'center',gap:2,marginLeft:2},
  streakMiniTxt: {fontFamily:'DM_Sans_700Bold',fontSize:10,color:T.gold},
  filterBtn:     {width:36,height:36,borderRadius:12,backgroundColor:T.card,borderWidth:1,borderColor:T.border,alignItems:'center',justifyContent:'center'},
  scrollContent: {paddingHorizontal:20},
  section:       {marginBottom:0},
  sectionCard:   {backgroundColor:T.card,borderRadius:24,borderWidth:1,padding:18,marginBottom:4,overflow:'hidden'},
  sectionTop:    {flexDirection:'row',alignItems:'center',gap:12,marginBottom:14},
  sectionIcon:   {width:40,height:40,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1},
  sectionTitle:  {fontFamily:'DM_Sans_700Bold',fontSize:16,color:T.txt,marginBottom:2},
  sectionSub:    {fontFamily:'DM_Sans_400Regular',fontSize:11,color:T.txt2},
  countBadge:    {paddingHorizontal:8,paddingVertical:3,borderRadius:20,borderWidth:1},
  countTxt:      {fontFamily:'DM_Sans_700Bold',fontSize:12},
  streakNotice:  {flexDirection:'row',alignItems:'center',gap:7,backgroundColor:'rgba(245,200,66,0.07)',borderRadius:12,paddingHorizontal:10,paddingVertical:6,borderWidth:1,borderColor:'rgba(245,200,66,0.20)'},
  streakNoticeTxt:{fontFamily:'DM_Sans_500Medium',fontSize:11,color:T.gold},
  filterPill:    {paddingHorizontal:12,paddingVertical:5,borderRadius:20,borderWidth:1,borderColor:'transparent',backgroundColor:'rgba(255,255,255,0.03)'},
  filterTxt:     {fontFamily:'DM_Sans_600SemiBold',fontSize:11},
  taskList:      {gap:8,paddingTop:8,paddingBottom:4},
  taskCard:      {flexDirection:'row',backgroundColor:T.card2,borderRadius:18,borderWidth:1,borderColor:T.border,overflow:'hidden'},
  stripe:        {width:3},
  taskBody:      {flex:1,padding:14,gap:9},
  taskTop:       {flexDirection:'row',alignItems:'flex-start',gap:10},
  checkBtn:      {width:22,height:22,position:'relative'},
  taskName:      {flex:1,fontFamily:'DM_Sans_500Medium',fontSize:14,color:T.txt,lineHeight:20},
  taskDone:      {textDecorationLine:'line-through',color:T.txt3},
  delBtn:        {width:28,height:28,alignItems:'center',justifyContent:'center',marginTop:-3},
  metaRow:       {flexDirection:'row',flexWrap:'wrap',gap:5},
  chip:          {flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:7,paddingVertical:3,borderRadius:8,backgroundColor:'rgba(255,255,255,0.04)'},
  chipTxt:       {fontFamily:'DM_Sans_500Medium',fontSize:10,color:T.txt2,textTransform:'capitalize'},
  subRow:        {flexDirection:'row',alignItems:'center',gap:8},
  subTrack:      {flex:1,height:3,backgroundColor:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'},
  subFill:       {height:3,borderRadius:2},
  subTxt:        {fontFamily:'DM_Sans_400Regular',fontSize:10,color:T.txt3,flexShrink:0},
  xpRow:         {flexDirection:'row',alignItems:'center',gap:4},
  xpTxt:         {fontFamily:'DM_Sans_700Bold',fontSize:11},
  xpBase:        {fontFamily:'DM_Sans_400Regular',fontSize:10,color:T.txt3},
  earnedBadge:   {backgroundColor:T.goldD,borderRadius:6,paddingHorizontal:6,paddingVertical:2},
  earnedTxt:     {fontFamily:'DM_Sans_700Bold',fontSize:9,color:T.gold,letterSpacing:0.3},
  addBtn:        {flexDirection:'row',alignItems:'center',gap:8,paddingVertical:11,paddingHorizontal:16,backgroundColor:'rgba(255,255,255,0.03)',borderRadius:14,borderWidth:1,borderColor:T.border,borderStyle:'dashed'},
  addBtnLocked:  {borderColor:'rgba(245,200,66,0.3)',backgroundColor:T.goldD,borderStyle:'solid'},
  addTxt:        {fontFamily:'DM_Sans_600SemiBold',fontSize:13},
  empty:         {alignItems:'center',paddingVertical:24,gap:6},
  emptyTxt:      {fontFamily:'DM_Sans_500Medium',fontSize:13,color:T.txt3},
  overlay:       {...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,0.65)'},
  sheetKAV:      {position:'absolute',bottom:0,left:0,right:0},
  sheet:         {backgroundColor:'#12122A',borderTopLeftRadius:30,borderTopRightRadius:30,padding:24,paddingBottom:36,borderTopWidth:1,borderColor:T.borderA,gap:14},
  sheetHandle:   {width:36,height:4,borderRadius:2,backgroundColor:T.txt3,alignSelf:'center',marginBottom:4},
  sheetTitle:    {fontFamily:'Fraunces_900Black',fontSize:22,color:T.txt,letterSpacing:-0.5},
  sheetInput:    {backgroundColor:T.card2,borderRadius:14,borderWidth:1,borderColor:T.border,paddingHorizontal:16,paddingVertical:13,color:T.txt,fontFamily:'DM_Sans_500Medium',fontSize:15},
  sheetLabel:    {fontFamily:'DM_Sans_600SemiBold',fontSize:11,color:T.txt2,letterSpacing:0.8,textTransform:'uppercase'},
  row:           {flexDirection:'row',flexWrap:'wrap',gap:8},
  pill:          {flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:12,paddingVertical:7,borderRadius:20,borderWidth:1,borderColor:T.border,backgroundColor:T.card2},
  pillTxt:       {fontFamily:'DM_Sans_600SemiBold',fontSize:12,textTransform:'capitalize'},
  xpPreview:     {flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:T.card2,borderRadius:16,padding:14,borderWidth:1,borderColor:T.border},
  tierDot:       {width:8,height:8,borderRadius:4},
  tierLabel:     {fontFamily:'DM_Sans_700Bold',fontSize:12},
  xpPreviewNum:  {fontFamily:'Fraunces_900Black',fontSize:20,color:T.gold,letterSpacing:-0.5},
  xpPreviewBonus:{fontFamily:'DM_Sans_500Medium',fontSize:11,color:T.gold},
  saveBtn:       {flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:18,paddingVertical:16,shadowColor:T.accent,shadowOffset:{width:0,height:6},shadowOpacity:0.4,shadowRadius:14,elevation:10},
  saveBtnTxt:    {fontFamily:'DM_Sans_700Bold',fontSize:16,color:'#fff'},
  premiumContainer:{position:'absolute',bottom:0,left:0,right:0,paddingHorizontal:16,paddingTop:10},
  premiumWrap:   {shadowColor:T.gold,shadowOffset:{width:0,height:6},shadowOpacity:0.22,shadowRadius:18,elevation:14},
  premiumCard:   {flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderRadius:22,padding:16,borderWidth:1,borderColor:'rgba(245,200,66,0.28)',overflow:'hidden'},
  premiumBorder: {...StyleSheet.absoluteFillObject,borderRadius:22,borderWidth:1,borderColor:'rgba(245,200,66,0.12)'},
  shimmerStrip:  {position:'absolute',top:0,bottom:0,width:130},
  crownBox:      {width:42,height:42,borderRadius:14,backgroundColor:T.goldD,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(245,200,66,0.28)'},
  premiumTitle:  {fontFamily:'DM_Sans_700Bold',fontSize:15,color:T.txt,marginBottom:2},
  premiumSub:    {fontFamily:'DM_Sans_400Regular',fontSize:11,color:T.txt2},
  premiumPill:   {paddingHorizontal:16,paddingVertical:9,borderRadius:14,flexShrink:0},
  premiumPillTxt:{fontFamily:'DM_Sans_700Bold',fontSize:13,color:'#0A0818'},

  // ── Floating +XP label (inside TaskRow)
  floatXpWrap:{
    position:'absolute', top:-6, left:0, right:0,
    alignItems:'center', zIndex:30, pointerEvents:'none',
  },
  floatXpTxt:{
    fontFamily:'Fraunces_900Black', fontSize:16,
    color:T.gold, letterSpacing:-0.3,
    textShadowColor:'rgba(0,0,0,0.6)', textShadowOffset:{width:0,height:1}, textShadowRadius:4,
  },

  // ── Mascot toast (slides up from bottom on complete/XP)
  mascotToast:{
    position:'absolute', bottom:96, left:16, right:16, zIndex:200,
  },
  mascotToastInner:{
    flexDirection:'row', alignItems:'center', gap:14,
    borderRadius:22, padding:16,
    borderWidth:1.5, borderColor:'rgba(123,110,246,0.45)',
    shadowColor:'#7B6EF6', shadowOffset:{width:0,height:8},
    shadowOpacity:0.35, shadowRadius:16, elevation:12,
  },
  mascotToastEmoji:{ fontSize:36, flexShrink:0 },
  mascotToastTitle:{ fontFamily:'Fraunces_900Black', fontSize:17, color:T.txt, letterSpacing:-0.3 },
  mascotToastSub:{   fontFamily:'DM_Sans_500Medium',  fontSize:12, color:T.accentL, marginTop:2 },
});