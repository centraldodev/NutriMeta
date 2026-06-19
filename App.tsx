import React, { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { AddMealScreen } from './src/screens/AddMealScreen';
import { AnalysisScreen } from './src/screens/AnalysisScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { RankingScreen } from './src/screens/RankingScreen';
import { Colors, Radius, Spacing, Typography } from './src/constants/theme';
import { isFirebaseConfigured } from './src/config';
import { useStore } from './src/store';
import { getUserProfile, mapFirebaseUser, onAuthChange } from './src/services/authService';
import { subscribeDailyLog } from './src/services/nutritionService';
import { clearSession, loadSession, saveSession } from './src/services/sessionStorage';
import { calcMacroGoals, formatDate } from './src/utils/nutrition';

type MainTab = 'home' | 'addMeal' | 'analysis' | 'ranking';

function MainTabs() {
  const [tab, setTab] = useState<MainTab>('home');

  const tabs = useMemo(
    () => [
      { key: 'home' as const, label: 'Hoje', icon: 'today' as const },
      { key: 'addMeal' as const, label: 'Refeições', icon: 'add-circle-outline' as const },
      { key: 'analysis' as const, label: 'Análise', icon: 'insights' as const },
      { key: 'ranking' as const, label: 'Ranking', icon: 'leaderboard' as const },
    ],
    []
  );

  return (
    <View style={styles.appShell}>
      <View style={styles.content}>
        {tab === 'home' && <HomeScreen />}
        {tab === 'addMeal' && <AddMealScreen />}
        {tab === 'analysis' && <AnalysisScreen />}
        {tab === 'ranking' && <RankingScreen />}
      </View>

      <View style={styles.tabBar}>
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
  const setUser = useStore((state) => state.setUser);
  const setProfile = useStore((state) => state.setProfile);
  const setGoals = useStore((state) => state.setGoals);
  const setTodayLog = useStore((state) => state.setTodayLog);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    loadSession()
      .then((session) => {
        if (!mounted || !session?.user) return;
        setUser(session.user);
        if (session.profile) setProfile(session.profile);
        if (session.goals) setGoals(session.goals);
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
      });

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
    if (!authReady) return;
    if (!user) {
      clearSession().catch(() => undefined);
      return;
    }
    saveSession({ user, profile, goals }).catch(() => undefined);
  }, [authReady, goals, profile, user]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) return undefined;
    return subscribeDailyLog(user.id, formatDate(new Date()), setTodayLog);
  }, [setTodayLog, user]);

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
    bottom: Spacing.base,
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
});
