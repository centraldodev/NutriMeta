import React, { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { AddMealScreen } from './src/screens/AddMealScreen';
import { AnalysisScreen } from './src/screens/AnalysisScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { RankingScreen } from './src/screens/RankingScreen';
import { Colors, Radius, Spacing, Typography, Shadows } from './src/constants/theme';
import { isFirebaseConfigured } from './src/config';
import { useStore } from './src/store';
import { getUserProfile, mapFirebaseUser, onAuthChange } from './src/services/authService';
import { subscribeDailyLog } from './src/services/nutritionService';
import { subscribeGroupNotifications } from './src/services/groupService';
import { calcMacroGoals, formatDate } from './src/utils/nutrition';

type MainTab = 'home' | 'addMeal' | 'analysis' | 'ranking';
const MAIN_TAB_BAR_HEIGHT = 70;
const WEB_FIXED_TAB_BAR_STYLE = Platform.OS === 'web'
  ? ({ position: 'fixed', left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto' } as any)
  : null;

function MainTabs() {
  const [tab, setTab] = useState<MainTab>('home');
  const [waterOpen, setWaterOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const tabBarBottom = Platform.OS === 'web' ? Spacing.base : insets.bottom + Spacing.sm;

  const tabs = useMemo(
    () => [
      { key: 'home' as const, label: 'Hoje', icon: 'today' as const },
      { key: 'addMeal' as const, label: 'Refeições', icon: 'add-circle-outline' as const },
      { key: 'analysis' as const, label: 'Análise', icon: 'insights' as const },
      { key: 'ranking' as const, label: 'Comunidade', icon: 'groups' as const },
    ],
    []
  );

  const user = useStore((state) => state.user);
  const goals = useStore((state) => state.goals);
  const addWater = useStore((state) => state.addWater);

  async function handleAddWater(amountMl: number) {
    if (!user || !goals) return;
    addWater(amountMl);
    if (isFirebaseConfigured && user.id !== 'dev_user') {
      try {
        const { addWaterIntake } = await import('./src/services/nutritionService');
        await addWaterIntake(user.id, goals, amountMl);
      } catch (error) {
        console.warn('Failed to save water to Firebase', error);
      }
    }
  }

  return (
    <View style={styles.appShell}>
      <View style={[styles.content, { paddingBottom: tabBarBottom + MAIN_TAB_BAR_HEIGHT + Spacing.sm }]}>
        {tab === 'home' && <HomeScreen waterOpen={waterOpen} onWaterClose={() => setWaterOpen(false)} onAddWater={handleAddWater} />}
        {tab === 'addMeal' && <AddMealScreen />}
        {tab === 'analysis' && <AnalysisScreen />}
        {tab === 'ranking' && <RankingScreen />}
      </View>

      <TouchableOpacity 
        style={[styles.waterFab, { bottom: MAIN_TAB_BAR_HEIGHT + Spacing.md }]} 
        onPress={() => setWaterOpen(true)}
      >
        <MaterialIcons name="local-drink" size={28} color={Colors.white} />
      </TouchableOpacity>

      <View style={[styles.tabBar, WEB_FIXED_TAB_BAR_STYLE, { bottom: tabBarBottom }]}>
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.tabButton, active && styles.tabButtonActive]}
              onPress={() => setTab(item.key)}
            >
              <MaterialIcons
                name={item.icon}
                size={22}
                color={active ? Colors.green600 : Colors.gray400}
              />
              <Text style={[styles.tabLabel, active && styles.tabTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  const user = useStore((state) => state.user);
  const profile = useStore((state) => state.profile);
  const goals = useStore((state) => state.goals);
  const groups = useStore((state) => state.groups);
  const setUser = useStore((state) => state.setUser);
  const setProfile = useStore((state) => state.setProfile);
  const setGoals = useStore((state) => state.setGoals);
  const setTodayLog = useStore((state) => state.setTodayLog);
  const setNotifications = useStore((state) => state.setNotifications);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (!mounted) return;

      if (!firebaseUser) {
        setAuthReady(true);
        return;
      }

      const mappedUser = mapFirebaseUser(firebaseUser);
      setUser(mappedUser);

      const loadedProfile = await getUserProfile(mappedUser.id);
      if (!mounted) return;
      if (loadedProfile) {
        setProfile(loadedProfile);
        setGoals(calcMacroGoals(loadedProfile));
      }
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [setGoals, setProfile, setUser]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) return undefined;
    return subscribeDailyLog(user.id, formatDate(new Date()), setTodayLog);
  }, [setTodayLog, user]);

  useEffect(() => {
    const group = groups[0];
    if (!user || !group || user.id === 'dev_user' || !isFirebaseConfigured) return undefined;
    return subscribeGroupNotifications(group.id, setNotifications);
  }, [groups, setNotifications, user]);

  if (!authReady) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingScreen}>
          <ActivityIndicator color={Colors.green400} />
          <Text style={styles.loadingText}>Entrando...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  let screen = <LoginScreen onSuccess={() => undefined} />;

  if (user && !profile) {
    screen = <OnboardingScreen onComplete={() => undefined} />;
  }

  if (user && profile) {
    screen = <MainTabs />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {screen}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg,
    gap: Spacing.sm,
  },
  loadingText: {
    color: Colors.gray600,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  appShell: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 1040 : undefined,
    alignSelf: 'center',
  },
  tabBar: {
    position: 'absolute',
    ...(Platform.OS === 'web'
      ? { width: '100%', maxWidth: 760, alignSelf: 'center' }
      : { left: Spacing.base, right: Spacing.base }),
    minHeight: MAIN_TAB_BAR_HEIGHT,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.xl,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
  },
  tabButtonActive: {
    backgroundColor: Colors.green50,
  },
  tabLabel: {
    marginTop: 2,
    fontSize: Typography.xs,
    color: Colors.gray400,
    fontWeight: Typography.semibold,
  },
  tabTextActive: {
    color: Colors.green600,
  },
  waterFab: {
    position: 'absolute',
    right: Spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.info,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }
      : Shadows.md),
  },
});
