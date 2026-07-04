// ─────────────────────────────────────────────────────────────────────────────
// app/(tabs)/_layout.tsx  —  Owl Reflection Engine
// Custom bottom tab bar with:
//   • Lucide-style SVG icons (react-native-svg)
//   • Spring scale-up + glow on active tab
//   • Sliding animated pill indicator
//   • Purple gradient FAB (Focus)
//   • Blur background + safe-area aware
// ─────────────────────────────────────────────────────────────────────────────

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Dimensions, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { supabase } from '@/lib/supabase';

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:       '#07070F',
  card:     '#111122',
  accent:   '#7B6EF6',
  accentD:  'rgba(123,110,246,0.18)',
  accentG:  'rgba(123,110,246,0.30)',
  gold:     '#F5C842',
  txt:      '#EEEDF8',
  txt2:     '#7E7E9A',
  txt3:     '#2E2E48',
  border:   'rgba(255,255,255,0.055)',
};

const { width: W } = Dimensions.get('window');
const BAR_H    = 68;
const PILL_W   = 58;
const SLOT_W   = W / 5;

// ─── SVG Icon Library ─────────────────────────────────────────────────────────

interface IconProps { size?: number; color?: string; strokeWidth?: number }

const HomeIcon = ({ size = 24, color = '#fff', strokeWidth = 1.8 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 9.5L12 3L21 9.5V20C21 20.55 20.55 21 20 21H15V15H9V21H4C3.45 21 3 20.55 3 20V9.5Z"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    />
  </Svg>
);

const TasksIcon = ({ size = 24, color = '#fff', strokeWidth = 1.8 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="18" height="18" rx="3" stroke={color} strokeWidth={strokeWidth}/>
    <Path d="M9 12L11 14L15 10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M9 7H15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.5"/>
    <Path d="M9 17H13" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.5"/>
  </Svg>
);

const FocusPlayIcon = ({ size = 26, color = '#fff' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" fill="none"/>
    <Path d="M9.5 7.5L17 12L9.5 16.5V7.5Z" fill={color}/>
  </Svg>
);

const StatsIcon = ({ size = 24, color = '#fff', strokeWidth = 1.8 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="13" width="4" height="8" rx="1.5" stroke={color} strokeWidth={strokeWidth}/>
    <Rect x="10" y="9" width="4" height="12" rx="1.5" stroke={color} strokeWidth={strokeWidth}/>
    <Rect x="17" y="5" width="4" height="16" rx="1.5" stroke={color} strokeWidth={strokeWidth}/>
  </Svg>
);

const ProfileIcon = ({ size = 24, color = '#fff' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Octagon shape */}
    <Path
      d="M8 2H16L22 8V16L16 22H8L2 16V8L8 2Z"
      stroke={color}
      strokeWidth={1.8}
      strokeLinejoin="round"
    />

    {/* User inside */}
    <Circle cx="12" cy="10" r="3" stroke={color} strokeWidth={1.8} />
    <Path
      d="M7 18C7 15.79 9.24 14 12 14C14.76 14 17 15.79 17 18"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </Svg>
);

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'home' | 'tasks' | 'focus' | 'stats' | 'profile';

interface TabDef {
  id:     TabId;
  label:  string;
  isFab:  boolean;
  Icon:   (props: IconProps) =>  React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'home',    label: 'Home',    isFab: false, Icon: HomeIcon    },
  { id: 'tasks',   label: 'Tasks',   isFab: false, Icon: TasksIcon   },
  { id: 'focus',   label: '',        isFab: true,  Icon: FocusPlayIcon },
  { id: 'stats',   label: 'Stats',   isFab: false, Icon: StatsIcon   },
  { id: 'profile', label: 'Profile', isFab: false, Icon: ProfileIcon },
];

// ─── Single animated tab button ───────────────────────────────────────────────

interface TabButtonProps {
  tab:      TabDef;
  active:   boolean;
  onPress:  () => void;
}

function TabButton({ tab, active, onPress }: TabButtonProps) {
  const scale     = useSharedValue(active ? 1.22 : 1);
  const glowOp    = useSharedValue(active ? 1 : 0);
  const labelOp   = useSharedValue(active ? 1 : 0);
  const translateY = useSharedValue(active ? -2 : 0);

  useEffect(() => {
    scale.value     = withSpring(active ? 1.22 : 1,  { damping: 14, stiffness: 280 });
    glowOp.value    = withTiming(active ? 1 : 0,     { duration: 220 });
    labelOp.value   = withTiming(active ? 1 : 0,     { duration: 180 });
    translateY.value = withSpring(active ? -2 : 0,   { damping: 16, stiffness: 260 });
  }, [active]);

  const iconWrapStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOp.value,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOp.value,
  }));

  const handlePress = () => {
    // Quick bounce on press
    scale.value = withSequence(
      withSpring(0.85, { damping: 12, stiffness: 500 }),
      withSpring(active ? 1.22 : 1.25, { damping: 10, stiffness: 300 }),
      withSpring(active ? 1.22 : 1,    { damping: 14, stiffness: 280 }),
    );
    onPress();
  };

  if (tab.isFab) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        style={styles.fabSlot}
        accessibilityRole="button"
        accessibilityLabel="Start Focus"
      >
        <Animated.View style={iconWrapStyle}>
          {/* Glow ring */}
          <Animated.View style={[styles.fabGlow, glowStyle]} />
          <LinearGradient
            colors={['#9B8EF8', '#5C4FD4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <tab.Icon size={22} color="#fff" />
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  const iconColor = active ? T.accent : T.txt3;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={1}
      style={styles.tabSlot}
      accessibilityRole="button"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
    >
      {/* Pill background glow */}
      <Animated.View style={[styles.tabPillBg, glowStyle]} />

      <Animated.View style={[styles.tabIconWrap, iconWrapStyle]}>
        <tab.Icon size={22} color={iconColor} strokeWidth={active ? 2.2 : 1.7} />
      </Animated.View>

      <Animated.Text style={[styles.tabLabel, { color: iconColor }, labelStyle]}>
        {tab.label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

// ─── Custom tab bar ───────────────────────────────────────────────────────────

function OwlTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.barOuter, { paddingBottom: insets.bottom + 4 }]}>
      {/* Blur bg */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 55 : 0}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      {/* Fallback bg for Android */}
      <View style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: Platform.OS === 'android'
            ? 'rgba(7,7,15,0.97)'
            : 'rgba(7,7,15,0.60)',
          borderTopWidth: 1,
          borderTopColor: T.border,
        }
      ]} />

      {/* Tab buttons */}
      <View style={styles.tabRow}>
        {TABS.map((tab) => {
          const routeIdx = state.routes.findIndex((r: any) => r.name === tab.id);
          const isActive  = routeIdx === state.index;

          return (
            <TabButton
              key={tab.id}
              tab={tab}
              active={isActive}
              onPress={() => {
                if (routeIdx === -1) return;
                const event = navigation.emit({
                  type: 'tabPress',
                  target: state.routes[routeIdx]?.key,
                  canPreventDefault: true,
                });
                if (!isActive && !event.defaultPrevented) {
                  navigation.navigate(state.routes[routeIdx].name);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── Layout export ────────────────────────────────────────────────────────────

export default function TabsLayout() {
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && !session) {
        router.replace('/login');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (mounted && !session) {
        router.replace('/login');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <Tabs
      tabBar={(props) => <OwlTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home"    options={{ title: 'Home'    }} />
      <Tabs.Screen name="tasks"   options={{ title: 'Tasks'   }} />
      <Tabs.Screen name="focus"   options={{ title: 'Focus'   }} />
      <Tabs.Screen name="stats"   options={{ title: 'Stats'   }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  barOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  tabRow: {
    flexDirection: 'row',
    height: BAR_H,
    alignItems: 'center',
  },

  // Normal tab slot
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_H,
    position: 'relative',
  },
  tabIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 9,
    fontFamily: 'DM_Sans_600SemiBold',
    letterSpacing: 0.2,
    marginTop: 3,
  },
  tabPillBg: {
    position: 'absolute',
    top: 8,
    width: PILL_W,
    height: 42,
    borderRadius: 14,
    backgroundColor: T.accentD,
    borderWidth: 1,
    borderColor: 'rgba(123,110,246,0.20)',
  },

  // FAB
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_H,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 14,
  },
  fabGlow: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(123,110,246,0.20)',
    top: -8,
    left: -8,
  },
});
