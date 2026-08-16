// ─────────────────────────────────────────────────────────────────────────────
// app/(tabs)/stats.tsx  —  Owl Reflection Engine
//
// Two-tab screen:
//   📊 Stats   — weekly/monthly XP bar chart · focus minutes · streak graph
//               · KPI cards (total XP, best streak, focus hours, tasks done)
//   🏆 Board   — Leaderboard ranked by total XP (global + "Your Region" toggle)
//               · each row shows avatar, display name, level badge, XP, rank
//               · current user row is highlighted and pinned above list
//
// Data sources:
//   stats: supabase.rpc('get_weekly_xp') + user_profiles
//   board: supabase.from('leaderboard').select().limit(50)
//   monthly: supabase.rpc('get_monthly_xp')  (defined in SQL below)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, RefreshControl, ActivityIndicator, Image,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay, withSequence, withRepeat,
  FadeInUp, FadeIn, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect, Line, G, Defs, Stop, LinearGradient as SvgGrad } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import {
  getLevelInfo, getNextLevel, getLevelProgress,
  LEVELS, type LevelDef, type UserXpState, loadUserXpState,
} from '@/lib/Xp';
import { readLocalTasks, readLocalStreak } from '@/lib/localState';
import { screen } from '@/lib/Analytics';
import { Mascot, MilestoneReaction } from '@/components/Mascot';

const { width: W } = Dimensions.get('window');

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:'#07070F', card:'#111122', card2:'#181830', card3:'#1E1E34',
  accent:'#7B6EF6', accentL:'#A99FF8', accentD:'rgba(123,110,246,0.14)',
  gold:'#F5C842', goldD:'rgba(245,200,66,0.13)',
  green:'#3ECFA0', greenD:'rgba(62,207,160,0.12)',
  red:'#F26B6B', blue:'#54AEFF', teal:'#2ECEC8', rose:'#FF6B9D',
  txt:'#EEEDF8', txt2:'#7E7E9A', txt3:'#3A3A54',
  border:'rgba(255,255,255,0.055)', borderA:'rgba(123,110,246,0.22)',blueD: 'rgba(84,174,255,0.2)',
};

// ─── Icons ────────────────────────────────────────────────────────────────────

type IP = { size?:number; color?:string; sw?:number };
const IcoFire     = ({size=18,color=T.gold,sw=1.7}:IP) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
const IcoStar     = ({size=14,color=T.gold,sw=1.7}:IP) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
const IcoZap      = ({size=16,color=T.accent,sw=1.8}:IP) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
const IcoClock    = ({size=16,color=T.teal,sw=1.7}:IP) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw}/><Path d="M12 7v5l3 3" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
const IcoTrophy   = ({size=16,color=T.gold,sw=1.7}:IP) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M8 22v-4M16 22v-4" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/><Path d="M6 4h12v5a6 6 0 0 1-12 0V4z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
const IcoTarget   = ({size=16,color=T.rose,sw=1.7}:IP) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw}/><Circle cx="12" cy="12" r="6" stroke={color} strokeWidth={sw}/><Circle cx="12" cy="12" r="2" stroke={color} strokeWidth={sw}/></Svg>;
const IcoGlobe    = ({size=15,color=T.blue,sw=1.7}:IP) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw}/><Path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke={color} strokeWidth={sw} strokeLinecap="round"/></Svg>;
const IcoUser     = ({size=16,color=T.txt2,sw=1.7}:IP) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={sw}/><Path d="M4 20c0-3.31 3.58-6 8-6s8 2.69 8 6" stroke={color} strokeWidth={sw} strokeLinecap="round"/></Svg>;
const IcoChevron  = ({size=14,color=T.txt3,sw=2}:IP) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></Svg>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayXp     { day: string; xp_earned: number }
interface MonthXp   { week: string; xp_earned: number }
interface LeaderRow {
  id: string; display_name: string; avatar_url: string | null;
  total_xp: number; level: number; current_streak: number;
  daily_xp_earned: number; rank: number;
}

// ─── XP Bar Chart ─────────────────────────────────────────────────────────────

function XpBarChart({
  data, color, maxVal, label,
}: { data:{ label:string; value:number }[]; color:string; maxVal:number; label:string }) {
  const CHART_H = 100;
  const BAR_W   = Math.floor((W - 60) / data.length) - 4;

  return (
    <View style={chart.wrap}>
      <Text style={chart.label}>{label}</Text>
      <View style={chart.bars}>
        {data.map((d, i) => {
          const pct = maxVal > 0 ? d.value / maxVal : 0;
          const h   = Math.max(Math.floor(pct * CHART_H), 4);
          return (
            <Animated.View
              key={d.label}
              entering={FadeInUp.delay(i * 60).duration(340)}
              style={chart.barCol}
            >
              <View style={[chart.barTrack, { height: CHART_H }]}>
                <Animated.View style={{ width: BAR_W }}>
                  <LinearGradient
                    colors={[color + '44', color]}
                    start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                    style={[chart.barFill, { height: h, width: BAR_W }]}
                  />
                </Animated.View>
                {d.value > 0 && (
                  <Text style={[chart.barVal, { color }]}>{d.value}</Text>
                )}
              </View>
              <Text style={chart.barDay}>{d.label}</Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const chart = StyleSheet.create({
  wrap:     { gap: 12 },
  label:    { fontFamily:'DM_Sans_600SemiBold', fontSize:11, color:T.txt2, letterSpacing:0.8, textTransform:'uppercase' },
  bars:     { flexDirection:'row', alignItems:'flex-end', gap:4, height:120, paddingBottom:20 },
  barCol:   { alignItems:'center', gap:4 },
  barTrack: { justifyContent:'flex-end', alignItems:'center', position:'relative' },
  barFill:  { borderRadius:5 },
  barVal:   { position:'absolute', top:-16, fontFamily:'DM_Sans_700Bold', fontSize:9 },
  barDay:   { fontFamily:'DM_Sans_500Medium', fontSize:9, color:T.txt3 },
});

// ─── Streak calendar ──────────────────────────────────────────────────────────

function StreakCalendar({ streak }: { streak: number }) {
  // Render last 28 days, mark last `streak` consecutive as filled
  const days = Array.from({ length: 28 }, (_, i) => i);
  return (
    <View style={cal.wrap}>
      <Text style={cal.label}>Last 4 Weeks</Text>
      <View style={cal.grid}>
        {days.map(i => {
          const filled = i >= 28 - streak;
          return (
            <Animated.View
              key={i}
              entering={FadeIn.delay(i * 15).duration(200)}
              style={[cal.dot, filled && { backgroundColor: T.accent, shadowColor: T.accent, shadowRadius: 4, shadowOpacity: 0.5 }]}
            />
          );
        })}
      </View>
    </View>
  );
}

const cal = StyleSheet.create({
  wrap:  { gap: 10 },
  label: { fontFamily:'DM_Sans_600SemiBold', fontSize:11, color:T.txt2, letterSpacing:0.8, textTransform:'uppercase' },
  grid:  { flexDirection:'row', flexWrap:'wrap', gap:5 },
  dot:   { width:14, height:14, borderRadius:4, backgroundColor:'rgba(255,255,255,0.07)', borderWidth:1, borderColor:T.border },
});

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, value, label, sub, color, delay }:
  { icon:React.ReactNode; value:string; label:string; sub?:string; color:string; delay:number }) {
  const glowOp = useSharedValue(0.4);
  useEffect(() => {
    glowOp.value = withRepeat(withSequence(withTiming(1,{duration:1800}),withTiming(0.4,{duration:1800})),-1,true);
  }, []);
  const gs = useAnimatedStyle(()=>({opacity:glowOp.value}));
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(360)}
      style={[kpi.card,{borderColor:color+'2A'}]}>
      <Animated.View style={[kpi.glow,{backgroundColor:color},gs]}/>
      <View style={[kpi.iconWrap,{backgroundColor:color+'18'}]}>{icon}</View>
      <Text style={[kpi.value,{color}]}>{value}</Text>
      <Text style={kpi.label}>{label}</Text>
      {sub && <Text style={kpi.sub}>{sub}</Text>}
    </Animated.View>
  );
}

const kpi = StyleSheet.create({
  card:    { width:(W-52)/2, backgroundColor:T.card, borderRadius:20, borderWidth:1, padding:16, gap:8, overflow:'hidden', position:'relative' },
  glow:    { position:'absolute', top:-24, right:-24, width:70, height:70, borderRadius:35, opacity:0.13 },
  iconWrap:{ width:38, height:38, borderRadius:13, alignItems:'center', justifyContent:'center' },
  value:   { fontFamily:'Fraunces_900Black', fontSize:26, letterSpacing:-1, lineHeight:30 },
  label:   { fontFamily:'DM_Sans_600SemiBold', fontSize:12, color:T.txt2 },
  sub:     { fontFamily:'DM_Sans_400Regular', fontSize:10, color:T.txt3 },
});

// ─── Level Ladder ─────────────────────────────────────────────────────────────

function LevelLadder({ currentXp }: { currentXp: number }) {
  const current = getLevelInfo(currentXp);
  return (
    <View style={ladder.wrap}>
      <Text style={ladder.title}>Level Ladder</Text>
      <View style={ladder.list}>
        {LEVELS.map((lv, i) => {
          const reached  = currentXp >= lv.minXp;
          const isCurrent= lv.level === current.level;
          const pct      = isCurrent
            ? getLevelProgress(currentXp)
            : reached ? 1 : 0;
          return (
            <Animated.View
              key={lv.level}
              entering={FadeInUp.delay(i * 40).duration(320)}
              style={[ladder.row, isCurrent && { backgroundColor:lv.color+'12', borderColor:lv.color+'44', borderWidth:1 }]}
            >
              <Text style={[ladder.emoji, !reached && {opacity:0.3}]}>{lv.emoji}</Text>
              <View style={{flex:1,gap:4}}>
                <View style={ladder.rowTop}>
                  <Text style={[ladder.lvLabel, {color:reached?lv.color:T.txt3}]}>L{lv.level} {lv.label}</Text>
                  <Text style={[ladder.lvXp, {color:reached?lv.color:T.txt3}]}>{lv.minXp.toLocaleString()} XP</Text>
                </View>
                <View style={ladder.track}>
                  <View style={[ladder.fill, { width:`${pct*100}%` as any, backgroundColor:lv.color }]}/>
                </View>
              </View>
              {isCurrent && <View style={[ladder.currentDot,{backgroundColor:lv.color}]}/>}
              {reached && !isCurrent && (
                <Text style={{fontSize:14}}>✅</Text>
              )}
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const ladder = StyleSheet.create({
  wrap:      { gap:12 },
  title:     { fontFamily:'DM_Sans_700Bold',fontSize:16,color:T.txt,letterSpacing:-0.2 },
  list:      { gap:8 },
  row:       { flexDirection:'row',alignItems:'center',gap:12,backgroundColor:T.card,borderRadius:16,borderWidth:1,borderColor:T.border,padding:12 },
  emoji:     { fontSize:22,width:30,textAlign:'center' },
  rowTop:    { flexDirection:'row',justifyContent:'space-between' },
  lvLabel:   { fontFamily:'DM_Sans_700Bold',fontSize:13 },
  lvXp:      { fontFamily:'DM_Sans_500Medium',fontSize:11 },
  track:     { height:3,backgroundColor:'rgba(255,255,255,0.07)',borderRadius:2,overflow:'hidden' },
  fill:      { height:3,borderRadius:2 },
  currentDot:{ width:8,height:8,borderRadius:4,flexShrink:0 },
});

// ─── Leaderboard Row ──────────────────────────────────────────────────────────

function BoardRow({ row, isMe, delay }: { row:LeaderRow; isMe:boolean; delay:number }) {
  const lv = getLevelInfo(row.total_xp);
  const rankColor = row.rank===1?T.gold:row.rank===2?'#C0C0C0':row.rank===3?'#CD7F32':T.txt2;

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(340)}
      style={[board.row, isMe&&{backgroundColor:T.accentD,borderColor:T.borderA}]}>
      {/* Rank */}
      <Text style={[board.rank, {color:rankColor, fontFamily:row.rank<=3?'Fraunces_900Black':'DM_Sans_700Bold'}]}>
        {row.rank<=3 ? ['🥇','🥈','🥉'][row.rank-1] : `#${row.rank}`}
      </Text>

      {/* Avatar */}
      <View style={[board.avatarWrap,{borderColor:lv.color+'55'}]}>
        {row.avatar_url
          ? <Image source={{uri:row.avatar_url}} style={board.avatar}/>
          : <LinearGradient colors={['#8B7EF8','#54AEFF']} style={board.avatar}>
              <Text style={board.avatarLetter}>{(row.display_name||'?').charAt(0).toUpperCase()}</Text>
            </LinearGradient>
        }
      </View>

      {/* Name + level */}
      <View style={{flex:1}}>
        <Text style={[board.name, isMe&&{color:T.accentL}]} numberOfLines={1}>
          {row.display_name || 'Anonymous'} {isMe&&'(You)'}
        </Text>
        <View style={board.lvBadge}>
          <Text style={{fontSize:10}}>{lv.emoji}</Text>
          <Text style={[board.lvTxt,{color:lv.color}]}>L{lv.level} {lv.label}</Text>
          {row.current_streak > 0 && (
            <Text style={board.streak}>🔥 {row.current_streak}d</Text>
          )}
        </View>
      </View>

      {/* XP */}
      <View style={{alignItems:'flex-end'}}>
        <Text style={board.xp}>{row.total_xp.toLocaleString()}</Text>
        <Text style={board.xpLabel}>XP</Text>
      </View>
    </Animated.View>
  );
}

const board = StyleSheet.create({
  row:         { flexDirection:'row',alignItems:'center',gap:12,backgroundColor:T.card,borderRadius:18,borderWidth:1,borderColor:T.border,padding:14 },
  rank:        { fontSize:14,width:32,textAlign:'center' },
  avatarWrap:  { width:44,height:44,borderRadius:22,borderWidth:2,overflow:'hidden',flexShrink:0 },
  avatar:      { width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center' },
  avatarLetter:{ fontFamily:'Fraunces_900Black',fontSize:16,color:'#fff' },
  name:        { fontFamily:'DM_Sans_700Bold',fontSize:14,color:T.txt },
  lvBadge:     { flexDirection:'row',alignItems:'center',gap:4,marginTop:2 },
  lvTxt:       { fontFamily:'DM_Sans_600SemiBold',fontSize:11 },
  streak:      { fontFamily:'DM_Sans_500Medium',fontSize:10,color:T.gold },
  xp:          { fontFamily:'Fraunces_900Black',fontSize:18,color:T.gold,letterSpacing:-0.5 },
  xpLabel:     { fontFamily:'DM_Sans_400Regular',fontSize:10,color:T.txt3 },
});

// ─── STATS TAB ────────────────────────────────────────────────────────────────

function StatsTab({ userId, bottomInset }: { userId: string; bottomInset: number }) {
  const [xpState,  setXpState]  = useState<UserXpState | null>(null);
  const [weekly,   setWeekly]   = useState<DayXp[]>([]);
  const [monthly,  setMonthly]  = useState<MonthXp[]>([]);
  const [period,   setPeriod]   = useState<'week'|'month'>('week');
  const [loading,  setLoading]  = useState(true);
  const [refreshing,setRefreshing]=useState(false);

  const load = useCallback(async () => {
    const [state, weekData, monthData, localSummary, localStreak] = await Promise.all([
      loadUserXpState(userId),
      supabase.rpc('get_weekly_xp',  { user_id: userId }),
      supabase.rpc('get_monthly_xp', { user_id: userId }),
      readLocalTasks(),
      readLocalStreak(),
    ]);

    if (state) {
      // Override DB task/streak values with locally-authoritative values
      setXpState({
        ...state,
        tasksToday:      localSummary.todayDone,
        tasksTotalToday: Math.max(localSummary.todayTotal, state.tasksTotalToday),
        currentStreak:   localStreak.count,
      });
    }
    if (weekData.data)  setWeekly(weekData.data);
    if (monthData.data) setMonthly(monthData.data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Format chart data
  const weekChart = weekly.map(d => ({
    label: new Date(d.day).toLocaleDateString('en-US',{weekday:'short'}).slice(0,2),
    value: d.xp_earned,
  }));
  const monthChart = monthly.map(d => ({ label: d.week, value: d.xp_earned }));
  const chartData  = period === 'week' ? weekChart : monthChart;
  const maxXp      = Math.max(...chartData.map(d => d.value), 100);

  const focusHours = xpState ? Math.floor(xpState.focusMinutesToday / 60) : 0;
  const focusMins  = xpState ? xpState.focusMinutesToday % 60 : 0;

  const allTasksDone = (xpState?.tasksToday ?? 0) >= (xpState?.tasksTotalToday ?? 1) && (xpState?.tasksTotalToday ?? 0) > 0;
  const goalReached  = (xpState?.dailyXpEarned ?? 0) >= (xpState?.dailyXpGoal ?? 500);

  if (loading) return (
    <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
      <ActivityIndicator color={T.accent} size="large"/>
    </View>
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent}/>}
      contentContainerStyle={{ gap:24, paddingBottom: bottomInset }}>

      {/* Milestone mascot — appears when user hits daily goal or all tasks */}
      {(allTasksDone || goalReached) && (
        <MilestoneReaction
          visible
          message={allTasksDone ? '🏆 All tasks done today!' : '⭐ Daily XP goal reached!'}
          size={52}
          duration={3200}
        />
      )}

      {/* KPI grid */}
      <View style={{ flexDirection:'row', flexWrap:'wrap', gap:12 }}>
        <KpiCard icon={<IcoStar size={18} color={T.gold}/>}
          value={xpState?.totalXp.toLocaleString()??'0'} label="Total XP"
          sub={`Level ${getLevelInfo(xpState?.totalXp??0).level}`} color={T.gold} delay={0}/>
        <KpiCard icon={<IcoFire size={18} color={T.red}/>}
          value={`${xpState?.currentStreak??0}d`} label="Current Streak"
          sub={`Best: ${xpState?.longestStreak??0}d`} color={T.red} delay={60}/>
        <KpiCard icon={<IcoClock size={18} color={T.teal}/>}
          value={focusHours > 0 ? `${focusHours}h ${focusMins}m` : `${xpState?.focusMinutesToday??0}m`}
          label="Focus Today" sub={`/ ${xpState?.focusGoalMinutes??120}m goal`} color={T.teal} delay={120}/>
        <KpiCard icon={<IcoTarget size={18} color={T.rose}/>}
          value={`${xpState?.tasksToday??0}/${xpState?.tasksTotalToday??0}`}
          label="Tasks Done" sub="today" color={T.rose} delay={180}/>
      </View>

      {/* Period toggle */}
      <Animated.View entering={FadeInUp.delay(110).duration(280)}>
        <View style={styles.periodToggle as any}>
          {(['week','month'] as const).map(p => (
            <TouchableOpacity key={p} onPress={()=>setPeriod(p)} activeOpacity={0.8}
              style={[styles.periodPill as any, period===p&&{backgroundColor:T.accentD,borderColor:T.borderA}]}>
              <Text style={[styles.periodTxt as any,{color:period===p?T.accentL:T.txt3}]}>
                {p==='week'?'This Week':'This Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {/* XP Chart */}
      <Animated.View entering={FadeInUp.delay(130).duration(280)} style={styles.statCard as any}>
        <LinearGradient colors={['rgba(123,110,246,0.08)','transparent']} style={StyleSheet.absoluteFill} pointerEvents="none"/>
        <XpBarChart
          data={chartData.length>0 ? chartData : [{label:'No data',value:0}]}
          color={T.accent} maxVal={maxXp}
          label={period==='week'?'Daily XP This Week':'Weekly XP This Month'}
        />
      </Animated.View>

      {/* Streak calendar */}
      <Animated.View entering={FadeInUp.delay(160).duration(280)} style={styles.statCard as any}>
        <StreakCalendar streak={Math.min(xpState?.currentStreak??0, 28)}/>
      </Animated.View>

      {/* Focus stats */}
      <Animated.View entering={FadeInUp.delay(190).duration(280)} style={styles.statCard as any}>
        <Text style={styles.statCardTitle as any}>Focus Breakdown</Text>
        {[
          { label:'Today',  val:`${xpState?.focusMinutesToday??0} min`,  color:T.accent },
          { label:'Streak', val:`${xpState?.currentStreak??0} days`,     color:T.gold   },
          { label:'Level',  val:`L${getLevelInfo(xpState?.totalXp??0).level} ${getLevelInfo(xpState?.totalXp??0).label}`, color:getLevelInfo(xpState?.totalXp??0).color },
          { label:'XP Goal',val:`${xpState?.dailyXpEarned??0}/${xpState?.dailyXpGoal??500}`, color:T.green },
        ].map(({label,val,color}) => (
          <View key={label} style={styles.focusRow as any}>
            <Text style={styles.focusRowLabel as any}>{label}</Text>
            <Text style={[styles.focusRowVal as any,{color}]}>{val}</Text>
          </View>
        ))}
      </Animated.View>

      {/* Level Ladder */}
      <Animated.View entering={FadeInUp.delay(220).duration(280)} style={styles.statCard as any}>
        <LinearGradient colors={['rgba(123,110,246,0.06)','transparent']} style={StyleSheet.absoluteFill} pointerEvents="none"/>
        <LevelLadder currentXp={xpState?.totalXp??0}/>
      </Animated.View>
    </ScrollView>
  );
}

// ─── LEADERBOARD TAB ──────────────────────────────────────────────────────────

function LeaderboardTab({ userId, bottomInset }: { userId: string; bottomInset: number }) {
  const [rows,      setRows]     = useState<LeaderRow[]>([]);
  const [myRow,     setMyRow]    = useState<LeaderRow | null>(null);
  const [scope,     setScope]    = useState<'global'|'daily'>('global');
  const [loading,   setLoading]  = useState(true);
  const [refreshing,setRefreshing]=useState(false);

  const load = useCallback(async () => {
    const view = scope === 'daily' ? 'leaderboard_today' : 'leaderboard';
    const { data } = await supabase
      .from(view)
      .select('*')
      .order(scope==='daily'?'xp_today':'total_xp', { ascending:false })
      .limit(50);

    if (data) {
      // Normalise field names (leaderboard_today uses xp_today instead of total_xp)
      const normalised: LeaderRow[] = data.map((r: any, i: number) => ({
        id:              r.id ?? r.user_id,
        display_name:    r.display_name,
        avatar_url:      r.avatar_url,
        total_xp:        r.total_xp ?? r.xp_today ?? 0,
        level:           r.level ?? 1,
        current_streak:  r.current_streak ?? 0,
        daily_xp_earned: r.daily_xp_earned ?? r.xp_today ?? 0,
        rank:            r.rank ?? r.rank_today ?? (i + 1),
      }));
      setRows(normalised);
      setMyRow(normalised.find(r => r.id === userId) ?? null);
    }
    setLoading(false);
  }, [scope, userId]);

  useEffect(() => { setLoading(true); load(); }, [scope]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <ScrollView showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent}/>}
      contentContainerStyle={{gap:12,paddingBottom:bottomInset}}>

      {/* Scope toggle */}
      <Animated.View entering={FadeInUp.delay(0).duration(280)}>
        <View style={styles.scopeToggle as any}>
          {([
            {key:'global', label:'All-Time', icon:<IcoGlobe size={14} color={scope==='global'?T.blue:T.txt3}/>},
            {key:'daily',  label:'Today',    icon:<IcoZap   size={14} color={scope==='daily' ?T.gold:T.txt3}/>},
          ] as const).map(({key,label,icon}) => (
            <TouchableOpacity key={key} onPress={()=>setScope(key)} activeOpacity={0.8}
              style={[styles.scopePill as any, scope===key&&{
                backgroundColor:key==='global'?T.blueD:T.goldD,
                borderColor:key==='global'?T.blue+'44':T.gold+'44',
              }]}>
              {icon}
              <Text style={[styles.scopeTxt as any,{color:scope===key?(key==='global'?T.blue:T.gold):T.txt3}]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {/* My rank (pinned) */}
      {myRow && (
        <Animated.View entering={FadeInUp.delay(30).duration(280)}>
          <Text style={styles.pinnedLabel as any}>Your Position</Text>
          <BoardRow row={myRow} isMe delay={0}/>
        </Animated.View>
      )}

      {/* Separator */}
      <View style={styles.boardDivider as any}/>

      {loading
        ? <ActivityIndicator color={T.accent} style={{marginTop:40}}/>
        : rows.length === 0
          ? <View style={{alignItems:'center',paddingVertical:40,gap:8}}>
              <Text style={{fontSize:40}}>🏆</Text>
              <Text style={{fontFamily:'DM_Sans_500Medium',fontSize:14,color:T.txt3}}>No data yet</Text>
            </View>
          : rows.map((row, i) => (
              <BoardRow key={row.id} row={row} isMe={row.id===userId} delay={i*35}/>
            ))
      }
    </ScrollView>
  );
}

// ─── SCREEN ───────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const insets  = useSafeAreaInsets();
  // Bottom nav footprint = BAR_H(68) + safe-area + 4 padding + 16px breathing room.
  const bottomInset = insets.bottom + 88;
  const [tab,    setTab]    = useState<'stats'|'board'>('stats');
  const [userId, setUserId] = useState('');
  const pillX   = useSharedValue(0);
  const tabW    = (W - 48) / 2;

  useEffect(() => {
    screen('Stats');
    supabase.auth.getUser().then(({ data:{ user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const switchTab = (t: 'stats'|'board') => {
    setTab(t);
    pillX.value = withSpring(t==='stats'?0:1, {damping:18,stiffness:260});
  };

  const pillStyle = useAnimatedStyle(()=>({transform:[{translateX:pillX.value*tabW}]}));
  
  const blueD  = 'rgba(84,174,255,0.12)';
  const goldD2 = 'rgba(245,200,66,0.12)';

  return (
    <View style={[styles.root as any,{paddingTop:insets.top}]}>
      <View style={styles.orb1 as any}/><View style={styles.orb2 as any}/>

      {/* Header */}
      <Animated.View entering={FadeInUp.delay(0).duration(280)} style={styles.header as any}>
        <View>
          <Text style={styles.headerSub as any}>YOUR PROGRESS</Text>
          <Text style={styles.headerTitle as any}>
            {tab==='stats'?'Stats':'Leaderboard'}
          </Text>
        </View>
      </Animated.View>

      {/* Tab toggle */}
      <Animated.View entering={FadeInUp.delay(20).duration(280)} style={styles.tabWrap as any}>
        <Animated.View style={[styles.tabPill as any, pillStyle]}/>
        <TouchableOpacity style={styles.tabBtn as any} onPress={()=>switchTab('stats')} activeOpacity={0.8}>
          <IcoTarget size={14} color={tab==='stats'?T.rose:T.txt3}/>
          <Text style={[styles.tabTxt as any,{color:tab==='stats'?T.txt:T.txt3}]}>Stats</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabBtn as any} onPress={()=>switchTab('board')} activeOpacity={0.8}>
          <IcoTrophy size={14} color={tab==='board'?T.gold:T.txt3}/>
          <Text style={[styles.tabTxt as any,{color:tab==='board'?T.txt:T.txt3}]}>Leaderboard</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Content */}
      <View style={styles.content as any}>
        {userId === '' ? (
          <ActivityIndicator color={T.accent} style={{marginTop:60}}/>
        ) : tab==='stats' ? (
          <StatsTab userId={userId} bottomInset={bottomInset}/>
        ) : (
          <LeaderboardTab userId={userId} bottomInset={bottomInset}/>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const blueD = 'rgba(84,174,255,0.12)';

const styles = StyleSheet.create({
  root:        { flex:1,backgroundColor:T.bg },
  orb1:        { position:'absolute',top:-60,right:-60,width:240,height:240,borderRadius:120,backgroundColor:'rgba(123,110,246,0.07)' },
  orb2:        { position:'absolute',bottom:100,left:-80,width:200,height:200,borderRadius:100,backgroundColor:'rgba(245,200,66,0.04)' },
  header:      { paddingHorizontal:20,paddingTop:16,paddingBottom:4 },
  headerSub:   { fontFamily:'DM_Sans_500Medium',fontSize:10,color:T.txt2,letterSpacing:1.5,marginBottom:3 },
  headerTitle: { fontFamily:'Fraunces_900Black',fontSize:30,color:T.txt,letterSpacing:-1,lineHeight:34 },

  tabWrap:   { flexDirection:'row',marginHorizontal:20,marginBottom:16,backgroundColor:T.card2,borderRadius:18,padding:4,position:'relative' },
  tabPill:   { position:'absolute',top:4,left:4,width:(W-88)/2,height:'100%',borderRadius:14,backgroundColor:T.card3,borderWidth:1,borderColor:T.borderA },
  tabBtn:    { flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:10,zIndex:1 },
  tabTxt:    { fontFamily:'DM_Sans_700Bold',fontSize:14 },

  content:   { flex:1,paddingHorizontal:20 },

  periodToggle:{ flexDirection:'row',backgroundColor:T.card2,borderRadius:14,padding:3,gap:0 },
  periodPill:  { flex:1,alignItems:'center',paddingVertical:8,borderRadius:12,borderWidth:1,borderColor:'transparent' },
  periodTxt:   { fontFamily:'DM_Sans_600SemiBold',fontSize:13 },

  statCard:  { backgroundColor:T.card,borderRadius:22,borderWidth:1,borderColor:T.border,padding:24,gap:20,overflow:'hidden' },
  statCardTitle:{ fontFamily:'DM_Sans_700Bold',fontSize:15,color:T.txt },
  focusRow:  { flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:T.border },
  focusRowLabel:{ fontFamily:'DM_Sans_500Medium',fontSize:13,color:T.txt2 },
  focusRowVal:  { fontFamily:'DM_Sans_700Bold',fontSize:14 },

  scopeToggle:{ flexDirection:'row',gap:8 },
  scopePill:  { flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:14,paddingVertical:8,borderRadius:20,borderWidth:1,borderColor:T.border,backgroundColor:'rgba(255,255,255,0.03)' },
  scopeTxt:   { fontFamily:'DM_Sans_600SemiBold',fontSize:13 },

  pinnedLabel:{ fontFamily:'DM_Sans_600SemiBold',fontSize:11,color:T.txt2,letterSpacing:0.8,textTransform:'uppercase',marginBottom:6 },
  boardDivider:{ height:1,backgroundColor:T.border,marginVertical:4 },


});