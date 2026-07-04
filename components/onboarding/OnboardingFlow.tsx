import React, { useState, useCallback } from 'react';
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
} from 'react-native';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  SlideInRight,
  SlideOutLeft,
} from 'react-native-reanimated';

import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveOnboarding } from '@/lib/storage';

type GoalOption = 'focus' | 'habits' | 'tasks' | 'balance' | 'learning' | 'fitness';
type WorkStyle = 'deep' | 'sprints' | 'flexible' | 'structured';
type FocusDuration = 25 | 45 | 60 | 90;

interface Props {
  onComplete: () => void;
}

const TOTAL_STEPS = 5;

export default function OnboardingFlow({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [goals, setGoals] = useState<GoalOption[]>([]);
  const [workStyle, setWorkStyle] = useState<WorkStyle | null>(null);
  const [focusDuration, setFocusDuration] = useState<FocusDuration | null>(null);
  const [notifications, setNotifications] = useState(true);

  const toggleGoal = (goal: GoalOption) => {
    setGoals((prev) =>
      prev.includes(goal)
        ? prev.filter((g) => g !== goal)
        : [...prev, goal]
    );
  };

  const canProceed = useCallback(() => {
    if (step === 0) return name.trim().length >= 2;
    if (step === 1) return goals.length > 0;
    if (step === 2) return workStyle !== null;
    if (step === 3) return focusDuration !== null;
    return true;
  }, [step, name, goals, workStyle, focusDuration]);

  const handleFinish = async () => {
    setSaving(true);

    await saveOnboarding({
      name,
      goals,
      workStyle,
      focusDuration,
      notifications,
    });

    setSaving(false);
    onComplete();
  };

  const next = () => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
    else handleFinish();
  };

  const back = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#0A0A0F', '#0D0D1A']}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {step === 0 && (
          <Animated.View entering={SlideInRight} exiting={SlideOutLeft}>
            <Text style={styles.title}>Hey, I'm Owl </Text>
            <TextInput
              style={styles.input}
              placeholder="Your name..."
              placeholderTextColor="#666"
              value={name}
              onChangeText={setName}
            />
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View entering={SlideInRight} exiting={SlideOutLeft}>
            <Text style={styles.title}>Your Goals</Text>
            {['focus', 'habits', 'tasks', 'balance', 'learning', 'fitness'].map(
              (g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.option,
                    goals.includes(g as GoalOption) && styles.optionActive,
                  ]}
                  onPress={() => toggleGoal(g as GoalOption)}
                >
                  <Text style={styles.optionText}>{g}</Text>
                </TouchableOpacity>
              )
            )}
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View entering={SlideInRight} exiting={SlideOutLeft}>
            <Text style={styles.title}>Work Style</Text>
            {['deep', 'sprints', 'flexible', 'structured'].map((w) => (
              <TouchableOpacity
                key={w}
                style={[
                  styles.option,
                  workStyle === w && styles.optionActive,
                ]}
                onPress={() => setWorkStyle(w as WorkStyle)}
              >
                <Text style={styles.optionText}>{w}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}

        {step === 3 && (
          <Animated.View entering={SlideInRight} exiting={SlideOutLeft}>
            <Text style={styles.title}>Focus Duration</Text>
            {[25, 45, 60, 90].map((d) => (
              <TouchableOpacity
                key={d}
                style={[
                  styles.option,
                  focusDuration === d && styles.optionActive,
                ]}
                onPress={() => setFocusDuration(d as FocusDuration)}
              >
                <Text style={styles.optionText}>{d} min</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}

        {step === 4 && (
          <Animated.View entering={SlideInRight} exiting={SlideOutLeft}>
            <Text style={styles.title}>Notifications</Text>
            <TouchableOpacity
              style={[styles.option, notifications && styles.optionActive]}
              onPress={() => setNotifications((n) => !n)}
            >
              <Text style={styles.optionText}>
                {notifications ? 'Enabled' : 'Disabled'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>

      <View style={styles.bottom}>
        {step > 0 && (
          <TouchableOpacity onPress={back}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          disabled={!canProceed() || saving}
          style={[
            styles.button,
            (!canProceed() || saving) && { opacity: 0.5 },
          ]}
          onPress={next}
        >
          <Text style={styles.buttonText}>
            {saving ? 'Saving...' : step === 4 ? 'Finish' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 100,
  },
  title: {
    fontSize: 26,
    color: '#fff',
    marginBottom: 20,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: '#7B6EF6',
    color: '#fff',
    paddingVertical: 8,
    fontSize: 18,
  },
  option: {
    padding: 16,
    backgroundColor: '#1C1C28',
    borderRadius: 12,
    marginBottom: 10,
  },
  optionActive: {
    borderColor: '#7B6EF6',
    borderWidth: 2,
  },
  optionText: {
    color: '#fff',
  },
  bottom: {
    padding: 20,
  },
  back: {
    color: '#aaa',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#7B6EF6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});