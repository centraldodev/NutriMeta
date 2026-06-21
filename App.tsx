import React, { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { AddMealScreen } from './src/screens/AddMealScreen';
import { AnalysisScreen } from './src/screens/AnalysisScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { NutritionistScreen } from './src/screens/NutritionistScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { RankingScreen } from './src/screens/RankingScreen';
import { Colors, Radius, Spacing, Typography, Shadows } from './src/constants/theme';
import { isFirebaseConfigured } from './src/config';
import { useStore } from './src/store';
import { getUserAccount, getUserProfile, onAuthChange } from './src/services/authService';
import { getSavedMeals, subscribeDailyLog } from './src/services/nutritionService';
import { getCachedDailyLog, saveCachedDailyLog } from './src/services/dailyLogStorage';
import { subscribeGroupNotifications } from './src/services/groupService';
import { calcMacroGoals, formatDate, generateId } from './src/utils/nutrition';

type MainTab = 'home' | 'addMeal' | 'analysis' | 'ranking';
const MAIN_TAB_BAR_HEIGHT = 70;
const WEB_FIXED_TAB_BAR_STYLE = Platform.OS === 'web'
  ? ({ position: 'fixed', left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto' } as any)
  : null;
const WEB_FIXED_WATER_FAB_STYLE = Platform.OS === 'web'
  ? ({ position: 'fixed' } as any)
  : null;

function MainTabs() {
  const [tab, setTab] = useState<MainTab>('home');
  const [waterOpen, setWaterOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const tabBarBottom = Platform.OS === 'web' ? 0 : insets.bottom;
  const waterFabBottom = tabBarBottom + MAIN_TAB_BAR_HEIGHT + Spacing.sm;
  const screenFabBottom = Platform.OS === 'web' ? waterFabBottom : Spacing.base;

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
  const addEntry = useStore((state) => state.addEntry);

  async function handleAddWater(amountMl: number) {
    if (!user || !goals) return;
    const payload = {
      foodName: `Água (${amountMl} ml)`,
      emoji: '💧',
      quantity: amountMl,
      unit: 'mililitro' as const,
      nutrition: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
      waterMl: amountMl,
      mealPeriod: 'hydration' as const,
      source: 'manual' as const,
    };

    if (isFirebaseConfigured && user.id !== 'dev_user') {
      try {
        const { addMealEntry } = await import('./src/services/nutritionService');
        const entry = await addMealEntry(user.id, goals, payload);
        addEntry(entry);
      } catch (error) {
        console.warn('Failed to save water to Firebase', error);
        addEntry({ ...payload, id: generateId(), userId: user.id, addedAt: new Date() });
      }
      return;
    }

    addEntry({ ...payload, id: generateId(), userId: user.id, addedAt: new Date() });
  }

  return (
    <View style={styles.appShell}>
      <View style={[styles.content, { paddingBottom: tabBarBottom + MAIN_TAB_BAR_HEIGHT + Spacing.sm }]}>
        {tab === 'home' && <HomeScreen waterOpen={waterOpen} onWaterClose={() => setWaterOpen(false)} onAddWater={handleAddWater} />}
        {tab === 'addMeal' && <AddMealScreen onMealAdded={() => setTab('analysis')} fabBottomOffset={screenFabBottom} />}
        {tab === 'analysis' && <AnalysisScreen />}
        {tab === 'ranking' && <RankingScreen fabBottomOffset={screenFabBottom} />}
      </View>

      {tab === 'home' && (
        <TouchableOpacity
          style={[styles.waterFab, WEB_FIXED_WATER_FAB_STYLE, { bottom: waterFabBottom }]}
          onPress={() => setWaterOpen(true)}
        >
          <MaterialIcons name="local-drink" size={28} color={Colors.white} />
        </TouchableOpacity>
      )}

      <View style={[styles.tabBar, WEB_FIXED_TAB_BAR_STYLE, { bottom: tabBarBottom }]}>
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.tabButton, active && styles.tabButtonActive]}
              onPress={() => {
                if (item.key !== 'home') setWaterOpen(false);
                setTab(item.key);
              }}
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
  const todayLog = useStore((state) => state.todayLog);
  const setUser = useStore((state) => state.setUser);
  const setProfile = useStore((state) => state.setProfile);
  const setGoals = useStore((state) => state.setGoals);
  const setSavedMeals = useStore((state) => state.setSavedMeals);
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

      const mappedUser = await getUserAccount(firebaseUser);
      setUser(mappedUser);

      if (mappedUser.role === 'nutritionist') {
        setProfile(null);
        setAuthReady(true);
        return;
      }

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
    if (!user) return undefined;
    const today = formatDate(new Date());
    let active = true;

    getCachedDailyLog(user.id, today)
      .then((cachedLog) => {
        if (active && cachedLog) setTodayLog(cachedLog);
      })
      .catch((error) => {
        console.warn('Failed to load cached daily log', error);
      });

    if (user.id === 'dev_user' || !isFirebaseConfigured) {
      return () => {
        active = false;
      };
    }

    const unsubscribe = subscribeDailyLog(user.id, today, (log) => {
      if (!active) return;
      if (log) {
        setTodayLog(log);
        saveCachedDailyLog(log).catch((error) => {
          console.warn('Failed to cache Firebase daily log', error);
        });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setTodayLog, user]);

  useEffect(() => {
    if (!user || user.role === 'nutritionist') {
      setSavedMeals([]);
      return;
    }

    if (user.id === 'dev_user' || !isFirebaseConfigured) {
      setSavedMeals([]);
      return;
    }

    let active = true;
    getSavedMeals(user.id)
      .then((meals) => {
        if (active) setSavedMeals(meals);
      })
      .catch((error) => {
        console.warn('Failed to load saved meals from Firebase', error);
      });

    return () => {
      active = false;
    };
  }, [setSavedMeals, user]);

  useEffect(() => {
    if (!todayLog) return;
    saveCachedDailyLog(todayLog).catch((error) => {
      console.warn('Failed to cache current daily log', error);
    });
  }, [todayLog]);

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

  if (user?.role === 'nutritionist') {
    screen = <NutritionistScreen />;
  } else if (user && !profile) {
    screen = <OnboardingScreen onComplete={() => undefined} />;
  }

  if (user && profile && user.role !== 'nutritionist') {
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
