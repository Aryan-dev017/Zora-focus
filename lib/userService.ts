// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// lib/userService.ts  â€”  Owl Reflection Engine
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { supabase } from './supabase';

// â”€â”€â”€ Save local + persist to Supabase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const completeOnboarding = async (data: {
  name:          string;   // display_name
  username?:     string;   // unique @handle (letters, digits, _ .)
  avatarChoice?: number;   // 1â€“6
  [key: string]: any;
}, userId: string) => {
  const trimmedName = data.name.trim();

  if (!userId) {
    throw new Error('Missing user session. Please sign in again.');
  }

  if (trimmedName.length < 2) {
    throw new Error('Please enter a name with at least 2 characters.');
  }

  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      id:                   userId,
      display_name:         trimmedName,
      onboarding_completed: true,
      updated_at:           new Date().toISOString(),
    });

  if (error) {
    throw new Error(error.message);
  }
};

// â”€â”€â”€ Username availability check (debounced from onboarding / profile) â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const checkUsernameAvailable = async (
  username: string,
  currentUserId?: string,
): Promise<{ available: boolean; error: string | null }> => {
  // Client-side format check first (fast, no network)
  if (!username || username.trim().length === 0)
    return { available: false, error: 'Username cannot be empty.' };
  if (username.length < 3)
    return { available: false, error: 'Must be at least 3 characters.' };
  if (username.length > 24)
    return { available: false, error: 'Must be 24 characters or fewer.' };
  if (!/^[a-zA-Z0-9._]+$/.test(username))
    return { available: false, error: 'Only letters, numbers, _ and . allowed.' };
  if (/\.\./.test(username) || /__/.test(username))
    return { available: false, error: 'No consecutive dots or underscores.' };
  if (/^[._]/.test(username) || /[._]$/.test(username))
    return { available: false, error: 'Cannot start or end with . or _.' };

  // Server-side uniqueness check
  try {
    const { data, error } = await supabase.rpc('check_username_available', {
      p_username: username.toLowerCase(),
      p_user_id:  currentUserId ?? null,
    });
    if (error) throw error;
    return { available: data === true, error: data === true ? null : 'Username already taken.' };
  } catch {
    // Fail open on network error so onboarding isn't blocked
    return { available: true, error: null };
  }
};

// â”€â”€â”€ Save username from profile screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const saveUsername = async (userId: string, username: string) => {
  const { error } = await supabase
    .from('user_profiles')
    .update({ username: username.toLowerCase(), updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new Error(error.message);
};
