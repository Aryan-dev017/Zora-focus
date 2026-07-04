// ─────────────────────────────────────────────────────────────────────────────
// app/(tabs)/home.tsx  —  Owl Reflection Engine
//
// ✅ Start Focus button → navigates to /(tabs)/focus
// ✅ Concentric progress rings (Focus / Tasks / Habits) — live from Supabase
// ✅ Top 3 daily tasks — live from AsyncStorage (local-first), tappable rows
// ✅ Mini 7-day XP bar chart
// ✅ Summary stat cards (Focus, Tasks, Habits, XP)
// ✅ Streak fire button → weekly popup with Mon–Sun activity dots
// ✅ Mascot "keep it up" toast when streak is retained
// ✅ Floating mascot bottom-right (idle / reward state)
// ✅ Pull-to-refresh + AppState reload + useFocusEffect reload
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, RefreshControl, AppState, Modal, Pressable,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle,
  withTiming, withSpring, withDelay, withSequence, withRepeat,
  FadeInUp, FadeIn, FadeOut, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Circle, Path, Rect, Defs, G, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import {
  loadUserXpState, getLevelInfo, getNextLevel, getLevelProgress,
  type UserXpState,
} from '@/lib/Xp';
import { readLocalTasks, readLocalStreak } from '@/lib/localState';
import { Mascot } from '@/components/Mascot';

const { width: W } = Dimensions.get('window');

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:'#07070F', card:'#111122', card2:'#181830',
  accent:'#7B6EF6', accentL:'#A99FF8', accentD:'rgba(123,110,246,0.14)',
  gold:'#F5C842', goldD:'rgba(245,200,66,0.12)',
  green:'#3ECFA0', greenD:'rgba(62,207,160,0.12)',
  red:'#F26B6B', blue:'#54AEFF', teal:'#2ECEC8', rose:'#FF6B9D',
  txt:'#EEEDF8', txt2:'#7E7E9A', txt3:'#3A3A54',
  border:'rgba(255,255,255,0.055)', borderA:'rgba(123,110,246,0.22)',
};

const CAT_COLOR: Record<string, string> = {
  work: T.accent, health: T.green, study: T.blue,
  personal: T.teal, creative: T.rose,
};

// ─── Greeting helper ──────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Good Night';
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  if (h < 21) return 'Good Evening';
  return 'Good Night';
}

// ─── Concentric progress rings ────────────────────────────────────────────────

const AnimCircle  = Animated.createAnimatedComponent(Circle);
const RING_SIZE   = 116;
const RING_CX     = RING_SIZE / 2;
const STROKE      = 8;

function circ(r: number) { return 2 * Math.PI * r; }

function RingArc({ r, pct, gradId, delay }: { r:number; pct:number; gradId:string; delay:number }) {
  const c   = circ(r);
  const off = useSharedValue(c);
  useEffect(() => {
    off.value = withDelay(delay,
      withTiming(c * (1 - Math.min(pct, 1)), { duration:1100, easing:Easing.out(Easing.cubic) }));
  }, [pct]);
  const aProps = useAnimatedProps(() => ({ strokeDashoffset: off.value }));
  return (
    <G>
      <Circle cx={RING_CX} cy={RING_CX} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE}/>
      <AnimCircle cx={RING_CX} cy={RING_CX} r={r} fill="none"
        stroke={`url(#${gradId})`} strokeWidth={STROKE}
        strokeLinecap="round" strokeDasharray={c} animatedProps={aProps}/>
    </G>
  );
}

function ConcentricRings({ fPct, tPct, hPct, overallPct }: {
  fPct:number; tPct:number; hPct:number; overallPct:number;
}) {
  return (
    <View style={{ width:RING_SIZE, height:RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        style={{ transform:[{ rotate:'-90deg' }] }}>
        <Defs>
          <SvgGrad id="gF" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#A99FF8"/><Stop offset="100%" stopColor="#7B6EF6"/>
          </SvgGrad>
          <SvgGrad id="gT" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#FADA6A"/><Stop offset="100%" stopColor="#F5C842"/>
          </SvgGrad>
          <SvgGrad id="gH" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#5EDDB4"/><Stop offset="100%" stopColor="#3ECFA0"/>
          </SvgGrad>
        </Defs>
        <RingArc r={42} pct={fPct} gradId="gF" delay={0}/>
        <RingArc r={31} pct={tPct} gradId="gT" delay={120}/>
        <RingArc r={20} pct={hPct} gradId="gH" delay={240}/>
      </Svg>
      <View style={S.ringCenter} pointerEvents="none">
        <Text style={S.ringPct}>{Math.round(overallPct * 100)}%</Text>
        <Text style={S.ringToday}>Today</Text>
      </View>
    </View>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ rows }: { rows:{ label:string; pct:number; color:string; sub:string }[] }) {
  return (
    <View style={S.legend}>
      {rows.map(row => (
        <View key={row.label} style={S.legendRow}>
          <View style={[S.legendDot, { backgroundColor:row.color }]}/>
          <View style={{ flex:1 }}>
            <View style={S.legendTop}>
              <Text style={S.legendName}>{row.label}</Text>
              <Text style={S.legendPct}>{Math.round(row.pct * 100)}%</Text>
            </View>
            <View style={S.legendTrack}>
              <View style={[S.legendFill, { width:`${row.pct*100}%` as any, backgroundColor:row.color }]}/>
            </View>
            <Text style={S.legendSub}>{row.sub}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Animated Daily XP bar ────────────────────────────────────────────────────

function DailyXpBar({ earned, goal }: { earned:number; goal:number }) {
  const pct    = Math.min(earned / Math.max(goal, 1), 1);
  const barPct = useSharedValue(0);
  const glowOp = useSharedValue(0);
  useEffect(() => {
    barPct.value = withDelay(500, withTiming(pct, { duration:900, easing:Easing.out(Easing.cubic) }));
    if (pct >= 1) glowOp.value = withDelay(1400, withRepeat(
      withSequence(withTiming(1, { duration:380 }), withTiming(0.2, { duration:520 })), -1, true));
  }, [earned]);
  const fillS = useAnimatedStyle(() => ({ width:`${barPct.value*100}%` as any }));
  const capS  = useAnimatedStyle(() => ({ opacity:glowOp.value, left:`${barPct.value*100}%` as any }));
  return (
    <View style={S.xpBarWrap}>
      <View style={S.xpBarTop}>
        <Text style={S.xpBarLabel}>Daily XP</Text>
        <Text style={S.xpBarVals}>{earned} / {goal} XP</Text>
      </View>
      <View style={S.xpBarTrack}>
        <Animated.View style={[S.xpBarFill, fillS]}>
          <LinearGradient colors={[T.accentL, T.accent]} start={{x:0,y:0}} end={{x:1,y:0}} style={{flex:1}}/>
        </Animated.View>
        <Animated.View style={[S.xpCap, capS]}/>
      </View>
      <Text style={S.xpBarPct}>{Math.round(pct * 100)}% of daily goal</Text>
    </View>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function Skeleton({ w, h, r = 10 }: { w:number|string; h:number; r?:number }) {
  const op = useSharedValue(0.3);
  useEffect(() => {
    op.value = withRepeat(
      withSequence(withTiming(0.7, { duration:700 }), withTiming(0.3, { duration:700 })),
      -1, true
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity:op.value }));
  return <Animated.View style={[{ width:w as any, height:h, borderRadius:r, backgroundColor:'rgba(255,255,255,0.08)' }, style]}/>;
}

// ─── Mini 7-day XP bar chart ──────────────────────────────────────────────────

interface DayBar { label:string; value:number }

function MiniXpChart({ data, maxVal }: { data:DayBar[]; maxVal:number }) {
  const CHART_H = 60;
  const BAR_W   = Math.floor((W - 80) / Math.max(data.length, 1)) - 4;
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday:'short' }).slice(0, 2);

  return (
    <View style={S.chartWrap}>
      <View style={{ flexDirection:'row', alignItems:'flex-end', gap:4, height:CHART_H }}>
        {data.map((d, i) => {
          const barH  = maxVal > 0 ? Math.max((d.value / maxVal) * CHART_H, d.value > 0 ? 4 : 2) : 2;
          const isToday = d.label === todayLabel;
          return (
            <View key={i} style={{ alignItems:'center', gap:4, flex:1 }}>
              {d.value > 0 && (
                <Text style={S.chartBarVal}>{d.value >= 1000 ? `${(d.value/1000).toFixed(1)}k` : `${d.value}`}</Text>
              )}
              <View style={[
                S.chartBar,
                { height: barH, backgroundColor: isToday ? T.accent : 'rgba(123,110,246,0.35)' },
                isToday && { shadowColor:T.accent, shadowOffset:{width:0,height:3}, shadowOpacity:0.55, shadowRadius:6, elevation:6 },
              ]}/>
              <Text style={[S.chartLabel, isToday && { color:T.accentL }]}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Start Focus CTA button ───────────────────────────────────────────────────

function StartFocusButton() {
  const scale = useSharedValue(1);
  const shimX = useSharedValue(-W);

  useEffect(() => {
    shimX.value = withRepeat(
      withTiming(W + 200, { duration:2600, easing:Easing.inOut(Easing.quad) }), -1
    );
    scale.value = withRepeat(
      withSequence(
        withSpring(1.014, { damping:8, stiffness:100 }),
        withSpring(1,     { damping:10 }),
      ), -1, true
    );
  }, []);

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.96, { damping:12 }),
      withSpring(1.04, { damping:10 }),
      withSpring(1,    { damping:12 }),
    );
    router.push('/(tabs)/focus' as any);
  };

  const btnS  = useAnimatedStyle(() => ({ transform:[{ scale:scale.value }] }));
  const shimS = useAnimatedStyle(() => ({ transform:[{ translateX:shimX.value }] }));

  return (
    <Animated.View style={[S.ctaWrap, btnS]}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1}>
        <LinearGradient
          colors={['#8B7EF8', '#7B6EF6', '#5C4FD4']}
          start={{x:0, y:0.5}} end={{x:1, y:0.5}}
          style={S.ctaBtn}
        >
          {/* Shimmer */}
          <Animated.View style={[S.ctaShimmer, shimS]}>
            <LinearGradient
              colors={['transparent','rgba(255,255,255,0.20)','transparent']}
              start={{x:0,y:0}} end={{x:1,y:0}} style={{flex:1}}
            />
          </Animated.View>
          {/* Play icon */}
          <View style={S.ctaPlayIcon}>
            <Svg width={16} height={18} viewBox="0 0 16 18" fill="white">
              <Path d="M2 1.5L14 9L2 16.5V1.5Z" fill="white"/>
            </Svg>
          </View>
          <View style={S.ctaTextWrap}>
            <Text style={S.ctaMain}>Start Focus</Text>
            <Text style={S.ctaSub}>Tap to begin your session</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Mini task row ────────────────────────────────────────────────────────────

interface MiniTask { id:string; name:string; done:boolean; category:string }

function MiniTaskRow({ task, delay }: { task:MiniTask; delay:number }) {
  const dotColor = CAT_COLOR[task.category] ?? T.accent;
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(320)} style={S.miniTaskRow}>
      {/* Category dot */}
      <View style={[S.miniDot, { backgroundColor:dotColor }]}/>
      {/* Done indicator */}
      {task.done ? (
        <View style={[S.miniCheckCircle, { borderColor:T.green }]}>
          <Text style={{ fontSize:9, color:T.green, fontWeight:'800' }}>✓</Text>
        </View>
      ) : (
        <View style={[S.miniCheckCircle, { borderColor:T.txt3 }]}/>
      )}
      {/* Task name */}
      <Text
        style={[S.miniTaskName, task.done && S.miniTaskDone]}
        numberOfLines={1}
      >
        {task.name}
      </Text>
      {/* XP hint */}
      {!task.done && <Text style={S.miniXpHint}>⚡</Text>}
    </Animated.View>
  );
}

// ─── Summary stat card ────────────────────────────────────────────────────────

function SummaryCard({ icon, value, label, color, delay, sub }: {
  icon:string; value:string; label:string; color:string; delay:number; sub:string;
}) {
  const glowOp = useSharedValue(0.5);
  useEffect(() => {
    glowOp.value = withRepeat(
      withSequence(withTiming(1, { duration:1800 }), withTiming(0.4, { duration:1800 })),
      -1, true
    );
  }, []);
  const glowS = useAnimatedStyle(() => ({ opacity:glowOp.value }));
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(360)} style={[S.sumCard, { borderColor:color+'2A' }]}>
      <Animated.View style={[S.sumGlow, { backgroundColor:color }, glowS]}/>
      <View style={[S.sumIconWrap, { backgroundColor:color+'18' }]}>
        <Text style={{ fontSize:18 }}>{icon}</Text>
      </View>
      <Text style={[S.sumValue, { color }]}>{value}</Text>
      <Text style={S.sumLabel}>{label}</Text>
      <Text style={S.sumSub}>{sub}</Text>
    </Animated.View>
  );
}

// ─── Streak week popup ────────────────────────────────────────────────────────

const DAY_LABELS = ['M','T','W','T','F','S','S'];
const DAY_NAMES  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function StreakWeekPopup({
  visible, onClose, streak, weeklyDays,
}: {
  visible:    boolean;
  onClose:    () => void;
  streak:     number;
  weeklyDays: { day:string; has_activity:boolean }[];
}) {
  const backdropOp = useSharedValue(0);
  const sheetY     = useSharedValue(400);
  useEffect(() => {
    if (visible) {
      backdropOp.value = withTiming(1, { duration:250 });
      sheetY.value     = withSpring(0, { damping:20, stiffness:280 });
    } else {
      backdropOp.value = withTiming(0, { duration:200 });
      sheetY.value     = withTiming(400, { duration:220, easing:Easing.in(Easing.quad) });
    }
  }, [visible]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity:backdropOp.value }));
  const sheetStyle    = useAnimatedStyle(() => ({ transform:[{ translateY:sheetY.value }] }));

  const todayIdx  = (new Date().getDay() + 6) % 7;
  const days      = Array.from({ length:7 }, (_, i) => ({
    label:   DAY_LABELS[i],
    name:    DAY_NAMES[i],
    active:  weeklyDays[i]?.has_activity ?? false,
    isToday: i === todayIdx,
  }));

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, POP.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}/>
      </Animated.View>
      <Animated.View style={[POP.sheet, sheetStyle]}>
        <View style={POP.handle}/>
        <View style={POP.titleRow}>
          <Text style={POP.titleEmoji}>🔥</Text>
          <View style={{ flex:1 }}>
            <Text style={POP.title}>{streak > 0 ? `${streak}-Day Streak!` : 'No streak yet'}</Text>
            <Text style={POP.subtitle}>
              {streak > 0
                ? 'Complete a task or focus session daily to keep it going'
                : 'Complete a task or focus session today to start'}
            </Text>
          </View>
        </View>

        <View style={POP.weekRow}>
          {days.map((d, i) => (
            <View key={i} style={POP.dayCol}>
              <Text style={POP.dayName}>{d.name}</Text>
              <View style={[POP.dayDot, d.active && POP.dayDotActive, d.isToday && POP.dayDotToday]}>
                {d.active ? <Text style={POP.dotEmoji}>🔥</Text>
                  : d.isToday ? <Text style={POP.dotEmoji}>◎</Text>
                  : <View style={POP.dotEmpty}/>}
              </View>
              <Text style={[POP.dayLabel, d.isToday && { color:T.accent }]}>{d.label}</Text>
            </View>
          ))}
        </View>

        <View style={POP.statusRow}>
          {[
            { val: days.filter(d=>d.active).length.toString(), label:'Days active' },
            { val: streak.toString(),                           label:'Streak' },
            { val: days[todayIdx].active ? '✓ Done' : 'Pending', label:'Today' },
          ].map(({ val, label }, i) => (
            <React.Fragment key={label}>
              {i > 0 && <View style={POP.divider}/>}
              <View style={POP.statusItem}>
                <Text style={[POP.statusVal,
                  label === 'Today' && { color: days[todayIdx].active ? T.green : T.gold }
                ]}>{val}</Text>
                <Text style={POP.statusLabel}>{label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        <View style={POP.tip}>
          <Text style={POP.tipEmoji}>💡</Text>
          <Text style={POP.tipText}>
            Complete at least one task or focus session every day to retain your streak.
          </Text>
        </View>

        <TouchableOpacity onPress={onClose} activeOpacity={0.85}>
          <LinearGradient colors={['#8B7EF8','#5C4FD4']} start={{x:0,y:0}} end={{x:1,y:0}} style={POP.closeBtn}>
            <Text style={POP.closeTxt}>Got it 👍</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const POP = StyleSheet.create({
  backdrop:   { backgroundColor:'rgba(0,0,0,0.65)', justifyContent:'flex-end' },
  sheet:      { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#12122A', borderTopLeftRadius:28, borderTopRightRadius:28, borderTopWidth:1, borderColor:'rgba(123,110,246,0.30)', padding:24, paddingBottom:42, gap:18 },
  handle:     { width:36, height:4, borderRadius:2, backgroundColor:'#3A3A54', alignSelf:'center', marginBottom:4 },
  titleRow:   { flexDirection:'row', alignItems:'flex-start', gap:14 },
  titleEmoji: { fontSize:32, flexShrink:0, marginTop:2 },
  title:      { fontFamily:'Fraunces_900Black', fontSize:20, color:'#EEEDF8', letterSpacing:-0.4 },
  subtitle:   { fontFamily:'DM_Sans_400Regular', fontSize:12, color:'#7E7E9A', marginTop:4, lineHeight:17 },
  weekRow:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  dayCol:     { alignItems:'center', gap:5, flex:1 },
  dayName:    { fontFamily:'DM_Sans_500Medium', fontSize:8, color:'#7E7E9A', textTransform:'uppercase', letterSpacing:0.4 },
  dayDot:     { width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.04)', borderWidth:1.5, borderColor:'rgba(255,255,255,0.08)', alignItems:'center', justifyContent:'center' },
  dayDotActive:{ backgroundColor:'rgba(245,200,66,0.14)', borderColor:'rgba(245,200,66,0.50)' },
  dayDotToday: { borderColor:'rgba(123,110,246,0.70)', backgroundColor:'rgba(123,110,246,0.10)' },
  dotEmoji:   { fontSize:18 },
  dotEmpty:   { width:8, height:8, borderRadius:4, backgroundColor:'rgba(255,255,255,0.10)' },
  dayLabel:   { fontFamily:'DM_Sans_700Bold', fontSize:11, color:'#3A3A54' },
  statusRow:  { flexDirection:'row', backgroundColor:'rgba(255,255,255,0.03)', borderRadius:18, borderWidth:1, borderColor:'rgba(255,255,255,0.06)', padding:14 },
  statusItem: { flex:1, alignItems:'center', gap:3 },
  statusVal:  { fontFamily:'Fraunces_900Black', fontSize:20, color:'#F5C842', letterSpacing:-0.5 },
  statusLabel:{ fontFamily:'DM_Sans_400Regular', fontSize:9, color:'#7E7E9A', textTransform:'uppercase', letterSpacing:0.5 },
  divider:    { width:1, backgroundColor:'rgba(255,255,255,0.08)', marginHorizontal:4 },
  tip:        { flexDirection:'row', alignItems:'flex-start', gap:10, backgroundColor:'rgba(123,110,246,0.08)', borderRadius:14, padding:12, borderWidth:1, borderColor:'rgba(123,110,246,0.18)' },
  tipEmoji:   { fontSize:16, flexShrink:0 },
  tipText:    { flex:1, fontFamily:'DM_Sans_400Regular', fontSize:12, color:'#7E7E9A', lineHeight:17 },
  closeBtn:   { paddingVertical:16, borderRadius:18, alignItems:'center' },
  closeTxt:   { fontFamily:'DM_Sans_700Bold', fontSize:16, color:'#fff' },
});

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  // ── State ──────────────────────────────────────────────────────────────────
  const [xp,         setXp]         = useState<UserXpState | null>(null);
  const [userName,   setUserName]   = useState('');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [top3Tasks,  setTop3Tasks]  = useState<MiniTask[]>([]);
  const [userId,     setUserId]     = useState<string | null>(null);
  const [weeklyDays, setWeeklyDays] = useState<{ day:string; has_activity:boolean }[]>([]);
  const [weeklyXp,   setWeeklyXp]   = useState<{ label:string; value:number }[]>([]);
  const [showStreak, setShowStreak] = useState(false);
  const [mascotEvent,setMascotEvent]= useState<'none'|'keepup'>('none');
  const prevStreakRef = useRef<number>(0);

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserId(user.id);

    // 1. Load profile name + XP state from Supabase (fast parallel reads)
    const [profileRes, stateRes] = await Promise.all([
      supabase.from('user_profiles').select('display_name').eq('id', user.id).single(),
      loadUserXpState(user.id),
    ]);

    if (profileRes.data) setUserName(profileRes.data.display_name || '');
    if (stateRes)        setXp(stateRes);

    // 2. Load top-3 tasks from AsyncStorage (local-first, instant)
    const localSummary = await readLocalTasks();
    setTop3Tasks(localSummary.top3 as MiniTask[]);

    // 3. Load streak from AsyncStorage (authoritative local value)
    const localStreak = await readLocalStreak();

    // 4. Override DB-sourced xp with locally-accurate task + streak values
    //    (DB may lag by 1 toggle if the background sync is still in flight)
    if (stateRes) {
      setXp(prev => prev ? {
        ...prev,
        tasksToday:      localSummary.todayDone,
        tasksTotalToday: Math.max(localSummary.todayTotal, prev.tasksTotalToday),
        currentStreak:   localStreak.count,
      } : prev);
    }

    setLoading(false);

    // 5. Streak fire popup data + 7-day XP chart (background, after initial render)
    const [wDaysRes, wXpRes] = await Promise.all([
      supabase.rpc('get_weekly_streak_days', { p_user_id: user.id }),
      supabase.rpc('get_weekly_xp',          { user_id:   user.id }),
    ]);

    if (wDaysRes.data) setWeeklyDays(wDaysRes.data);
    if (wXpRes.data) {
      setWeeklyXp(
        (wXpRes.data as { day:string; xp_earned:number }[]).map(d => ({
          label: new Date(d.day).toLocaleDateString('en-US', { weekday:'short' }).slice(0, 2),
          value: d.xp_earned,
        }))
      );
    }

    // 6. Mascot keep-it-up when streak is retained/extended
    const cur  = localStreak.count;
    const prev = prevStreakRef.current;
    if (cur > 0 && cur !== prev && prev !== 0) {
      setMascotEvent('keepup');
      setTimeout(() => setMascotEvent('none'), 3000);
    }
    prevStreakRef.current = cur;
  }, []);

  useEffect(() => { loadData(); }, []);
  useFocusEffect(useCallback(() => { loadData(); }, []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') loadData(); });
    return () => sub.remove();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await loadData(); setRefreshing(false);
  }, [loadData]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const fPct       = xp ? Math.min(xp.focusMinutesToday / Math.max(xp.focusGoalMinutes, 1), 1) : 0;
  const tPct       = xp ? Math.min(xp.tasksToday / Math.max(xp.tasksTotalToday, 1), 1) : 0;
  const hPct       = xp ? Math.min(xp.habitsToday / Math.max(xp.habitsTotalToday, 1), 1) : 0;
  const overallPct = fPct * 0.40 + tPct * 0.35 + hPct * 0.25;
  const levelInfo  = getLevelInfo(xp?.totalXp ?? 0);
  const nextLevel  = getNextLevel(xp?.totalXp ?? 0);
  const levelProg  = getLevelProgress(xp?.totalXp ?? 0);
  const maxXp      = Math.max(...weeklyXp.map(d => d.value), 100);

  const legendRows = [
    { label:'Focus',  pct:fPct, color:T.accent, sub:`${xp?.focusMinutesToday??0}/${xp?.focusGoalMinutes??120}m` },
    { label:'Tasks',  pct:tPct, color:T.gold,   sub:`${xp?.tasksToday??0}/${xp?.tasksTotalToday??5} done` },
    { label:'Habits', pct:hPct, color:T.green,  sub:`${xp?.habitsToday??0}/${xp?.habitsTotalToday??5}` },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { paddingTop:insets.top }]}>
      <View style={S.orb1}/><View style={S.orb2}/>

      <ScrollView
        style={{ flex:1 }}
        contentContainerStyle={[S.content, { paddingBottom:insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent}/>}
      >
        {/* ── HEADER ──────────────────────────────────── */}
        <Animated.View entering={FadeIn.delay(0).duration(440)} style={S.header}>
          <View>
            <Text style={S.greetSub}>{getGreeting()}</Text>
            <Text style={S.greetName}>{userName || 'there'} 👋</Text>
          </View>
          <View style={S.headerRight}>
            {/* 🔥 Streak fire button */}
            <TouchableOpacity
              onPress={() => setShowStreak(true)}
              activeOpacity={0.8}
              style={[
                S.streakFireBtn,
                (xp?.currentStreak ?? 0) > 0 ? S.streakFireActive : S.streakFireInactive,
              ]}
            >
              <Text style={S.streakFireEmoji}>🔥</Text>
              <Text style={[S.streakFireCount, { color:(xp?.currentStreak??0) > 0 ? T.gold : T.txt3 }]}>
                {xp?.currentStreak ?? 0}d
              </Text>
            </TouchableOpacity>
            <View style={S.levelBadge}>
              <Text style={{ fontSize:14 }}>{levelInfo.emoji}</Text>
              <Text style={S.levelTxt}>{levelInfo.label}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile' as any)} activeOpacity={0.85}>
              <LinearGradient colors={['#8B7EF8','#54AEFF']} style={S.avatar}>
                <Text style={S.avatarLetter}>{(userName||'?').charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── PROGRESS CARD ───────────────────────────── */}
        <Animated.View entering={FadeIn.delay(60).duration(460)} style={S.ringCard}>
          <LinearGradient colors={['rgba(123,110,246,0.10)','transparent']} style={StyleSheet.absoluteFill} pointerEvents="none"/>

          <View style={S.ringCardTop}>
            <Text style={S.ringCardLabel}>Today's Progress</Text>
            <Text style={S.ringCardDate}>
              {new Date().toLocaleDateString('en-US',{ weekday:'short', month:'short', day:'numeric' })}
            </Text>
          </View>

          {loading ? (
            <View style={S.ringWrap}>
              <Skeleton w={RING_SIZE} h={RING_SIZE} r={RING_SIZE/2}/>
              <View style={{ flex:1, gap:8 }}>
                <Skeleton w="100%" h={12}/><Skeleton w="70%" h={12}/>
                <Skeleton w="100%" h={12}/><Skeleton w="70%" h={12}/>
                <Skeleton w="100%" h={12}/><Skeleton w="70%" h={12}/>
              </View>
            </View>
          ) : (
            <View style={S.ringWrap}>
              <ConcentricRings fPct={fPct} tPct={tPct} hPct={hPct} overallPct={overallPct}/>
              <Legend rows={legendRows}/>
            </View>
          )}

          {/* Streak / XP / Level chips */}
          <View style={S.streakRow}>
            {[
              { icon:'🔥', val:`${xp?.currentStreak??0}d`, label:'Streak'   },
              { icon:'⚡', val:`${xp?.totalXp??0}`,         label:'Total XP' },
              { icon:'🏆', val:`L${xp?.level??1}`,           label:'Level'    },
            ].map(({ icon, val, label }) => (
              <View key={label} style={S.streakChip}>
                <Text style={S.streakVal}>{icon} {val}</Text>
                <Text style={S.streakLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Daily XP bar */}
          <DailyXpBar earned={xp?.dailyXpEarned??0} goal={xp?.dailyXpGoal??500}/>

          {/* Level progress bar */}
          {nextLevel && xp && (
            <View style={S.levelBar}>
              <View style={S.levelBarTop}>
                <Text style={S.levelBarLabel}>{levelInfo.label} → {nextLevel.label}</Text>
                <Text style={S.levelBarXp}>{xp.totalXp}/{nextLevel.minXp} XP</Text>
              </View>
              <View style={S.levelBarTrack}>
                <View style={[S.levelBarFill, { width:`${levelProg*100}%` as any }]}/>
              </View>
            </View>
          )}
        </Animated.View>

        {/* ── START FOCUS CTA ─────────────────────────── */}
        <Animated.View entering={FadeIn.delay(130).duration(440)}>
          <StartFocusButton/>
        </Animated.View>

        {/* ── TOP 3 TASKS ─────────────────────────────── */}
        <Animated.View entering={FadeIn.delay(180).duration(420)} style={S.tasksCard}>
          <LinearGradient colors={['rgba(245,200,66,0.08)','transparent']} style={StyleSheet.absoluteFill} pointerEvents="none"/>
          <View style={S.tasksHeader}>
            <Text style={S.tasksTitle}>Today's Tasks</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/tasks' as any)}>
              <Text style={S.tasksSeeAll}>See all →</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ gap:10 }}>
              <Skeleton w="100%" h={20}/><Skeleton w="80%" h={20}/><Skeleton w="90%" h={20}/>
            </View>
          ) : top3Tasks.length === 0 ? (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/tasks' as any)}
              style={S.emptyTasksBtn}
              activeOpacity={0.8}
            >
              <Text style={S.emptyTasksIcon}>📋</Text>
              <Text style={S.emptyTasksTxt}>Add your first task for today</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ gap:8 }}>
              {top3Tasks.map((t, i) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => router.push('/(tabs)/tasks' as any)}
                  activeOpacity={0.75}
                >
                  <MiniTaskRow task={t} delay={200 + i * 50}/>
                </TouchableOpacity>
              ))}
              {(xp?.tasksTotalToday ?? 0) > 3 && (
                <TouchableOpacity onPress={() => router.push('/(tabs)/tasks' as any)} style={S.moreTasksBtn}>
                  <Text style={S.moreTasksTxt}>
                    +{(xp?.tasksTotalToday ?? 0) - 3} more tasks →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </Animated.View>

        {/* ── 7-DAY XP CHART ──────────────────────────── */}
        {weeklyXp.length > 0 && (
          <Animated.View entering={FadeIn.delay(220).duration(400)} style={S.chartCard}>
            <LinearGradient colors={['rgba(123,110,246,0.08)','transparent']} style={StyleSheet.absoluteFill} pointerEvents="none"/>
            <View style={S.chartHeader}>
              <Text style={S.chartTitle}>XP This Week</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/stats' as any)}>
                <Text style={S.chartSeeStats}>Full stats →</Text>
              </TouchableOpacity>
            </View>
            <MiniXpChart data={weeklyXp} maxVal={maxXp}/>
          </Animated.View>
        )}

        {/* ── SUMMARY STATS ───────────────────────────── */}
        <Animated.View entering={FadeIn.delay(260).duration(400)} style={S.section}>
          <View style={S.sectionRow}>
            <Text style={S.sectionTitle}>Today</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/stats' as any)}>
              <Text style={S.sectionAction}>See Stats →</Text>
            </TouchableOpacity>
          </View>
          <View style={S.sumGrid}>
            <SummaryCard icon="⏱" value={`${xp?.focusMinutesToday??0}m`}
              label="Focus" color={T.accent} delay={280} sub={`/ ${xp?.focusGoalMinutes??120}m goal`}/>
            <SummaryCard icon="✅" value={`${xp?.tasksToday??0}/${xp?.tasksTotalToday??0}`}
              label="Tasks" color={T.gold} delay={320} sub={`${Math.round(tPct*100)}% complete`}/>
            <SummaryCard icon="🧘" value={`${xp?.habitsToday??0}/${xp?.habitsTotalToday??0}`}
              label="Habits" color={T.green} delay={360} sub={`${Math.round(hPct*100)}% complete`}/>
            <SummaryCard icon="⭐" value={`${xp?.dailyXpEarned??0}`}
              label="XP Today" color={T.rose} delay={400} sub={`/ ${xp?.dailyXpGoal??500} goal`}/>
          </View>
        </Animated.View>
      </ScrollView>

      {/* ── FLOATING MASCOT ─────────────────────────── */}
      <Mascot state={mascotEvent === 'keepup' ? 'reward' : 'idle'} size={82} floating/>

      {/* Keep-it-up toast */}
      {mascotEvent === 'keepup' && (
        <Animated.View entering={FadeIn.delay(200).duration(300)} style={S.keepupToast} pointerEvents="none">
          <Text style={S.keepupText}>🔥 Keep it up!</Text>
          <Text style={S.keepupSub}>Streak retained for today</Text>
        </Animated.View>
      )}

      {/* Weekly streak popup */}
      <StreakWeekPopup
        visible={showStreak}
        onClose={() => setShowStreak(false)}
        streak={xp?.currentStreak ?? 0}
        weeklyDays={weeklyDays}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:     { flex:1, backgroundColor:T.bg },
  content:  { paddingHorizontal:20 },
  orb1:     { position:'absolute', top:-80, right:-80, width:280, height:280, borderRadius:140, backgroundColor:'rgba(123,110,246,0.09)' },
  orb2:     { position:'absolute', top:360, left:-100, width:220, height:220, borderRadius:110, backgroundColor:'rgba(245,200,66,0.04)' },

  // Header
  header:           { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingTop:16, paddingBottom:4, marginBottom:14 },
  greetSub:         { fontFamily:'DM_Sans_500Medium', fontSize:11, color:T.txt2, letterSpacing:1.2, textTransform:'uppercase', marginBottom:3 },
  greetName:        { fontFamily:'Fraunces_900Black', fontSize:26, color:T.txt, letterSpacing:-0.5, lineHeight:30 },
  headerRight:      { flexDirection:'row', alignItems:'center', gap:8 },
  levelBadge:       { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:T.accentD, borderRadius:20, borderWidth:1, borderColor:T.borderA, paddingHorizontal:10, paddingVertical:5 },
  levelTxt:         { fontFamily:'DM_Sans_700Bold', fontSize:11, color:T.accentL },
  avatar:           { width:40, height:40, borderRadius:20, alignItems:'center', justifyContent:'center', shadowColor:T.accent, shadowOffset:{width:0,height:4}, shadowOpacity:0.45, shadowRadius:10, elevation:8 },
  avatarLetter:     { fontFamily:'Fraunces_900Black', fontSize:16, color:'#fff' },
  streakFireBtn:    { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:10, paddingVertical:7, borderRadius:20, borderWidth:1.5 },
  streakFireActive: { backgroundColor:'rgba(245,200,66,0.13)', borderColor:'rgba(245,200,66,0.45)' },
  streakFireInactive:{ backgroundColor:'rgba(255,255,255,0.04)', borderColor:'rgba(255,255,255,0.10)' },
  streakFireEmoji:  { fontSize:16 },
  streakFireCount:  { fontFamily:'DM_Sans_700Bold', fontSize:13 },

  // Progress card
  ringCard:      { backgroundColor:T.card, borderRadius:24, borderWidth:1, borderColor:T.border, padding:16, marginBottom:14, overflow:'hidden' },
  ringCardTop:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14 },
  ringCardLabel: { fontFamily:'DM_Sans_600SemiBold', fontSize:10, color:T.txt2, letterSpacing:0.8, textTransform:'uppercase' },
  ringCardDate:  { fontFamily:'DM_Sans_400Regular', fontSize:10, color:T.txt3 },
  ringWrap:      { flexDirection:'row', alignItems:'center', gap:18, marginBottom:12 },
  ringCenter:    { ...StyleSheet.absoluteFillObject, alignItems:'center', justifyContent:'center', gap:1 },
  ringPct:       { fontFamily:'Fraunces_900Black', fontSize:22, color:T.txt, letterSpacing:-1, lineHeight:26 },
  ringToday:     { fontFamily:'DM_Sans_500Medium', fontSize:9, color:T.txt2 },

  // Legend
  legend:     { flex:1, gap:8 },
  legendRow:  { flexDirection:'row', alignItems:'center', gap:6 },
  legendDot:  { width:7, height:7, borderRadius:3.5, flexShrink:0 },
  legendTop:  { flexDirection:'row', justifyContent:'space-between', marginBottom:3 },
  legendName: { fontFamily:'DM_Sans_500Medium', fontSize:11, color:T.txt2 },
  legendPct:  { fontFamily:'DM_Sans_700Bold', fontSize:11, color:T.txt },
  legendTrack:{ height:2, backgroundColor:T.border, borderRadius:1, overflow:'hidden' },
  legendFill: { height:2, borderRadius:1 },
  legendSub:  { fontFamily:'DM_Sans_400Regular', fontSize:9, color:T.txt3, marginTop:1 },

  // Streak chips
  streakRow:    { flexDirection:'row', gap:6, marginBottom:10 },
  streakChip:   { flex:1, backgroundColor:'rgba(255,255,255,0.03)', borderWidth:1, borderColor:T.border, borderRadius:12, padding:8, gap:2 },
  streakVal:    { fontFamily:'DM_Sans_700Bold', fontSize:12, color:T.txt },
  streakLabel:  { fontFamily:'DM_Sans_400Regular', fontSize:8, color:T.txt2, textTransform:'uppercase', letterSpacing:0.5 },

  // XP bar
  xpBarWrap:  { gap:4, marginBottom:10 },
  xpBarTop:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  xpBarLabel: { fontFamily:'DM_Sans_600SemiBold', fontSize:10, color:T.txt2, letterSpacing:0.5 },
  xpBarVals:  { fontFamily:'DM_Sans_700Bold', fontSize:10, color:T.accentL },
  xpBarTrack: { height:5, backgroundColor:'rgba(255,255,255,0.07)', borderRadius:3, overflow:'visible', position:'relative' },
  xpBarFill:  { height:5, borderRadius:3, overflow:'hidden' },
  xpCap:      { position:'absolute', top:-4, width:13, height:13, borderRadius:6.5, marginLeft:-6.5, backgroundColor:T.accent },
  xpBarPct:   { fontFamily:'DM_Sans_400Regular', fontSize:9, color:T.txt3 },

  // Level bar
  levelBar:     { gap:4 },
  levelBarTop:  { flexDirection:'row', justifyContent:'space-between' },
  levelBarLabel:{ fontFamily:'DM_Sans_500Medium', fontSize:10, color:T.txt2 },
  levelBarXp:   { fontFamily:'DM_Sans_400Regular', fontSize:9, color:T.txt3 },
  levelBarTrack:{ height:3, backgroundColor:'rgba(255,255,255,0.07)', borderRadius:2, overflow:'hidden' },
  levelBarFill: { height:3, borderRadius:2, backgroundColor:T.accent },

  // CTA
  ctaWrap:     { marginBottom:14 },
  ctaBtn:      { flexDirection:'row', alignItems:'center', paddingVertical:18, paddingHorizontal:28, borderRadius:22, overflow:'hidden', shadowColor:T.accent, shadowOffset:{width:0,height:8}, shadowOpacity:0.55, shadowRadius:18, elevation:14 },
  ctaShimmer:  { position:'absolute', top:0, bottom:0, width:120 },
  ctaPlayIcon: { width:38, height:38, borderRadius:19, backgroundColor:'rgba(255,255,255,0.18)', alignItems:'center', justifyContent:'center', marginRight:14, flexShrink:0 },
  ctaTextWrap: { flex:1 },
  ctaMain:     { fontFamily:'Fraunces_900Black', fontSize:20, color:'#fff', letterSpacing:-0.3 },
  ctaSub:      { fontFamily:'DM_Sans_400Regular', fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 },

  // Tasks card
  tasksCard:    { backgroundColor:T.card, borderRadius:24, borderWidth:1, borderColor:'rgba(245,200,66,0.20)', padding:16, marginBottom:14, overflow:'hidden' },
  tasksHeader:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  tasksTitle:   { fontFamily:'DM_Sans_700Bold', fontSize:15, color:T.txt },
  tasksSeeAll:  { fontFamily:'DM_Sans_600SemiBold', fontSize:12, color:T.gold },

  // Mini task row
  miniTaskRow:    { flexDirection:'row', alignItems:'center', gap:8, paddingVertical:6, paddingHorizontal:2 },
  miniDot:        { width:8, height:8, borderRadius:4, flexShrink:0 },
  miniCheckCircle:{ width:18, height:18, borderRadius:9, borderWidth:1.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  miniTaskName:   { flex:1, fontFamily:'DM_Sans_500Medium', fontSize:14, color:T.txt, lineHeight:20 },
  miniTaskDone:   { textDecorationLine:'line-through', color:T.txt3 },
  miniXpHint:     { fontSize:12, flexShrink:0 },

  moreTasksBtn:   { paddingTop:4 },
  moreTasksTxt:   { fontFamily:'DM_Sans_600SemiBold', fontSize:12, color:T.gold },
  emptyTasksBtn:  { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:8 },
  emptyTasksIcon: { fontSize:22 },
  emptyTasksTxt:  { fontFamily:'DM_Sans_500Medium', fontSize:13, color:T.txt3 },

  // XP chart card
  chartCard:      { backgroundColor:T.card, borderRadius:24, borderWidth:1, borderColor:T.border, padding:16, marginBottom:14, overflow:'hidden' },
  chartHeader:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14 },
  chartTitle:     { fontFamily:'DM_Sans_700Bold', fontSize:15, color:T.txt },
  chartSeeStats:  { fontFamily:'DM_Sans_600SemiBold', fontSize:12, color:T.accent },
  chartWrap:      { paddingHorizontal:4 },
  chartBar:       { width:'100%', borderRadius:4, minHeight:2 },
  chartBarVal:    { fontFamily:'DM_Sans_700Bold', fontSize:9, color:T.txt2, textAlign:'center' },
  chartLabel:     { fontFamily:'DM_Sans_500Medium', fontSize:9, color:T.txt3, textAlign:'center' },

  // Summary stats
  section:      { marginBottom:8 },
  sectionRow:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingBottom:12 },
  sectionTitle: { fontFamily:'DM_Sans_700Bold', fontSize:15, color:T.txt, letterSpacing:-0.2, paddingVertical:12 },
  sectionAction:{ fontFamily:'DM_Sans_600SemiBold', fontSize:12, color:T.accent },
  sumGrid:      { flexDirection:'row', flexWrap:'wrap', gap:10, marginBottom:4 },
  sumCard:      { width:(W-50)/2, backgroundColor:T.card, borderRadius:18, borderWidth:1, padding:12, gap:5, overflow:'hidden', position:'relative' },
  sumGlow:      { position:'absolute', top:-20, right:-20, width:60, height:60, borderRadius:30, opacity:0.12 },
  sumIconWrap:  { width:32, height:32, borderRadius:10, alignItems:'center', justifyContent:'center' },
  sumValue:     { fontFamily:'Fraunces_900Black', fontSize:20, letterSpacing:-0.5, lineHeight:24 },
  sumLabel:     { fontFamily:'DM_Sans_600SemiBold', fontSize:11, color:T.txt2 },
  sumSub:       { fontFamily:'DM_Sans_400Regular', fontSize:9, color:T.txt3 },

  // Keep-it-up toast
  keepupToast: { position:'absolute', bottom:100, left:20, right:20, backgroundColor:'rgba(245,200,66,0.14)', borderRadius:18, borderWidth:1.5, borderColor:'rgba(245,200,66,0.40)', paddingHorizontal:18, paddingVertical:12, alignItems:'center', zIndex:100 },
  keepupText:  { fontFamily:'Fraunces_900Black', fontSize:18, color:'#F5C842', letterSpacing:-0.3 },
  keepupSub:   { fontFamily:'DM_Sans_400Regular', fontSize:11, color:'rgba(245,200,66,0.75)', marginTop:2 },
});