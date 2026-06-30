import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors, Spacing } from '../../constants/theme';
import { isFirebaseConfigured } from '../../config';
import { signOut } from '../../services/authService';
import { respondNutritionistInvite, subscribePatientAcceptedNutritionistLinks, subscribePatientNutritionistInvites } from '../../services/nutritionistLinkService';
import { subscribeUnreadChatCountByLink } from '../../services/nutritionistChatService';
import { subscribePatientFoodPlans } from '../../services/nutritionistService';
import { saveMealEntryOrQueue } from '../../services/pendingSyncService';
import { FoodPlanMealStatus, setFoodPlanMealStatus, subscribeFoodPlanMealStatuses } from '../../services/foodPlanStatusService';
import { markNotificationsRead, subscribePatientNotifications } from '../../services/groupService';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { NutritionistChatModal } from '../../components/NutritionistChatModal';
import { ShoppingPdfModal } from '../../components/ShoppingPdfModal';
import { NutritionDataHelpModal } from '../../components/NutritionDataHelpModal';
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton';
import { useStore, selectGoals, selectTodayLog, selectUnreadCount } from '../../store';
import { formatBrasiliaDate, formatDate, formatKcal, generateId, getBrasiliaHour, macroPercent } from '../../utils/nutrition';
import { FoodNutrition, FoodPlan, FoodPlanMeal, MacroGoals, MealEntry, NutritionistPatientLink } from '../../types';

import { RingChart, RING_SIZE } from './components/RingChart';
import { NutritionGoalTable } from './components/NutritionGoalTable';
import { FoodPlanCard, makeFoodPlanMealKey, makeLegacyFoodPlanMealKey, PlanMeal } from './components/FoodPlanCard';
import { SettingsModal } from './components/SettingsModal';
import { NotificationsModal } from './components/NotificationsModal';
import { ChatsModal } from './components/ChatsModal';
import { WaterModal } from './components/WaterModal';
import { DEFAULT_GOALS, NutritionGoalRow } from './types';
import { styles } from './styles';

const MEAL_PERIOD_ORDER = ['breakfast', 'snack', 'lunch', 'dinner', 'hydration'];

export function HomeScreen({
  showHeaderActions = true,
}: {
  showHeaderActions?: boolean;
}) {
  const { width } = useWindowDimensions();
  const isDesktopWide = Platform.OS === 'web' && width >= 1100;
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const clearAuth = useStore((s) => s.clearAuth);
  const todayLog = useStore(selectTodayLog);
  const goals = useStore(selectGoals);
  const addEntry = useStore((s) => s.addEntry);
  const setNotifications = useStore((s) => s.setNotifications);
  const markRead = useStore((s) => s.markRead);
  const unreadCount = useStore(selectUnreadCount);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [nutritionistInvites, setNutritionistInvites] = useState<NutritionistPatientLink[]>([]);
  const [chatLinks, setChatLinks] = useState<NutritionistPatientLink[]>([]);
  const [foodPlans, setFoodPlans] = useState<FoodPlan[]>([]);
  const [foodPlansLoading, setFoodPlansLoading] = useState(false);
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  const [chatLink, setChatLink] = useState<NutritionistPatientLink | null>(null);
  const [completingMealKey, setCompletingMealKey] = useState<string | null>(null);
  const [selectedFoodPlanOptions, setSelectedFoodPlanOptions] = useState<Record<string, string>>({});
  const [openFoodPlanOptionKey, setOpenFoodPlanOptionKey] = useState<string | null>(null);
  const [foodPlanMealStatuses, setFoodPlanMealStatuses] = useState<Record<string, FoodPlanMealStatus>>({});
  const [shoppingPdfOpen, setShoppingPdfOpen] = useState(false);
  const todayKey = formatDate(new Date());

  const totals: FoodNutrition = useMemo(
    () => todayLog?.totalNutrition ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
    [todayLog]
  );

  const safeGoals: MacroGoals = { ...DEFAULT_GOALS, ...(goals ?? {}) };
  const nutritionGoalRows = useMemo<NutritionGoalRow[]>(() => [
    { key: 'kcal', label: 'Calorias', unit: ' kcal', goal: safeGoals.kcal, mode: 'target', section: 'Energia e macros' },
    { key: 'protein', label: 'Proteína', unit: 'g', goal: safeGoals.protein, mode: 'target', section: 'Energia e macros', overPct: 130 },
    { key: 'carbs', label: 'Carboidratos', unit: 'g', goal: safeGoals.carbs, mode: 'target', section: 'Energia e macros', overPct: 120 },
    { key: 'fat', label: 'Gorduras', unit: 'g', goal: safeGoals.fat, mode: 'target', section: 'Energia e macros', overPct: 120 },
    { key: 'fiber', label: 'Fibras', unit: 'g', goal: safeGoals.fiber, mode: 'target', section: 'Energia e macros', overPct: 160 },
    { key: 'waterMl', label: 'Água', unit: 'ml', goal: safeGoals.water, mode: 'target', section: 'Energia e macros', overPct: 140 },
    { key: 'sugar', label: 'Açúcar', unit: 'g', goal: safeGoals.sugar, mode: 'limit', section: 'Limites' },
    { key: 'sodium', label: 'Sódio', unit: 'mg', goal: safeGoals.sodium, mode: 'limit', section: 'Limites' },
    { key: 'calcium', label: 'Cálcio', unit: 'mg', goal: 1300, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'iron', label: 'Ferro', unit: 'mg', goal: 18, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'potassium', label: 'Potássio', unit: 'mg', goal: 4700, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'magnesium', label: 'Magnésio', unit: 'mg', goal: 420, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'zinc', label: 'Zinco', unit: 'mg', goal: 11, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminA', label: 'Vitamina A', unit: 'mcg', goal: 900, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminC', label: 'Vitamina C', unit: 'mg', goal: 90, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminD', label: 'Vitamina D', unit: 'mcg', goal: 20, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminE', label: 'Vitamina E', unit: 'mg', goal: 15, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminB12', label: 'Vitamina B12', unit: 'mcg', goal: 2.4, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'folate', label: 'Folato', unit: 'mcg', goal: 400, mode: 'target', section: 'Vitaminas e minerais' },
  ], [safeGoals]);
  const waterMl = todayLog?.waterMl ?? 0;
  const completedFoodPlanMeals = useMemo(() => {
    const completed: Record<string, boolean> = {};
    Object.values(foodPlanMealStatuses).forEach((item) => {
      if (item.status === 'completed') completed[item.mealKey] = true;
    });
    todayLog?.entries.forEach((entry) => {
      if (entry.source !== 'saved' || !entry.savedMealId) return;
      if (entry.mealGroupId?.startsWith(`${entry.savedMealId}_`)) {
        completed[entry.mealGroupId] = true;
      }
      if (entry.mealGroupLabel) {
        completed[`${entry.savedMealId}_${entry.mealPeriod}_${entry.mealGroupLabel}`] = true;
      }
    });
    return completed;
  }, [foodPlanMealStatuses, todayLog?.entries]);
  const skippedFoodPlanMeals = useMemo(() => {
    const skipped: Record<string, boolean> = {};
    Object.values(foodPlanMealStatuses).forEach((item) => {
      if (item.status === 'skipped') skipped[item.mealKey] = true;
    });
    return skipped;
  }, [foodPlanMealStatuses]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setNutritionistInvites([]);
      return undefined;
    }
    return subscribePatientNutritionistInvites(user.id, setNutritionistInvites);
  }, [user]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setChatLinks([]);
      return undefined;
    }
    return subscribePatientAcceptedNutritionistLinks(user.id, setChatLinks);
  }, [user]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setUnreadChatCounts({});
      return undefined;
    }
    return subscribeUnreadChatCountByLink(user.id, setUnreadChatCounts);
  }, [user]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setFoodPlans([]);
      setFoodPlansLoading(false);
      return undefined;
    }
    setFoodPlansLoading(true);
    return subscribePatientFoodPlans(user.id, (items) => {
      setFoodPlans(items);
      setFoodPlansLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setNotifications([]);
      return undefined;
    }
    return subscribePatientNotifications(user.id, setNotifications);
  }, [setNotifications, user]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setFoodPlanMealStatuses({});
      return undefined;
    }
    return subscribeFoodPlanMealStatuses(user.id, todayKey, (items) => {
      setFoodPlanMealStatuses(Object.fromEntries(items.map((item) => [item.mealKey, item])));
      setSelectedFoodPlanOptions((current) => {
        const next = { ...current };
        items.forEach((item) => {
          if (item.selectedOptionId) next[item.mealKey] = item.selectedOptionId;
        });
        return next;
      });
    });
  }, [todayKey, user]);

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
  const kcalPct = macroPercent(totals.kcal, safeGoals.kcal);
  const hour = getBrasiliaHour();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = (profile?.name ?? user?.name ?? 'Usuário').split(' ')[0];

  const unreadChatTotal = Object.values(unreadChatCounts).reduce((sum, count) => sum + count, 0);
  const primaryPlan = foodPlans[0] ?? null;

  const allPlanMeals = useMemo<PlanMeal[]>(() => {
    return foodPlans
      .flatMap((plan) =>
        plan.meals.map((meal, mealIndex) => ({ plan, meal, mealIndex })),
      )
      .sort((a, b) => {
        const timeA = a.meal.time ?? '';
        const timeB = b.meal.time ?? '';
        if (timeA && timeB) return timeA.localeCompare(timeB);
        if (timeA) return -1;
        if (timeB) return 1;
        return MEAL_PERIOD_ORDER.indexOf(a.meal.period) - MEAL_PERIOD_ORDER.indexOf(b.meal.period);
      });
  }, [foodPlans]);

  const today = formatBrasiliaDate(new Date(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  function openNotifications() {
    setHeaderMenuOpen(false);
    setNotificationsOpen(true);
    const unreadIds = useStore.getState().notifications
      .filter((item) => !item.read)
      .map((item) => item.id);
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
      // Even if Firebase is offline, clear the in-memory app state.
    } finally {
      setLogoutLoading(false);
      setLogoutConfirmOpen(false);
      clearAuth();
    }
  }

  function openProfileSettings() {
    setHeaderMenuOpen(false);
    setSettingsOpen(true);
  }

  function openChats() {
    setHeaderMenuOpen(false);
    setChatsOpen(true);
  }

  function openHelp() {
    setHeaderMenuOpen(false);
    setHelpOpen(true);
  }

  function openShoppingList() {
    setHeaderMenuOpen(false);
    if (!primaryPlan) {
      Alert.alert('Sem plano alimentar', 'Você ainda não tem um plano alimentar para gerar a lista de compras.');
      return;
    }
    setShoppingPdfOpen(true);
  }

  function createLocalFoodPlanEntry(userId: string, payload: Omit<MealEntry, 'id' | 'userId' | 'addedAt'>): MealEntry {
    return {
      ...payload,
      id: generateId(),
      userId,
      addedAt: new Date(),
    };
  }

  function handleSelectFoodPlanOption(mealKey: string, optionId: string) {
    setSelectedFoodPlanOptions((items) => ({ ...items, [mealKey]: optionId }));
    setOpenFoodPlanOptionKey(null);
    if (user && user.id !== 'dev_user' && isFirebaseConfigured) {
      setFoodPlanMealStatus({
        userId: user.id,
        date: todayKey,
        mealKey,
        status: foodPlanMealStatuses[mealKey]?.status ?? 'pending',
        selectedOptionId: optionId,
      }).catch((error) => {
        console.warn('Failed to save selected food plan option', error);
      });
    }
  }

  function handleToggleFoodPlanOptions(mealKey: string) {
    setOpenFoodPlanOptionKey((current) => (current === mealKey ? null : mealKey));
  }

  function handleSkipFoodPlanMeal(mealKey: string) {
    const nextSkipped = !skippedFoodPlanMeals[mealKey];
    setFoodPlanMealStatuses((items) => ({
      ...items,
      [mealKey]: {
        id: items[mealKey]?.id ?? mealKey,
        userId: user?.id ?? 'local',
        date: todayKey,
        mealKey,
        status: nextSkipped ? 'skipped' : 'pending',
        selectedOptionId: selectedFoodPlanOptions[mealKey],
        updatedAt: new Date(),
      },
    }));
    if (user && user.id !== 'dev_user' && isFirebaseConfigured) {
      setFoodPlanMealStatus({
        userId: user.id,
        date: todayKey,
        mealKey,
        status: nextSkipped ? 'skipped' : 'pending',
        selectedOptionId: selectedFoodPlanOptions[mealKey],
      }).catch((error) => {
        console.warn('Failed to save skipped food plan meal', error);
        Alert.alert('Erro', 'Não foi possível salvar o status dessa refeição agora.');
      });
    }
  }

  async function handleCompleteFoodPlanMeal(plan: FoodPlan, meal: FoodPlanMeal, mealIndex: number) {
    if (!user) return;
    const items = meal.items.filter((item) => item.nutrition);
    if (items.length === 0) {
      Alert.alert('Plano incompleto', 'Essa refeição não possui nutrientes calculados para registrar automaticamente.');
      return;
    }

    const key = makeFoodPlanMealKey(plan.id, meal, mealIndex);
    const mealGroupId = key;
    setCompletingMealKey(key);
    setFoodPlanMealStatuses((items) => ({
      ...items,
      [key]: {
        id: items[key]?.id ?? key,
        userId: user.id,
        date: todayKey,
        mealKey: key,
        status: 'completed',
        selectedOptionId: selectedFoodPlanOptions[key],
        updatedAt: new Date(),
      },
    }));
    try {
      for (const item of items) {
        const payload: Omit<MealEntry, 'id' | 'userId' | 'addedAt'> = {
          foodName: `${item.name} (${item.quantity})`,
          emoji: item.emoji ?? '🍽️',
          quantity: item.quantityValue ?? 1,
          unit: item.unit ?? 'porcao',
          nutrition: item.nutrition ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
          mealPeriod: meal.period,
          mealGroupId,
          mealGroupLabel: meal.title,
          source: 'saved',
          savedMealId: plan.id,
        };
        const result = isFirebaseConfigured && user.id !== 'dev_user'
          ? await saveMealEntryOrQueue({ userId: user.id, goals: safeGoals, payload })
          : { entry: createLocalFoodPlanEntry(user.id, payload), queued: false };
        addEntry(result.entry);
      }
      if (isFirebaseConfigured && user.id !== 'dev_user') {
        await setFoodPlanMealStatus({
          userId: user.id,
          date: todayKey,
          mealKey: key,
          status: 'completed',
          selectedOptionId: selectedFoodPlanOptions[key],
        });
      }
      Alert.alert('Refeição registrada', 'A refeição recomendada foi adicionada ao seu dia.');
    } catch (error) {
      console.warn('Failed to complete food plan meal', error);
      setFoodPlanMealStatuses((items) => {
        const next = { ...items };
        delete next[key];
        return next;
      });
      Alert.alert('Erro', 'Não foi possível registrar essa refeição agora.');
    } finally {
      setCompletingMealKey(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.userName}>{firstName}</Text>
          <Text style={styles.dateLabel}>{today}</Text>
        </View>
        {showHeaderActions ? <View style={styles.headerActions}>
          <TouchableOpacity style={styles.helpButton} onPress={openNotifications}>
            <MaterialIcons name="notifications-none" size={21} color={Colors.green600} />
            {unreadCount + nutritionistInvites.length + unreadChatTotal > 0 && <View style={styles.notificationDot} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setHeaderMenuOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Abrir menu"
            accessibilityState={{ expanded: headerMenuOpen }}
          >
            <MaterialIcons name={headerMenuOpen ? 'close' : 'menu'} size={25} color={Colors.green600} />
            {unreadChatTotal > 0 && <View style={styles.notificationDot} />}
          </TouchableOpacity>
          {headerMenuOpen ? (
            <View style={styles.headerMenu}>
              <TouchableOpacity style={styles.headerMenuItem} onPress={openProfileSettings}>
                <MaterialIcons name="person-outline" size={20} color={Colors.green600} />
                <Text style={styles.headerMenuText}>Editar perfil</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerMenuItem} onPress={openChats}>
                <MaterialIcons name="chat-bubble-outline" size={20} color={Colors.green600} />
                <Text style={styles.headerMenuText}>Chat</Text>
                {unreadChatTotal > 0 ? (
                  <Text style={styles.headerMenuBadge}>{unreadChatTotal}</Text>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerMenuItem} onPress={openShoppingList}>
                <MaterialIcons name="picture-as-pdf" size={20} color={Colors.green600} />
                <Text style={styles.headerMenuText}>Lista de compras</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerMenuItem} onPress={openHelp}>
                <MaterialIcons name="help-outline" size={20} color={Colors.green600} />
                <Text style={styles.headerMenuText}>Ajuda</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerMenuItem}
                onPress={() => {
                  setHeaderMenuOpen(false);
                  setLogoutConfirmOpen(true);
                }}
              >
                <MaterialIcons name="logout" size={20} color={Colors.danger} />
                <Text style={[styles.headerMenuText, styles.headerMenuTextDanger]}>Sair</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View> : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={isDesktopWide ? styles.desktopTopGrid : undefined}>
          <View style={isDesktopWide ? styles.desktopSummaryColumn : undefined}>
            {/* 1. Anel de calorias + resumo rápido */}
            <View style={styles.ringSection}>
              <View style={styles.ringWrap}>
                <RingChart pct={kcalPct} color={Colors.green400} />
                <View style={styles.ringCenter}>
                  <Text style={styles.ringKcal}>{formatKcal(totals.kcal)}</Text>
                  <Text style={styles.ringKcalSub}>kcal hoje</Text>
                  <Text style={styles.ringGoal}>de {safeGoals.kcal}</Text>
                </View>
              </View>

              <View style={styles.remainRow}>
                <View style={styles.remainItem}>
                  <Text style={styles.remainVal}>{Math.max(0, safeGoals.kcal - Math.round(totals.kcal))}</Text>
                  <Text style={styles.remainLabel}>kcal restantes</Text>
                </View>
                <View style={[styles.remainItem, styles.remainCenter]}>
                  <Text style={styles.remainVal}>{Math.round(totals.kcal)}</Text>
                  <Text style={styles.remainLabel}>consumidas</Text>
                </View>
                <View style={styles.remainItem}>
                  <Text style={styles.remainVal}>{waterMl}/{safeGoals.water}</Text>
                  <Text style={styles.remainLabel}>ml de água</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={isDesktopWide ? styles.desktopPlanColumn : undefined}>
            {/* 2. Plano alimentar (só quando existir) */}
            {foodPlansLoading && allPlanMeals.length === 0 ? (
              <View style={styles.foodPlanPanel}>
                <View style={styles.foodPlanHeader}>
                  <View style={{ flex: 1 }}>
                    <SkeletonLine width={88} height={10} />
                    <SkeletonLine width="62%" height={18} style={{ marginTop: 8 }} />
                  </View>
                  <SkeletonLine width={74} height={10} />
                </View>
                <SkeletonLine width="86%" height={12} style={{ marginBottom: Spacing.sm }} />
                <SkeletonBlock height={104} />
              </View>
            ) : allPlanMeals.length > 0 && primaryPlan ? (
              <FoodPlanCard
                meals={allPlanMeals}
                planTitle={primaryPlan.title}
                planNotes={primaryPlan.notes}
                nutritionistName={primaryPlan.nutritionistName}
                completingMealKey={completingMealKey}
                onCompleteMeal={handleCompleteFoodPlanMeal}
                onOpenShoppingPdf={() => setShoppingPdfOpen(true)}
                selectedOptions={selectedFoodPlanOptions}
                openOptionKey={openFoodPlanOptionKey}
                skippedMealKeys={skippedFoodPlanMeals}
                completedMealKeys={completedFoodPlanMeals}
                onSelectOption={handleSelectFoodPlanOption}
                onToggleOptions={handleToggleFoodPlanOptions}
                onSkipMeal={handleSkipFoodPlanMeal}
              />
            ) : null}
          </View>
        </View>

        {/* 3. Tabela de metas e nutrientes */}
        <NutritionGoalTable rows={nutritionGoalRows} totals={totals} waterMl={waterMl} />
      </ScrollView>

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NutritionDataHelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} />
      <ShoppingPdfModal
        visible={shoppingPdfOpen}
        plan={primaryPlan}
        plans={foodPlans}
        onClose={() => setShoppingPdfOpen(false)}
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
      <NutritionistChatModal
        visible={Boolean(chatLink)}
        link={chatLink}
        currentUserId={user?.id}
        currentUserName={profile?.name ?? user?.name ?? 'Paciente'}
        onClose={() => setChatLink(null)}
      />
    </SafeAreaView>
  );
}

export default HomeScreen;
