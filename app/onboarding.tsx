// OnboardingFlow.tsx
// Owl Reflection Engine — Animated Onboarding
// Stack: React Native + Expo + react-native-reanimated + Supabase
// Architecture: Owl Skill Rules (TypeScript, modular, clean state)

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/Analytics';
import { completeOnboarding } from '@/lib/userService';
import { router } from 'expo-router'; // your supabase client

// ─── Types ────────────────────────────────────────────────────────────────────

type GoalOption = 'focus' | 'habits' | 'tasks' | 'balance' | 'learning' | 'fitness';
type WorkStyle = 'deep' | 'sprints' | 'flexible' | 'structured';
type FocusDuration = 25 | 45 | 60 | 90;

interface OnboardingData {
  name: string;
  goals: GoalOption[];
  workStyle: WorkStyle | null;
  focusDuration: FocusDuration | null;
  notificationsEnabled: boolean;
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const THEME = {
  bg: '#0A0A0F',
  bgCard: '#13131A',
  bgCardActive: '#1C1C28',
  accent: '#7B6EF6',
  accentSoft: '#A99FF8',
  accentGlow: 'rgba(123,110,246,0.15)',
  accentGlowStrong: 'rgba(123,110,246,0.35)',
  gold: '#F5C84A',
  goldSoft: 'rgba(245,200,74,0.12)',
  textPrimary: '#F0EFF8',
  textSecondary: '#8A8A9A',
  textMuted: '#4A4A5A',
  border: 'rgba(255,255,255,0.06)',
  borderActive: 'rgba(123,110,246,0.4)',
  danger: '#F26B6B',
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Step Config ──────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5;
const BRAND_LOGO = require('../assets/branding/logo.png');

// ─── Subcomponents ────────────────────────────────────────────────────────────

/** Animated progress dots */
const ProgressDots = ({ current }: { current: number }) => (
  <View style={styles.progressRow}>
    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
      <Animated.View
        key={i}
        style={[
          styles.dot,
          i === current && styles.dotActive,
          i < current && styles.dotDone,
        ]}
      />
    ))}
  </View>
);

/** Glowing pill chip for multi-select */
const Chip = ({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
}) => {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.93, { damping: 12 }, () => {
      scale.value = withSpring(1, { damping: 12 });
    });
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={1}>
      <Animated.View
        style={[
          animStyle,
          styles.chip,
          selected && styles.chipSelected,
        ]}
      >
        <Text style={styles.chipIcon}>{icon}</Text>
        <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
          {label}
        </Text>
        {selected && (
          <View style={styles.chipCheck}>
            <Text style={styles.chipCheckText}>✓</Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

/** Single-select card */
const OptionCard = ({
  label,
  description,
  icon,
  selected,
  onPress,
}: {
  label: string;
  description: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
}) => {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.96, { damping: 15 }, () => {
      scale.value = withSpring(1, { damping: 15 });
    });
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={1}>
      <Animated.View style={[animStyle, styles.optionCard, selected && styles.optionCardSelected]}>
        <Text style={styles.optionIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
            {label}
          </Text>
          <Text style={styles.optionDesc}>{description}</Text>
        </View>
        <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
          {selected && <View style={styles.radioInner} />}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

/** Main CTA Button */
const PrimaryButton = ({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.4 : 1,
  }));

  const handlePress = () => {
    if (disabled) return;
    scale.value = withSpring(0.95, { damping: 10 }, () => {
      scale.value = withSpring(1, { damping: 10 });
    });
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={1} disabled={disabled}>
      <Animated.View style={animStyle}>
        <LinearGradient
          colors={['#8B7EF8', '#6B5EE8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>{label}</Text>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─── Step Screens ─────────────────────────────────────────────────────────────

/** Step 0: Welcome + Name */
const StepName = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) => (
  <Animated.View entering={SlideInRight.duration(380).easing(Easing.out(Easing.cubic))} exiting={SlideOutLeft.duration(300)} style={styles.stepContainer}>
    {/* Decorative orb */}
    <View style={styles.orbLarge} />

    <View style={styles.brandMarkWrap}>
      <Image source={BRAND_LOGO} style={styles.brandMark} resizeMode="contain" />
    </View>

    <Text style={styles.stepTitle}>Welcome to Zora.</Text>
    <Text style={styles.stepSubtitle}>
      Your focus companion for building better sessions,{'\n'}habits, and momentum one day at a time.
    </Text>

    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>What should I call you?</Text>
      <TextInput
        style={styles.textInput}
        placeholder="Your name..."
        placeholderTextColor={THEME.textMuted}
        value={value}
        onChangeText={onChange}
        autoFocus
        returnKeyType="done"
        selectionColor={THEME.accent}
      />
      <View style={[styles.inputUnderline, value.length > 0 && styles.inputUnderlineActive]} />
    </View>
  </Animated.View>
);

/** Step 1: Goals multi-select */
const GOAL_OPTIONS: { id: GoalOption; label: string; icon: string }[] = [
  { id: 'focus', label: 'Deep Focus', icon: '🎯' },
  { id: 'habits', label: 'Build Habits', icon: '🔗' },
  { id: 'tasks', label: 'Crush Tasks', icon: '✅' },
  { id: 'balance', label: 'Work-Life Balance', icon: '⚖️' },
  { id: 'learning', label: 'Learn Faster', icon: '📚' },
  { id: 'fitness', label: 'Health & Energy', icon: '⚡' },
];

const StepGoals = ({
  selected,
  onToggle,
}: {
  selected: GoalOption[];
  onToggle: (id: GoalOption) => void;
}) => (
  <Animated.View entering={SlideInRight.duration(380).easing(Easing.out(Easing.cubic))} exiting={SlideOutLeft.duration(300)} style={styles.stepContainer}>
    <View style={styles.orbSmall} />
    <Text style={styles.stepTitle}>What are you{'\n'}working towards?</Text>
    <Text style={styles.stepSubtitle}>Pick everything that resonates.</Text>

    <View style={styles.chipGrid}>
      {GOAL_OPTIONS.map((g) => (
        <Chip
          key={g.id}
          label={g.label}
          icon={g.icon}
          selected={selected.includes(g.id)}
          onPress={() => onToggle(g.id)}
        />
      ))}
    </View>
  </Animated.View>
);

/** Step 2: Work style */
const WORK_STYLES: { id: WorkStyle; label: string; description: string; icon: string }[] = [
  { id: 'deep', label: 'Deep Worker', description: 'Long uninterrupted blocks, few tasks', icon: '🌊' },
  { id: 'sprints', label: 'Sprint Mode', description: 'Pomodoro-style, many short bursts', icon: '⚡' },
  { id: 'flexible', label: 'Flexible Flow', description: 'Adapt to the day, no rigid structure', icon: '🌀' },
  { id: 'structured', label: 'Full Structure', description: 'Time-blocked, calendar-driven', icon: '🏗️' },
];

const StepWorkStyle = ({
  selected,
  onSelect,
}: {
  selected: WorkStyle | null;
  onSelect: (v: WorkStyle) => void;
}) => (
  <Animated.View entering={SlideInRight.duration(380).easing(Easing.out(Easing.cubic))} exiting={SlideOutLeft.duration(300)} style={styles.stepContainer}>
    <Text style={styles.stepTitle}>How do you{'\n'}work best?</Text>
    <Text style={styles.stepSubtitle}>Zora adapts to your natural rhythm.</Text>

    <View style={styles.optionList}>
      {WORK_STYLES.map((w) => (
        <OptionCard
          key={w.id}
          label={w.label}
          description={w.description}
          icon={w.icon}
          selected={selected === w.id}
          onPress={() => onSelect(w.id)}
        />
      ))}
    </View>
  </Animated.View>
);

/** Step 3: Focus duration */
const FOCUS_DURATIONS: { value: FocusDuration; label: string; desc: string }[] = [
  { value: 25, label: '25 min', desc: 'Classic Pomodoro' },
  { value: 45, label: '45 min', desc: 'Extended focus' },
  { value: 60, label: '60 min', desc: 'Deep work block' },
  { value: 90, label: '90 min', desc: 'Ultradian rhythm' },
];

const StepFocusDuration = ({
  selected,
  onSelect,
}: {
  selected: FocusDuration | null;
  onSelect: (v: FocusDuration) => void;
}) => (
  <Animated.View entering={SlideInRight.duration(380).easing(Easing.out(Easing.cubic))} exiting={SlideOutLeft.duration(300)} style={styles.stepContainer}>
    <Text style={styles.stepTitle}>Default focus{'\n'}session length?</Text>
    <Text style={styles.stepSubtitle}>You can always change this later.</Text>

    <View style={styles.durationGrid}>
      {FOCUS_DURATIONS.map((d) => (
        <TouchableOpacity
          key={d.value}
          onPress={() => onSelect(d.value)}
          style={[styles.durationCard, selected === d.value && styles.durationCardSelected]}
        >
          <Text style={[styles.durationValue, selected === d.value && styles.durationValueSelected]}>
            {d.label}
          </Text>
          <Text style={styles.durationDesc}>{d.desc}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </Animated.View>
);

/** Step 4: Notifications + final */
const StepFinish = ({
  name,
  notificationsEnabled,
  onToggle,
}: {
  name: string;
  notificationsEnabled: boolean;
  onToggle: () => void;
}) => (
  <Animated.View entering={SlideInRight.duration(380).easing(Easing.out(Easing.cubic))} exiting={SlideOutLeft.duration(300)} style={styles.stepContainer}>
    <View style={styles.orbLarge} />
    <View style={styles.emojiWrap}>
      <Text style={styles.stepEmoji}>✨</Text>
    </View>

    <Text style={styles.stepTitle}>Almost there,{'\n'}{name || 'friend'}!</Text>
    <Text style={styles.stepSubtitle}>One last thing to set you up for success.</Text>

    <TouchableOpacity onPress={onToggle} style={[styles.notifCard, notificationsEnabled && styles.notifCardActive]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.notifTitle}>Daily Reminders</Text>
        <Text style={styles.notifDesc}>
          Gentle nudges to start your focus blocks and check in on your habits.
        </Text>
      </View>
      <View style={[styles.toggle, notificationsEnabled && styles.toggleActive]}>
        <View style={[styles.toggleThumb, notificationsEnabled && styles.toggleThumbActive]} />
      </View>
    </TouchableOpacity>

    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Your Setup</Text>
      <Text style={styles.summaryLine}>Name: <Text style={styles.summaryValue}>{name || '—'}</Text></Text>
      <Text style={styles.summaryLine}>Reminders: <Text style={styles.summaryValue}>{notificationsEnabled ? 'On' : 'Off'}</Text></Text>
    </View>
  </Animated.View>
);

// ─── Main Onboarding Component ────────────────────────────────────────────────

export default function OnboardingFlow({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  // PostHog: track onboarding start on first render
  const [data, setData] = useState<OnboardingData>({
    name: '',
    goals: [],
    workStyle: null,
    focusDuration: null,
    notificationsEnabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  React.useEffect(() => { track('onboarding_started'); }, []);

  // ── Validation per step
  const canProceed = useCallback(() => {
    if (step === 0) return data.name.trim().length >= 2;
    if (step === 1) return data.goals.length >= 1;
    if (step === 2) return data.workStyle !== null;
    if (step === 3) return data.focusDuration !== null;
    return true;
  }, [step, data]);

  // ── Toggle goal
  const toggleGoal = (id: GoalOption) => {
    setData((prev) => ({
      ...prev,
      goals: prev.goals.includes(id)
        ? prev.goals.filter((g) => g !== id)
        : [...prev.goals, id],
    }));
  };

  // ── Save to Supabase + complete
  const handleFinish = async () => {
    setSaveError(null);
    setSaving(true);
    let didSave = false;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Your session expired. Please sign in again before finishing onboarding.');
      }

      await completeOnboarding({ name: data.name }, user.id);
      didSave = true;
      track('onboarding_completed', { name_length: data.name.trim().length, goals: data.goals });
      onComplete?.();
      /*
          display_name: data.name.trim(),        // ← correct column name
      */
    } catch (e) {
      // Non-blocking — let user continue even if save fails
      console.warn('Onboarding save error:', e);
      setSaveError(
        e instanceof Error
          ? e.message
          : 'We could not save your profile yet. Please try again.'
      );
    } finally {
      setSaving(false);
      // Navigate to home — display_name is now in DB so home screen will load it
      if (didSave) router.replace('/(tabs)/home');
    }
  };

  const next = () => {
    if (step < TOTAL_STEPS - 1) {
      setSaveError(null);
      setStep((s) => s + 1);
      return;
    }

    void handleFinish();
  };

  const back = () => {
    setSaveError(null);
    if (step > 0) setStep((s) => s - 1);
  };

  const ctaLabel =
    step === TOTAL_STEPS - 1
      ? saving ? 'Saving...' : 'Start My Journey →'
      : 'Continue →';

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" />

      {/* Background gradient */}
      <LinearGradient
        colors={['#0A0A0F', '#0D0D1A', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />

      {/* Top nav */}
      <View style={styles.topNav}>
        {step > 0 ? (
          <TouchableOpacity onPress={back} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <ProgressDots current={step} />
        <View style={styles.backBtn} />
      </View>

      {/* Step content — KeyboardAvoiding for name step */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 && (
            <StepName value={data.name} onChange={(v) => setData((d) => ({ ...d, name: v }))} />
          )}
          {step === 1 && (
            <StepGoals selected={data.goals} onToggle={toggleGoal} />
          )}
          {step === 2 && (
            <StepWorkStyle
              selected={data.workStyle}
              onSelect={(v) => setData((d) => ({ ...d, workStyle: v }))}
            />
          )}
          {step === 3 && (
            <StepFocusDuration
              selected={data.focusDuration}
              onSelect={(v) => setData((d) => ({ ...d, focusDuration: v }))}
            />
          )}
          {step === 4 && (
            <StepFinish
              name={data.name}
              notificationsEnabled={data.notificationsEnabled}
              onToggle={() => setData((d) => ({ ...d, notificationsEnabled: !d.notificationsEnabled }))}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        {saveError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        ) : null}
        <PrimaryButton
          label={step === TOTAL_STEPS - 1 && saveError && !saving ? 'Try Again' : ctaLabel}
          onPress={next}
          disabled={!canProceed() || saving}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.textMuted,
  },
  dotActive: {
    width: 20,
    backgroundColor: THEME.accent,
  },
  dotDone: {
    backgroundColor: THEME.accentSoft,
  },
  backBtn: {
    width: 70,
  },
  backBtnText: {
    color: THEME.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  stepContainer: {
    flex: 1,
    paddingTop: 24,
  },

  // Decorative orbs
  orbLarge: {
    position: 'absolute',
    top: -60,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: THEME.accentGlow,
    // blur handled by Expo BlurView in real RN; approximated here
  },
  orbSmall: {
    position: 'absolute',
    top: 20,
    left: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(245,200,74,0.06)',
  },

  emojiWrap: {
    marginBottom: 16,
  },
  brandMarkWrap: {
    marginBottom: 20,
  },
  brandMark: {
    width: 120,
    height: 120,
    borderRadius: 30,
  },
  stepEmoji: {
    fontSize: 52,
  },
  stepTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: THEME.textPrimary,
    lineHeight: 40,
    letterSpacing: -0.5,
    marginBottom: 10,
    // In real RN, use a custom font like 'Fraunces' or 'Clash Display'
  },
  stepSubtitle: {
    fontSize: 16,
    color: THEME.textSecondary,
    lineHeight: 24,
    marginBottom: 36,
  },

  // Name step
  inputWrap: {
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 13,
    color: THEME.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  textInput: {
    fontSize: 26,
    fontWeight: '600',
    color: THEME.textPrimary,
    paddingBottom: 8,
  },
  inputUnderline: {
    height: 1.5,
    backgroundColor: THEME.border,
  },
  inputUnderlineActive: {
    backgroundColor: THEME.accent,
  },

  // Chip grid (goals)
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: THEME.border,
    backgroundColor: THEME.bgCard,
  },
  chipSelected: {
    borderColor: THEME.accent,
    backgroundColor: THEME.accentGlow,
  },
  chipIcon: {
    fontSize: 18,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME.textSecondary,
  },
  chipLabelSelected: {
    color: THEME.accentSoft,
  },
  chipCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: THEME.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCheckText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },

  // Option cards (work style)
  optionList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: THEME.border,
    backgroundColor: THEME.bgCard,
  },
  optionCardSelected: {
    borderColor: THEME.accent,
    backgroundColor: THEME.accentGlow,
  },
  optionIcon: {
    fontSize: 26,
    width: 36,
    textAlign: 'center',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.textPrimary,
    marginBottom: 2,
  },
  optionLabelSelected: {
    color: THEME.accentSoft,
  },
  optionDesc: {
    fontSize: 13,
    color: THEME.textMuted,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: THEME.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: THEME.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.accent,
  },

  // Duration grid
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  durationCard: {
    width: (SCREEN_W - 48 - 12) / 2,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: THEME.border,
    backgroundColor: THEME.bgCard,
    alignItems: 'center',
  },
  durationCardSelected: {
    borderColor: THEME.accent,
    backgroundColor: THEME.accentGlow,
  },
  durationValue: {
    fontSize: 24,
    fontWeight: '700',
    color: THEME.textPrimary,
    marginBottom: 4,
  },
  durationValueSelected: {
    color: THEME.accentSoft,
  },
  durationDesc: {
    fontSize: 12,
    color: THEME.textMuted,
    textAlign: 'center',
  },

  // Final step
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: THEME.border,
    backgroundColor: THEME.bgCard,
    marginBottom: 16,
  },
  notifCardActive: {
    borderColor: THEME.accent,
    backgroundColor: THEME.accentGlow,
  },
  notifTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.textPrimary,
    marginBottom: 4,
  },
  notifDesc: {
    fontSize: 13,
    color: THEME.textMuted,
    lineHeight: 18,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: THEME.textMuted,
    padding: 3,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: THEME.accent,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  summaryCard: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: THEME.goldSoft,
    borderWidth: 1,
    borderColor: 'rgba(245,200,74,0.2)',
    gap: 8,
  },
  summaryTitle: {
    fontSize: 12,
    color: THEME.gold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  summaryLine: {
    fontSize: 14,
    color: THEME.textSecondary,
  },
  summaryValue: {
    color: THEME.textPrimary,
    fontWeight: '600',
  },

  // Bottom CTA
  bottomBar: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  errorCard: {
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(242,107,107,0.35)',
    backgroundColor: 'rgba(242,107,107,0.12)',
  },
  errorText: {
    color: THEME.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
