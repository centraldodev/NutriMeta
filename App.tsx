import React, { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Alert, Platform, Text, TouchableOpacity, View, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { AddMealScreen } from './src/screens/AddMealScreen';
import { AnalysisScreen } from './src/screens/AnalysisScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { NutritionistScreen } from './src/screens/NutritionistScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { RankingScreen } from './src/screens/RankingScreen';
import { ConfirmDialog } from './src/components/ConfirmDialog';
import { NutritionistChatModal } from './src/components/NutritionistChatModal';
import { Colors, Radius, Spacing, Typography, Shadows } from './src/constants/theme';
import { isFirebaseConfigured } from './src/config';
import { selectNotifications, selectUnreadCount, useStore } from './src/store';
import { getUserAccount, getUserProfile, onAuthChange, signOut, subscribeUserProfile } from './src/services/authService';
import { getSavedMeals, subscribeDailyLog } from './src/services/nutritionService';
import { getCachedDailyLog, removeCachedDailyLog, saveCachedDailyLog } from './src/services/dailyLogStorage';
import { markNotificationsRead, subscribeGroupNotifications, subscribePatientNotifications } from './src/services/groupService';
import { respondNutritionistInvite, subscribePatientAcceptedNutritionistLinks, subscribePatientNutritionistInvites } from './src/services/nutritionistLinkService';
import { subscribeUnreadChatCountByLink } from './src/services/nutritionistChatService';
import { getPendingMealEntryCount, saveMealEntryOrQueue, syncPendingMealEntries } from './src/services/pendingSyncService';
import { SettingsModal } from './src/screens/Home/components/SettingsModal';
import { NotificationsModal } from './src/screens/Home/components/NotificationsModal';
import { ChatsModal } from './src/screens/Home/components/ChatsModal';
import { calcMacroGoals, formatDate, generateId } from './src/utils/nutrition';
import { NutritionistPatientLink } from './src/types';

type MainTab = 'home' | 'addMeal' | 'analysis' | 'ranking';
const MAIN_TAB_BAR_HEIGHT = 70;
const WEB_FIXED_TAB_BAR_STYLE = Platform.OS === 'web'
  ? ({ position: 'fixed', left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto' } as any)
  : null;
function MainTabs() {
  const [tab, setTab] = useState<MainTab>('home');
  const [visitedTabs, setVisitedTabs] = useState<Record<MainTab, boolean>>({
    home: true,
    addMeal: false,
    analysis: false,
    ranking: false,
  });
  const [waterOpen, setWaterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [nutritionistInvites, setNutritionistInvites] = useState<NutritionistPatientLink[]>([]);
  const [chatLinks, setChatLinks] = useState<NutritionistPatientLink[]>([]);
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  const [chatLink, setChatLink] = useState<NutritionistPatientLink | null>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 980;
  const tabBarBottom = Platform.OS === 'web' ? 0 : insets.bottom;
  const screenFabBottom = isDesktopWeb
    ? Spacing.base
    : Platform.OS === 'web'
      ? tabBarBottom + MAIN_TAB_BAR_HEIGHT + Spacing.sm
      : Spacing.base;

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
  const profile = useStore((state) => state.profile);
  const goals = useStore((state) => state.goals);
  const addEntry = useStore((state) => state.addEntry);
  const clearAuth = useStore((state) => state.clearAuth);
  const notifications = useStore(selectNotifications);
  const unreadCount = useStore(selectUnreadCount);
  const setNotifications = useStore((state) => state.setNotifications);
  const markRead = useStore((state) => state.markRead);
  const unreadChatTotal = Object.values(unreadChatCounts).reduce((sum, count) => sum + count, 0);
  const sidebarBadgeCount = unreadCount + nutritionistInvites.length + unreadChatTotal;

  function openTab(nextTab: MainTab) {
    if (nextTab !== 'addMeal') setWaterOpen(false);
    setVisitedTabs((items) => ({ ...items, [nextTab]: true }));
    setTab(nextTab);
  }

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
      const { entry, queued, error } = await saveMealEntryOrQueue({ userId: user.id, goals, payload });
      if (queued) console.warn('Water saved locally and queued for sync', error);
      addEntry(entry);
      return;
    }

    addEntry({ ...payload, id: generateId(), userId: user.id, addedAt: new Date() });
  }

  useEffect(() => {
    if (!isDesktopWeb || !user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setNutritionistInvites([]);
      return undefined;
    }
    return subscribePatientNutritionistInvites(user.id, setNutritionistInvites);
  }, [isDesktopWeb, user]);

  useEffect(() => {
    if (!isDesktopWeb || !user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setChatLinks([]);
      return undefined;
    }
    return subscribePatientAcceptedNutritionistLinks(user.id, setChatLinks);
  }, [isDesktopWeb, user]);

  useEffect(() => {
    if (!isDesktopWeb || !user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setUnreadChatCounts({});
      return undefined;
    }
    return subscribeUnreadChatCountByLink(user.id, setUnreadChatCounts);
  }, [isDesktopWeb, user]);

  useEffect(() => {
    if (!isDesktopWeb || !user || user.id === 'dev_user' || !isFirebaseConfigured) {
      return undefined;
    }
    return subscribePatientNotifications(user.id, setNotifications);
  }, [isDesktopWeb, setNotifications, user]);

  async function handleRespondNutritionistInvite(linkId: string, status: 'accepted' | 'rejected') {
    try {
      await respondNutritionistInvite(linkId, status);
      setNutritionistInvites((items) => items.filter((item) => item.id !== linkId));
      Alert.alert(status === 'accepted' ? 'Acesso aceito' : 'Solicitação recusada',
        status === 'accepted'
          ? 'Seu nutricionista agora pode acompanhar seus registros.'
          : 'O nutricionista não terá acesso aos seus registros.');
    } catch (error) {
      console.warn('Failed to respond nutritionist invite', error);
      Alert.alert('Erro', 'Não foi possível responder essa solicitação agora.');
    }
  }

  function openDesktopNotifications() {
    setNotificationsOpen(true);
    const unreadIds = notifications.filter((item) => !item.read).map((item) => item.id);
    if (unreadIds.length === 0) return;
    markRead(unreadIds);
    if (isFirebaseConfigured && user?.id !== 'dev_user') {
      markNotificationsRead(unreadIds).catch((error) => {
        console.warn('Failed to mark notifications as read', error);
      });
    }
  }

  async function confirmLogout() {
    setLogoutLoading(true);
    try {
      await signOut();
    } catch {
      // Even if Firebase is offline, clear local state.
    } finally {
      setLogoutLoading(false);
      setLogoutConfirmOpen(false);
      clearAuth();
    }
  }

  const scenes = (
    <>
      <View style={[styles.tabScene, tab !== 'home' && styles.tabSceneHidden]}>
        <HomeScreen showHeaderActions={!isDesktopWeb} />
      </View>
      {visitedTabs.addMeal ? (
        <View style={[styles.tabScene, tab !== 'addMeal' && styles.tabSceneHidden]}>
          <AddMealScreen
            onMealAdded={() => openTab('addMeal')}
            fabBottomOffset={screenFabBottom}
            waterOpen={waterOpen && tab === 'addMeal'}
            onWaterOpen={() => setWaterOpen(true)}
            onWaterClose={() => setWaterOpen(false)}
            onAddWater={handleAddWater}
          />
        </View>
      ) : null}
      {visitedTabs.analysis ? (
        <View style={[styles.tabScene, tab !== 'analysis' && styles.tabSceneHidden]}>
          <AnalysisScreen />
        </View>
      ) : null}
      {visitedTabs.ranking ? (
        <View style={[styles.tabScene, tab !== 'ranking' && styles.tabSceneHidden]}>
          <RankingScreen fabBottomOffset={screenFabBottom} />
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.appShell, isDesktopWeb && styles.desktopShell]}>
      {isDesktopWeb ? (
        <View style={styles.sidebar}>
          <View style={styles.sidebarBrand}>
            <View style={styles.sidebarLogo}>
              <MaterialIcons name="eco" size={24} color={Colors.green600} />
            </View>
            <View style={styles.sidebarBrandText}>
              <Text style={styles.sidebarTitle}>NutriMeta</Text>
              <Text style={styles.sidebarUser} numberOfLines={1}>{profile?.name ?? user?.name ?? 'Usuário'}</Text>
            </View>
          </View>
          <View style={styles.sidebarNav}>
            {tabs.map((item) => {
              const active = tab === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.sidebarItem, active && styles.sidebarItemActive]}
                  onPress={() => openTab(item.key)}
                >
                  <MaterialIcons
                    name={item.icon}
                    size={21}
                    color={active ? Colors.green600 : Colors.gray400}
                  />
                  <Text style={[styles.sidebarItemText, active && styles.sidebarItemTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.sidebarFooter}>
            <TouchableOpacity style={styles.sidebarAction} onPress={openDesktopNotifications}>
              <MaterialIcons name="notifications-none" size={21} color={Colors.gray600} />
              <Text style={styles.sidebarActionText}>Notificações</Text>
              {sidebarBadgeCount > 0 ? <Text style={styles.sidebarBadge}>{sidebarBadgeCount}</Text> : null}
            </TouchableOpacity>
            <TouchableOpacity style={styles.sidebarAction} onPress={() => setSettingsOpen(true)}>
              <MaterialIcons name="person-outline" size={21} color={Colors.gray600} />
              <Text style={styles.sidebarActionText}>Configurações</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sidebarAction} onPress={() => setChatsOpen(true)}>
              <MaterialIcons name="chat-bubble-outline" size={21} color={Colors.gray600} />
              <Text style={styles.sidebarActionText}>Chat</Text>
              {unreadChatTotal > 0 ? <Text style={styles.sidebarBadge}>{unreadChatTotal}</Text> : null}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarAction, styles.sidebarLogout]} onPress={() => setLogoutConfirmOpen(true)}>
              <MaterialIcons name="logout" size={21} color={Colors.danger} />
              <Text style={[styles.sidebarActionText, styles.sidebarLogoutText]}>Sair</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={[
        styles.content,
        isDesktopWeb ? styles.desktopContent : { paddingBottom: tabBarBottom + MAIN_TAB_BAR_HEIGHT + Spacing.sm },
      ]}>
        {isDesktopWeb ? (
          <View style={styles.desktopStage}>{scenes}</View>
        ) : scenes}
      </View>

      {!isDesktopWeb ? (
        <View style={[styles.tabBar, WEB_FIXED_TAB_BAR_STYLE, { bottom: tabBarBottom }]}>
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => openTab(item.key)}
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
      ) : null}

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        nutritionistInvites={nutritionistInvites}
        chatLinks={chatLinks}
        unreadChatCounts={unreadChatCounts}
        onRespondInvite={handleRespondNutritionistInvite}
        onOpenChat={(link) => {
          setNotificationsOpen(false);
          setChatLink(link);
        }}
      />
      <ChatsModal
        visible={chatsOpen}
        onClose={() => setChatsOpen(false)}
        chatLinks={chatLinks}
        unreadChatCounts={unreadChatCounts}
        onOpenChat={(link) => {
          setChatLink(link);
          setChatsOpen(false);
        }}
      />
      <NutritionistChatModal
        visible={Boolean(chatLink)}
        link={chatLink}
        currentUserId={user?.id}
        currentUserName={profile?.name ?? user?.name ?? 'Paciente'}
        onClose={() => setChatLink(null)}
      />
      <ConfirmDialog
        visible={logoutConfirmOpen}
        title="Sair da conta"
        message="Você quer sair do NutriMeta?"
        confirmText="Sair"
        destructive
        loading={logoutLoading}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={confirmLogout}
      />
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
        setGoals(loadedProfile.macroGoals ?? calcMacroGoals(loadedProfile));
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

    if (user.id === 'dev_user' || !isFirebaseConfigured) {
      getCachedDailyLog(user.id, today)
        .then((cachedLog) => {
          if (active && cachedLog) setTodayLog(cachedLog);
        })
        .catch((error) => {
          console.warn('Failed to load cached daily log', error);
        });
      return () => {
        active = false;
      };
    }

    getPendingMealEntryCount(user.id)
      .then(async (pendingCount) => {
        if (!active) return;
        if (pendingCount === 0) {
          await removeCachedDailyLog(user.id, today);
          return;
        }
        const cachedLog = await getCachedDailyLog(user.id, today);
        if (active && cachedLog) setTodayLog(cachedLog);
      })
      .catch((error) => {
        console.warn('Failed to prepare cached daily log', error);
      });

    const unsubscribe = subscribeDailyLog(user.id, today, (log) => {
      if (!active) return;
      getPendingMealEntryCount(user.id)
        .then(async (pendingCount) => {
          if (!active) return;
          if (pendingCount > 0) return;
          setTodayLog(log);
          await removeCachedDailyLog(user.id, today);
        })
        .catch((error) => {
          console.warn('Failed to handle Firebase daily log snapshot', error);
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setTodayLog, user]);

  useEffect(() => {
    if (!user || user.role === 'nutritionist' || user.id === 'dev_user' || !isFirebaseConfigured) {
      return undefined;
    }

    return subscribeUserProfile(user.id, (nextProfile) => {
      setProfile(nextProfile);
      if (nextProfile) {
        setGoals(nextProfile.macroGoals ?? calcMacroGoals(nextProfile));
      }
    });
  }, [setGoals, setProfile, user]);

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
    if (!todayLog || !user) return;

    if (user.id === 'dev_user' || !isFirebaseConfigured) {
      saveCachedDailyLog(todayLog).catch((error) => {
        console.warn('Failed to cache current daily log', error);
      });
      return;
    }

    getPendingMealEntryCount(user.id)
      .then((pendingCount) => (
        pendingCount > 0
          ? saveCachedDailyLog(todayLog)
          : removeCachedDailyLog(user.id, todayLog.date)
      ))
      .catch((error) => {
        console.warn('Failed to update local daily log cache', error);
      });
  }, [todayLog, user]);

  useEffect(() => {
    if (!user || user.role === 'nutritionist' || user.id === 'dev_user' || !isFirebaseConfigured) {
      return undefined;
    }

    let syncing = false;
    const runSync = async () => {
      if (syncing) return;
      syncing = true;
      try {
        await syncPendingMealEntries(user.id);
        if (await getPendingMealEntryCount(user.id) === 0) {
          await removeCachedDailyLog(user.id, formatDate(new Date()));
        }
      } catch (error) {
        console.warn('Failed to sync pending meal entries', error);
      } finally {
        syncing = false;
      }
    };

    runSync();
    const interval = setInterval(runSync, 15000);
    return () => clearInterval(interval);
  }, [user]);

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
          <Text style={styles.loadingTitle}>Preparando o NutriMeta</Text>
          <Text style={styles.loadingText}>Carregando seus dados iniciais...</Text>
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
    minHeight: Platform.OS === 'web' ? '100vh' as any : undefined,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg,
    gap: Spacing.xs,
    padding: Spacing.xl,
  },
  loadingTitle: {
    marginTop: Spacing.sm,
    color: Colors.gray800,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    textAlign: 'center',
  },
  loadingText: {
    color: Colors.gray600,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    textAlign: 'center',
  },
  appShell: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  desktopShell: {
    minHeight: Platform.OS === 'web' ? '100vh' as any : undefined,
    position: 'relative',
    overflow: Platform.OS === 'web' ? 'hidden' as any : 'visible',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 1040 : undefined,
    alignSelf: 'center',
  },
  desktopContent: {
    position: Platform.OS === 'web' ? 'fixed' as any : 'relative',
    left: Platform.OS === 'web' ? 268 : 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: Platform.OS === 'web' ? 'auto' as any : '100%',
    maxWidth: Platform.OS === 'web' ? 'none' as any : undefined,
    alignSelf: 'stretch',
    marginLeft: 0,
    paddingBottom: 0,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    alignItems: 'center',
    overflow: Platform.OS === 'web' ? 'hidden' as any : 'visible',
  },
  desktopStage: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 'none' as any : undefined,
  },
  sidebar: {
    width: 268,
    position: Platform.OS === 'web' ? 'fixed' as any : 'relative',
    left: 0,
    top: 0,
    bottom: 0,
    minHeight: Platform.OS === 'web' ? '100vh' as any : undefined,
    backgroundColor: Colors.white,
    padding: Spacing.base,
    justifyContent: 'space-between',
  },
  sidebarBrand: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  sidebarLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.green50,
    borderWidth: 1,
    borderColor: Colors.green100,
  },
  sidebarBrandText: {
    flex: 1,
    minWidth: 0,
  },
  sidebarTitle: {
    fontSize: Typography.lg,
    color: Colors.gray800,
    fontWeight: Typography.bold,
  },
  sidebarUser: {
    marginTop: 2,
    fontSize: Typography.xs,
    color: Colors.gray400,
    fontWeight: Typography.semibold,
  },
  sidebarNav: {
    gap: Spacing.xs,
  },
  sidebarItem: {
    minHeight: 46,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  sidebarItemActive: {
    backgroundColor: Colors.green50,
    borderWidth: 1,
    borderColor: Colors.green100,
  },
  sidebarItemText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.gray600,
    fontWeight: Typography.semibold,
  },
  sidebarItemTextActive: {
    color: Colors.green600,
    fontWeight: Typography.bold,
  },
  sidebarFooter: {
    gap: Spacing.xs,
    paddingTop: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sidebarAction: {
    minHeight: 42,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  sidebarActionText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.gray600,
    fontWeight: Typography.semibold,
  },
  sidebarBadge: {
    minWidth: 22,
    overflow: 'hidden',
    borderRadius: Radius.full,
    backgroundColor: Colors.danger,
    color: Colors.white,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
  },
  sidebarLogout: {
    marginTop: Spacing.xs,
  },
  sidebarLogoutText: {
    color: Colors.danger,
  },
  tabScene: {
    flex: 1,
  },
  tabSceneHidden: {
    display: 'none',
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
});
