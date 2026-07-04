// ─────────────────────────────────────────────────────────────────────────────
// app/_layout.tsx  —  Owl Reflection Engine  (final)
//
// Navigation guard:
//   No session          → /auth        (login / sign up)
//   Session, no onboard → /onboarding
//   Session + onboard   → /(tabs)/home
//
// Auth state changes trigger re-evaluation in real time.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, Image, ImageBackground } from 'react-native';
import { Stack, router } from 'expo-router';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay,
  runOnJS, Easing,
} from 'react-native-reanimated';
import { useFonts } from 'expo-font';
import { Fraunces_900Black } from '@expo-google-fonts/fraunces';
import {
  DMSans_400Regular, DMSans_500Medium,
  DMSans_600SemiBold, DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '@/lib/supabase';
import { configureRevenueCat, identifyUser, resetUser } from '@/lib/purchases';
import { initAnalytics, identify, resetAnalytics } from '@/lib/Analytics';
import { clearLocalTaskAndStreakState } from '@/lib/localState';
import { clearOnboarding } from '@/lib/storage';
import { ENV, logStartupConfigWarnings } from '@/lib/env';
import { RevenueCatProvider } from './context/RevenueCatProvider';
import type { Session } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react-native';

let sentryInitialized = false;
function initSentrySafely(): void {
  if (sentryInitialized) return;
  sentryInitialized = true;

  try {
    const integrations: any[] = [];
    if (typeof Sentry.mobileReplayIntegration === 'function') {
      integrations.push(Sentry.mobileReplayIntegration());
    }
    if (typeof Sentry.feedbackIntegration === 'function') {
      integrations.push(Sentry.feedbackIntegration());
    }

    Sentry.init({
      dsn: ENV.sentryDsn,
      sendDefaultPii: ENV.sentrySendDefaultPii,
      enableLogs: __DEV__,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1,
      integrations,
    });
  } catch (error) {
    console.warn('[Startup] Sentry initialization failed:', error);
  }
}

initSentrySafely();

void SplashScreen.preventAutoHideAsync().catch(() => {});

const BG = '#07070F';
const BRAND_LOGO = require('../assets/branding/logo.png');
const BRAND_BACKGROUND = require('../assets/branding/background.png');
const STARTUP_TIMEOUT_MS = 4000;
type Dest = '/login' | '/onboarding' | '/(tabs)/home';

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// ─── Resolve where to navigate ────────────────────────────────────────────────

async function resolveDestination(session: Session | null): Promise<Dest> {
  if (!session?.user) return '/login';

  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('onboarding_completed')
      .eq('id', session.user.id)
      .single();

    return data?.onboarding_completed ? '/(tabs)/home' : '/onboarding';
  } catch {
    return '/onboarding';
  }
}

// ─── Branded Splash ───────────────────────────────────────────────────────────

function BrandSplash({ onDone }: { onDone: () => void }) {
  const scale    = useSharedValue(0.72);
  const opacity  = useSharedValue(0);
  const textOp   = useSharedValue(0);
  const curtainY = useSharedValue(0);

  useEffect(() => {
    scale.value    = withSpring(1, { damping: 14, stiffness: 200 });
    opacity.value  = withTiming(1, { duration: 380 });
    textOp.value   = withDelay(360, withTiming(1, { duration: 380 }));
    curtainY.value = withDelay(900, withTiming(-1100, {
      duration: 520, easing: Easing.in(Easing.cubic),
    }, (done) => { if (done) runOnJS(onDone)(); }));
  }, []);

  const logoS    = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  const textS    = useAnimatedStyle(() => ({ opacity: textOp.value, transform: [{ translateY: (1 - textOp.value) * 12 }] }));
  const curtainS = useAnimatedStyle(() => ({ transform: [{ translateY: curtainY.value }] }));

  return (
    <Animated.View style={[S.splash, curtainS]}>
      <ImageBackground source={BRAND_BACKGROUND} style={S.splashBackground} resizeMode="cover">
        <View style={S.splashScrim} />
        <Animated.View style={[S.splashContent, logoS]}>
          <Image source={BRAND_LOGO} style={S.splashLogo} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[S.splashTextWrap, textS]}>
          <Text style={S.splashTitle}>Zora</Text>
          <Text style={S.splashSub}>Focus Timer & Streak</Text>
        </Animated.View>
      </ImageBackground>
    </Animated.View>
  );
}

// ─── Root Layout ─────────────────────────────────────────────────────────────

export default Sentry.wrap(function RootLayout() {
  const [ready,       setReady]       = useState(false);
  const [splashDone,  setSplashDone]  = useState(false);
  const [showSplash,  setShowSplash]  = useState(false);
  const [destination, setDestination] = useState<Dest | null>(null);
  const splashDoneRef = useRef(false);

  const [fontsLoaded, fontsError] = useFonts({
    Fraunces_900Black,
    DMSans_400Regular, DMSans_500Medium,
    DMSans_600SemiBold, DMSans_700Bold,
  });

  // ── Configure RevenueCat before anything
  useEffect(() => {
    const initStartup = async () => {
      logStartupConfigWarnings();

      try {
        await configureRevenueCat();
      } catch (error) {
        console.warn('[Startup] RevenueCat configure failed:', error);
      }

      try {
        initAnalytics();
      } catch (error) {
        console.warn('[Startup] Analytics init failed:', error);
      }
    };

    void initStartup();
  }, []);

  // ── Resolve initial session + listen for auth changes
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      let nextDestination: Dest = '/login';

      try {
        await configureRevenueCat();

        const session = await withTimeout<Session | null>(
          supabase.auth
            .getSession()
            .then(({ data }) => data.session)
            .catch((error) => {
              console.warn('[Startup] Session lookup failed:', error);
              return null;
            }),
          STARTUP_TIMEOUT_MS,
          null
        );

        if (session?.user?.id) {
          identifyUser(session.user.id).catch(() => {});
          identify(session.user.id);
        }

        nextDestination = await withTimeout<Dest>(
          resolveDestination(session),
          STARTUP_TIMEOUT_MS,
          session?.user ? '/onboarding' : '/login'
        );
      } catch (error) {
        console.warn('[Startup] Initial route resolution failed:', error);
      }

      if (!mounted) return;
      setDestination(nextDestination);
      setReady(true);
    };

    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_IN' && session?.user?.id) {
          try {
            await configureRevenueCat();
          } catch (error) {
            console.warn('[Startup] RevenueCat configure failed after sign-in:', error);
          }
          identifyUser(session.user.id).catch(() => {});
          identify(session.user.id);
        }

        if (event === 'SIGNED_OUT') {
          void Promise.allSettled([
            resetUser(),
            Promise.resolve(resetAnalytics()),
            clearLocalTaskAndStreakState(),
            clearOnboarding(),
          ]);
          setDestination('/login');
          if (splashDoneRef.current) router.replace('/login');
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const fallbackDest: Dest = session?.user ? '/onboarding' : '/login';
          let dest: Dest = fallbackDest;

          try {
            dest = await withTimeout<Dest>(
              resolveDestination(session),
              STARTUP_TIMEOUT_MS,
              fallbackDest
            );
          } catch (error) {
            console.warn('[Startup] Auth route refresh failed:', error);
          }

          if (!mounted) return;
          setDestination(dest);
          if (splashDoneRef.current) router.replace(dest);
        }
      }
    );

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // ── Hide native splash once fonts + session resolved
  useEffect(() => {
    if ((fontsLoaded || fontsError) && ready) {
      void SplashScreen.hideAsync().catch(() => {});
      setShowSplash(true);
    }
  }, [fontsLoaded, fontsError, ready]);

  const handleSplashDone = () => {
    splashDoneRef.current = true;
    setSplashDone(true);
    router.replace(destination ?? '/login');
  };

  if (!fontsLoaded && !fontsError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RevenueCatProvider>
          <StatusBar barStyle="light-content" backgroundColor={BG} />
          <View style={S.root}>
            <Stack
              screenOptions={{
                headerShown:       false,
                contentStyle:      { backgroundColor: BG },
                animation:         'fade',
                animationDuration: 260,
              }}
            >
              <Stack.Screen name="login"            options={{ animation:'fade',              gestureEnabled:false }} />
              <Stack.Screen name="onboarding"      options={{ animation:'slide_from_bottom', gestureEnabled:false }} />
              <Stack.Screen name="(tabs)"          options={{ animation:'fade',              gestureEnabled:false }} />
              <Stack.Screen name="modal/paywall"   options={{ presentation:'modal',          animation:'slide_from_bottom' }} />
            </Stack>

            {showSplash && !splashDone && (
              <BrandSplash onDone={handleSplashDone} />
            )}
          </View>
        </RevenueCatProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:        { flex:1, backgroundColor:BG },
  splash:      { ...StyleSheet.absoluteFillObject, backgroundColor:BG, zIndex:999 },
  splashBackground: { flex:1, justifyContent:'center', alignItems:'center' },
  splashScrim: { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(10, 8, 24, 0.16)' },
  splashContent: {
    width:132,
    height:132,
    borderRadius:34,
    overflow:'hidden',
    alignItems:'center',
    justifyContent:'center',
    backgroundColor:'rgba(255,255,255,0.10)',
    borderWidth:1,
    borderColor:'rgba(255,255,255,0.18)',
    shadowColor:'#130D2B',
    shadowOffset:{ width:0, height:18 },
    shadowOpacity:0.36,
    shadowRadius:32,
    elevation:20,
  },
  splashLogo: { width:120, height:120 },
  splashTextWrap: { alignItems:'center', marginTop:20 },
  splashTitle: { fontFamily:'Fraunces_900Black', fontSize:42, color:'#FFFFFF', letterSpacing:-1.2, textAlign:'center' },
  splashSub: { fontFamily:'DM_Sans_500Medium', fontSize:14, color:'rgba(255,255,255,0.88)', letterSpacing:1.4, textTransform:'uppercase', textAlign:'center', marginTop:6 },
});
