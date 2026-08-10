// ─────────────────────────────────────────────────────────────────────────────
// app/modal/paywall.tsx  —  Owl Reflection Engine  (RevenueCat powered)
//
// TWO MODES via ?mode= query param:
//   (default)   → Custom paywall fed by live RC packages + real prices
//   ?mode=rc    → Native RevenueCatUI.Paywall (managed from RC Dashboard)
//
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay, withSequence,
  withRepeat, FadeInUp, FadeIn, ZoomIn, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import RevenueCatUI from 'react-native-purchases-ui';
import type { CustomerInfo } from 'react-native-purchases';
import { useRevenueCat } from '../context/RevenueCatProvider';
import { ENTITLEMENT_ID, isExpoGo } from '@/lib/purchases';

const { width: W } = Dimensions.get('window');

// ─── Mascot image ─────────────────────────────────────────────────────────────
const MASCOT = require('../../assets/mascot/mascot.png');

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:      '#07070F', card:'#111122', card2:'#181830',
  accent:  '#7B6EF6', accentL:'#A99FF8', accentD:'rgba(123,110,246,0.16)',
  gold:    '#F5C842', goldD:'rgba(245,200,66,0.14)',
  green:   '#3ECFA0', blue:'#54AEFF', teal:'#2ECEC8', rose:'#FF6B9D',
  txt:     '#EEEDF8', txt2:'#7E7E9A', txt3:'#3A3A54',
  border:  'rgba(255,255,255,0.055)', borderA:'rgba(123,110,246,0.22)',
};

type IP = { size?:number; color?:string; sw?:number };
const IcoX     = ({size=18,color=T.txt2,sw=2}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  </Svg>
);
const IcoCheck = ({size=16,color=T.green,sw=2.2}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);
const IcoZap   = ({size=16,color=T.gold,sw=1.9}:IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const BENEFITS = [
  { icon:'⚡', title:'Unlimited Focus Sessions',  sub:'No daily caps — run as many blocks as you need.', color:T.gold   },
  { icon:'📊', title:'Advanced Stats & Insights', sub:'Weekly reports, trends, productivity patterns.',  color:T.accent },
  { icon:'🎵', title:'Full Music Library',         sub:'All binaural beats + nature sound packs.',        color:T.teal   },
  { icon:'🏆', title:'Streaks & Achievements',    sub:'Exclusive badges, leaderboard, milestones.',       color:T.green  },
  { icon:'🔁', title:'Smart Recurring Tasks',     sub:'Auto-reset daily and weekly goals.',               color:T.blue   },
  { icon:'🎓', title:'AI Study Coach',            sub:'Personalised nudges and daily check-ins.',         color:T.rose   },
];

// ─────────────────────────────────────────────────────────────────────────────
// NATIVE RC PAYWALL (Dashboard-managed)
// ─────────────────────────────────────────────────────────────────────────────

function NativeRCPaywall() {
  const insets = useSafeAreaInsets();
  const { refreshStatus } = useRevenueCat();

  if (isExpoGo) {
    return <CustomPaywall />;
  }

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <TouchableOpacity onPress={() => router.back()}
        style={[S.closeBtnAbs, { top: insets.top + 14 }]}>
        <IcoX size={18} color={T.txt2}/>
      </TouchableOpacity>
      <RevenueCatUI.Paywall
        onDismiss={() => router.back()}
        onPurchaseCompleted={async ({ customerInfo }: { customerInfo: CustomerInfo }) => {
          await refreshStatus();
          router.back();
        }}
        onRestoreCompleted={({ customerInfo }: { customerInfo: CustomerInfo }) => {
          refreshStatus();
          if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
            Alert.alert('Restored! 🎉', 'Pro access restored.');
            router.back();
          }
        }}
        onPurchaseError={({ error }) => console.error('[RC Paywall]', error)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM PAYWALL (live RC prices + mascot image)
// ─────────────────────────────────────────────────────────────────────────────

function CustomPaywall() {
  const insets = useSafeAreaInsets();
  const { offering, purchase, restore, isPro, loading } = useRevenueCat();

  const [plan,       setPlan]       = useState<'monthly'|'yearly'|'lifetime'>('yearly');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring,  setRestoring]  = useState(false);

  const mascotY   = useSharedValue(0);
  const glowOp    = useSharedValue(0.4);
  const glowScale = useSharedValue(1);
  const shimX     = useSharedValue(-W);

  useEffect(() => {
    mascotY.value = withRepeat(withSequence(
      withSpring(-12, { damping:5, stiffness:55 }),
      withSpring(0,   { damping:5, stiffness:55 }),
    ), -1, true);
    glowOp.value = withRepeat(withSequence(
      withTiming(0.9, { duration:1800 }),
      withTiming(0.3, { duration:1800 }),
    ), -1, true);
    glowScale.value = withRepeat(withSequence(
      withTiming(1.15, { duration:1800, easing:Easing.inOut(Easing.sin) }),
      withTiming(1,    { duration:1800, easing:Easing.inOut(Easing.sin) }),
    ), -1, true);
    shimX.value = withRepeat(
      withTiming(W + 200, { duration:2000, easing:Easing.inOut(Easing.quad) }), -1
    );
  }, []);

  const mascotStyle = useAnimatedStyle(() => ({ transform:[{ translateY: mascotY.value }] }));
  const glowStyle   = useAnimatedStyle(() => ({
    opacity: glowOp.value,
    transform: [{ scale: glowScale.value }],
  }));
  const shimStyle   = useAnimatedStyle(() => ({ transform:[{ translateX: shimX.value }] }));

  const selectedPkg = plan==='monthly' ? offering.monthly
                    : plan==='yearly'  ? offering.yearly
                    : offering.lifetime;
  const purchaseDisabled = purchasing || loading || !selectedPkg || isExpoGo;

  const fmt = (pkg: typeof offering.monthly, fallback: string) =>
    pkg?.product?.priceString ?? fallback;

  const monthlyPrice  = fmt(offering.monthly,  '$9.99');
  const yearlyPrice   = fmt(offering.yearly,   '$59.99');
  const lifetimePrice = fmt(offering.lifetime, '$149.99');

  const handlePurchase = async () => {
    if (isExpoGo) {
      Alert.alert('Unavailable in Expo Go', 'Purchases are available in a development build or production app.');
      return;
    }
    if (!selectedPkg) { Alert.alert('Not ready', 'Products loading…'); return; }
    setPurchasing(true);
    const r = await purchase(selectedPkg);
    setPurchasing(false);
    if (r.success) {
      Alert.alert('Welcome to Pro! 🎉', 'All features are now unlocked.', [
        { text:"Let's Go!", onPress: () => router.back() },
      ]);
    } else if (r.error) {
      Alert.alert('Purchase failed', r.error);
    }
  };

  const handleRestore = async () => {
    if (isExpoGo) {
      Alert.alert('Unavailable in Expo Go', 'Restore is available in a development build or production app.');
      return;
    }
    setRestoring(true);
    const r = await restore();
    setRestoring(false);
    if (r.success) {
      Alert.alert('Restored! 🎉', 'Your Pro access has been restored.', [
        { text:'Continue', onPress:() => router.back() },
      ]);
    } else {
      Alert.alert('Nothing to restore', r.error ?? 'No previous purchases found.');
    }
  };

  const handleCustomerCenter = async () => {
    if (isExpoGo) {
      Alert.alert('Unavailable in Expo Go', 'Subscription management is available in a development build or production app.');
      return;
    }
    try { await RevenueCatUI.presentCustomerCenter(); }
    catch (e) { console.error('[RC] CustomerCenter error:', e); }
  };

  // ── Already Pro ──────────────────────────────────────────────────────────
  if (isPro) {
    return (
      <View style={[S.root, { alignItems:'center', justifyContent:'center', paddingTop:insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={[S.closeBtnAbs, { top:insets.top+14 }]}>
          <IcoX size={18} color={T.txt2}/>
        </TouchableOpacity>
        <View style={S.mascotContainer}>
          <Animated.View style={[S.mascotGlow, glowStyle]}/>
          <Animated.View style={mascotStyle}>
            <Image source={MASCOT} style={S.mascotImgLarge} resizeMode="contain"/>
          </Animated.View>
        </View>
        <Text style={S.alreadyPro}>You're already Pro!</Text>
        <Text style={S.alreadyProSub}>All features are unlocked. Thank you! 🙏</Text>
        <TouchableOpacity onPress={handleCustomerCenter} style={S.ccBtn}>
          <Text style={S.ccBtnTxt}>Manage Subscription</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main paywall ─────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A0818','#07070F','#0A0818']} locations={[0,0.5,1]} style={StyleSheet.absoluteFill}/>
      <View style={S.topGlow}/><View style={S.bottomGlow}/>

      <Animated.View entering={FadeIn.delay(100)} style={[S.closeBtnAbs, { top:insets.top+14 }]}>
        <TouchableOpacity onPress={() => router.back()} style={S.closeBtnInner}>
          <IcoX size={18} color={T.txt2}/>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        style={{ flex:1 }}
        contentContainerStyle={[S.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* PRO badge */}
        <Animated.View entering={ZoomIn.delay(80).duration(400).springify()} style={S.proBadgeWrap}>
          <LinearGradient colors={[T.gold,'#E8A800']} start={{x:0,y:0}} end={{x:1,y:1}} style={S.proBadge}>
            <Text style={S.proText}>PRO</Text>
          </LinearGradient>
        </Animated.View>

        {/* Headline */}
        <Animated.View entering={FadeInUp.delay(120).duration(420)} style={S.headlineWrap}>
          <Text style={S.headline}>Unlock Your{'\n'}Full Potential</Text>
          <Text style={S.headlineSub}>Everything you need to focus deeper,{'\n'}build habits, and grow every day.</Text>
        </Animated.View>

        {/* ── MASCOT IMAGE ─────────────────────────────────────────── */}
        <Animated.View
          entering={ZoomIn.delay(200).duration(480).springify()}
          style={S.mascotContainer}
        >
          {/* Pink glow halo — matches mascot's magenta tone */}
          <Animated.View style={[S.mascotGlow, glowStyle]}/>

          {/* Floating mascot */}
          <Animated.View style={mascotStyle}>
            <Image source={MASCOT} style={S.mascotImg} resizeMode="contain"/>
          </Animated.View>

          {/* Gold sparkles */}
          <View style={[S.sparkle, S.sparkle1]}><Text style={S.sparkleTxt}>✦</Text></View>
          <View style={[S.sparkle, S.sparkle2]}><Text style={S.sparkleTxt}>✦</Text></View>
          <View style={[S.sparkle, S.sparkle3]}><Text style={[S.sparkleTxt, { fontSize:10, color:T.accentL }]}>✦</Text></View>
        </Animated.View>

        {/* Benefits card */}
        <Animated.View entering={FadeInUp.delay(280).duration(380)} style={S.benefitsCard}>
          <LinearGradient colors={['rgba(123,110,246,0.08)','transparent']} style={StyleSheet.absoluteFill} pointerEvents="none"/>
          <Text style={S.benefitsHeading}>What you get with Pro</Text>
          <View style={S.benefitsList}>
            {BENEFITS.map((b, i) => (
              <Animated.View key={b.title} entering={FadeInUp.delay(300+i*50).duration(360).springify()} style={S.benefitRow}>
                <View style={[S.benefitIcon, { backgroundColor:b.color+'14', borderColor:b.color+'33' }]}>
                  <Text style={{ fontSize:20 }}>{b.icon}</Text>
                </View>
                <View style={{ flex:1, gap:2 }}>
                  <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                    <Text style={S.benefitTitle}>{b.title}</Text>
                    <IcoCheck size={14} color={b.color} sw={2.5}/>
                  </View>
                  <Text style={S.benefitSub}>{b.sub}</Text>
                </View>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* Plan selector */}
        <Animated.View entering={FadeInUp.delay(500).duration(380)} style={S.planWrap}>
          {loading
            ? <ActivityIndicator color={T.accent} style={{ marginVertical:20 }}/>
            : <>
                <TouchableOpacity onPress={() => setPlan('monthly')} activeOpacity={0.85}
                  style={[S.planCard, plan==='monthly' && { borderColor:T.accent, backgroundColor:T.accentD }]}>
                  <View>
                    <Text style={S.planName}>Monthly</Text>
                    <Text style={S.planPrice}>{monthlyPrice}<Text style={S.planPer}>/mo</Text></Text>
                  </View>
                  {plan==='monthly' && <View style={[S.planCheck, { backgroundColor:T.accent }]}/>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setPlan('yearly')} activeOpacity={0.85}
                  style={[S.planCard, S.planCardYearly, plan==='yearly' && { borderColor:T.gold, backgroundColor:T.goldD }]}>
                  <View style={S.savingsBadge}><Text style={S.savingsTxt}>Best Value</Text></View>
                  <View>
                    <Text style={S.planName}>Yearly</Text>
                    <Text style={[S.planPrice, { color:T.gold }]}>{yearlyPrice}<Text style={S.planPer}>/yr</Text></Text>
                    {offering.yearly && (
                      <Text style={S.planNote}>
                        ≈ {(offering.yearly.product.price/12).toLocaleString('en-US',{ style:'currency', currency:'USD', maximumFractionDigits:2 })}/mo
                      </Text>
                    )}
                  </View>
                  {plan==='yearly' && <View style={[S.planCheck, { backgroundColor:T.gold }]}/>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setPlan('lifetime')} activeOpacity={0.85}
                  style={[S.planCard, plan==='lifetime' && { borderColor:T.accent, backgroundColor:T.accentD }]}>
                  <View>
                    <Text style={S.planName}>Lifetime</Text>
                    <Text style={S.planPrice}>{lifetimePrice}<Text style={S.planPer}> once</Text></Text>
                  </View>
                  {plan==='lifetime' && <View style={[S.planCheck, { backgroundColor:T.accent }]}/>}
                </TouchableOpacity>
              </>
          }
        </Animated.View>

        {/* Trust row */}
        <Animated.View entering={FadeInUp.delay(560).duration(360)} style={S.trustRow}>
          {['🔒 Secure','✅ Cancel anytime','🎁 3 days free'].map(t=>(
            <View key={t} style={S.trustChip}><Text style={S.trustTxt}>{t}</Text></View>
          ))}
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={FadeInUp.delay(600).duration(380)} style={S.ctaWrap}>
          <TouchableOpacity onPress={handlePurchase} disabled={purchaseDisabled} activeOpacity={1}>
            <LinearGradient
              colors={['#9B8EF8','#7B6EF6','#5C4FD4']}
              start={{x:0,y:0.5}} end={{x:1,y:0.5}}
              style={[S.ctaBtn, purchaseDisabled && { opacity:0.7 }]}
            >
              <Animated.View style={[S.shimmer, shimStyle]}>
                <LinearGradient colors={['transparent','rgba(255,255,255,0.18)','transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={{ flex:1 }}/>
              </Animated.View>
              {purchasing
                ? <ActivityIndicator color="#fff" size="small"/>
                : <><IcoZap size={18} color="#fff" sw={2.2}/>
                    <View style={{ flex:1 }}>
                      <Text style={S.ctaMain}>Start 3-Day Free Trial</Text>
                      <Text style={S.ctaSub}>
                        {plan==='monthly' ? `Then ${monthlyPrice}/mo`
                          : plan==='yearly'  ? `Then ${yearlyPrice}/yr`
                          : `Then ${lifetimePrice} one-time`} · Cancel anytime
                      </Text>
                    </View>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Legal + restore + customer center */}
        <Animated.View entering={FadeIn.delay(660)} style={S.legalWrap}>
          <Text style={S.legalTxt}>
            Free for 3 days. After trial ends you'll be billed the selected plan.
            Subscription auto-renews. Cancel any time before trial ends.
          </Text>
          <TouchableOpacity onPress={handleRestore} disabled={restoring || isExpoGo}>
            {restoring
              ? <ActivityIndicator color={T.accentL} size="small"/>
              : <Text style={S.restoreLink}>Restore purchases</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={handleCustomerCenter}>
            <Text style={S.ccLink}>Manage subscription</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <TouchableOpacity><Text style={S.legalLink}>Privacy Policy</Text></TouchableOpacity>
            <Text style={S.legalDot}>·</Text>
            <TouchableOpacity><Text style={S.legalLink}>Terms of Use</Text></TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return mode === 'rc' && !isExpoGo ? <NativeRCPaywall /> : <CustomPaywall />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:            { flex:1, backgroundColor:T.bg },
  content:         { paddingHorizontal:20, paddingTop:70, alignItems:'center' },
  topGlow:         { position:'absolute',top:-100,left:W/2-160,width:320,height:320,borderRadius:160,backgroundColor:'rgba(123,110,246,0.12)' },
  bottomGlow:      { position:'absolute',bottom:0,right:-60,width:240,height:240,borderRadius:120,backgroundColor:'rgba(245,200,66,0.06)' },
  closeBtnAbs:     { position:'absolute',right:20,zIndex:20 },
  closeBtnInner:   { width:36,height:36,borderRadius:12,backgroundColor:'rgba(255,255,255,0.07)',borderWidth:1,borderColor:T.border,alignItems:'center',justifyContent:'center' },

  // Mascot
  mascotContainer: { width:220, height:220, alignItems:'center', justifyContent:'center', marginBottom:4, position:'relative' },
  mascotImg:       { width:200, height:200 },
  mascotImgLarge:  { width:150, height:150 },
  mascotGlow:      {
    position:     'absolute',
    width:         180, height:80, borderRadius:90,
    bottom:        8,
    backgroundColor:'#FF6B9D',
    opacity:       0.25,
    shadowColor:  '#FF6B9D',
    shadowOffset:  { width:0, height:0 },
    shadowOpacity: 1,
    shadowRadius:  40,
  },

  // Sparkles
  sparkle:   { position:'absolute', zIndex:2 },
  sparkle1:  { top:6,   right:16 },
  sparkle2:  { top:32,  left:10 },
  sparkle3:  { bottom:20, right:8 },
  sparkleTxt:{ fontSize:18, color:T.gold },

  proBadgeWrap:    { marginBottom:18 },
  proBadge:        { paddingHorizontal:20,paddingVertical:7,borderRadius:20,shadowColor:T.gold,shadowOffset:{width:0,height:4},shadowOpacity:0.5,shadowRadius:12,elevation:10 },
  proText:         { fontFamily:'Fraunces_900Black',fontSize:14,color:'#0A0818',letterSpacing:3 },
  headlineWrap:    { alignItems:'center',gap:10,marginBottom:8 },
  headline:        { fontFamily:'Fraunces_900Black',fontSize:32,color:T.txt,letterSpacing:-1,lineHeight:38,textAlign:'center' },
  headlineSub:     { fontFamily:'DM_Sans_400Regular',fontSize:14,color:T.txt2,textAlign:'center',lineHeight:21 },
  benefitsCard:    { width:'100%',backgroundColor:T.card,borderRadius:28,borderWidth:1,borderColor:T.borderA,padding:22,marginBottom:14,gap:16,overflow:'hidden' },
  benefitsHeading: { fontFamily:'DM_Sans_700Bold',fontSize:13,color:T.txt2,letterSpacing:0.8,textTransform:'uppercase',marginBottom:2 },
  benefitsList:    { gap:14 },
  benefitRow:      { flexDirection:'row',alignItems:'flex-start',gap:14 },
  benefitIcon:     { width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1,flexShrink:0 },
  benefitTitle:    { fontFamily:'DM_Sans_700Bold',fontSize:14,color:T.txt,flex:1 },
  benefitSub:      { fontFamily:'DM_Sans_400Regular',fontSize:12,color:T.txt2,lineHeight:18 },
  planWrap:        { width:'100%',gap:10,marginBottom:12 },
  planCard:        { flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:T.card,borderRadius:20,borderWidth:1,borderColor:T.border,padding:16,position:'relative',overflow:'hidden' },
  planCardYearly:  { borderColor:'rgba(245,200,66,0.3)' },
  planName:        { fontFamily:'DM_Sans_700Bold',fontSize:15,color:T.txt,marginBottom:4 },
  planPrice:       { fontFamily:'Fraunces_900Black',fontSize:22,color:T.accentL,letterSpacing:-0.5 },
  planPer:         { fontFamily:'DM_Sans_400Regular',fontSize:13,color:T.txt2 },
  planNote:        { fontFamily:'DM_Sans_400Regular',fontSize:11,color:T.txt3,marginTop:2 },
  planCheck:       { width:18,height:18,borderRadius:9 },
  savingsBadge:    { position:'absolute',top:10,right:12,backgroundColor:T.goldD,borderRadius:8,paddingHorizontal:8,paddingVertical:3,borderWidth:1,borderColor:'rgba(245,200,66,0.3)' },
  savingsTxt:      { fontFamily:'DM_Sans_700Bold',fontSize:10,color:T.gold },
  trustRow:        { flexDirection:'row',gap:6,justifyContent:'center',flexWrap:'wrap',marginBottom:14 },
  trustChip:       { paddingHorizontal:10,paddingVertical:5,borderRadius:20,backgroundColor:'rgba(255,255,255,0.04)',borderWidth:1,borderColor:T.border },
  trustTxt:        { fontFamily:'DM_Sans_500Medium',fontSize:11,color:T.txt2 },
  ctaWrap:         { width:W-40,marginBottom:18 },
  ctaBtn:          { flexDirection:'row',alignItems:'center',paddingVertical:18,paddingHorizontal:24,borderRadius:24,gap:12,overflow:'hidden',shadowColor:T.accent,shadowOffset:{width:0,height:8},shadowOpacity:0.55,shadowRadius:20,elevation:14 },
  shimmer:         { position:'absolute',top:0,bottom:0,width:100,opacity:0.9 },
  ctaMain:         { fontFamily:'Fraunces_900Black',fontSize:18,color:'#fff',letterSpacing:-0.3 },
  ctaSub:          { fontFamily:'DM_Sans_400Regular',fontSize:11,color:'rgba(255,255,255,0.65)',marginTop:2 },
  legalWrap:       { alignItems:'center',gap:10,width:W-40 },
  legalTxt:        { fontFamily:'DM_Sans_400Regular',fontSize:10,color:T.txt3,textAlign:'center',lineHeight:16 },
  restoreLink:     { fontFamily:'DM_Sans_600SemiBold',fontSize:12,color:T.accentL,textDecorationLine:'underline' },
  ccLink:          { fontFamily:'DM_Sans_500Medium',fontSize:12,color:T.txt2,textDecorationLine:'underline' },
  ccBtn:           { marginTop:24,paddingHorizontal:24,paddingVertical:12,borderRadius:16,borderWidth:1,borderColor:T.borderA,backgroundColor:T.accentD },
  ccBtnTxt:        { fontFamily:'DM_Sans_600SemiBold',fontSize:14,color:T.accentL },
  legalLink:       { fontFamily:'DM_Sans_400Regular',fontSize:11,color:T.txt3 },
  legalDot:        { color:T.txt3,fontSize:11 },
  alreadyPro:      { fontFamily:'Fraunces_900Black',fontSize:28,color:T.txt,letterSpacing:-0.5,textAlign:'center',marginTop:16 },
  alreadyProSub:   { fontFamily:'DM_Sans_400Regular',fontSize:14,color:T.txt2,textAlign:'center',marginTop:8,paddingHorizontal:32 },
});
