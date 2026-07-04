import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'onboarding_data';
const COMPLETED_KEY = 'onboarding_completed';

import { supabase } from './supabase';

export const saveOnboarding = async (data: any) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log("❌ No user found");
    return;
  }

  // ✅ Save locally (optional)
  await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(data));
  await AsyncStorage.setItem(COMPLETED_KEY, 'true');

  // ✅ SAVE TO DATABASE (IMPORTANT)
  const { error } = await supabase.from('user_profiles').upsert({
    id: user.id,
    display_name: data.name, // 👈 your input field
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.log("❌ onboarding DB error:", error);
  } else {
    console.log("✅ onboarding saved to DB");
  }
};

export const getOnboarding = async () => {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value ? JSON.parse(value) : null;
};

export const isOnboardingCompleted = async () => {
  const value = await AsyncStorage.getItem(COMPLETED_KEY);
  return value === 'true';
};

export const clearOnboarding = async () => {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
  await AsyncStorage.removeItem(COMPLETED_KEY);
};