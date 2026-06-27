import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/theme";
import { useStore, selectGoals, selectSavedMeals } from "../../store";
import {
  getRecentDailyLogs,
  incrementMealUsage,
  removeMealEntry,
  updateMealEntry,
} from "../../services/nutritionService";
import { addCommunityPost } from "../../services/groupService";
import { getCachedRecentDailyLogs } from "../../services/dailyLogStorage";
import { WaterModal } from "../HomeScreen";
import {
  removePendingMealEntryByEntryId,
  saveMealEntryOrQueue,
  subscribePendingMealEntries,
} from "../../services/pendingSyncService";
import { generateFoodNutrition } from "../../services/foodNutritionAiService";
import {
  getCustomFoods,
  saveCustomFood,
} from "../../services/customFoodService";
import { DailyLog, FoodItem, MealEntry, MealPeriod, QuantityUnit } from "../../types";
import {
  dateDaysAgoBrasilia,
  formatDate,
  formatNutritionDetails,
  sumNutrition,
} from "../../utils/nutrition";
import { isFirebaseConfigured } from "../../config";
import { FoodIcon } from "../../components/FoodIcon";
import { MealDraft, MEAL_PERIODS, MEAL_PERIOD_LABELS, MealEntryPayload } from "./types";
import { findExactFood } from "./utils/foodSearch";
import {
  mergeDailyLogs,
  formatDateChip,
  formatLogDateLabel,
  markAiFood,
  createLocalEntry,
  firebaseErrorMessage,
  createMealGroupId,
  buildMealPayload,
  getDefaultMealPeriod,
  getEntryMealPeriod,
} from "./utils/mealUtils";
import AddMealModal from "./components/AddMealModal";
import { PhotoModal } from "./components/PhotoModal";
import { TodayEntry, EditMealEntryModal } from "./components/TodayEntry";
import { styles, logStyle } from "./styles";

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function AddMealScreen({
  onMealAdded,
  fabBottomOffset = 82,
  waterOpen = false,
  onWaterOpen,
  onWaterClose,
  onAddWater,
}: {
  onMealAdded?: () => void;
  fabBottomOffset?: number;
  waterOpen?: boolean;
  onWaterOpen?: () => void;
  onWaterClose?: () => void;
  onAddWater?: (amountMl: number) => void;
}) {
  const todayLog = useStore((s) => s.todayLog);
  const savedMeals = useStore(selectSavedMeals);
  const removeEntry = useStore((s) => s.removeEntry);
  const updateEntry = useStore((s) => s.updateEntry);
  const goals = useStore(selectGoals);
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const addEntryFn = useStore((s) => s.addEntry);

  const [addModal, setAddModal] = useState(false);
  const [photoModal, setPhotoModal] = useState(false);
  const [customFoods, setCustomFoods] = useState<FoodItem[]>([]);
  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(() =>
    formatDate(new Date()),
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MealEntry | null>(null);
  const dateScrollRef = React.useRef<ScrollView>(null);
  const fabAnimation = React.useRef(new Animated.Value(0)).current;
  const todayDate = formatDate(new Date());
  const recentDates = React.useMemo(
    () =>
      Array.from({ length: 31 }, (_item, index) =>
        dateDaysAgoBrasilia(30 - index),
      ),
    [],
  );

  const fabMenuTranslateY = fabAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  const fabMenuScale = fabAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const fabIconRotation = fabAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  React.useEffect(() => {
    Animated.spring(fabAnimation, {
      toValue: actionMenuOpen ? 1 : 0,
      speed: 22,
      bounciness: 5,
      useNativeDriver: Platform.OS !== "web",
    }).start();

    return () => fabAnimation.stopAnimation();
  }, [actionMenuOpen, fabAnimation]);

  function closeActionMenu() {
    setActionMenuOpen(false);
  }

  function toggleActionMenu() {
    setActionMenuOpen((open) => !open);
  }

  function handleMealAdded() {
    setTimeout(() => onMealAdded?.(), 0);
  }

  function openManualMeal() {
    closeActionMenu();
    setAddModal(true);
  }

  function openPhotoMeal() {
    closeActionMenu();
    setPhotoModal(true);
  }

  function openWater() {
    closeActionMenu();
    onWaterOpen?.();
  }

  React.useEffect(() => {
    let active = true;
    if (!user) {
      setCustomFoods([]);
      return undefined;
    }

    getCustomFoods(user.id)
      .then((foods) => {
        if (!active) return;
        setCustomFoods(foods);
      })
      .catch((error) => {
        console.warn("Failed to load custom foods", error);
      });

    return () => {
      active = false;
    };
  }, [user]);

  React.useEffect(() => {
    if (!user || user.id === "dev_user") {
      setPendingSyncCount(0);
      return undefined;
    }
    return subscribePendingMealEntries((items) => {
      setPendingSyncCount(items.length);
    }, user.id);
  }, [user]);

  React.useEffect(() => {
    let active = true;
    async function loadRecentLogs() {
      if (!user) {
        setRecentLogs([]);
        return;
      }
      try {
        const cached = await getCachedRecentDailyLogs(user.id, 31);
        if (active && cached.length > 0) setRecentLogs(cached);

        if (isFirebaseConfigured && user.id !== "dev_user") {
          const remote = await getRecentDailyLogs(user.id, 31);
          if (active) setRecentLogs(mergeDailyLogs(remote, cached));
        } else if (active) {
          setRecentLogs(mergeDailyLogs(todayLog ? [todayLog] : [], cached));
        }
      } catch (error) {
        console.warn("Failed to load recent meal logs", error);
        if (active) setRecentLogs(todayLog ? [todayLog] : []);
      }
    }

    void loadRecentLogs();
    return () => {
      active = false;
    };
  }, [user?.id, todayLog?.updatedAt]);

  const handleCreateFood = useCallback(
    async (foodName: string, preferredUnit: QuantityUnit) => {
      if (!user) throw new Error("Missing user");
      const existing = findExactFood(foodName, customFoods);
      if (existing) return existing;

      const food = markAiFood(
        await generateFoodNutrition(foodName, preferredUnit),
      );
      const foods = await saveCustomFood(user.id, food);
      setCustomFoods(foods);
      return food;
    },
    [customFoods, user],
  );

  async function saveDraftItems(
    items: MealDraft[],
    source: "voice" | "photo",
    mealPeriod: MealPeriod,
    options: { navigateAfter?: boolean } = {},
  ) {
    if (!user || !goals) {
      Alert.alert(
        "Perfil não carregado",
        "Aguarde o app carregar seus dados e tente novamente.",
      );
      throw new Error("Missing user or goals");
    }
    if (items.length === 0) {
      Alert.alert(
        "Nenhum alimento para adicionar",
        "Revise os itens detectados antes de confirmar.",
      );
      throw new Error("No meal draft items");
    }
    if (
      items.some(
        (item) =>
          item.food && (!item.quantityText.trim() || item.quantity <= 0),
      )
    ) {
      Alert.alert(
        "Quantidade inválida",
        "Informe uma quantidade maior que zero para todos os alimentos.",
      );
      throw new Error("Invalid meal draft quantity");
    }

    let savedCount = 0;
    let firebaseFallbackCount = 0;
    let firstFirebaseError: unknown = null;
    const mealGroupId = createMealGroupId(source);

    for (const item of items) {
      if (!item.food) continue;
      const payload = buildMealPayload({
        food: item.food,
        quantity: item.quantity,
        unit: item.unit,
        nutrition: item.nutrition,
        mealPeriod,
        source,
        mealGroupId,
      });
      let entry: MealEntry;
      try {
        const result =
          isFirebaseConfigured && user.id !== "dev_user"
            ? await saveMealEntryOrQueue({ userId: user.id, goals, payload })
            : {
                entry: createLocalEntry(user.id, payload),
                queued: false,
                error: undefined,
              };
        entry = result.entry;
        if (result.queued) {
          firebaseFallbackCount += 1;
          firstFirebaseError ??= result.error;
        }
      } catch (error) {
        console.warn(`${source} meal save failed, using local entry`, error);
        entry = createLocalEntry(user.id, payload);
        firebaseFallbackCount += 1;
        firstFirebaseError ??= error;
      }
      addEntryFn(entry);
      if (source === "photo" && item.food.source === "ai") {
        try {
          const foods = await saveCustomFood(user.id, item.food);
          setCustomFoods(foods);
        } catch (error) {
          console.warn("Failed to save custom food", error);
        }
      }
      savedCount += 1;
    }

    if (savedCount === 0) {
      Alert.alert(
        "Nenhum alimento válido",
        "Revise os itens detectados antes de confirmar.",
      );
      throw new Error("No valid meal draft items");
    }

    if (firebaseFallbackCount > 0) {
      console.warn(
        "Meal items queued for Firebase sync",
        firebaseFallbackCount,
        firebaseErrorMessage(firstFirebaseError),
      );
    }

    if (options.navigateAfter !== false) handleMealAdded();
  }

  async function publishPhotoPost(
    items: MealDraft[],
    mealPeriod: MealPeriod,
    photo: {
      imageUri: string;
      mimeType?: string;
      summary: string;
      caption: string;
    },
  ) {
    if (!user) return;
    const validItems = items.filter((item) => item.food);
    const nutrition = sumNutrition(
      validItems.map((item) => ({ nutrition: item.nutrition })),
    );
    const foodNames = validItems
      .map((item) => item.food?.name ?? item.foodText)
      .filter(Boolean);
    const authorName = profile?.name ?? user.name ?? "Usuário";
    const authorNickname = profile?.nickname ?? user.nickname;

    if (!isFirebaseConfigured || user.id === "dev_user") {
      Alert.alert(
        "Modo local",
        "A publicação social precisa do Firebase ativo para salvar a foto no feed.",
      );
      return;
    }

    try {
      await addCommunityPost({
        authorId: user.id,
        authorName,
        authorNickname,
        imageUri: photo.imageUri,
        imageMimeType: photo.mimeType,
        caption: photo.caption,
        nutrition,
        foodNames,
        mealPeriod,
      });
      Alert.alert("Publicado", "Sua foto foi publicada na comunidade.");
    } catch (error) {
      console.warn("Failed to publish community post", error);
      Alert.alert(
        "Não foi possível publicar",
        "A refeição foi salva, mas a foto não entrou no feed agora.",
      );
    }
  }

  async function handlePhotoConfirm(
    items: MealDraft[],
    mealPeriod: MealPeriod,
    photo?: {
      imageUri: string;
      mimeType?: string;
      summary: string;
      caption: string;
    },
  ) {
    await saveDraftItems(items, "photo", mealPeriod, { navigateAfter: false });
    if (photo) {
      Alert.alert(
        "Publicar na comunidade?",
        "Compartilhar a foto do prato com as informações nutricionais?",
        [
          { text: "Agora não", style: "cancel", onPress: handleMealAdded },
          {
            text: "Publicar",
            onPress: async () => {
              await publishPhotoPost(items, mealPeriod, photo);
              handleMealAdded();
            },
          },
        ],
      );
      return;
    }
    handleMealAdded();
  }

  async function quickAdd(mealId: string) {
    if (!user || !goals) return;
    const meal = savedMeals.find((m) => m.id === mealId);
    if (!meal) return;
    if (isFirebaseConfigured && user.id !== "dev_user") {
      try {
        await incrementMealUsage(mealId);
      } catch (error) {
        console.warn("Failed to increment saved meal usage", error);
      }
    }
    let queuedCount = 0;
    let firstQueueError: unknown = null;
    const mealGroupId = createMealGroupId("saved");
    for (const e of meal.entries) {
      const period = e.mealPeriod ?? getDefaultMealPeriod();
      const payload = {
        ...e,
        mealPeriod: period,
        mealGroupId,
        mealGroupLabel: MEAL_PERIOD_LABELS[period],
        source: "saved",
        savedMealId: mealId,
      } satisfies MealEntryPayload;
      const result =
        isFirebaseConfigured && user.id !== "dev_user"
          ? await saveMealEntryOrQueue({ userId: user.id, goals, payload })
          : {
              entry: createLocalEntry(user.id, payload),
              queued: false,
              error: undefined,
            };
      if (result.queued) {
        queuedCount += 1;
        firstQueueError ??= result.error;
      }
      addEntryFn(result.entry);
    }
    if (queuedCount > 0) {
      console.warn(
        "Saved meal queued for Firebase sync",
        queuedCount,
        firebaseErrorMessage(firstQueueError),
      );
    }
    handleMealAdded();
  }

  async function handleDeleteEntry(entry: MealEntry) {
    if (user) {
      const removedPending = await removePendingMealEntryByEntryId(
        user.id,
        entry.id,
      );
      if (removedPending) {
        removeEntry(entry.id);
        return;
      }
    }
    if (user && goals && isFirebaseConfigured && user.id !== "dev_user") {
      try {
        await removeMealEntry(user.id, goals, entry);
      } catch {
        Alert.alert(
          "Erro",
          "Não foi possível remover este alimento do Firebase.",
        );
        return;
      }
    }
    removeEntry(entry.id);
  }

  async function handleUpdateEntry(nextEntry: MealEntry) {
    if (user && goals && isFirebaseConfigured && user.id !== "dev_user") {
      try {
        await updateMealEntry(user.id, goals, nextEntry);
      } catch (error) {
        console.warn("Failed to update meal entry", error);
        Alert.alert(
          "Erro",
          "Não foi possível atualizar esta refeição no Firebase.",
        );
        throw error;
      }
    }
    updateEntry(nextEntry);
  }

  const logsByDate = React.useMemo(() => {
    const byDate = new Map(recentLogs.map((log) => [log.date, log]));
    if (todayLog) byDate.set(todayLog.date, todayLog);
    return byDate;
  }, [recentLogs, todayLog]);
  const selectedLog =
    logsByDate.get(selectedDate) ??
    (selectedDate === todayDate ? todayLog : undefined);
  const entries = selectedLog?.entries ?? [];
  const isViewingToday = selectedDate === todayDate;
  const groupedEntries = React.useMemo(() => {
    const periodOrder = new Map(
      MEAL_PERIODS.map((period, index) => [period.key, index]),
    );
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        icon: string;
        period: MealPeriod;
        entries: MealEntry[];
        latest: number;
      }
    >();

    entries.forEach((entry) => {
      const period = getEntryMealPeriod(entry);
      const periodConfig =
        MEAL_PERIODS.find((item) => item.key === period) ?? MEAL_PERIODS[0];
      const key = entry.mealGroupId ?? `legacy_${period}`;
      const latest = new Date(entry.addedAt).getTime();
      const current = groups.get(key);
      if (current) {
        current.entries.push(entry);
        current.latest = Math.max(current.latest, latest);
        return;
      }
      groups.set(key, {
        key,
        label: entry.mealGroupLabel ?? periodConfig.label,
        icon: periodConfig.icon,
        period,
        entries: [entry],
        latest,
      });
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        entries: group.entries
          .slice()
          .sort(
            (a, b) =>
              new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
          ),
      }))
      .sort(
        (a, b) =>
          (periodOrder.get(a.period) ?? 99) -
            (periodOrder.get(b.period) ?? 99) || b.latest - a.latest,
      );
  }, [entries]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerTitle}>Registrar refeição</Text>
          {pendingSyncCount > 0 ? (
            <Text style={styles.headerSubtitle}>Sincronização pendente</Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          {pendingSyncCount > 0 ? (
            <View style={styles.pendingPill}>
              <MaterialIcons
                name="cloud-off"
                size={16}
                color={Colors.warning}
              />
              <Text style={styles.pendingPillText}>{pendingSyncCount}</Text>
            </View>
          ) : (
            <View style={styles.syncedPill}>
              <MaterialIcons
                name="cloud-done"
                size={16}
                color={Colors.green600}
              />
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: fabBottomOffset + 96 },
        ]}
        onScrollBeginDrag={closeActionMenu}
      >
        <View style={styles.datePanel}>
          <View style={styles.datePanelHeader}>
            <View>
              <Text style={styles.sectionLabel}>Histórico de refeições</Text>
              <Text style={styles.datePanelTitle}>
                {isViewingToday ? "Hoje" : formatLogDateLabel(selectedDate)}
              </Text>
            </View>
            <View style={styles.dateTotalPill}>
              <Text style={styles.dateTotalKcal}>
                {Math.round(selectedLog?.totalNutrition?.kcal ?? 0)}
              </Text>
              <Text style={styles.dateTotalLabel}>kcal</Text>
            </View>
          </View>
          <ScrollView
            ref={dateScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={() =>
              dateScrollRef.current?.scrollToEnd({ animated: false })
            }
          >
            <View style={styles.dateChips}>
              {recentDates.map((date) => {
                const chip = formatDateChip(date);
                const active = selectedDate === date;
                const hasLog = logsByDate.has(date);
                return (
                  <TouchableOpacity
                    key={date}
                    style={[styles.dateChip, active && styles.dateChipActive]}
                    onPress={() => setSelectedDate(date)}
                  >
                    <Text
                      style={[
                        styles.dateChipWeekday,
                        active && styles.dateChipTextActive,
                      ]}
                    >
                      {date === todayDate ? "hoje" : chip.weekday}
                    </Text>
                    <Text
                      style={[
                        styles.dateChipDay,
                        active && styles.dateChipTextActive,
                      ]}
                    >
                      {chip.day}
                    </Text>
                    <View
                      style={[
                        styles.dateChipDot,
                        hasLog && styles.dateChipDotFilled,
                        active && styles.dateChipDotActive,
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Saved meals */}
        {isViewingToday && savedMeals.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Refeições salvas</Text>
            {savedMeals.map((m) => (
              <View key={m.id} style={styles.savedCard}>
                <View style={styles.savedLeft}>
                  <View style={styles.savedEmoji}>
                    <FoodIcon name={m.name} emoji={m.emoji} />
                  </View>
                  <View>
                    <Text style={styles.savedName}>{m.name}</Text>
                    <Text style={styles.savedInfo}>
                      {formatNutritionDetails(m.totalNutrition, {
                        includeKcal: true,
                      })}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.quickAddBtn}
                  onPress={() => quickAdd(m.id)}
                >
                  <Text style={styles.quickAddTxt}>+ Adicionar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionLabel}>
          {isViewingToday ? "Registro de hoje" : "Registro do dia"} (
          {entries.length})
        </Text>
        {entries.length === 0 ? (
          <View style={styles.emptyLog}>
            <Text style={styles.emptyLogText}>
              Nenhum alimento registrado nesta data
            </Text>
          </View>
        ) : (
          <View style={styles.logList}>
            {groupedEntries.map((group) => (
              <View key={group.key} style={logStyle.group}>
                <View style={logStyle.groupHeader}>
                  <MaterialIcons
                    name={group.icon as any}
                    size={18}
                    color={Colors.green600}
                  />
                  <Text style={logStyle.groupTitle}>{group.label}</Text>
                  <Text style={logStyle.groupCount}>
                    {group.entries.length}
                  </Text>
                </View>
                {group.entries.map((entry) => (
                  <TodayEntry
                    key={entry.id}
                    entry={entry}
                    onEdit={
                      isViewingToday ? () => setEditingEntry(entry) : undefined
                    }
                    onDelete={
                      isViewingToday
                        ? () => handleDeleteEntry(entry)
                        : undefined
                    }
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {actionMenuOpen ? (
        <TouchableOpacity
          style={styles.fabBackdrop}
          activeOpacity={1}
          onPress={closeActionMenu}
          accessibilityLabel="Fechar ações rápidas"
        />
      ) : null}

      <View
        pointerEvents="box-none"
        style={[styles.fabLayer, { bottom: fabBottomOffset }]}
      >
        <View pointerEvents="box-none" style={styles.fabInner}>
          <Animated.View
            pointerEvents={actionMenuOpen ? "auto" : "none"}
            style={[
              styles.fabActions,
              {
                opacity: fabAnimation,
                transform: [
                  { translateY: fabMenuTranslateY },
                  { scale: fabMenuScale },
                ],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.fabActionItem}
              onPress={openManualMeal}
              accessibilityRole="button"
              accessibilityLabel="Adicionar refeição manualmente"
            >
              <View style={styles.fabActionLabel}>
                <Text style={styles.fabActionText}>Adicionar refeição</Text>
              </View>
              <View style={styles.fabActionButton}>
                <MaterialIcons
                  name="edit-note"
                  size={22}
                  color={Colors.green600}
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.fabActionItem,
                !onWaterOpen && styles.fabActionDisabled,
              ]}
              onPress={openWater}
              disabled={!onWaterOpen}
              accessibilityRole="button"
              accessibilityLabel="Adicionar água"
            >
              <View style={styles.fabActionLabel}>
                <Text style={styles.fabActionText}>Adicionar água</Text>
              </View>
              <View style={styles.fabActionButton}>
                <MaterialIcons
                  name="local-drink"
                  size={22}
                  color={Colors.green600}
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.fabActionItem}
              onPress={openPhotoMeal}
              accessibilityRole="button"
              accessibilityLabel="Adicionar refeição por foto"
            >
              <View style={styles.fabActionLabel}>
                <Text style={styles.fabActionText}>Adicionar por foto</Text>
              </View>
              <View style={styles.fabActionButton}>
                <MaterialIcons
                  name="photo-camera"
                  size={22}
                  color={Colors.green600}
                />
              </View>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={[styles.fabButton, actionMenuOpen && styles.fabButtonOpen]}
            onPress={toggleActionMenu}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={
              actionMenuOpen
                ? "Fechar opções de registro"
                : "Abrir opções de registro"
            }
            accessibilityState={{ expanded: actionMenuOpen }}
          >
            <Animated.View style={{ transform: [{ rotate: fabIconRotation }] }}>
              <MaterialIcons name="add" size={32} color={Colors.white} />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      <AddMealModal
        visible={addModal}
        onClose={() => setAddModal(false)}
        onAdded={handleMealAdded}
        customFoods={customFoods}
        onCreateFood={handleCreateFood}
      />
      <PhotoModal
        visible={photoModal}
        onClose={() => setPhotoModal(false)}
        onConfirm={handlePhotoConfirm}
        customFoods={customFoods}
        onCreateFood={handleCreateFood}
      />
      {onAddWater && onWaterClose ? (
        <WaterModal
          visible={waterOpen}
          onClose={onWaterClose}
          onAdd={onAddWater}
        />
      ) : null}
      <EditMealEntryModal
        visible={Boolean(editingEntry)}
        entry={editingEntry}
        customFoods={customFoods}
        onClose={() => setEditingEntry(null)}
        onSave={handleUpdateEntry}
      />
    </SafeAreaView>
  );
}

export default AddMealScreen;
