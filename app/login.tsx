// ─────────────────────────────────────────────────────────────────────────────
// app/auth.tsx  —  Owl Reflection Engine
//
// Login / Sign-up screen:
//   • Animated tab toggle (Sign In ↔ Sign Up) with sliding pill
//   • Email + password fields with show/hide toggle
//   • Sign Up: confirm password field + strength indicator
//   • Supabase signUp → creates user_profiles row via DB trigger
//   • Supabase signInWithPassword → navigates based on onboarding_completed
//   • Forgot password → supabase.auth.resetPasswordForEmail
//   • Google Sign-In placeholder (wired to supabase OAuth)
//   • All form errors shown inline with shake animation
//   • Spring entrance animations, shimmer CTA button
// ─────────────────────────────────────────────────────────────────────────────
import { Image as RNImage } from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView,
  Dimensions, Alert, ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay, withSequence,
  withRepeat, FadeInUp, FadeIn, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path, Circle, Rect, Line, G } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { ENV } from '@/lib/env';

void WebBrowser.maybeCompleteAuthSession();

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:      '#07070F',
  bg2:     '#0C0C1A',
  card:    '#111122',
  card2:   '#181830',
  accent:  '#7B6EF6',
  accentL: '#A99FF8',
  accentD: 'rgba(123,110,246,0.14)',
  accentG: 'rgba(123,110,246,0.28)',
  gold:    '#F5C842',
  goldD:   'rgba(245,200,66,0.12)',
  green:   '#3ECFA0',
  greenD:  'rgba(62,207,160,0.12)',
  red:     '#F26B6B',
  redD:    'rgba(242,107,107,0.12)',
  txt:     '#EEEDF8',
  txt2:    '#7E7E9A',
  txt3:    '#3A3A54',
  border:  'rgba(255,255,255,0.055)',
  borderA: 'rgba(123,110,246,0.22)',
  borderF: 'rgba(123,110,246,0.55)',
};

const { width: W } = Dimensions.get('window');
const TAB_INSET = 4;
const LOGO_BASE_FRAME = 156;
const LOGO_BASE_GLOW = 126;
const LOGO_BASE_IMAGE = 126;
const LOGO_BOX_SCALE = 0.85;
const LOGO_IMAGE_SCALE = 1;
const LOGO_FRAME_SIZE = LOGO_BASE_FRAME * LOGO_BOX_SCALE;
const LOGO_GLOW_SIZE = LOGO_BASE_GLOW * LOGO_BOX_SCALE;
const LOGO_IMAGE_SIZE = LOGO_BASE_IMAGE * LOGO_IMAGE_SCALE;
const LOGO_FRAME_RADIUS = 38 * LOGO_BOX_SCALE;

// ─── Icons ────────────────────────────────────────────────────────────────────

type IP = { size?: number; color?: string; sw?: number };

const IcoMail = ({ size = 18, color = T.txt2, sw = 1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="4" width="20" height="16" rx="3" stroke={color} strokeWidth={sw} />
    <Path d="M2 7l10 7 10-7" stroke={color} strokeWidth={sw} strokeLinecap="round" />
  </Svg>
);

const IcoLock = ({ size = 18, color = T.txt2, sw = 1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="11" width="18" height="11" rx="3" stroke={color} strokeWidth={sw} />
    <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
  </Svg>
);

const IcoEye = ({ size = 18, color = T.txt2, sw = 1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={sw} />
  </Svg>
);

const IcoEyeOff = ({ size = 18, color = T.txt2, sw = 1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M1 1l22 22" stroke={color} strokeWidth={sw} strokeLinecap="round" />
  </Svg>
);

const IcoArrow = ({ size = 18, color = '#fff', sw = 2 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 12h14M12 5l7 7-7 7" stroke={color} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IcoGoogle = ({ size = 20 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </Svg>
);

const HERO_POINTS = [
  { icon: 'shield', label: 'Secure sign-in' },
  { icon: 'moon', label: 'Deep focus' },
  { icon: 'bar-chart-2', label: 'Live progress' },
] as const;

const GOOGLE_REDIRECT_PATH = 'auth/callback';

function getGoogleRedirectTo(): string {
  return ENV.supabaseAuthRedirectUrl || Linking.createURL(GOOGLE_REDIRECT_PATH);
}

function getUrlParam(url: string, key: string): string | null {
  try {
    const parsed = new URL(url);
    const queryValue = parsed.searchParams.get(key);
    if (queryValue) return queryValue;

    const hash = parsed.hash.replace(/^#/, '');
    return new URLSearchParams(hash).get(key);
  } catch {
    const value = Linking.parse(url).queryParams?.[key];
    return typeof value === 'string' ? value : null;
  }
}

function getGoogleAuthErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (/network|fetch|internet|offline|timeout|econn/i.test(message)) {
    return 'We could not reach Google. Check your internet connection and try again.';
  }
  if (/expired|invalid_grant|token/i.test(message)) {
    return 'This Google sign-in session expired. Please try again.';
  }
  if (/redirect|not allowed|callback/i.test(message)) {
    return 'Google sign-in is not fully configured. Check the OAuth redirect settings.';
  }

  return message || 'Something went wrong while signing in with Google. Please try again.';
}

function HeroBadge({ icon, label }: { icon: keyof typeof Feather.glyphMap; label: string }) {
  return (
    <View style={styles.heroBadge}>
      <Feather name={icon} size={13} color={T.accentL} />
      <Text style={styles.heroBadgeTxt}>{label}</Text>
    </View>
  );
}

// ─── Password strength ────────────────────────────────────────────────────────

function getStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: 'transparent' };
  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak',   color: T.red   };
  if (score <= 3) return { score, label: 'Fair',   color: T.gold  };
  return              { score, label: 'Strong', color: T.green };
}

function PasswordStrengthBar({ password }: { password: string }) {
  const { score, label, color } = getStrength(password);
  if (!password) return null;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={ps.wrap}>
      <View style={ps.bars}>
        {[1, 2, 3, 4, 5].map(i => (
          <View key={i} style={[ps.bar, {
            backgroundColor: i <= score ? color : 'rgba(255,255,255,0.07)',
          }]} />
        ))}
      </View>
      <Text style={[ps.label, { color }]}>{label}</Text>
    </Animated.View>
  );
}

const ps = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  bars:  { flexDirection: 'row', gap: 4, flex: 1 },
  bar:   { flex: 1, height: 4, borderRadius: 2 },
  label: { fontFamily: 'DM_Sans_600SemiBold', fontSize: 11, width: 42, textAlign: 'right' },
});

// ─── Animated text field ──────────────────────────────────────────────────────

interface FieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: React.ReactNode;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address';
  error?: string;
  delay?: number;
  autoCapitalize?: 'none' | 'sentences';
}

function Field({
  value, onChange, placeholder, icon, secure = false,
  keyboardType = 'default', error, delay = 0, autoCapitalize = 'none',
}: FieldProps) {
  const [focused,   setFocused]   = useState(false);
  const [showPass,  setShowPass]  = useState(false);
  const borderOp = useSharedValue(0);
  const shakeX   = useSharedValue(0);

  useEffect(() => {
    borderOp.value = withTiming(focused ? 1 : 0, { duration: 200 });
  }, [focused]);

  useEffect(() => {
    if (error) {
      shakeX.value = withSequence(
        withTiming(-6, { duration: 60 }),
        withRepeat(withSequence(
          withTiming(6,  { duration: 60 }),
          withTiming(-6, { duration: 60 }),
        ), 3, true),
        withTiming(0, { duration: 60 }),
      );
    }
  }, [error]);

  const wrapStyle  = useAnimatedStyle(() => ({
    borderColor: error
      ? T.red
      : `rgba(123,110,246,${borderOp.value * 0.55})`,
    transform: [{ translateX: shakeX.value }],
  }));

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(380).springify()} style={{ gap: 4 }}>
      <Animated.View style={[styles.field, wrapStyle]}>
        <View style={styles.fieldIcon}>{icon}</View>
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={T.txt3}
          secureTextEntry={secure && !showPass}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secure && (
          <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
            {showPass
              ? <IcoEye    size={18} color={focused ? T.accentL : T.txt3} />
              : <IcoEyeOff size={18} color={T.txt3} />
            }
          </TouchableOpacity>
        )}
      </Animated.View>
      {error && (
        <Animated.Text entering={FadeIn.duration(200)} style={styles.fieldError}>
          {error}
        </Animated.Text>
      )}
    </Animated.View>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────

export default function AuthScreen() {
  const insets = useSafeAreaInsets();

  // Tab state
  const [mode, setMode]       = useState<'signin' | 'signup'>('signin');
  const pillX  = useSharedValue(0);
  const [tabWidth, setTabWidth] = useState(0);
  const tabPillWidth = Math.max((tabWidth - TAB_INSET * 2) / 2, 0);

  // Form state
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const authBusy = loading || googleLoading;

  // Field errors
  const [emailErr,   setEmailErr]   = useState('');
  const [passErr,    setPassErr]    = useState('');
  const [confirmErr, setConfirmErr] = useState('');

  // CTA shimmer
  const shimX = useSharedValue(-W);
  useEffect(() => {
    shimX.value = withRepeat(
      withTiming(W + 200, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1
    );
  }, []);

  // Orb pulse
  const orbOp = useSharedValue(0.6);
  useEffect(() => {
    orbOp.value = withRepeat(
      withSequence(
        withTiming(1,   { duration: 2400 }),
        withTiming(0.4, { duration: 2400 }),
      ), -1, true
    );
  }, []);

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    pillX.value = withSpring(next === 'signin' ? 0 : 1, { damping: 18, stiffness: 260 });
    setEmailErr(''); setPassErr(''); setConfirmErr('');
  };

  const pillStyle = useAnimatedStyle(() => ({
    width: tabPillWidth,
    transform: [{ translateX: pillX.value * tabPillWidth }],
  }));
  const shimStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimX.value }] }));
  const orbStyle  = useAnimatedStyle(() => ({ opacity: orbOp.value }));

  // ── Validation
  const validate = (): boolean => {
    let ok = true;
    setEmailErr(''); setPassErr(''); setConfirmErr('');

    if (!email.trim()) { setEmailErr('Email is required'); ok = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailErr('Enter a valid email'); ok = false; }

    if (!password) { setPassErr('Password is required'); ok = false; }
    else if (password.length < 8) { setPassErr('At least 8 characters'); ok = false; }

    if (mode === 'signup') {
      if (!confirm) { setConfirmErr('Please confirm your password'); ok = false; }
      else if (confirm !== password) { setConfirmErr('Passwords do not match'); ok = false; }
    }
    return ok;
  };

  // ── Sign In
  const handleSignIn = async () => {
    if (authBusy) return;
    if (!validate()) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes('invalid')) {
        setEmailErr('Incorrect email or password');
        setPassErr(' ');
      } else {
        Alert.alert('Sign in failed', error.message);
      }
      return;
    }

    // Check if onboarding is done
    const userId = data.session?.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.onboarding_completed) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/onboarding');
      }
    }
  };

  // ── Sign Up
  const handleSignUp = async () => {
    if (authBusy) return;
    if (!validate()) return;
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Supabase will send a confirmation email if enabled in dashboard
        emailRedirectTo: 'owlapp://auth/callback',
      },
    });

    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        setEmailErr('An account with this email already exists');
      } else {
        Alert.alert('Sign up failed', error.message);
      }
      return;
    }

    // If email confirmation is disabled in Supabase dashboard, user is logged in immediately
    if (data.session) {
      // Profile row auto-created by DB trigger (from supabase_profile_migration.sql)
      router.replace('/onboarding');
    } else {
      // Email confirmation is enabled — show message
      Alert.alert(
        'Check your inbox! 📬',
        `We sent a confirmation link to ${email.trim()}.\n\nClick the link to activate your account, then come back to sign in.`,
        [{ text: 'Got it', onPress: () => switchMode('signin') }]
      );
    }
  };

  // ── Forgot Password
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setEmailErr('Enter your email first');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'owlapp://auth/reset-password',
    });
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('📬 Reset email sent', `Check your inbox at ${email.trim()} for a password reset link.`);
    }
  };

  // ── Google OAuth (requires Expo AuthSession setup)
  const handleGoogle = async () => {
    if (authBusy) return;
    setGoogleLoading(true);

    try {
      const redirectTo = getGoogleRedirectTo();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        Alert.alert('Google sign-in failed', getGoogleAuthErrorMessage(error));
        return;
      }
      if (!data?.url) {
        Alert.alert('Google sign-in failed', 'Google did not return a sign-in URL. Please try again.');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        if (result.type === 'cancel' || result.type === 'dismiss') {
          Alert.alert('Google sign-in cancelled', 'No changes were made to your account.');
        } else {
          Alert.alert('Google sign-in incomplete', 'Please try again.');
        }
        return;
      }

      const oauthError = getUrlParam(result.url, 'error_description') ?? getUrlParam(result.url, 'error');
      if (oauthError) {
        Alert.alert('Google sign-in failed', getGoogleAuthErrorMessage(oauthError));
        return;
      }

      const authCode = getUrlParam(result.url, 'code');
      if (!authCode) {
        Alert.alert(
          'Google sign-in failed',
          'Google did not return an auth code. Check the Supabase redirect URL allow list.'
        );
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
      if (exchangeError) {
        Alert.alert('Google sign-in failed', getGoogleAuthErrorMessage(exchangeError));
      }
    } catch (e) {
      Alert.alert('Google sign-in failed', getGoogleAuthErrorMessage(e));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Background gradient */}
        <LinearGradient
          colors={['#0A0818', '#07070F', '#0D0D1E']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Ambient orbs */}
        <Animated.View style={[styles.orb1, orbStyle]} />
        <Animated.View style={[styles.orb2, orbStyle]} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── LOGO + TAGLINE ──────────────────────────── */}
          <Animated.View entering={FadeInUp.delay(0).duration(430)} style={styles.logoWrap}>
            <View style={styles.logoIcon}>
              <LinearGradient
                colors={['#8B7EF8', '#5C4FD4']}
                style={styles.logoGrad}
              >
                <View style={styles.logoGlow} />
                <RNImage
                  source={require('../assets/branding/logo.png')}
                  style={styles.logoImage}
                />
              </LinearGradient>
            </View>
            <Text style={styles.logoTitle}>Zora</Text>
            <Text style={styles.logoSub}>Focus Timer & Streak</Text>
          </Animated.View>

          {/* ── CARD ────────────────────────────────────── */}
          <Animated.View entering={FadeInUp.delay(80).duration(460)} style={styles.card}>
            <LinearGradient
              colors={['rgba(123,110,246,0.08)', 'transparent']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Tab toggle */}
            <View
              style={styles.tabWrap}
              onLayout={({ nativeEvent }) => setTabWidth(nativeEvent.layout.width)}
            >
              {/* Sliding pill */}
              <Animated.View style={[styles.tabPill, pillStyle]} />
              <TouchableOpacity
                style={styles.tab}
                onPress={() => switchMode('signin')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tab}
                onPress={() => switchMode('signup')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── FORM ──────────────────────────────────── */}
            <View style={styles.form}>

              {/* Welcome text */}
              <Animated.View entering={FadeInUp.delay(140).duration(360)} style={styles.welcomeWrap}>
                <Text style={styles.welcomeTitle}>
                  {mode === 'signin' ? 'Welcome back' : 'Create your account'}
                </Text>
                <Text style={styles.welcomeSub}>
                  {mode === 'signin'
                    ? 'Sign in to continue your journey'
                    : 'Start your productivity journey today'}
                </Text>
                <View style={styles.heroBadgeRow}>
                  {HERO_POINTS.map((point) => (
                    <HeroBadge key={point.label} icon={point.icon} label={point.label} />
                  ))}
                </View>
              </Animated.View>

              {/* Email */}
              <Field
                value={email}
                onChange={v => { setEmail(v); setEmailErr(''); }}
                placeholder="Email address"
                icon={<IcoMail size={17} color={email ? T.accentL : T.txt3} />}
                keyboardType="email-address"
                error={emailErr}
                delay={180}
              />

              {/* Password */}
              <Field
                value={password}
                onChange={v => { setPassword(v); setPassErr(''); }}
                placeholder="Password"
                icon={<IcoLock size={17} color={password ? T.accentL : T.txt3} />}
                secure
                error={passErr}
                delay={220}
              />

              {/* Password strength (sign-up only) */}
              {mode === 'signup' && <PasswordStrengthBar password={password} />}

              {/* Confirm password (sign-up only) */}
              {mode === 'signup' && (
                <Field
                  value={confirm}
                  onChange={v => { setConfirm(v); setConfirmErr(''); }}
                  placeholder="Confirm password"
                  icon={<IcoLock size={17} color={confirm ? T.accentL : T.txt3} />}
                  secure
                  error={confirmErr}
                  delay={260}
                />
              )}

              {/* Forgot password (sign-in only) */}
              {mode === 'signin' && (
                <Animated.View entering={FadeInUp.delay(260).duration(360)} style={styles.forgotRow}>
                  <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7}>
                    <Text style={styles.forgotLink}>Forgot password?</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* CTA */}
              <Animated.View entering={FadeInUp.delay(300).duration(380)}>
                <TouchableOpacity
                  onPress={mode === 'signin' ? handleSignIn : handleSignUp}
                  disabled={authBusy}
                  activeOpacity={1}
                >
                  <LinearGradient
                    colors={['#9B8EF8', '#7B6EF6', '#5C4FD4']}
                    start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                    style={[styles.cta, loading && { opacity: 0.7 }]}
                  >
                    {/* Shimmer */}
                    <Animated.View style={[styles.shimmer, shimStyle]}>
                      <LinearGradient
                        colors={['transparent', 'rgba(255,255,255,0.18)', 'transparent']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={{ flex: 1 }}
                      />
                    </Animated.View>

                    {loading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <>
                          <Text style={styles.ctaTxt}>
                            {mode === 'signin' ? 'Sign In' : 'Create Account'}
                          </Text>
                          <IcoArrow size={18} color="#fff" sw={2.2} />
                        </>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              {/* Divider */}
              <Animated.View entering={FadeInUp.delay(340).duration(360)} style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </Animated.View>

              {/* Google */}
              <Animated.View entering={FadeInUp.delay(380).duration(360)}>
                <TouchableOpacity
                  onPress={handleGoogle}
                  disabled={authBusy}
                  activeOpacity={0.85}
                  style={[styles.googleBtn, authBusy && { opacity: 0.7 }]}
                >
                  {googleLoading
                    ? <ActivityIndicator color={T.txt} size="small" />
                    : <IcoGoogle size={20} />
                  }
                  <Text style={styles.googleTxt}>
                    {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>

          {/* Terms */}
          <Animated.View entering={FadeIn.delay(460)} style={styles.termsWrap}>
            <Text style={styles.termsTxt}>
              By continuing you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </Animated.View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: T.bg, overflow: 'hidden' },
  content:     { paddingHorizontal: 20, paddingTop: 24, alignItems: 'center' },

  orb1: {
    position: 'absolute', top: -80, right: -80,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(123,110,246,0.12)',
  },
  orb2: {
    position: 'absolute', bottom: 100, left: -80,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(245,200,66,0.06)',
  },

  // Logo
  logoWrap:  { alignItems: 'center', gap: 8, marginBottom: 32 },
  logoIcon:  { marginBottom: 8 },
  logoGrad: {
    width: LOGO_FRAME_SIZE, height: LOGO_FRAME_SIZE, borderRadius: LOGO_FRAME_RADIUS,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: T.accent, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  logoGlow: {
    position: 'absolute',
    width: LOGO_GLOW_SIZE, height: LOGO_GLOW_SIZE, borderRadius: LOGO_GLOW_SIZE / 2,
    bottom: -12 * LOGO_BOX_SCALE,
    backgroundColor: 'rgba(245,200,66,0.22)',
  },
  logoImage: {
    width: LOGO_IMAGE_SIZE,
    height: LOGO_IMAGE_SIZE,
    resizeMode: 'contain',
  },
  logoOwl:   { fontSize: 38 },
  logoTitle: {
    fontFamily: 'Fraunces_900Black', fontSize: 34,
    color: T.txt, letterSpacing: -1, lineHeight: 38,
  },
  logoSub: {
    fontFamily: 'DM_Sans_500Medium', fontSize: 12,
    color: T.txt2, letterSpacing: 2, textTransform: 'uppercase',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: T.border,
  },
  heroBadgeTxt: {
    fontFamily: 'DM_Sans_500Medium',
    fontSize: 11,
    color: T.txt2,
  },

  // Card
  card: {
    width: '100%',
    backgroundColor: T.card,
    borderRadius: 30, borderWidth: 1,
    borderColor: T.borderA, overflow: 'hidden',
    padding: 24, gap: 20,
  },

  // Tab toggle
  tabWrap: {
    flexDirection: 'row',
    backgroundColor: T.bg2,
    borderRadius: 18, padding: TAB_INSET,
    position: 'relative',
    overflow: 'hidden',
  },
  tabPill: {
    position: 'absolute', top: TAB_INSET, bottom: TAB_INSET, left: TAB_INSET,
    borderRadius: 14,
    backgroundColor: T.card2,
    borderWidth: 1, borderColor: T.borderA,
  },
  tab:       { flex: 1, alignItems: 'center', paddingVertical: 11, zIndex: 1 },
  tabText:   { fontFamily: 'DM_Sans_600SemiBold', fontSize: 14, color: T.txt3 },
  tabTextActive: { color: T.txt },

  // Form
  form:        { gap: 14 },
  welcomeWrap: { gap: 4, marginBottom: 4 },
  welcomeTitle:{
    fontFamily: 'Fraunces_900Black', fontSize: 22,
    color: T.txt, letterSpacing: -0.5,
  },
  welcomeSub: {
    fontFamily: 'DM_Sans_400Regular', fontSize: 13,
    color: T.txt2,
  },

  // Field
  field: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.card2, borderRadius: 16,
    borderWidth: 1.5, borderColor: T.border,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    gap: 10,
  },
  fieldIcon:  { flexShrink: 0 },
  fieldInput: {
    flex: 1, color: T.txt,
    fontFamily: 'DM_Sans_500Medium', fontSize: 15,
  },
  fieldError: {
    fontFamily: 'DM_Sans_500Medium', fontSize: 12,
    color: T.red, marginLeft: 4,
  },
  eyeBtn: { padding: 2 },

  // Forgot
  forgotRow: { alignItems: 'flex-end', marginTop: -4 },
  forgotLink:{
    fontFamily: 'DM_Sans_600SemiBold', fontSize: 13,
    color: T.accentL,
  },

  // CTA
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 18, paddingVertical: 17,
    overflow: 'hidden',
    shadowColor: T.accent, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 18, elevation: 12,
  },
  shimmer: { position: 'absolute', top: 0, bottom: 0, width: 100, opacity: 0.9 },
  ctaTxt: {
    fontFamily: 'Fraunces_900Black', fontSize: 17,
    color: '#fff', letterSpacing: -0.3,
  },

  // Divider
  dividerRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.border },
  dividerText: {
    fontFamily: 'DM_Sans_500Medium', fontSize: 12, color: T.txt3,
  },

  // Google
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, backgroundColor: T.card2, borderRadius: 18,
    borderWidth: 1, borderColor: T.border, paddingVertical: 15,
  },
  googleTxt: {
    fontFamily: 'DM_Sans_600SemiBold', fontSize: 15, color: T.txt,
  },

  // Terms
  termsWrap: { marginTop: 20, paddingHorizontal: 10 },
  termsTxt: {
    fontFamily: 'DM_Sans_400Regular', fontSize: 11,
    color: T.txt3, textAlign: 'center', lineHeight: 17,
  },
  termsLink: { color: T.accentL },
});
