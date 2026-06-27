import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { isFirebaseConfigured } from '../config';
import { normalizeNickname, saveUserProfile, signOut, validateNickname } from '../services/authService';
import { respondNutritionistInvite, subscribePatientAcceptedNutritionistLinks, subscribePatientNutritionistInvites } from '../services/nutritionistLinkService';
import { subscribeUnreadChatCountByLink } from '../services/nutritionistChatService';
import { subscribePatientFoodPlans } from '../services/nutritionistService';
import { saveMealEntryOrQueue } from '../services/pendingSyncService';
import { markNotificationsRead, subscribePatientNotifications } from '../services/groupService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NativeDatePicker } from '../components/NativeDatePicker';
import { NutritionistChatModal } from '../components/NutritionistChatModal';
import { ShoppingPdfModal } from '../components/ShoppingPdfModal';
import { NutritionDataHelpModal } from '../components/NutritionDataHelpModal';
import { useStore, selectGoals, selectNotifications, selectTodayLog, selectUnreadCount } from '../store';
import { calcMacroGoals, formatBrasiliaDate, formatKcal, formatGrams, formatNutritionDetails, getBrasiliaHour, macroPercent, generateId } from '../utils/nutrition';
import {
  buildValidatedProfileValues,
  birthDateFromAge,
  birthDateToDate,
  calculateAgeFromBirthDate,
  dateToBirthDateString,
  formatBirthDateInput,
  formatHeightInput,
  formatWeightInput,
  maskBirthDateInput,
  maskHeightInput,
  maskNameInput,
  maskWeightInput,
  normalizeBirthDateInput,
  parseProfileNumber,
  validateProfileBasics,
} from '../utils/profileValidation';
import { ActivityLevel, BiologicalSex, FoodNutrition, FoodPlan, FoodPlanMeal, FoodPlanMealSubstitution, GoalType, MacroGoals, MealEntry, NutritionistPatientLink, UserProfile } from '../types';

const RING_SIZE = 160;
const RING_STROKE = 14;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

const DEFAULT_GOALS: MacroGoals = {
  kcal: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  fiber: 25,
  water: 2500,
  sugar: 50,
  sodium: 2300,
  calcium: 1000,
  iron: 18,
  potassium: 2600,
  magnesium: 320,
  zinc: 8,
  vitaminA: 700,
  vitaminC: 75,
  vitaminD: 15,
  vitaminE: 15,
  vitaminB12: 2.4,
  folate: 400,
};

type EditableGoalKey = keyof MacroGoals;

const EDITABLE_GOAL_ROWS: {
  key: EditableGoalKey;
  label: string;
  unit: string;
}[] = [
  { key: 'kcal', label: 'Calorias', unit: 'kcal' },
  { key: 'protein', label: 'Proteína', unit: 'g' },
  { key: 'carbs', label: 'Carboidratos', unit: 'g' },
  { key: 'fat', label: 'Gorduras', unit: 'g' },
  { key: 'fiber', label: 'Fibras', unit: 'g' },
  { key: 'water', label: 'Água', unit: 'ml' },
  { key: 'sugar', label: 'Açúcar máx.', unit: 'g' },
  { key: 'sodium', label: 'Sódio máx.', unit: 'mg' },
  { key: 'calcium', label: 'Cálcio', unit: 'mg' },
  { key: 'iron', label: 'Ferro', unit: 'mg' },
  { key: 'potassium', label: 'Potássio', unit: 'mg' },
  { key: 'magnesium', label: 'Magnésio', unit: 'mg' },
  { key: 'zinc', label: 'Zinco', unit: 'mg' },
  { key: 'vitaminA', label: 'Vitamina A', unit: 'mcg' },
  { key: 'vitaminC', label: 'Vitamina C', unit: 'mg' },
  { key: 'vitaminD', label: 'Vitamina D', unit: 'mcg' },
  { key: 'vitaminE', label: 'Vitamina E', unit: 'mg' },
  { key: 'vitaminB12', label: 'Vitamina B12', unit: 'mcg' },
  { key: 'folate', label: 'Folato', unit: 'mcg' },
];

type NutritionGoalMode = 'target' | 'limit';

type NutritionGoalRow = {
  key: keyof FoodNutrition | 'waterMl';
  label: string;
  unit: string;
  goal: number;
  mode: NutritionGoalMode;
  section: 'Energia e macros' | 'Limites' | 'Vitaminas e minerais';
  overPct?: number;
};

function formatNutritionValue(value: number, unit: string): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')}${unit}`;
}

function getNutritionGoalStatus(current: number, goal: number, mode: NutritionGoalMode, overPct = 110) {
  const pct = goal > 0 ? Math.round((current / goal) * 100) : 0;

  if (mode === 'limit') {
    if (current > goal) return { pct, label: 'Passou', color: Colors.danger, bg: Colors.proteinL };
    if (current > 0) return { pct, label: 'Bom', color: Colors.green600, bg: Colors.green50 };
    return { pct, label: 'Sem consumo', color: Colors.gray400, bg: Colors.gray50 };
  }

  if (pct > overPct) return { pct, label: 'Passou', color: Colors.warning, bg: Colors.fatL };
  if (pct >= 90) return { pct, label: 'Bom', color: Colors.green600, bg: Colors.green50 };
  return { pct, label: 'Em progresso', color: Colors.info, bg: Colors.carbsL };
}

function RingChart({ pct, color }: { pct: number; color: string }) {
  const dash = (pct / 100) * CIRCUMFERENCE;
  const centerPoint = RING_SIZE / 2;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle
        cx={centerPoint}
        cy={centerPoint}
        r={RING_R}
        stroke={Colors.gray50}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <Circle
        cx={centerPoint}
        cy={centerPoint}
        r={RING_R}
        stroke={color}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${centerPoint} ${centerPoint})`}
      />
    </Svg>
  );
}

function NutritionGoalTable({
  rows,
  totals,
  waterMl,
}: {
  rows: NutritionGoalRow[];
  totals: FoodNutrition;
  waterMl: number;
}) {
  const sections = ['Energia e macros', 'Limites', 'Vitaminas e minerais'] as const;

  return (
    <View style={styles.nutritionPanel}>
      <View style={styles.nutritionHeader}>
        <View>
          <Text style={styles.nutritionTitle}>Metas e nutrientes</Text>
          <Text style={styles.nutritionSubtitle}>Resumo diário no estilo rótulo nutricional</Text>
        </View>
      </View>

      {sections.map((section) => {
        const sectionRows = rows.filter((row) => row.section === section);
        return (
          <View key={section} style={styles.nutritionSection}>
            <Text style={styles.nutritionSectionTitle}>{section}</Text>
            {sectionRows.map((row) => {
              const current = row.key === 'waterMl' ? waterMl : ((totals[row.key] as number | undefined) ?? 0);
              const status = getNutritionGoalStatus(current, row.goal, row.mode, row.overPct);
              const barPct = Math.min(status.pct, 100);

              return (
                <View key={row.key} style={styles.nutritionRow}>
                  <View style={styles.nutritionRowTop}>
                    <Text style={styles.nutritionName}>{row.label}</Text>
                    <Text style={styles.nutritionValues}>
                      {formatNutritionValue(current, row.unit)}
                      <Text style={styles.nutritionGoalText}> / {formatNutritionValue(row.goal, row.unit)}</Text>
                    </Text>
                  </View>
                  <View style={styles.nutritionMetaRow}>
                    <View style={styles.nutritionBarBg}>
                      <View style={[styles.nutritionBarFill, { width: `${barPct}%`, backgroundColor: status.color }]} />
                    </View>
                    <Text style={[styles.nutritionStatus, { color: status.color, backgroundColor: status.bg }]}>{status.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function parseNumber(value: string, fallback: number) {
  return parseProfileNumber(value, fallback);
}

function formatGoalInputs(goals: MacroGoals): Record<EditableGoalKey, string> {
  return EDITABLE_GOAL_ROWS.reduce(
    (inputs, item) => ({
      ...inputs,
      [item.key]: typeof goals[item.key] === 'number' ? String(goals[item.key]) : '',
    }),
    {} as Record<EditableGoalKey, string>,
  );
}

function buildGoalsFromInputs(
  inputs: Record<EditableGoalKey, string>,
  fallback: MacroGoals = DEFAULT_GOALS,
): MacroGoals {
  const goals = { ...fallback } as MacroGoals;
  EDITABLE_GOAL_ROWS.forEach(({ key }) => {
    const fallbackValue = fallback[key] ?? DEFAULT_GOALS[key] ?? 0;
    const value = parseNumber(inputs[key], typeof fallbackValue === 'number' ? fallbackValue : 0);
    goals[key] = Math.round(value) as never;
  });
  return goals;
}

function makeFoodPlanMealKey(planId: string, meal: FoodPlanMeal, mealIndex: number) {
  return `${planId}_${mealIndex}_${meal.period}_${meal.title}`;
}

function makeLegacyFoodPlanMealKey(planId: string, meal: FoodPlanMeal) {
  return `${planId}_${meal.period}_${meal.title}`;
}

function FoodPlanCard({
  plan,
  completingMealKey,
  onCompleteMeal,
  onOpenShoppingPdf,
  selectedOptions,
  openOptionKey,
  skippedMealKeys,
  completedMealKeys,
  onSelectOption,
  onToggleOptions,
  onSkipMeal,
}: {
  plan: FoodPlan;
  completingMealKey?: string | null;
  onCompleteMeal: (plan: FoodPlan, meal: FoodPlanMeal, mealIndex: number) => void;
  onOpenShoppingPdf: () => void;
  selectedOptions: Record<string, string>;
  openOptionKey: string | null;
  skippedMealKeys: Record<string, boolean>;
  completedMealKeys: Record<string, boolean>;
  onSelectOption: (mealKey: string, optionId: string) => void;
  onToggleOptions: (mealKey: string) => void;
  onSkipMeal: (mealKey: string) => void;
}) {
  const plannedMeals = plan.meals.map((meal, index) => ({
    meal,
    index,
    key: makeFoodPlanMealKey(plan.id, meal, index),
    legacyKey: makeLegacyFoodPlanMealKey(plan.id, meal),
  }));
  const legacyKeyCounts = plannedMeals.reduce<Record<string, number>>((counts, item) => {
    counts[item.legacyKey] = (counts[item.legacyKey] ?? 0) + 1;
    return counts;
  }, {});
  const isMealCompleted = (item: { key: string; legacyKey: string }) =>
    completedMealKeys[item.key] || (legacyKeyCounts[item.legacyKey] === 1 && completedMealKeys[item.legacyKey]);
  const mealOptions = (meal: FoodPlanMeal) => [
    {
      id: 'main',
      title: 'Opção principal',
      items: meal.items,
      totalNutrition: meal.totalNutrition,
      instructions: meal.instructions,
    },
    ...(meal.substitutions ?? []),
  ];
  const selectedMealFromOption = (
    meal: FoodPlanMeal,
    option: FoodPlanMealSubstitution | {
      id: string;
      title: string;
      items: FoodPlanMeal['items'];
      totalNutrition?: FoodNutrition;
      instructions?: string;
    },
  ): FoodPlanMeal => ({
    ...meal,
    instructions: option.instructions ?? meal.instructions,
    items: option.items,
    totalNutrition: option.totalNutrition,
  });
  const visibleMeals = plannedMeals
    .filter((item) => !isMealCompleted(item))
    .slice(0, 2);

  return (
    <View style={styles.foodPlanPanel}>
      <View style={styles.foodPlanHeader}>
        <View>
          <Text style={styles.foodPlanEyebrow}>Plano alimentar</Text>
          <Text style={styles.foodPlanTitle}>{plan.title}</Text>
        </View>
        <Text style={styles.foodPlanAuthor}>{plan.nutritionistName}</Text>
      </View>
      {plan.notes ? <Text style={styles.foodPlanNotes}>{plan.notes}</Text> : null}
      {visibleMeals.length === 0 ? (
        <View style={styles.foodPlanCompleteBox}>
          <MaterialIcons name="task-alt" size={22} color={Colors.green600} />
          <Text style={styles.foodPlanCompleteText}>
            Todas as refeições do plano foram marcadas hoje.
          </Text>
        </View>
      ) : null}
      {visibleMeals.map(({ meal, index, key, legacyKey }) => {
        const options = mealOptions(meal);
        const selectedOptionId = selectedOptions[key] ?? 'main';
        const selectedOption =
          options.find((option) => option.id === selectedOptionId) ?? options[0];
        const selectedMeal = selectedMealFromOption(meal, selectedOption);
        const isSkipped = skippedMealKeys[key];
        const isCompleted = isMealCompleted({ key, legacyKey });
        const isCompleting = completingMealKey === key;

        return (
          <View key={key} style={[styles.foodPlanMeal, isSkipped && styles.foodPlanMealSkipped]}>
            <View style={styles.foodPlanMealHeader}>
              <View style={styles.foodPlanMealHeaderText}>
                <Text style={styles.foodPlanMealTitle}>{meal.time ? `${meal.time} · ${meal.title}` : meal.title}</Text>
                <Text style={styles.foodPlanOptionLabel}>{selectedOption.title}</Text>
              </View>
            <View style={styles.foodPlanMealHeaderActions}>
              <TouchableOpacity
                style={styles.foodPlanShoppingIconBtn}
                onPress={onOpenShoppingPdf}
                accessibilityRole="button"
                accessibilityLabel="Abrir lista de compras em PDF"
              >
                <MaterialIcons name="picture-as-pdf" size={19} color={Colors.green600} />
              </TouchableOpacity>
              {options.length > 1 ? (
              <TouchableOpacity
                style={styles.foodPlanDropdownBtn}
                onPress={() => onToggleOptions(key)}
                  accessibilityRole="button"
                  accessibilityLabel="Selecionar opção da refeição"
                >
                  <MaterialIcons
                    name={openOptionKey === key ? 'expand-less' : 'expand-more'}
                    size={20}
                  color={Colors.green600}
                />
              </TouchableOpacity>
              ) : null}
            </View>
          </View>
            {openOptionKey === key ? (
              <View style={styles.foodPlanDropdown}>
                {options.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.foodPlanDropdownItem,
                      selectedOption.id === option.id && styles.foodPlanDropdownItemActive,
                    ]}
                    onPress={() => onSelectOption(key, option.id)}
                  >
                    <Text
                      style={[
                        styles.foodPlanDropdownText,
                        selectedOption.id === option.id && styles.foodPlanDropdownTextActive,
                      ]}
                    >
                      {option.title}
                    </Text>
                    {selectedOption.id === option.id ? (
                      <MaterialIcons name="check" size={18} color={Colors.green600} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <Text style={styles.foodPlanMealItems}>
              {selectedMeal.items.map((item) => `${item.quantity} ${item.name}`.trim()).join(', ')}
            </Text>
            {selectedMeal.totalNutrition ? (
              <Text style={styles.foodPlanMealNutrition}>{formatNutritionDetails(selectedMeal.totalNutrition, { includeKcal: true })}</Text>
            ) : null}
            <View style={styles.foodPlanMealActions}>
              <TouchableOpacity
                style={[styles.foodPlanSkipBtn, isSkipped && styles.foodPlanSkipBtnActive]}
                onPress={() => onSkipMeal(key)}
              >
                <MaterialIcons name="skip-next" size={18} color={isSkipped ? Colors.white : Colors.gray600} />
                <Text style={[styles.foodPlanSkipText, isSkipped && styles.foodPlanSkipTextActive]}>
                  {isSkipped ? 'Pulada' : 'Pular'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.foodPlanDoneBtn,
                  isCompleted && styles.foodPlanDoneBtnCompleted,
                  (isCompleting || isSkipped || isCompleted) && styles.foodPlanDoneBtnDisabled,
                ]}
                onPress={() => onCompleteMeal(plan, selectedMeal, index)}
                disabled={isCompleting || isSkipped || isCompleted}
              >
                <MaterialIcons name={isCompleted ? 'task-alt' : 'check-circle'} size={18} color={Colors.white} />
                <Text style={styles.foodPlanDoneText}>
                  {isCompleted ? 'Refeição marcada' : isCompleting ? 'Registrando...' : 'Fiz esta refeição'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}
function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const goals = useStore(selectGoals);
  const setUser = useStore((s) => s.setUser);
  const setProfile = useStore((s) => s.setProfile);
  const setGoals = useStore((s) => s.setGoals);

  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [sex, setSex] = useState<BiologicalSex>('M');
  const [goalType, setGoalType] = useState<GoalType>('maintain');
  const [activity, setActivity] = useState<ActivityLevel>(1.55);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [goalInputs, setGoalInputs] = useState<Record<EditableGoalKey, string>>(
    formatGoalInputs(DEFAULT_GOALS),
  );
  const [saving, setSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [birthDateEditing, setBirthDateEditing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const activeGoals = { ...DEFAULT_GOALS, ...(profile?.macroGoals ?? goals ?? {}) };
    setName(profile?.name ?? user?.name ?? '');
    setNickname(profile?.nickname ?? user?.nickname ?? '');
    setBirthDate(profile?.birthDate ?? (profile?.age ? birthDateFromAge(profile.age) : ''));
    setBirthDateEditing(false);
    setWeight(formatWeightInput(profile?.weight));
    setHeight(formatHeightInput(profile?.height));
    setSex(profile?.sex ?? 'M');
    setGoalType(profile?.goal ?? 'maintain');
    setActivity(profile?.activityLevel ?? 1.55);
    setAvatarUrl(user?.avatarUrl);
    setGoalInputs(formatGoalInputs(activeGoals));
  }, [visible, goals, profile, user]);

  function updateGoalInput(key: EditableGoalKey, value: string) {
    setGoalInputs((current) => ({ ...current, [key]: value }));
  }

  function buildProfile(): UserProfile | null {
    if (!user) return null;
    const normalizedBirthDate = normalizeBirthDateInput(birthDate);
    const error = validateProfileBasics({ name, birthDate: normalizedBirthDate, weight, height });
    if (error) {
      Alert.alert('Confira seus dados', error);
      return null;
    }
    const nicknameValue = nickname.trim();
    const nicknameError = nicknameValue ? validateNickname(nicknameValue) : null;
    if (nicknameError) {
      Alert.alert('Confira seu nickname', nicknameError);
      return null;
    }
    const profileValues = buildValidatedProfileValues({ birthDate: normalizedBirthDate, weight, height, fallback: profile ?? undefined });
    const nextProfile: UserProfile = {
      userId: user.id,
      name: name.trim() || user.name,
      nickname: nicknameValue ? normalizeNickname(nicknameValue) : undefined,
      birthDate: profileValues.birthDate,
      age: profileValues.age,
      weight: profileValues.weight,
      height: profileValues.height,
      sex,
      goal: goalType,
      activityLevel: activity,
      onboardingComplete: true,
      groupIds: profile?.groupIds ?? [],
      macroGoals: profile?.macroGoals,
      communityPrivacy: profile?.communityPrivacy ?? {
        showProtein: true,
        showFiber: true,
        showCalories: true,
        showStreak: true,
        showLimits: true,
      },
      createdAt: profile?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    return nextProfile;
  }

  function handleRecalculateGoals() {
    const nextProfile = buildProfile();
    if (!nextProfile) return;
    const calculated = calcMacroGoals(nextProfile);
    setGoalInputs(formatGoalInputs(calculated));
  }

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para escolher uma imagem de perfil.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });

    if (!result.canceled) {
      setAvatarUrl(result.assets[0]?.uri);
    }
  }

  async function handleSave() {
    if (!user) return;
    const nextProfile = buildProfile();
    if (!nextProfile) return;

    const nextGoals = buildGoalsFromInputs(goalInputs, {
      ...DEFAULT_GOALS,
      ...(profile?.macroGoals ?? goals ?? {}),
    });
    const profileToSave: UserProfile = { ...nextProfile, macroGoals: nextGoals };

    setSaving(true);
    try {
      if (isFirebaseConfigured && user.id !== 'dev_user') {
        const savedNickname = await saveUserProfile(profileToSave);
        profileToSave.nickname = savedNickname;
      }
      setProfile(profileToSave);
      setGoals(nextGoals);
      setUser({ ...user, name: profileToSave.name, nickname: profileToSave.nickname, avatarUrl });
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message === 'nickname_taken') {
        Alert.alert('Nickname indisponível', 'Esse nickname já está em uso. Escolha outro.');
      } else {
        Alert.alert('Erro', 'Não foi possível salvar as configurações.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.bg}>
        <TouchableOpacity style={modalStyles.backdrop} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Configurações</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={modalStyles.scroll}>
            <View style={modalStyles.photoRow}>
              <TouchableOpacity style={modalStyles.photoButton} onPress={handlePickPhoto}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={modalStyles.photo} />
                ) : (
                  <Text style={modalStyles.photoInitials}>
                    {(name || user?.name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={modalStyles.profileInfo}>
                <TextInput
                  style={modalStyles.profileNameInput}
                  value={name}
                  onChangeText={(v) => setName(maskNameInput(v))}
                  placeholder="Seu nome"
                  placeholderTextColor={Colors.gray400}
                  autoCapitalize="words"
                />
                <View style={modalStyles.nicknameRow}>
                  <Text style={modalStyles.nicknamePrefix}>@</Text>
                  <TextInput
                    style={modalStyles.nicknameInput}
                    value={nickname}
                    onChangeText={(v) => setNickname(normalizeNickname(v))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="nickname"
                    placeholderTextColor={Colors.gray400}
                    maxLength={20}
                  />
                </View>
                {birthDateEditing || !birthDate ? (
                  <View style={modalStyles.birthDateRow}>
                    <TextInput
                      style={modalStyles.birthDateInput}
                      value={birthDate.includes('-') ? formatBirthDateInput(birthDate) : birthDate}
                      onChangeText={(value) => setBirthDate(maskBirthDateInput(value))}
                      placeholder="Data de nascimento"
                      placeholderTextColor={Colors.gray400}
                      keyboardType="numeric"
                      maxLength={10}
                      onBlur={() => {
                        if (birthDate) setBirthDateEditing(false);
                      }}
                    />
                    {Platform.OS !== 'web' ? (
                      <TouchableOpacity style={modalStyles.datePickerBtn} onPress={() => setDatePickerOpen(true)}>
                        <MaterialIcons name="calendar-today" size={18} color={Colors.green600} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={modalStyles.birthDateDisplay}
                    onPress={() => {
                      setBirthDateEditing(true);
                      if (Platform.OS !== 'web') setDatePickerOpen(true);
                    }}
                  >
                    <MaterialIcons name="cake" size={16} color={Colors.gray400} />
                    <Text style={modalStyles.birthDateText}>{formatBirthDateInput(birthDate)}</Text>
                    <MaterialIcons name="edit" size={15} color={Colors.green600} />
                  </TouchableOpacity>
                )}
                {datePickerOpen && Platform.OS !== 'web' ? (
                  <NativeDatePicker
                    value={birthDateToDate(birthDate)}
                    maximumDate={new Date()}
                    onChange={(date, dismissed) => {
                      setDatePickerOpen(false);
                      setBirthDateEditing(false);
                      if (!dismissed && date) setBirthDate(dateToBirthDateString(date));
                    }}
                  />
                ) : null}
              </View>
              <View style={modalStyles.ageCard}>
                <Text style={modalStyles.ageValue}>
                  {calculateAgeFromBirthDate(birthDate) || '--'}
                </Text>
                <Text style={modalStyles.ageLabel}>anos</Text>
              </View>
            </View>

            <Text style={modalStyles.sectionTitle}>Dados do corpo</Text>
            <View style={modalStyles.fieldGrid}>
              <Field label="Peso (kg)" value={weight} onChangeText={(v) => setWeight(maskWeightInput(v))} keyboardType="decimal-pad" placeholder="85,5" />
              <Field label="Altura (m)" value={height} onChangeText={(v) => setHeight(maskHeightInput(v))} keyboardType="numeric" maxLength={4} placeholder="1,85" />
            </View>

            <Text style={modalStyles.label}>Sexo biológico</Text>
            <View style={modalStyles.segmentRow}>
              {(['M', 'F'] as BiologicalSex[]).map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[modalStyles.segment, sex === item && modalStyles.segmentActive]}
                  onPress={() => setSex(item)}
                >
                  <Text style={[modalStyles.segmentText, sex === item && modalStyles.segmentTextActive]}>
                    {item === 'M' ? 'Masculino' : 'Feminino'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={modalStyles.label}>Objetivo</Text>
            <View style={modalStyles.segmentWrap}>
              {[
                ['deficit', 'Emagrecer'],
                ['maintain', 'Manter'],
                ['muscle', 'Massa'],
                ['bulk', 'Volume'],
              ].map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[modalStyles.pill, goalType === value && modalStyles.pillActive]}
                  onPress={() => setGoalType(value as GoalType)}
                >
                  <Text style={[modalStyles.pillText, goalType === value && modalStyles.pillTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={modalStyles.label}>Atividade</Text>
            <View style={modalStyles.segmentWrap}>
              {[
                [1.2, 'Sedentário'],
                [1.375, 'Leve'],
                [1.55, 'Moderado'],
                [1.725, 'Intenso'],
                [1.9, 'Atleta'],
              ].map(([value, label]) => (
                <TouchableOpacity
                  key={String(value)}
                  style={[modalStyles.pill, activity === value && modalStyles.pillActive]}
                  onPress={() => setActivity(value as ActivityLevel)}
                >
                  <Text style={[modalStyles.pillText, activity === value && modalStyles.pillTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={modalStyles.sectionHeaderRow}>
              <View>
                <Text style={modalStyles.sectionTitle}>Metas nutricionais</Text>
                <Text style={modalStyles.sectionHint}>Edite manualmente ou recalcule pelos dados acima.</Text>
              </View>
              <View style={modalStyles.goalActionRow}>
                <TouchableOpacity
                  style={modalStyles.recalcBtn}
                  onPress={handleRecalculateGoals}
                  accessibilityRole="button"
                  accessibilityLabel="Recalcular metas nutricionais"
                >
                  <MaterialIcons name="refresh" size={20} color={Colors.green600} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={modalStyles.fieldGrid}>
              {EDITABLE_GOAL_ROWS.map((item) => (
                <Field
                  key={item.key}
                  label={item.label}
                  value={goalInputs[item.key]}
                  onChangeText={(value) => updateGoalInput(item.key, value)}
                  keyboardType="numeric"
                  suffix={item.unit}
                />
              ))}
            </View>
          </ScrollView>

          <View style={modalStyles.actions}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.saveBtn} onPress={handleSave} disabled={saving}>
              <Text style={modalStyles.saveText}>{saving ? 'Salvando...' : 'Salvar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  suffix,
  ...props
}: {
  label: string;
  suffix?: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={modalStyles.fieldWrap}>
      <Text style={modalStyles.label}>{label}</Text>
      <View style={modalStyles.inputRow}>
        <TextInput
          {...props}
          style={modalStyles.input}
          placeholderTextColor={Colors.gray400}
        />
        {suffix && <Text style={modalStyles.suffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

function NotificationsModal({
  visible,
  onClose,
  nutritionistInvites,
  chatLinks,
  unreadChatCounts,
  onRespondInvite,
  onOpenChat,
}: {
  visible: boolean;
  onClose: () => void;
  nutritionistInvites: NutritionistPatientLink[];
  chatLinks: NutritionistPatientLink[];
  unreadChatCounts: Record<string, number>;
  onRespondInvite: (linkId: string, status: 'accepted' | 'rejected') => void;
  onOpenChat: (link: NutritionistPatientLink) => void;
}) {
  const notifications = useStore(selectNotifications);
  const unreadChatLinks = chatLinks.filter((link) => (unreadChatCounts[link.id] ?? 0) > 0);
  const hasItems = notifications.length > 0 || nutritionistInvites.length > 0 || unreadChatLinks.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.bg}>
        <TouchableOpacity style={modalStyles.backdrop} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Notificações</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={modalStyles.scroll}>
            {!hasItems ? (
              <View style={modalStyles.emptyNotice}>
                <MaterialIcons name="notifications-none" size={34} color={Colors.gray400} />
                <Text style={modalStyles.emptyNoticeText}>Feedbacks e dicas aparecerão aqui.</Text>
              </View>
            ) : (
              <>
                {unreadChatLinks.map((link) => {
                  const unread = unreadChatCounts[link.id] ?? 0;
                  return (
                    <TouchableOpacity
                      key={`chat_${link.id}`}
                      style={modalStyles.noticeCard}
                      onPress={() => onOpenChat(link)}
                    >
                      <Text style={modalStyles.noticeTitle}>Mensagem nova</Text>
                      <Text style={modalStyles.noticeText}>
                        {link.nutritionistName} enviou {unread} mensagem(ns) no chat.
                      </Text>
                      <Text style={modalStyles.noticeMeta}>Toque para abrir a conversa.</Text>
                    </TouchableOpacity>
                  );
                })}
                {nutritionistInvites.map((invite) => (
                  <View key={invite.id} style={modalStyles.noticeCard}>
                    <Text style={modalStyles.noticeTitle}>Solicitação de nutricionista</Text>
                    <Text style={modalStyles.noticeText}>
                      {invite.nutritionistName} quer acessar seus registros nutricionais para acompanhamento.
                    </Text>
                    <Text style={modalStyles.noticeMeta}>{invite.nutritionistEmail}</Text>
                    <View style={modalStyles.noticeActions}>
                      <TouchableOpacity style={modalStyles.noticeRejectBtn} onPress={() => onRespondInvite(invite.id, 'rejected')}>
                        <Text style={modalStyles.noticeRejectText}>Recusar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={modalStyles.noticeAcceptBtn} onPress={() => onRespondInvite(invite.id, 'accepted')}>
                        <Text style={modalStyles.noticeAcceptText}>Aceitar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {notifications.map((item) => (
                  <View key={item.id} style={[modalStyles.noticeCard, item.read && modalStyles.noticeCardRead]}>
                    <Text style={modalStyles.noticeTitle}>{item.userName || 'NutriMeta'}</Text>
                    <Text style={modalStyles.noticeText}>{item.message}</Text>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ChatsModal({
  visible,
  onClose,
  chatLinks,
  unreadChatCounts,
  onOpenChat,
}: {
  visible: boolean;
  onClose: () => void;
  chatLinks: NutritionistPatientLink[];
  unreadChatCounts: Record<string, number>;
  onOpenChat: (link: NutritionistPatientLink) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.bg}>
        <TouchableOpacity style={modalStyles.backdrop} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Chats</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={modalStyles.scroll}>
            {chatLinks.length === 0 ? (
              <View style={modalStyles.emptyNotice}>
                <MaterialIcons name="chat-bubble-outline" size={34} color={Colors.gray400} />
                <Text style={modalStyles.emptyNoticeText}>Seus chats iniciados aparecerão aqui.</Text>
              </View>
            ) : (
              chatLinks.map((link) => {
                const unread = unreadChatCounts[link.id] ?? 0;
                return (
                  <TouchableOpacity key={link.id} style={modalStyles.noticeCard} onPress={() => onOpenChat(link)}>
                    <Text style={modalStyles.noticeTitle}>Chat com nutricionista</Text>
                    <Text style={modalStyles.noticeText}>{link.nutritionistName}</Text>
                    <Text style={modalStyles.noticeMeta}>
                      {unread > 0 ? `${unread} mensagem(ns) nova(s)` : 'Toque para continuar a conversa'}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function WaterModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (amountMl: number) => void;
}) {
  const options = [
    { label: '100 ml', sub: 'alguns goles', amount: 100 },
    { label: '250 ml', sub: '1 copo', amount: 250 },
    { label: '500 ml', sub: 'garrafa pequena', amount: 500 },
    { label: '1 litro', sub: 'garrafa grande', amount: 1000 },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={waterStyles.bg}>
        <TouchableOpacity style={waterStyles.backdrop} onPress={onClose} />
        <View style={waterStyles.card}>
          <Text style={waterStyles.title}>Quanto de água você bebeu?</Text>
          <View style={waterStyles.grid}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.amount}
                style={waterStyles.option}
                onPress={() => {
                  onAdd(option.amount);
                  onClose();
                }}
              >
                <Text style={waterStyles.optionTitle}>{option.label}</Text>
                <Text style={waterStyles.optionSub}>{option.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function HomeScreen() {
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
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  const [chatLink, setChatLink] = useState<NutritionistPatientLink | null>(null);
  const [completingMealKey, setCompletingMealKey] = useState<string | null>(null);
  const [selectedFoodPlanOptions, setSelectedFoodPlanOptions] = useState<Record<string, string>>({});
  const [openFoodPlanOptionKey, setOpenFoodPlanOptionKey] = useState<string | null>(null);
  const [skippedFoodPlanMeals, setSkippedFoodPlanMeals] = useState<Record<string, boolean>>({});
  const [manuallyCompletedFoodPlanMeals, setManuallyCompletedFoodPlanMeals] = useState<Record<string, boolean>>({});
  const [shoppingPdfOpen, setShoppingPdfOpen] = useState(false);

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
    const completed: Record<string, boolean> = { ...manuallyCompletedFoodPlanMeals };
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
  }, [manuallyCompletedFoodPlanMeals, todayLog?.entries]);

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
      return undefined;
    }
    return subscribePatientFoodPlans(user.id, setFoodPlans);
  }, [user]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setNotifications([]);
      return undefined;
    }
    return subscribePatientNotifications(user.id, setNotifications);
  }, [setNotifications, user]);

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
  const initials = (profile?.name ?? user?.name ?? 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const unreadChatTotal = Object.values(unreadChatCounts).reduce((sum, count) => sum + count, 0);
  const latestFoodPlan = foodPlans[0] ?? null;

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
    if (!latestFoodPlan) {
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
  }

  function handleToggleFoodPlanOptions(mealKey: string) {
    setOpenFoodPlanOptionKey((current) => (current === mealKey ? null : mealKey));
  }

  function handleSkipFoodPlanMeal(mealKey: string) {
    setSkippedFoodPlanMeals((items) => ({
      ...items,
      [mealKey]: !items[mealKey],
    }));
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
    setManuallyCompletedFoodPlanMeals((items) => ({ ...items, [key]: true }));
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
      Alert.alert('Refeição registrada', 'A refeição recomendada foi adicionada ao seu dia.');
    } catch (error) {
      console.warn('Failed to complete food plan meal', error);
      setManuallyCompletedFoodPlanMeals((items) => {
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
        <View style={styles.headerActions}>
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
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
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

        {/* 2. Plano alimentar (só quando existir) */}
        {latestFoodPlan ? (
          <FoodPlanCard
            plan={latestFoodPlan}
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

        {/* 3. Tabela de metas e nutrientes */}
        <NutritionGoalTable rows={nutritionGoalRows} totals={totals} waterMl={waterMl} />
      </ScrollView>

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NutritionDataHelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} />
      <ShoppingPdfModal
        visible={shoppingPdfOpen}
        plan={latestFoodPlan}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    zIndex: 50,
    elevation: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  greeting: { fontSize: Typography.sm, color: Colors.gray400 },
  userName: { fontSize: Typography.xl, fontWeight: Typography.bold },
  dateLabel: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  headerActions: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  helpButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray50,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.green50,
    borderWidth: 1,
    borderColor: Colors.green100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMenu: {
    position: 'absolute',
    top: 50,
    right: 0,
    width: 190,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    paddingVertical: 6,
    zIndex: 100,
    ...Shadows.md,
  },
  headerMenuItem: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  headerMenuText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.gray800,
    fontWeight: Typography.semibold,
  },
  headerMenuTextDanger: { color: Colors.danger },
  headerMenuBadge: {
    minWidth: 22,
    overflow: 'hidden',
    borderRadius: Radius.full,
    backgroundColor: Colors.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    color: Colors.white,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    textAlign: 'center',
  },
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.green600 },
  gearBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.green600,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },

  scroll: { paddingBottom: 100 },
  ringSection: { backgroundColor: Colors.white, padding: Spacing.base, marginBottom: Spacing.sm },
  ringWrap: { alignItems: 'center', marginBottom: Spacing.md, position: 'relative' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringKcal: { fontSize: Typography.xxl, fontWeight: Typography.bold },
  ringKcalSub: { fontSize: Typography.xs, color: Colors.gray400 },
  ringGoal: { fontSize: Typography.sm, color: Colors.gray400 },
  remainRow: { flexDirection: 'row', justifyContent: 'space-around' },
  remainItem: { alignItems: 'center', flex: 1 },
  remainCenter: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.sm },
  remainVal: { fontSize: Typography.lg, fontWeight: Typography.bold },
  remainLabel: { fontSize: Typography.xs, color: Colors.gray400 },

  foodPlanPanel: {
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    ...Shadows.sm,
  },
  foodPlanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  foodPlanEyebrow: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.4 },
  foodPlanTitle: { marginTop: 2, fontSize: Typography.lg, color: Colors.gray800, fontWeight: Typography.bold },
  foodPlanAuthor: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.bold },
  foodPlanNotes: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 19, marginBottom: Spacing.sm },
  foodPlanCompleteBox: { minHeight: 58, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.green100, backgroundColor: Colors.green50, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm },
  foodPlanCompleteText: { flex: 1, fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.bold, lineHeight: 18 },
  foodPlanMeal: { backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.xs },
  foodPlanMealSkipped: { opacity: 0.72 },
  foodPlanMealHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
  foodPlanMealHeaderText: { flex: 1 },
  foodPlanMealTitle: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  foodPlanOptionLabel: { marginTop: 2, fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold },
  foodPlanMealHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foodPlanShoppingIconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green100 },
  foodPlanDropdownBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green100 },
  foodPlanDropdown: { marginTop: Spacing.xs, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Colors.white },
  foodPlanDropdownItem: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, paddingHorizontal: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  foodPlanDropdownItemActive: { backgroundColor: Colors.green50 },
  foodPlanDropdownText: { flex: 1, fontSize: Typography.sm, color: Colors.gray600, fontWeight: Typography.semibold },
  foodPlanDropdownTextActive: { color: Colors.green600 },
  foodPlanMealItems: { marginTop: 3, fontSize: Typography.xs, color: Colors.gray600, lineHeight: 17 },
  foodPlanMealNutrition: { marginTop: 4, fontSize: Typography.xs, color: Colors.gray400, lineHeight: 17 },
  foodPlanMealActions: { marginTop: Spacing.sm, flexDirection: 'row', gap: Spacing.xs },
  foodPlanSkipBtn: { minHeight: 38, paddingHorizontal: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  foodPlanSkipBtnActive: { backgroundColor: Colors.gray600, borderColor: Colors.gray600 },
  foodPlanSkipText: { color: Colors.gray600, fontSize: Typography.sm, fontWeight: Typography.bold },
  foodPlanSkipTextActive: { color: Colors.white },
  foodPlanDoneBtn: { flex: 1, minHeight: 38, borderRadius: Radius.md, backgroundColor: Colors.green400, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  foodPlanDoneBtnCompleted: { backgroundColor: Colors.green600 },
  foodPlanDoneBtnDisabled: { opacity: 0.65 },
  foodPlanDoneText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.bold },
  shoppingTitle: { marginTop: Spacing.sm, marginBottom: Spacing.xs, fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  shoppingItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: 5 },
  shoppingText: { flex: 1, fontSize: Typography.sm, color: Colors.gray600 },
  nutritionPanel: {
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  nutritionHeader: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  nutritionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  nutritionSubtitle: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  nutritionSection: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  nutritionSectionTitle: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 6,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.green600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    backgroundColor: Colors.green50,
  },
  nutritionRow: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  nutritionRowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  nutritionName: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gray800 },
  nutritionValues: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray800 },
  nutritionGoalText: { fontSize: Typography.xs, fontWeight: Typography.regular, color: Colors.gray400 },
  nutritionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 6 },
  nutritionBarBg: { flex: 1, height: 6, backgroundColor: Colors.gray50, borderRadius: Radius.full, overflow: 'hidden' },
  nutritionBarFill: { height: 6, borderRadius: Radius.full },
  nutritionStatus: {
    minWidth: 78,
    overflow: 'hidden',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    textAlign: 'center',
  },

});

const modalStyles = StyleSheet.create({
  bg: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '92%',
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 720 : undefined,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.base,
    paddingBottom: Spacing.lg,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.base },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  title: { fontSize: Typography.xl, fontWeight: Typography.bold },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  closeText: { fontSize: Typography.xl, color: Colors.gray600, lineHeight: 24 },
  scroll: { paddingBottom: Spacing.base },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  photoButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.green50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.green100 },
  photo: { width: 72, height: 72, borderRadius: 36 },
  photoInitials: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.green600 },
  profileInfo: { flex: 1, minWidth: 0, gap: 0, justifyContent: 'center' },
  profileNameInput: { minHeight: 23, padding: 0, fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.gray800 },
  nicknameRow: { flexDirection: 'row', alignItems: 'center' },
  nicknamePrefix: { fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.bold, marginRight: 1 },
  nicknameInput: { flex: 1, minHeight: 19, padding: 0, fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.semibold },
  birthDateDisplay: { minHeight: 23, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 },
  birthDateText: { fontSize: Typography.sm, color: Colors.gray600, fontWeight: Typography.semibold },
  birthDateRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  birthDateInput: { flex: 1, minHeight: 32, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, paddingHorizontal: Spacing.sm, fontSize: Typography.sm, color: Colors.gray800 },
  datePickerBtn: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green100 },
  ageCard: { width: 62, minHeight: 62, borderRadius: Radius.md, backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green100, alignItems: 'center', justifyContent: 'center' },
  ageValue: { fontSize: Typography.xl, color: Colors.green600, fontWeight: Typography.bold },
  ageLabel: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: Typography.semibold },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, marginBottom: 3 },
  sectionHint: { fontSize: Typography.xs, color: Colors.gray400, lineHeight: 16 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  fieldWrap: { width: '48%' },
  label: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.gray600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, backgroundColor: Colors.white },
  input: { flex: 1, paddingVertical: Spacing.sm, fontSize: Typography.base, color: Colors.gray800 },
  suffix: { fontSize: Typography.xs, color: Colors.gray400, marginLeft: 4 },
  segmentRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  segment: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.border },
  segmentActive: { backgroundColor: Colors.green50, borderColor: Colors.green400 },
  segmentText: { color: Colors.gray600, fontWeight: Typography.semibold },
  segmentTextActive: { color: Colors.green600 },
  segmentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.green50, borderColor: Colors.green400 },
  pillText: { color: Colors.gray600, fontWeight: Typography.semibold, fontSize: Typography.sm },
  pillTextActive: { color: Colors.green600 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  goalActionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.xs, flex: 1 },
  recalcBtn: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green400 },
  actions: { flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.gray600, fontWeight: Typography.semibold },
  saveBtn: { flex: 1.4, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.green400 },
  saveText: { color: Colors.white, fontWeight: Typography.bold },
  helpCard: {
    maxHeight: '82%',
    maxWidth: Platform.OS === 'web' ? 620 : undefined,
    marginHorizontal: Spacing.base,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    alignSelf: 'stretch',
  },
  helpScroll: { paddingBottom: Spacing.sm },
  helpIntro: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20, marginBottom: Spacing.md },
  helpBlock: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  helpBlockTitle: { fontSize: Typography.base, fontWeight: Typography.bold, marginBottom: 6 },
  helpText: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20 },
  sourceLink: {
    fontSize: Typography.sm,
    color: Colors.green600,
    fontWeight: Typography.semibold,
    lineHeight: 22,
    marginBottom: 8,
  },
  helpFootnote: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    lineHeight: 18,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  emptyNotice: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyNoticeText: { marginTop: Spacing.sm, fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center' },
  noticeCard: { backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  noticeCardRead: { opacity: 0.68 },
  noticeTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray800, marginBottom: 4 },
  noticeText: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 19 },
  noticeMeta: { marginTop: 4, fontSize: Typography.xs, color: Colors.gray400 },
  noticeActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.md },
  noticeRejectBtn: { borderWidth: 1, borderColor: Colors.borderMd, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  noticeRejectText: { fontSize: Typography.sm, color: Colors.gray600, fontWeight: Typography.bold },
  noticeAcceptBtn: { backgroundColor: Colors.green400, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  noticeAcceptText: { fontSize: Typography.sm, color: Colors.white, fontWeight: Typography.bold },
});

const waterStyles = StyleSheet.create({
  bg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.base },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  card: { width: '100%', maxWidth: 380, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.base, ...Shadows.lg },
  title: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.gray800, marginBottom: Spacing.md, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  option: { width: '48%', backgroundColor: Colors.carbsL, borderWidth: 1, borderColor: '#B9D8F4', borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  optionTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.info },
  optionSub: { marginTop: 3, fontSize: Typography.xs, color: Colors.gray600 },
});
