// ─────────────────────────────────────────────────────────────────────────────
// app/(tabs)/profile.tsx  —  Owl Reflection Engine
//
// Features:
//   • Avatar: tap to upload from camera roll → uploads to Supabase Storage
//   • Inline edit: display name, goal, bio (tap pencil → sheet opens)
//   • Email shown from auth.user — tap to edit → updates via supabase.auth.updateUser
//   • Streak board: current streak / longest / total days / level badge
//   • Achievements row (unlocked badges with glow)
//   • Settings menu rows (notifications, appearance, privacy, etc.)
//   • Sign out with confirmation shake animation
//   • All profile writes → user_profiles table in Supabase
//   • Staggered FadeInUp on mount, spring scale on every interactive element
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, KeyboardAvoidingView,
  Dimensions, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  FadeInUp,
  FadeIn,
  ZoomIn,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from 'expo-blur';
import Svg, {
  Path, Circle, Rect, G, Defs, Stop,
  LinearGradient as SvgGradient,
  Line, Polygon,
} from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { resetUser } from '@/lib/purchases';
import { saveUsername, checkUsernameAvailable } from '@/lib/userService';
import { router } from 'expo-router';
import { Mascot } from '@/components/Mascot';
import { getLevelInfo, getNextLevel, type LevelDef } from '@/lib/Xp';

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:      '#07070F',
  bg2:     '#0C0C1A',
  card:    '#111122',
  card2:   '#181830',
  card3:   '#1E1E34',
  accent:  '#7B6EF6',
  accentL: '#A99FF8',
  accentD: 'rgba(123,110,246,0.14)',
  accentB: 'rgba(123,110,246,0.24)',
  gold:    '#F5C842',
  goldD:   'rgba(245,200,66,0.13)',
  green:   '#3ECFA0',
  greenD:  'rgba(62,207,160,0.12)',
  red:     '#F26B6B',
  redD:    'rgba(242,107,107,0.12)',
  blue:    '#54AEFF',
  blueD:   'rgba(84,174,255,0.12)',
  teal:    '#2ECEC8',
  rose:    '#FF6B9D',
  txt:     '#EEEDF8',
  txt2:    '#7E7E9A',
  txt3:    '#3A3A54',
  border:  'rgba(255,255,255,0.055)',
  borderA: 'rgba(123,110,246,0.22)',
};

const { width: W } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// ICON LIBRARY
// ─────────────────────────────────────────────────────────────────────────────

type IP = { size?: number; color?: string; sw?: number };

const IcoCamera   = ({ size=22, color=T.txt, sw=1.8 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="12" cy="13" r="4" stroke={color} strokeWidth={sw}/>
  </Svg>
);

const IcoPencil   = ({ size=16, color=T.txt2, sw=1.8 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const IcoCheck    = ({ size=18, color=T.green, sw=2.2 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const IcoX        = ({ size=18, color=T.red, sw=2.2 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  </Svg>
);

const IcoMail     = ({ size=16, color=T.txt2, sw=1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="4" width="20" height="16" rx="3" stroke={color} strokeWidth={sw}/>
    <Path d="M2 7l10 7 10-7" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  </Svg>
);

const IcoTarget   = ({ size=16, color=T.rose, sw=1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw}/>
    <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth={sw}/>
    <Circle cx="12" cy="12" r="2" stroke={color} strokeWidth={sw}/>
  </Svg>
);

const IcoFire     = ({ size=16, color=T.gold, sw=1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const IcoStar     = ({ size=15, color=T.gold, sw=1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const IcoZap      = ({ size=16, color=T.accent, sw=1.8 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const IcoChevron  = ({ size=16, color=T.txt3, sw=2 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const IcoBell     = ({ size=18, color=T.txt2, sw=1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  </Svg>
);

const IcoShield   = ({ size=18, color=T.blue, sw=1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const IcoPalette  = ({ size=18, color=T.teal, sw=1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw}/>
    <Circle cx="8.5" cy="9.5" r="1.5" fill={color}/>
    <Circle cx="15.5" cy="9.5" r="1.5" fill={color}/>
    <Circle cx="12" cy="15" r="1.5" fill={color}/>
  </Svg>
);

const IcoLogout   = ({ size=18, color=T.red, sw=1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
    <Polygon points="16,17 21,12 16,7" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
    <Line x1="21" y1="12" x2="9" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  </Svg>
);

const IcoUser     = ({ size=36, color='rgba(123,110,246,0.6)', sw=1.5 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={sw}/>
    <Path d="M4 20c0-3.31 3.58-6 8-6s8 2.69 8 6" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  </Svg>
);

const IcoTrophy   = ({ size=20, color=T.gold, sw=1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M4 22h16M8 22v-4M16 22v-4" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
    <Path d="M6 4h12v5a6 6 0 0 1-12 0V4z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const IcoInfo     = ({ size=16, color=T.txt3, sw=1.7 }: IP) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw}/>
    <Path d="M12 16v-4M12 8h.01" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  </Svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

interface UserProfile {
  id:            string;
  display_name:  string;
  bio:           string;
  goal:          string;
  avatar_url:    string | null;
  current_streak: number;
  longest_streak: number;
  total_days:    number;
  level:         number;
  total_xp:      number;
  onboarding_completed: boolean;
  username?:     string | null;
  avatar_choice: number;
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) { console.error('fetchProfile:', error); return null; }
  return data as UserProfile;
}

async function updateProfile(userId: string, updates: Partial<UserProfile>) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

async function uploadAvatar(userId: string, uri: string): Promise<string> {
  // Read file as blob
  const response = await fetch(uri);
  const blob     = await response.blob();
  const ext      = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path     = `avatars/${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('user-avatars')
    .upload(path, blob, { upsert: true, contentType: `image/${ext}` });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('user-avatars').getPublicUrl(path);
  return data.publicUrl + `?t=${Date.now()}`; // cache-bust
}

async function updateEmail(newEmail: string) {
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  icon, value, label, color, delay,
}: { icon: React.ReactNode; value: string; label: string; color: string; delay: number }) {
  const glowOp = useSharedValue(0.5);
  useEffect(() => {
    glowOp.value = withRepeat(
      withSequence(
        withTiming(1,   { duration: 1800 }),
        withTiming(0.4, { duration: 1800 }),
      ), -1, true
    );
  }, []);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOp.value }));

  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(400).springify()}
      style={[statS.card, { borderColor: color + '2A' }]}
    >
      <Animated.View style={[statS.glow, { backgroundColor: color }, glowStyle]} />
      <View style={[statS.iconWrap, { backgroundColor: color + '18' }]}>{icon}</View>
      <Text style={[statS.value, { color }]}>{value}</Text>
      <Text style={statS.label}>{label}</Text>
    </Animated.View>
  );
}

const statS = StyleSheet.create({
  card: {
    flex: 1, minWidth: (W - 56) / 2,
    backgroundColor: T.card,
    borderRadius: 20, borderWidth: 1,
    padding: 16, gap: 8,
    overflow: 'hidden', alignItems: 'flex-start',
  },
  glow: {
    position: 'absolute', top: -20, right: -20,
    width: 70, height: 70, borderRadius: 35,
    opacity: 0.12,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  value: { fontFamily: 'Fraunces_900Black', fontSize: 28, letterSpacing: -1, lineHeight: 32 },
  label: { fontFamily: 'DM_Sans_500Medium', fontSize: 11, color: T.txt2, letterSpacing: 0.3 },
});

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL BADGE
// ─────────────────────────────────────────────────────────────────────────────

const LEVELS = [
  { level: 1, label: 'Seedling',   color: T.green,  emoji: '🌱', minXp: 0     },
  { level: 2, label: 'Focused',    color: T.blue,   emoji: '🔵', minXp: 500   },
  { level: 3, label: 'Dedicated',  color: T.accent, emoji: '⚡', minXp: 1500  },
  { level: 4, label: 'Expert',     color: T.teal,   emoji: '🔮', minXp: 4000  },
  { level: 5, label: 'Master',     color: T.gold,   emoji: '👑', minXp: 10000 },
];

// ─────────────────────────────────────────────────────────────────────────────
// ACHIEVEMENT BADGES
// ─────────────────────────────────────────────────────────────────────────────

const ACHIEVEMENTS = [
  { id:'a1', emoji:'🔥', label:'7-Day Streak',   color:T.gold,   unlocked:true  },
  { id:'a2', emoji:'⚡', label:'Focus Master',   color:T.accent, unlocked:true  },
  { id:'a3', emoji:'📚', label:'Book Worm',       color:T.blue,   unlocked:true  },
  { id:'a4', emoji:'🏃', label:'Runner',          color:T.green,  unlocked:false },
  { id:'a5', emoji:'🧘', label:'Mindful',         color:T.teal,   unlocked:true  },
  { id:'a6', emoji:'👑', label:'Level 5',         color:T.gold,   unlocked:false },
];

// ─────────────────────────────────────────────────────────────────────────────
// EDIT FIELD SHEET
// ─────────────────────────────────────────────────────────────────────────────

interface EditSheetProps {
  visible:     boolean;
  field:       'name' | 'email' | null;
  value:       string;
  onClose:     () => void;
  onSave:      (val: string, password?: string) => Promise<void>;
}

function EditSheet({ visible, field, value, onClose, onSave }: EditSheetProps) {
  const [text,     setText]    = useState(value);
  const [password, setPassword]= useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading] = useState(false);
  const translateY = useSharedValue(600);
  const overlayOp  = useSharedValue(0);

  useEffect(() => { setText(value); setPassword(''); }, [value, visible]);

  useEffect(() => {
    if (visible) {
      overlayOp.value  = withTiming(1, { duration: 220 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 250 });
    } else {
      overlayOp.value  = withTiming(0, { duration: 180 });
      translateY.value = withSpring(600, { damping: 20, stiffness: 300 });
    }
  }, [visible]);

  const sheetStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));

  const handleSave = async () => {
    if (!text.trim()) return;
    if (field === 'email' && !password.trim()) {
      Alert.alert('Password required', 'Please enter your current password to change your email address.');
      return;
    }
    setLoading(true);
    try {
      await onSave(text.trim(), field === 'email' ? password : undefined);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save changes.');
    } finally {
      setLoading(false);
    }
  };

  const FIELD_META: Record<string, { title: string; placeholder: string }> = {
    name:  { title: 'Edit Display Name', placeholder: 'Your display name…' },
    email: { title: 'Change Email',      placeholder: 'your@email.com'     },
  };

  const meta = field ? FIELD_META[field] : null;
  if (!field || !meta) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[editS.overlay, overlayStyle]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={editS.kav} pointerEvents="box-none">
        <Animated.View style={[editS.sheet, sheetStyle]}>
          <View style={editS.handle} />

          <View style={editS.headerRow}>
            <Text style={editS.title}>{meta.title}</Text>
            <TouchableOpacity onPress={onClose} style={editS.closeBtn}>
              <IcoX size={18} color={T.txt2} sw={2} />
            </TouchableOpacity>
          </View>

          {/* Email note */}
          {field === 'email' && (
            <View style={editS.emailNote}>
              <Text style={editS.emailNoteTxt}>
                🔒 Changing your email requires your current password. A confirmation will be sent to the new address.
              </Text>
            </View>
          )}

          {/* Main field input */}
          <TextInput
            style={editS.input}
            value={text}
            onChangeText={setText}
            placeholder={meta.placeholder}
            placeholderTextColor={T.txt3}
            autoFocus
            keyboardType={field === 'email' ? 'email-address' : 'default'}
            autoCapitalize={field === 'email' ? 'none' : 'words'}
            textContentType={field === 'email' ? 'emailAddress' : 'name'}
          />

          {/* Password field — only for email change */}
          {field === 'email' && (
            <>
              <Text style={editS.passLabel}>Current Password</Text>
              <View style={editS.passWrap}>
                <TextInput
                  style={[editS.input, { marginBottom:0, flex:1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password…"
                  placeholderTextColor={T.txt3}
                  secureTextEntry={!showPass}
                  textContentType="password"
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPass(p => !p)} style={editS.eyeBtn}>
                  <Text style={editS.eyeTxt}>{showPass ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity onPress={handleSave} disabled={loading} activeOpacity={0.85}>
            <LinearGradient
              colors={['#8B7EF8', '#5C4FD4']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={editS.saveBtn}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <IcoCheck size={18} color="#fff" sw={2.2} />
                    <Text style={editS.saveBtnText}>Save Changes</Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const editS = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  kav: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: '#12122A',
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    padding: 24, paddingBottom: 40,
    borderTopWidth: 1, borderColor: T.borderA,
    gap: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: T.txt3, alignSelf: 'center', marginBottom: 4,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Fraunces_900Black', fontSize: 22, color: T.txt, letterSpacing: -0.5 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: T.card2, alignItems: 'center', justifyContent: 'center',
  },
  input: {
    backgroundColor: T.card2, borderRadius: 16, borderWidth: 1,
    borderColor: T.border, paddingHorizontal: 16, paddingVertical: 14,
    color: T.txt, fontFamily: 'DM_Sans_500Medium', fontSize: 15,
  },
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
  // Email change extras
  emailNote: {
    backgroundColor: 'rgba(123,110,246,0.08)',
    borderRadius: 12, borderWidth:1, borderColor: 'rgba(123,110,246,0.22)',
    padding: 12,
  },
  emailNoteTxt: { fontFamily:'DM_Sans_400Regular', fontSize:12, color:T.accentL, lineHeight:17 },
  passLabel:    { fontFamily:'DM_Sans_600SemiBold', fontSize:11, color:T.txt2, letterSpacing:0.8, textTransform:'uppercase' },
  passWrap:     { flexDirection:'row', alignItems:'center', gap:8 },
  eyeBtn:       { paddingHorizontal:10, paddingVertical:14 },
  eyeTxt:       { fontSize:18 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 18, paddingVertical: 16,
    shadowColor: T.accent, shadowOffset: { width:0, height:6 },
    shadowOpacity: 0.4, shadowRadius: 14, elevation: 10,
  },
  saveBtnText: { fontFamily: 'DM_Sans_700Bold', fontSize: 16, color: '#fff' },
});

// ─────────────────────────────────────────────────────────────────────────────
// MENU ROW
// ─────────────────────────────────────────────────────────────────────────────

function MenuRow({
  icon, label, sublabel, onPress, danger, delay,
}: {
  icon: React.ReactNode; label: string; sublabel?: string;
  onPress: () => void; danger?: boolean; delay: number;
}) {
  const scale = useSharedValue(1);
  const press = () => {
    scale.value = withSequence(
      withSpring(0.97, { damping: 14 }),
      withSpring(1,    { damping: 12 }),
    );
    onPress();
  };
  const s = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(360)} style={s}>
      <TouchableOpacity onPress={press} activeOpacity={0.85} style={menuS.row}>
        <View style={[menuS.iconBox, danger && { backgroundColor: T.redD }]}>
          {icon}
        </View>
        <View style={menuS.textWrap}>
          <Text style={[menuS.label, danger && { color: T.red }]}>{label}</Text>
          {sublabel && <Text style={menuS.sub}>{sublabel}</Text>}
        </View>
        {!danger && <IcoChevron size={16} color={T.txt3} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

const menuS = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: T.card, borderRadius: 18, borderWidth: 1,
    borderColor: T.border, padding: 16,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: T.card2, alignItems: 'center', justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  label:    { fontFamily: 'DM_Sans_600SemiBold', fontSize: 15, color: T.txt },
  sub:      { fontFamily: 'DM_Sans_400Regular',  fontSize: 12, color: T.txt2, marginTop: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SCREEN
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR SYSTEM — 6 preset avatars (emoji + gradient pairs)
// ─────────────────────────────────────────────────────────────────────────────

export const AVATAR_META = [
  { id:1, emoji:'🦁', label:'Lion',    bg:'rgba(245,200,66,0.18)',  border:'rgba(245,200,66,0.60)' },
  { id:2, emoji:'🦊', label:'Fox',     bg:'rgba(255,120,73,0.18)',  border:'rgba(255,120,73,0.60)' },
  { id:3, emoji:'🐼', label:'Panda',   bg:'rgba(255,255,255,0.10)', border:'rgba(255,255,255,0.35)' },
  { id:4, emoji:'🐉', label:'Dragon',  bg:'rgba(62,207,160,0.18)',  border:'rgba(62,207,160,0.60)' },
  { id:5, emoji:'🦋', label:'Butterfly',bg:'rgba(123,110,246,0.18)',border:'rgba(123,110,246,0.60)' },
  { id:6, emoji:'🐺', label:'Wolf',    bg:'rgba(84,174,255,0.18)',  border:'rgba(84,174,255,0.60)' },
] as const;

// ─── Avatar picker modal ──────────────────────────────────────────────────────

function AvatarPickerModal({
  visible, current, onSelect, onClose,
}: {
  visible: boolean; current: number;
  onSelect: (n: number) => void; onClose: () => void;
}) {
  const backdropOp = useSharedValue(0);
  const sheetY     = useSharedValue(400);
  useEffect(() => {
    if (visible) {
      backdropOp.value = withTiming(1, { duration:240 });
      sheetY.value     = withSpring(0, { damping:20, stiffness:280 });
    } else {
      backdropOp.value = withTiming(0, { duration:200 });
      sheetY.value     = withTiming(400, { duration:210 });
    }
  }, [visible]);
  const bdStyle    = useAnimatedStyle(() => ({ opacity: backdropOp.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform:[{ translateY: sheetY.value }] }));
  if (!visible) return null;
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, avS.backdrop, bdStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}/>
      </Animated.View>
      <Animated.View style={[avS.sheet, sheetStyle]}>
        <View style={avS.handle}/>
        <Text style={avS.title}>Choose your avatar</Text>
        <Text style={avS.sub}>Pick who represents you in the app</Text>
        <View style={avS.grid}>
          {AVATAR_META.map(a => (
            <TouchableOpacity
              key={a.id}
              onPress={() => onSelect(a.id)}
              activeOpacity={0.8}
              style={[avS.cell, current===a.id && { borderColor:a.border, backgroundColor:a.bg }]}
            >
              <Text style={avS.cellEmoji}>{a.emoji}</Text>
              <Text style={[avS.cellLabel, current===a.id && { color:'#EEEDF8' }]}>{a.label}</Text>
              {current===a.id && <View style={avS.checkDot}><Text style={{fontSize:10}}>✓</Text></View>}
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

const avS = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.68)', justifyContent:'flex-end' },
  sheet:      { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#12122A', borderTopLeftRadius:28, borderTopRightRadius:28, borderTopWidth:1, borderColor:'rgba(123,110,246,0.28)', padding:24, paddingBottom:40, gap:12 },
  handle:     { width:36, height:4, borderRadius:2, backgroundColor:'#3A3A54', alignSelf:'center', marginBottom:4 },
  title:      { fontFamily:'Fraunces_900Black', fontSize:22, color:'#EEEDF8', letterSpacing:-0.3 },
  sub:        { fontFamily:'DM_Sans_400Regular', fontSize:13, color:'#7E7E9A', marginTop:-4 },
  grid:       { flexDirection:'row', flexWrap:'wrap', gap:12, justifyContent:'space-between' },
  cell: {
    width:'30%', aspectRatio:1, borderRadius:20,
    borderWidth:1.5, borderColor:'rgba(255,255,255,0.08)',
    backgroundColor:'rgba(255,255,255,0.03)',
    alignItems:'center', justifyContent:'center', gap:4, position:'relative',
  },
  cellEmoji:  { fontSize:32 },
  cellLabel:  { fontFamily:'DM_Sans_600SemiBold', fontSize:11, color:'#7E7E9A' },
  checkDot:   { position:'absolute', top:6, right:6, width:18, height:18, borderRadius:9, backgroundColor:'#7B6EF6', alignItems:'center', justifyContent:'center' },
});

// ─── Username picker modal ────────────────────────────────────────────────────

function UsernameModal({
  visible, currentUsername, userId, onSave, onClose,
}: {
  visible: boolean; currentUsername: string; userId: string;
  onSave: (u: string) => void; onClose: () => void;
}) {
  const [val,     setVal]     = useState(currentUsername);
  const [status,  setStatus]  = useState<'idle'|'checking'|'ok'|'taken'|'invalid'>('idle');
  const [errMsg,  setErrMsg]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  const backdropOp = useSharedValue(0);
  const sheetY     = useSharedValue(500);

  useEffect(() => {
    setVal(currentUsername); setStatus('idle'); setErrMsg('');
  }, [visible, currentUsername]);

  useEffect(() => {
    if (visible) {
      backdropOp.value = withTiming(1, { duration:240 });
      sheetY.value     = withSpring(0, { damping:20, stiffness:280 });
    } else {
      backdropOp.value = withTiming(0, { duration:200 });
      sheetY.value     = withTiming(500, { duration:210 });
    }
  }, [visible]);

  const bdStyle    = useAnimatedStyle(() => ({ opacity: backdropOp.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform:[{ translateY: sheetY.value }] }));

  const checkAvailability = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text || text === currentUsername) { setStatus('idle'); return; }
    setStatus('checking');
    debounceRef.current = setTimeout(async () => {
      const { available, error } = await checkUsernameAvailable(text, userId);
      if (error && !available) { setStatus('invalid'); setErrMsg(error); }
      else if (!available)     { setStatus('taken');   setErrMsg('Username already taken'); }
      else                     { setStatus('ok');      setErrMsg(''); }
    }, 500);
  }, [currentUsername, userId]);

  const handleChange = (text: string) => {
    setVal(text.toLowerCase().replace(/[^a-z0-9._]/g,''));
    checkAvailability(text);
  };

  const handleSave = async () => {
    if (status === 'taken' || status === 'invalid') return;
    setSaving(true);
    try {
      await saveUsername(userId, val);
      onSave(val);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const statusColor = status==='ok' ? '#3ECFA0' : status==='taken'||status==='invalid' ? '#F26B6B' : '#7E7E9A';
  const statusIcon  = status==='ok' ? '✓ Available' : status==='checking' ? '…' : status==='taken'||status==='invalid' ? `✗ ${errMsg}` : '';

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, unS.backdrop, bdStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}/>
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={unS.kav}>
        <Animated.View style={[unS.sheet, sheetStyle]}>
          <View style={unS.handle}/>
          <Text style={unS.title}>Your Username</Text>
          <Text style={unS.sub}>Unique handle — visible on leaderboards</Text>

          <View style={unS.inputWrap}>
            <Text style={unS.atSign}>@</Text>
            <TextInput
              style={unS.input}
              value={val}
              onChangeText={handleChange}
              placeholder="yourhandle"
              placeholderTextColor="#3A3A54"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoFocus
            />
          </View>

          {statusIcon !== '' && (
            <Text style={[unS.statusTxt, { color: statusColor }]}>{statusIcon}</Text>
          )}

          <Text style={unS.rules}>Letters, numbers, underscores (_) and periods (.) · 3–24 chars</Text>

          <TouchableOpacity onPress={handleSave} disabled={saving || status==='taken' || status==='invalid'} activeOpacity={0.85}>
            <LinearGradient
              colors={status==='ok'||status==='idle' ? ['#8B7EF8','#5C4FD4'] : ['#2A2A40','#1A1A30']}
              start={{x:0,y:0}} end={{x:1,y:0}}
              style={unS.saveBtn}
            >
              {saving ? <ActivityIndicator color="#fff" size="small"/> : <Text style={unS.saveTxt}>Save Username</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const unS = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.68)', justifyContent:'flex-end' },
  kav:        { position:'absolute', bottom:0, left:0, right:0 },
  sheet:      { backgroundColor:'#12122A', borderTopLeftRadius:28, borderTopRightRadius:28, borderTopWidth:1, borderColor:'rgba(123,110,246,0.28)', padding:24, paddingBottom:40, gap:14 },
  handle:     { width:36, height:4, borderRadius:2, backgroundColor:'#3A3A54', alignSelf:'center', marginBottom:4 },
  title:      { fontFamily:'Fraunces_900Black', fontSize:22, color:'#EEEDF8', letterSpacing:-0.3 },
  sub:        { fontFamily:'DM_Sans_400Regular', fontSize:13, color:'#7E7E9A', marginTop:-6 },
  inputWrap:  { flexDirection:'row', alignItems:'center', backgroundColor:'#181830', borderRadius:14, borderWidth:1.5, borderColor:'rgba(123,110,246,0.22)', paddingHorizontal:14, paddingVertical:2 },
  atSign:     { fontFamily:'DM_Sans_700Bold', fontSize:16, color:'#7B6EF6', marginRight:2 },
  input:      { flex:1, fontFamily:'DM_Sans_500Medium', fontSize:16, color:'#EEEDF8', paddingVertical:13 },
  statusTxt:  { fontFamily:'DM_Sans_600SemiBold', fontSize:12, marginTop:-6 },
  rules:      { fontFamily:'DM_Sans_400Regular', fontSize:11, color:'#3A3A54' },
  saveBtn:    { borderRadius:16, paddingVertical:15, alignItems:'center' },
  saveTxt:    { fontFamily:'DM_Sans_700Bold', fontSize:15, color:'#fff' },
});

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  // ── Auth / user state
  const [userId,   setUserId]   = useState<string | null>(null);
  const [email,    setEmail]    = useState('');
  const [profile,       setProfile]      = useState<UserProfile | null>(null);
  const [loading,       setLoading]      = useState(true);
  const [avatarChoice,  setAvatarChoice]  = useState(1);       // 1–6
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [username,      setUsername]      = useState('');       // @handle
  const [showUsernamePicker, setShowUsernamePicker] = useState(false);

  // ── Edit sheet
  const [editField,  setEditField]  = useState<'name' | 'email' | null>(null);
  const [editValue,  setEditValue]  = useState('');

  // ── Avatar ring pulse
  const avatarRing = useSharedValue(1);
  const logoutShake = useSharedValue(0);

  useEffect(() => {
    avatarRing.value = withRepeat(
      withSequence(
        withSpring(1.04, { damping: 8, stiffness: 120 }),
        withSpring(1,    { damping: 10 }),
      ), -1, true
    );
  }, []);

  // ── Load data
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      setUserId(user.id);
      setEmail(user.email ?? '');

      const p = await fetchProfile(user.id);
      if (p) {
        setProfile(p);
        setAvatarChoice(p.avatar_choice ?? 1);
        setUsername(p.username ?? '');
      }
      setLoading(false);
    })();
  }, []);

  // ── Avatar picker: opens the 6-option grid
  const handleAvatarPress = () => setShowAvatarPicker(true);

  const handleAvatarSelect = async (choice: number) => {
    setAvatarChoice(choice);
    setShowAvatarPicker(false);
    if (userId) {
      await updateProfile(userId, { avatar_choice: choice });
      setProfile(prev => prev ? { ...prev, avatar_choice: choice } : prev);
    }
  };

  // ── Open edit sheet
  const openEdit = (field: 'name' | 'email') => {
    const val = field === 'email' ? email : (profile?.display_name ?? '');
    setEditField(field);
    setEditValue(val);
  };

  // ── Save from sheet — name only needs val, email needs password verification
  const handleSave = async (val: string, password?: string) => {
    if (!userId) return;
    if (editField === 'email') {
      // Verify current password first to protect email change
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Could not verify your session.');
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email:    user.email,
        password: password ?? '',
      });
      if (signInErr) throw new Error('Incorrect password. Please try again.');
      await updateEmail(val);
      setEmail(val);
    } else if (editField === 'name') {
      await updateProfile(userId, { display_name: val });
      setProfile(prev => prev ? { ...prev, display_name: val } : prev);
    }
  };

  // ── Sign out
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          try {
            // Shake animation while signing out
            logoutShake.value = withSequence(
              withTiming(-8,  { duration: 60 }),
              withTiming(8,   { duration: 60 }),
              withTiming(-6,  { duration: 55 }),
              withTiming(6,   { duration: 55 }),
              withTiming(0,   { duration: 50 }),
            );
            await resetUser().catch(() => {});
            await supabase.auth.signOut();
            router.replace('/login');
          } catch (e) {
            // Force navigate even on error
            router.replace('/login');
          }
        },
      },
    ]);
  };

  const avatarRingStyle  = useAnimatedStyle(() => ({ transform: [{ scale: avatarRing.value }] }));
  const logoutShakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: logoutShake.value }] }));

  const levelInfo = getLevelInfo(profile?.total_xp ?? 0);
  const nextLevel = LEVELS.find(l => l.minXp > (profile?.total_xp ?? 0));
  const xpProgress = nextLevel
    ? ((profile?.total_xp ?? 0) - levelInfo.minXp) / (nextLevel.minXp - levelInfo.minXp)
    : 1;

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={T.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Ambient orbs */}
      <View style={styles.orb1} />
      <View style={styles.orb2} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(0).duration(440)} style={styles.header}>
          <Text style={styles.headerSub}>YOUR SPACE</Text>
          <Text style={styles.headerTitle}>Profile</Text>
        </Animated.View>

        {/* ── MASCOT + NAME CARD ──────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(60).duration(460)} style={styles.heroCard}>
          <LinearGradient
            colors={['rgba(123,110,246,0.10)', 'transparent']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Mascot + avatar picker trigger */}
          <View style={styles.mascotHeroWrap}>
            <Mascot
              state={
                (profile?.current_streak ?? 0) === 0 ? 'sad' :
                (profile?.total_xp ?? 0) >= 8550 ? 'reward' :
                'idle'
              }
              size={92}
            />
            {/* Chosen avatar badge — tap to pick */}
            <TouchableOpacity onPress={handleAvatarPress} style={styles.mascotChangeBadge} activeOpacity={0.85}>
              <Text style={{ fontSize:14 }}>{AVATAR_META[avatarChoice - 1]?.emoji ?? '🦁'}</Text>
            </TouchableOpacity>
          </View>

          {/* Name + level badge */}
          <View style={styles.nameWrap}>
            <TouchableOpacity
              onPress={() => openEdit('name')}
              style={styles.nameRow}
              activeOpacity={0.7}
            >
              <Text style={styles.displayName} numberOfLines={1}>
                {profile?.display_name || 'Tap to set name'}
              </Text>
              <IcoPencil size={15} color={T.accentL}/>
            </TouchableOpacity>

            {/* Level badge */}
            <View style={[styles.levelBadge, { backgroundColor: levelInfo.color + '20', borderColor: levelInfo.color + '44' }]}>
              <Text style={{ fontSize:13 }}>{levelInfo.emoji}</Text>
              <Text style={[styles.levelText, { color: levelInfo.color }]}>{levelInfo.label}</Text>
            </View>
          </View>

          {/* Email */}
          <TouchableOpacity onPress={() => openEdit('email')} style={styles.emailRow} activeOpacity={0.7}>
            <IcoMail size={14} color={T.txt2}/>
            <Text style={styles.emailText}>{email}</Text>
            <IcoPencil size={13} color={T.txt3}/>
          </TouchableOpacity>

          {/* Username */}
          <TouchableOpacity
            onPress={() => setShowUsernamePicker(true)}
            style={styles.usernameRow}
            activeOpacity={0.7}
          >
            <Text style={styles.usernameAt}>@</Text>
            <Text style={styles.usernameTxt} numberOfLines={1}>
              {username || 'set a username'}
            </Text>
            <IcoPencil size={13} color={T.txt3}/>
          </TouchableOpacity>

          {/* XP / Level / Streak row — "This is MY companion" */}
          <View style={styles.companionStats}>
            <View style={styles.companionStat}>
              <Text style={[styles.companionStatVal, { color:T.gold }]}>
                {(profile?.total_xp ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.companionStatLabel}>Total XP</Text>
            </View>
            <View style={styles.companionDivider}/>
            <View style={styles.companionStat}>
              <Text style={[styles.companionStatVal, { color:levelInfo.color }]}>
                L{profile?.level ?? 1}
              </Text>
              <Text style={styles.companionStatLabel}>Level</Text>
            </View>
            <View style={styles.companionDivider}/>
            <View style={styles.companionStat}>
              <Text style={[styles.companionStatVal, { color:(profile?.current_streak??0) > 0 ? T.red : T.txt3 }]}>
                {profile?.current_streak ?? 0}d
              </Text>
              <Text style={styles.companionStatLabel}>Streak</Text>
            </View>
          </View>

          {/* XP level bar */}
          <View style={styles.xpWrap}>
            <View style={styles.xpTop}>
              <View style={styles.xpLeft}>
                <IcoStar size={12} color={T.gold}/>
                <Text style={styles.xpLabel}>{profile?.total_xp ?? 0} XP</Text>
              </View>
              {nextLevel && (
                <Text style={styles.xpNext}>{nextLevel.label} at {nextLevel.minXp} XP</Text>
              )}
            </View>
            <View style={styles.xpTrack}>
              <Animated.View
                style={[
                  styles.xpFill,
                  { width:`${xpProgress * 100}%` as any, backgroundColor:levelInfo.color }
                ]}
              />
            </View>
          </View>
        </Animated.View>

        {/* ── STREAK STATS ────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(130).duration(440)} style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Streaks</Text>
        </Animated.View>

        <View style={styles.statsGrid}>
          <StatCard
            icon={<IcoFire size={18} color={T.gold} />}
            value={`${profile?.current_streak ?? 0}d`}
            label="Current Streak"
            color={T.gold}
            delay={150}
          />
          <StatCard
            icon={<IcoTrophy size={18} color={T.accent} />}
            value={`${profile?.longest_streak ?? 0}d`}
            label="Best Streak"
            color={T.accent}
            delay={200}
          />
          <StatCard
            icon={<IcoZap size={18} color={T.green} />}
            value={`${profile?.total_days ?? 0}`}
            label="Total Days"
            color={T.green}
            delay={250}
          />
          <StatCard
            icon={<IcoStar size={18} color={T.rose} />}
            value={`L${profile?.level ?? 1}`}
            label="Current Level"
            color={T.rose}
            delay={300}
          />
        </View>

        {/* ── ACHIEVEMENTS ────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(330).duration(420)} style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <Text style={styles.sectionSub}>
            {ACHIEVEMENTS.filter(a => a.unlocked).length}/{ACHIEVEMENTS.length} unlocked
          </Text>
        </Animated.View>

        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badgesScroll}
        >
          {ACHIEVEMENTS.map((a, i) => (
            <Animated.View
              key={a.id}
              entering={ZoomIn.delay(350 + i * 50).duration(340).springify()}
              style={[
                styles.badge,
                a.unlocked
                  ? { borderColor: a.color + '55', backgroundColor: a.color + '12' }
                  : { borderColor: T.border, opacity: 0.35 }
              ]}
            >
              {a.unlocked && (
                <View style={[styles.badgeGlow, { backgroundColor: a.color }]} />
              )}
              <Text style={styles.badgeEmoji}>{a.emoji}</Text>
              <Text style={[styles.badgeLabel, { color: a.unlocked ? a.color : T.txt3 }]}>
                {a.label}
              </Text>
            </Animated.View>
          ))}
        </ScrollView>

        {/* ── SETTINGS ────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(450).duration(400)} style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Settings</Text>
        </Animated.View>

        <View style={styles.menuList}>
          <MenuRow
            icon={<IcoBell size={18} color={T.gold} />}
            label="Notifications"
            sublabel="Reminders, daily digest"
            onPress={() => {}}
            delay={470}
          />
          <MenuRow
            icon={<IcoPalette size={18} color={T.teal} />}
            label="Appearance"
            sublabel="Theme, font size"
            onPress={() => {}}
            delay={510}
          />
          <MenuRow
            icon={<IcoShield size={18} color={T.blue} />}
            label="Privacy & Security"
            sublabel="Data, permissions"
            onPress={() => {}}
            delay={550}
          />
          <MenuRow
            icon={<IcoInfo size={18} color={T.txt2} />}
            label="About"
            sublabel="Version 1.0.0"
            onPress={() => {}}
            delay={590}
          />
        </View>

        {/* ── SIGN OUT ────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(630).duration(400)} style={logoutShakeStyle}>
          <TouchableOpacity
            onPress={handleSignOut}
            activeOpacity={0.85}
            style={styles.signOutBtn}
          >
            <IcoLogout size={18} color={T.red} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* ── EDIT SHEET ──────────────────────────────────────── */}
      <EditSheet
        visible={editField !== null}
        field={editField}
        value={editValue}
        onClose={() => setEditField(null)}
        onSave={handleSave}
      />

      {/* ── AVATAR PICKER ───────────────────────────────────── */}
      <AvatarPickerModal
        visible={showAvatarPicker}
        current={avatarChoice}
        onSelect={handleAvatarSelect}
        onClose={() => setShowAvatarPicker(false)}
      />

      {/* ── USERNAME MODAL ──────────────────────────────────── */}
      <UsernameModal
        visible={showUsernamePicker}
        currentUsername={username}
        userId={userId ?? ''}
        onSave={(u) => setUsername(u)}
        onClose={() => setShowUsernamePicker(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  orb1: {
    position: 'absolute', top: -60, right: -60,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(123,110,246,0.07)',
  },
  orb2: {
    position: 'absolute', top: 420, left: -80,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(245,200,66,0.04)',
  },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20 },

  // ── Header
  header:      { paddingTop: 16, paddingBottom: 4, marginBottom: 16 },
  headerSub:   { fontFamily: 'DM_Sans_500Medium', fontSize: 10, color: T.txt2, letterSpacing: 1.5, marginBottom: 3 },
  headerTitle: { fontFamily: 'Fraunces_900Black', fontSize: 30, color: T.txt, letterSpacing: -1, lineHeight: 34 },

  // ── Hero card
  heroCard: {
    backgroundColor: T.card,
    borderRadius: 26, borderWidth: 1,
    borderColor: T.borderA,
    padding: 22, marginBottom: 16,
    alignItems: 'center', gap: 14,
    overflow: 'hidden',
  },
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    padding: 3, alignItems: 'center', justifyContent: 'center',
  },
  avatarInner: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: T.card2,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 90, height: 90, borderRadius: 45 },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: -2,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: T.card,
    shadowColor: T.accent, shadowOffset: { width:0, height:4 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },

  // Mascot hero — replaces avatar in profile
  mascotHeroWrap: {
    position: 'relative',
    marginBottom: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  mascotChangeBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.card,
    shadowColor: T.accent, shadowOffset: { width:0, height:3 },
    shadowOpacity: 0.45, shadowRadius: 6, elevation: 6,
  },

  // XP / Level / Streak companion stats row
  companionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  companionStat:     { flex:1, alignItems:'center', gap:4 },
  companionStatVal:  { fontFamily:'Fraunces_900Black', fontSize:22, letterSpacing:-0.5 },
  companionStatLabel:{ fontFamily:'DM_Sans_500Medium', fontSize:10, color:T.txt2, textTransform:'uppercase', letterSpacing:0.8 },
  companionDivider:  { width:1, height:32, backgroundColor:T.border },

  nameWrap: { alignItems: 'center', gap: 8 },
  nameRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayName: {
    fontFamily: 'Fraunces_900Black',
    fontSize: 24, color: T.txt, letterSpacing: -0.5,
    maxWidth: W - 100,
  },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  levelText: { fontFamily: 'DM_Sans_700Bold', fontSize: 12 },

  emailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.card2, borderRadius: 14,
    borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: 'stretch',
  },
  emailText: { flex: 1, fontFamily: 'DM_Sans_400Regular', fontSize: 13, color: T.txt2 },

  // Username row (replaced goal row)
  usernameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: T.accentD,
    borderRadius: 14, borderWidth: 1,
    borderColor: T.borderA,
    paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: 'stretch',
  },
  usernameAt:  { fontFamily:'DM_Sans_700Bold', fontSize:14, color:T.accent },
  usernameTxt: { flex:1, fontFamily:'DM_Sans_500Medium', fontSize:13, color:T.accentL },

  xpWrap: { alignSelf: 'stretch', gap: 7 },
  xpTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  xpLabel: { fontFamily: 'DM_Sans_700Bold', fontSize: 12, color: T.gold },
  xpNext:  { fontFamily: 'DM_Sans_400Regular', fontSize: 10, color: T.txt3 },
  xpTrack: {
    height: 5, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3, overflow: 'hidden',
  },
  xpFill: { height: 5, borderRadius: 3 },

  // ── Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14,
  },
  sectionTitle: { fontFamily: 'DM_Sans_700Bold', fontSize: 16, color: T.txt },
  sectionSub:   { fontFamily: 'DM_Sans_400Regular', fontSize: 12, color: T.txt2 },

  // ── Stats grid
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10, marginBottom: 4,
  },

  // ── Achievements
  badgesScroll: { paddingRight: 20, gap: 10, paddingBottom: 8 },
  badge: {
    width: 84, alignItems: 'center',
    backgroundColor: T.card, borderRadius: 20,
    borderWidth: 1, padding: 14, gap: 8,
    overflow: 'hidden', position: 'relative',
  },
  badgeGlow: {
    position: 'absolute', top: -10, right: -10,
    width: 50, height: 50, borderRadius: 25, opacity: 0.15,
  },
  badgeEmoji: { fontSize: 28 },
  badgeLabel: {
    fontFamily: 'DM_Sans_600SemiBold', fontSize: 10,
    textAlign: 'center', letterSpacing: 0.2,
  },

  // ── Bio card
  bioCard: {
    backgroundColor: T.card, borderRadius: 20,
    borderWidth: 1, borderColor: T.border,
    padding: 18, marginBottom: 4, gap: 8,
  },
  bioTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bioTitle:{ fontFamily: 'DM_Sans_700Bold', fontSize: 14, color: T.txt },
  bioText: { fontFamily: 'DM_Sans_400Regular', fontSize: 13, color: T.txt2, lineHeight: 20 },

  // ── Menu
  menuList: { gap: 8, marginBottom: 8 },

  // ── Sign out
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16,
    backgroundColor: T.redD, borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(242,107,107,0.25)',
    marginTop: 8, marginBottom: 4,
  },
  signOutText: { fontFamily: 'DM_Sans_700Bold', fontSize: 15, color: T.red },
});
