import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { isFirebaseConfigured } from '../config';
import { signOut } from '../services/authService';
import { createFoodPlan, getPatientRecentLogs, subscribePatientFoodPlans, updatePatientProfile } from '../services/nutritionistService';
import { analyzeFoodPlanWithAi, fallbackFoodPlanAnalysis, FoodPlanAiAnalysis, saveAiPlanFoodsToFirebase } from '../services/foodPlanAiService';
import { getLinkedPatientProfiles, sendNutritionistInvite, subscribeLinkedPatientProfiles, subscribeNutritionistAcceptedLinks } from '../services/nutritionistLinkService';
import { subscribeUnreadChatCountByLink } from '../services/nutritionistChatService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NutritionistChatModal } from '../components/NutritionistChatModal';
import { useStore } from '../store';
import { ActivityLevel, BiologicalSex, DailyLog, FoodNutrition, FoodPlan, FoodPlanMeal, GoalType, MacroGoals, MealEntry, NutritionistPatientLink, UserProfile } from '../types';
import { calcMacroGoals, formatBrasiliaTime, formatNutritionDetails, macroPercent } from '../utils/nutrition';
import {
  AI_LIMIT_MESSAGE,
  AI_LIMIT_TITLE,
  isAiLimitError,
} from '../utils/aiErrors';
import {
  buildValidatedProfileValues,
  formatHeightInput,
  formatWeightInput,
  maskAgeInput,
  maskHeightInput,
  maskNameInput,
  maskWeightInput,
  parseProfileNumber,
  validateProfileBasics,
} from '../utils/profileValidation';

const PERIOD_LABELS: Record<MealEntry['mealPeriod'], string> = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  dinner: 'Jantar',
  snack: 'Lanche',
  hydration: 'Hidratação',
};

function pct(value: number, goal?: number) {
  if (!goal || goal <= 0) return 0;
  return Math.round((value / goal) * 100);
}

const DEFAULT_GOALS: MacroGoals = {
  kcal: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  fiber: 25,
  water: 2500,
  sugar: 50,
  sodium: 2300,
};

const PATIENT_LOG_LOOKBACK_DAYS = 31;

const MEAL_PERIOD_OPTIONS: { key: MealEntry['mealPeriod']; label: string }[] = [
  { key: 'breakfast', label: 'Café da manhã' },
  { key: 'lunch', label: 'Almoço' },
  { key: 'dinner', label: 'Jantar' },
  { key: 'snack', label: 'Lanche' },
];

function parseNumber(value: string, fallback: number) {
  return parseProfileNumber(value, fallback);
}

function buildGoalsFromInputs(inputs: Record<keyof MacroGoals, string>): MacroGoals {
  return {
    kcal: Math.round(parseNumber(inputs.kcal, DEFAULT_GOALS.kcal)),
    protein: Math.round(parseNumber(inputs.protein, DEFAULT_GOALS.protein)),
    carbs: Math.round(parseNumber(inputs.carbs, DEFAULT_GOALS.carbs)),
    fat: Math.round(parseNumber(inputs.fat, DEFAULT_GOALS.fat)),
    fiber: Math.round(parseNumber(inputs.fiber, DEFAULT_GOALS.fiber)),
    water: Math.round(parseNumber(inputs.water, DEFAULT_GOALS.water)),
    sugar: Math.round(parseNumber(inputs.sugar, DEFAULT_GOALS.sugar)),
    sodium: Math.round(parseNumber(inputs.sodium, DEFAULT_GOALS.sodium)),
  };
}

function formatGoalInputs(goals: MacroGoals): Record<keyof MacroGoals, string> {
  return {
    kcal: String(goals.kcal),
    protein: String(goals.protein),
    carbs: String(goals.carbs),
    fat: String(goals.fat),
    fiber: String(goals.fiber),
    water: String(goals.water),
    sugar: String(goals.sugar),
    sodium: String(goals.sodium),
  };
}

function parsePlanItems(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [quantity = '', name = '', notes = ''] = line.split('|').map((part) => part.trim());
      return { quantity, name: name || quantity, notes: notes || undefined };
    })
    .filter((item) => item.name);
}

function maskTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isValidMealTime(value: string) {
  if (!value.trim()) return true;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

const PLAN_NUTRIENT_TARGETS: {
  key: keyof FoodNutrition;
  label: string;
  unit: string;
  getGoal: (goals: MacroGoals) => number;
}[] = [
  { key: 'kcal', label: 'Calorias', unit: 'kcal', getGoal: (goals) => goals.kcal },
  { key: 'protein', label: 'Proteína', unit: 'g', getGoal: (goals) => goals.protein },
  { key: 'carbs', label: 'Carboidratos', unit: 'g', getGoal: (goals) => goals.carbs },
  { key: 'fat', label: 'Gorduras', unit: 'g', getGoal: (goals) => goals.fat },
  { key: 'fiber', label: 'Fibras', unit: 'g', getGoal: (goals) => goals.fiber },
  { key: 'sodium', label: 'Sódio', unit: 'mg', getGoal: (goals) => goals.sodium },
  { key: 'sugar', label: 'Açúcar', unit: 'g', getGoal: (goals) => goals.sugar },
];

function formatPlanNutrient(value: number, unit: string) {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')}${unit}`;
}

function PlanNutritionPreview({
  analysis,
  goals,
}: {
  analysis: FoodPlanAiAnalysis;
  goals: MacroGoals;
}) {
  const details = formatNutritionDetails(analysis.totalNutrition, { includeKcal: true });
  return (
    <View style={styles.planPreviewBox}>
      <Text style={styles.planPreviewTitle}>Prévia nutricional do plano</Text>
      {PLAN_NUTRIENT_TARGETS.map((item) => {
        const current = Number(analysis.totalNutrition[item.key] ?? 0);
        const goal = item.getGoal(goals);
        const pctValue = macroPercent(current, goal);
        const overLimit = (item.key === 'sodium' || item.key === 'sugar') && goal > 0 && current > goal;
        return (
          <View key={item.key} style={styles.planPreviewRow}>
            <View style={styles.planPreviewTop}>
              <Text style={styles.planPreviewLabel}>{item.label}</Text>
              <Text style={[styles.planPreviewValue, overLimit && styles.progressOver]}>
                {formatPlanNutrient(current, item.unit)} / {formatPlanNutrient(goal, item.unit)}
              </Text>
            </View>
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, pctValue)}%`, backgroundColor: overLimit ? Colors.danger : Colors.green400 },
                ]}
              />
            </View>
          </View>
        );
      })}
      {details ? <Text style={styles.planPreviewDetails}>{details}</Text> : null}
    </View>
  );
}

function NutritionistField({
  label,
  suffix,
  wide,
  ...props
}: {
  label: string;
  suffix?: string;
  wide?: boolean;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={[styles.fieldWrap, wide && styles.fieldWrapWide]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>
        <TextInput {...props} style={[styles.fieldInput, props.style]} placeholderTextColor={Colors.gray400} />
        {suffix ? <Text style={styles.fieldSuffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function PatientEditModal({
  visible,
  patient,
  onClose,
  onSave,
}: {
  visible: boolean;
  patient: UserProfile | null;
  onClose: () => void;
  onSave: (profile: UserProfile) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [sex, setSex] = useState<BiologicalSex>('M');
  const [goalType, setGoalType] = useState<GoalType>('maintain');
  const [activity, setActivity] = useState<ActivityLevel>(1.55);
  const [goalInputs, setGoalInputs] = useState<Record<keyof MacroGoals, string>>(formatGoalInputs(DEFAULT_GOALS));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !patient) return;
    const activeGoals = patient.macroGoals ?? calcMacroGoals(patient);
    setName(patient.name);
    setAge(String(patient.age));
    setWeight(formatWeightInput(patient.weight));
    setHeight(formatHeightInput(patient.height));
    setSex(patient.sex);
    setGoalType(patient.goal);
    setActivity(patient.activityLevel);
    setGoalInputs(formatGoalInputs(activeGoals));
  }, [patient, visible]);

  function updateGoalInput(key: keyof MacroGoals, value: string) {
    setGoalInputs((current) => ({ ...current, [key]: value }));
  }

  function handleRecalculateGoals() {
    if (!patient) return;
    const error = validateProfileBasics({ name, age, weight, height });
    if (error) {
      Alert.alert('Confira os dados', error);
      return;
    }
    const profileValues = buildValidatedProfileValues({ age, weight, height, fallback: patient });
    const preview: UserProfile = {
      ...patient,
      name: name.trim() || patient.name,
      age: profileValues.age,
      weight: profileValues.weight,
      height: profileValues.height,
      sex,
      goal: goalType,
      activityLevel: activity,
    };
    setGoalInputs(formatGoalInputs(calcMacroGoals(preview)));
  }

  async function handleSave() {
    if (!patient) return;
    const error = validateProfileBasics({ name, age, weight, height });
    if (error) {
      Alert.alert('Confira os dados', error);
      return;
    }
    const profileValues = buildValidatedProfileValues({ age, weight, height, fallback: patient });
    const nextProfile: UserProfile = {
      ...patient,
      name: name.trim() || patient.name,
      age: profileValues.age,
      weight: profileValues.weight,
      height: profileValues.height,
      sex,
      goal: goalType,
      activityLevel: activity,
      macroGoals: buildGoalsFromInputs(goalInputs),
      updatedAt: new Date(),
    };

    setSaving(true);
    try {
      await onSave(nextProfile);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Editar paciente</Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
            <View style={styles.fieldGrid}>
              <NutritionistField label="Nome" value={name} onChangeText={(v) => setName(maskNameInput(v))} />
              <NutritionistField label="Idade" value={age} onChangeText={(v) => setAge(maskAgeInput(v))} keyboardType="numeric" maxLength={3} />
              <NutritionistField label="Peso" value={weight} onChangeText={(v) => setWeight(maskWeightInput(v))} keyboardType="decimal-pad" suffix="kg" />
              <NutritionistField label="Altura" value={height} onChangeText={(v) => setHeight(maskHeightInput(v))} keyboardType="numeric" maxLength={4} suffix="m" />
            </View>

            <Text style={styles.fieldLabel}>Sexo biológico</Text>
            <View style={styles.segmentRow}>
              {(['M', 'F'] as BiologicalSex[]).map((item) => (
                <TouchableOpacity key={item} style={[styles.segment, sex === item && styles.segmentActive]} onPress={() => setSex(item)}>
                  <Text style={[styles.segmentText, sex === item && styles.segmentTextActive]}>{item === 'M' ? 'Masculino' : 'Feminino'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Objetivo</Text>
            <View style={styles.segmentWrap}>
              {([
                ['deficit', 'Emagrecer'],
                ['maintain', 'Manter'],
                ['muscle', 'Massa'],
                ['bulk', 'Volume'],
              ] as [GoalType, string][]).map(([value, label]) => (
                <TouchableOpacity key={value} style={[styles.pill, goalType === value && styles.pillActive]} onPress={() => setGoalType(value)}>
                  <Text style={[styles.pillText, goalType === value && styles.pillTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Atividade</Text>
            <View style={styles.segmentWrap}>
              {([
                [1.2, 'Sedentário'],
                [1.375, 'Leve'],
                [1.55, 'Moderado'],
                [1.725, 'Intenso'],
                [1.9, 'Atleta'],
              ] as [ActivityLevel, string][]).map(([value, label]) => (
                <TouchableOpacity key={String(value)} style={[styles.pill, activity === value && styles.pillActive]} onPress={() => setActivity(value)}>
                  <Text style={[styles.pillText, activity === value && styles.pillTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalSectionHeader}>
              <Text style={styles.sectionTitleNoMargin}>Metas nutricionais</Text>
              <TouchableOpacity style={styles.recalcBtn} onPress={handleRecalculateGoals}>
                <Text style={styles.recalcText}>Recalcular</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.fieldGrid}>
              <NutritionistField label="Calorias" value={goalInputs.kcal} onChangeText={(v) => updateGoalInput('kcal', v)} keyboardType="numeric" suffix="kcal" />
              <NutritionistField label="Proteína" value={goalInputs.protein} onChangeText={(v) => updateGoalInput('protein', v)} keyboardType="numeric" suffix="g" />
              <NutritionistField label="Carboidratos" value={goalInputs.carbs} onChangeText={(v) => updateGoalInput('carbs', v)} keyboardType="numeric" suffix="g" />
              <NutritionistField label="Gorduras" value={goalInputs.fat} onChangeText={(v) => updateGoalInput('fat', v)} keyboardType="numeric" suffix="g" />
              <NutritionistField label="Fibras" value={goalInputs.fiber} onChangeText={(v) => updateGoalInput('fiber', v)} keyboardType="numeric" suffix="g" />
              <NutritionistField label="Água" value={goalInputs.water} onChangeText={(v) => updateGoalInput('water', v)} keyboardType="numeric" suffix="ml" />
              <NutritionistField label="Açúcar máx." value={goalInputs.sugar} onChangeText={(v) => updateGoalInput('sugar', v)} keyboardType="numeric" suffix="g" />
              <NutritionistField label="Sódio máx." value={goalInputs.sodium} onChangeText={(v) => updateGoalInput('sodium', v)} keyboardType="numeric" suffix="mg" />
            </View>
          </ScrollView>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveText}>{saving ? 'Salvando...' : 'Salvar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FoodPlanModal({
  visible,
  patient,
  nutritionist,
  onClose,
  onCreate,
}: {
  visible: boolean;
  patient: UserProfile | null;
  nutritionist: { id: string; name: string } | null;
  onClose: () => void;
  onCreate: (plan: Omit<FoodPlan, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [mealPeriod, setMealPeriod] = useState<MealEntry['mealPeriod']>('breakfast');
  const [mealTime, setMealTime] = useState('');
  const [mealTitle, setMealTitle] = useState('');
  const [mealItems, setMealItems] = useState('');
  const [analysis, setAnalysis] = useState<FoodPlanAiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const activeGoals = patient ? patient.macroGoals ?? calcMacroGoals(patient) : DEFAULT_GOALS;

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setNotes('');
    setMealPeriod('breakfast');
    setMealTime('');
    setMealTitle('');
    setMealItems('');
    setAnalysis(null);
    setAnalyzing(false);
  }, [visible]);

  function buildMealsForPlan(): FoodPlanMeal[] | null {
    if (!patient) return null;
    const items = parsePlanItems(mealItems);
    if (!title.trim() || !mealTitle.trim() || items.length === 0) {
      Alert.alert('Plano incompleto', 'Informe título, refeição e ao menos um item no formato quantidade | alimento.');
      return null;
    }
    if (!isValidMealTime(mealTime)) {
      Alert.alert('Horário inválido', 'Informe o horário no formato HH:mm, por exemplo 07:30.');
      return null;
    }
    return [{
      period: mealPeriod,
      title: mealTitle.trim(),
      time: mealTime.trim() || undefined,
      instructions: notes.trim() || undefined,
      items,
    }];
  }

  async function buildAnalysis(meals: FoodPlanMeal[]): Promise<FoodPlanAiAnalysis> {
    if (!patient) return fallbackFoodPlanAnalysis(meals);
    try {
      return await analyzeFoodPlanWithAi({
        profile: patient,
        goals: activeGoals,
        meals,
      });
    } catch (error) {
      console.warn('Failed to analyze food plan with AI', error);
      if (isAiLimitError(error)) {
        Alert.alert(AI_LIMIT_TITLE, `${AI_LIMIT_MESSAGE}\n\nCriei uma prévia básica sem estimativa detalhada de nutrientes.`);
      } else {
        Alert.alert('IA indisponível', 'Criei uma prévia básica sem estimativa detalhada de nutrientes.');
      }
      return fallbackFoodPlanAnalysis(meals);
    }
  }

  async function handleAnalyzePlan() {
    const meals = buildMealsForPlan();
    if (!meals) return;
    setAnalyzing(true);
    try {
      const nextAnalysis = await buildAnalysis(meals);
      setAnalysis(nextAnalysis);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCreate() {
    if (!patient || !nutritionist) return;
    const meals = buildMealsForPlan();
    if (!meals) return;

    setSaving(true);
    try {
      const finalAnalysis = analysis ?? await buildAnalysis(meals);
      try {
        await saveAiPlanFoodsToFirebase(nutritionist.id, finalAnalysis.meals);
      } catch (error) {
        console.warn('Failed to cache AI plan foods', error);
      }
      await onCreate({
        patientId: patient.userId,
        nutritionistId: nutritionist.id,
        nutritionistName: nutritionist.name,
        title: title.trim(),
        notes: notes.trim() || undefined,
        meals: finalAnalysis.meals,
        shoppingList: finalAnalysis.shoppingList,
        totalNutrition: finalAnalysis.totalNutrition,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Novo plano alimentar</Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
            <NutritionistField label="Título do plano" value={title} onChangeText={setTitle} placeholder="Ex: Semana 1 - recomposição" wide />
            <NutritionistField label="Observações" value={notes} onChangeText={setNotes} placeholder="Ex: beber água entre as refeições" multiline wide />

            <Text style={styles.fieldLabel}>Refeição</Text>
            <View style={styles.segmentWrap}>
              {MEAL_PERIOD_OPTIONS.map((period) => (
                <TouchableOpacity key={period.key} style={[styles.pill, mealPeriod === period.key && styles.pillActive]} onPress={() => setMealPeriod(period.key)}>
                  <Text style={[styles.pillText, mealPeriod === period.key && styles.pillTextActive]}>{period.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <NutritionistField
              label="Horário"
              value={mealTime}
              onChangeText={(value) => setMealTime(maskTimeInput(value))}
              placeholder="07:30"
              keyboardType="numeric"
              maxLength={5}
              wide
            />
            <NutritionistField label="Nome da refeição" value={mealTitle} onChangeText={setMealTitle} placeholder="Ex: Café da manhã proteico" wide />
            <NutritionistField
              label="Itens da refeição"
              value={mealItems}
              onChangeText={setMealItems}
              onBlur={() => setAnalysis(null)}
              placeholder={'1 unidade | banana\n2 unidades | ovos\n30 g | aveia'}
              multiline
              wide
              style={styles.multilineInput}
            />
            <Text style={styles.modalHint}>A lista de compras e a prévia de nutrientes serão geradas por IA, agrupando itens iguais e estimando macros, minerais e vitaminas.</Text>
            <TouchableOpacity style={[styles.analyzeBtn, analyzing && styles.btnDisabled]} onPress={handleAnalyzePlan} disabled={analyzing}>
              {analyzing ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.analyzeText}>Gerar prévia com IA</Text>}
            </TouchableOpacity>
            {analysis ? <PlanNutritionPreview analysis={analysis} goals={activeGoals} /> : null}
          </ScrollView>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleCreate} disabled={saving}>
              <Text style={styles.saveText}>{saving ? 'Analisando...' : 'Criar plano'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function NutritionistScreen() {
  const user = useStore((s) => s.user);
  const clearAuth = useStore((s) => s.clearAuth);
  const [patients, setPatients] = useState<UserProfile[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [acceptedLinks, setAcceptedLinks] = useState<NutritionistPatientLink[]>([]);
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  const [chatLink, setChatLink] = useState<NutritionistPatientLink | null>(null);
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [foodPlanOpen, setFoodPlanOpen] = useState(false);
  const [foodPlans, setFoodPlans] = useState<FoodPlan[]>([]);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const selectedPatient = patients.find((patient) => patient.userId === selectedPatientId) ?? null;
  const selectedLog = logs.find((log) => log.date === selectedDate) ?? logs[0] ?? null;
  const selectedPatientLink = acceptedLinks.find((link) => link.patientId === selectedPatientId) ?? null;

  async function loadPatients() {
    if (!isFirebaseConfigured || !user) return;
    setLoadingPatients(true);
    try {
      const loaded = await getLinkedPatientProfiles(user.id);
      setPatients(loaded);
      setSelectedPatientId((current) => {
        if (current && loaded.some((patient) => patient.userId === current)) return current;
        return loaded[0]?.userId ?? null;
      });
    } catch (error) {
      console.warn('Failed to load nutritionist patients', error);
      Alert.alert('Erro', 'Não foi possível carregar os pacientes agora.');
    } finally {
      setLoadingPatients(false);
    }
  }

  useEffect(() => {
    if (!isFirebaseConfigured || !user) return undefined;
    setLoadingPatients(true);
    const unsubscribe = subscribeLinkedPatientProfiles(
      user.id,
      (loaded) => {
        setPatients(loaded);
        setSelectedPatientId((current) => {
          if (current && loaded.some((patient) => patient.userId === current)) return current;
          return loaded[0]?.userId ?? null;
        });
        setLoadingPatients(false);
      },
      (error) => {
        console.warn('Failed to load nutritionist patients', error);
        Alert.alert('Erro', 'Não foi possível carregar os pacientes agora.');
        setLoadingPatients(false);
      }
    );
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      setAcceptedLinks([]);
      return undefined;
    }
    return subscribeNutritionistAcceptedLinks(user.id, setAcceptedLinks);
  }, [user]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      setUnreadChatCounts({});
      return undefined;
    }
    return subscribeUnreadChatCountByLink(user.id, setUnreadChatCounts);
  }, [user]);

  useEffect(() => {
    let active = true;
    async function loadLogs() {
      if (!selectedPatientId || !isFirebaseConfigured) {
        setLogs([]);
        return;
      }
      setLoadingLogs(true);
      try {
        const loaded = await getPatientRecentLogs(selectedPatientId, PATIENT_LOG_LOOKBACK_DAYS);
        if (!active) return;
        setLogs(loaded);
        setSelectedDate(loaded[0]?.date ?? null);
      } catch (error) {
        console.warn('Failed to load patient logs', error);
        Alert.alert('Erro', 'Não foi possível carregar os registros deste paciente.');
      } finally {
        if (active) setLoadingLogs(false);
      }
    }
    loadLogs();
    return () => {
      active = false;
    };
  }, [selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId || !isFirebaseConfigured) {
      setFoodPlans([]);
      return undefined;
    }
    return subscribePatientFoodPlans(selectedPatientId, setFoodPlans);
  }, [selectedPatientId]);

  const filteredPatients = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return patients;
    return patients.filter((patient) => patient.name.toLowerCase().includes(normalized));
  }, [patients, search]);

  const entriesByPeriod = useMemo(() => {
    const groups = new Map<MealEntry['mealPeriod'], MealEntry[]>();
    selectedLog?.entries.forEach((entry) => {
      groups.set(entry.mealPeriod, [...(groups.get(entry.mealPeriod) ?? []), entry]);
    });
    return Array.from(groups.entries());
  }, [selectedLog]);

  async function handleSignOut() {
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

  async function handleSendInvite() {
    if (!user || !inviteEmail.trim()) return;
    setInviteLoading(true);
    try {
      await sendNutritionistInvite({
        nutritionistId: user.id,
        nutritionistName: user.name,
        nutritionistEmail: user.email,
        patientEmail: inviteEmail,
      });
      setInviteEmail('');
      Alert.alert('Solicitação enviada', 'O paciente receberá o convite nas notificações da página inicial.');
      await loadPatients();
    } catch (error: any) {
      const message = error?.message === 'patient_not_found'
        ? 'Não encontramos um paciente cadastrado com esse e-mail.'
        : error?.message === 'patient_is_nutritionist'
          ? 'Esse e-mail pertence a uma conta de nutricionista.'
          : error?.message === 'self_invite'
            ? 'Você não pode enviar convite para sua própria conta.'
            : error?.message === 'already_accepted'
              ? 'Esse paciente já aceitou seu acesso.'
              : 'Não foi possível enviar a solicitação agora.';
      Alert.alert('Convite não enviado', message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleSavePatientProfile(nextProfile: UserProfile) {
    try {
      await updatePatientProfile(nextProfile);
      setPatients((items) => items.map((item) => item.userId === nextProfile.userId ? nextProfile : item));
      Alert.alert('Paciente atualizado', 'Dados e metas nutricionais foram salvos.');
    } catch (error) {
      console.warn('Failed to update patient profile', error);
      Alert.alert('Erro', 'Não foi possível salvar os dados do paciente agora.');
      throw error;
    }
  }

  async function handleCreateFoodPlan(plan: Omit<FoodPlan, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      await createFoodPlan(plan);
      Alert.alert('Plano criado', 'O plano alimentar e a lista de compras já estão disponíveis para o paciente.');
    } catch (error) {
      console.warn('Failed to create food plan', error);
      Alert.alert('Erro', 'Não foi possível criar o plano alimentar agora.');
      throw error;
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Nutricionista</Text>
          <Text style={styles.title}>Acesso completo</Text>
          <Text style={styles.subtitle}>Acompanhe pacientes, refeições, água, metas e nutrientes dos últimos dias.</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={() => setLogoutConfirmOpen(true)}>
          <MaterialIcons name="logout" size={18} color={Colors.green600} />
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!isFirebaseConfigured ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="cloud-off" size={38} color={Colors.gray400} />
            <Text style={styles.emptyTitle}>Firebase necessário</Text>
            <Text style={styles.emptyText}>O acesso do nutricionista usa dados sincronizados dos pacientes.</Text>
          </View>
        ) : (
          <>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Enviar solicitação</Text>
              <Text style={styles.mutedText}>Informe o e-mail do paciente. Ele precisa aceitar o acesso nas notificações da página inicial.</Text>
              <View style={styles.inviteRow}>
                <TextInput
                  style={styles.inviteInput}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="email@paciente.com"
                  placeholderTextColor={Colors.gray400}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TouchableOpacity
                  style={[styles.inviteBtn, (!inviteEmail.trim() || inviteLoading) && styles.btnDisabled]}
                  onPress={handleSendInvite}
                  disabled={!inviteEmail.trim() || inviteLoading}
                >
                  {inviteLoading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.inviteBtnText}>Enviar</Text>}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Pacientes</Text>
              <View style={styles.searchRow}>
                <MaterialIcons name="search" size={18} color={Colors.gray400} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar paciente"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
              {loadingPatients ? (
                <ActivityIndicator color={Colors.green400} />
              ) : filteredPatients.length === 0 ? (
                <Text style={styles.mutedText}>Nenhum paciente vinculado ainda. Envie uma solicitação e aguarde o aceite.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientRow}>
                  {filteredPatients.map((patient) => {
                    const active = patient.userId === selectedPatientId;
                    const patientLink = acceptedLinks.find((link) => link.patientId === patient.userId);
                    const unread = patientLink ? unreadChatCounts[patientLink.id] ?? 0 : 0;
                    return (
                      <TouchableOpacity
                        key={patient.userId}
                        style={[styles.patientCard, active && styles.patientCardActive]}
                        onPress={() => setSelectedPatientId(patient.userId)}
                      >
                        <View style={styles.patientNameRow}>
                          <Text style={[styles.patientName, active && styles.patientNameActive]}>{patient.name}</Text>
                          {unread > 0 ? (
                            <View style={styles.patientUnreadBadge}>
                              <Text style={styles.patientUnreadText}>{unread}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.patientMeta}>{patient.age} anos · {patient.weight}kg</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {selectedPatient ? (
              <View style={styles.panel}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitleNoMargin}>Resumo do paciente</Text>
                  <View style={styles.patientActionRow}>
                    <TouchableOpacity style={styles.chatBtn} onPress={() => setEditPatientOpen(true)}>
                      <MaterialIcons name="edit" size={17} color={Colors.green600} />
                      <Text style={styles.chatBtnText}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.chatBtn} onPress={() => setFoodPlanOpen(true)}>
                      <MaterialIcons name="restaurant-menu" size={17} color={Colors.green600} />
                      <Text style={styles.chatBtnText}>Plano</Text>
                    </TouchableOpacity>
                    {selectedPatientLink ? (
                      <TouchableOpacity style={styles.chatBtn} onPress={() => setChatLink(selectedPatientLink)}>
                        <MaterialIcons name="chat" size={17} color={Colors.green600} />
                        <Text style={styles.chatBtnText}>
                          Chat{(unreadChatCounts[selectedPatientLink.id] ?? 0) > 0 ? ` (${unreadChatCounts[selectedPatientLink.id]})` : ''}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
                <View style={styles.summaryGrid}>
                  <InfoCard label="Objetivo" value={goalLabel(selectedPatient.goal)} />
                  <InfoCard label="Altura" value={`${selectedPatient.height} cm`} />
                  <InfoCard label="Peso" value={`${selectedPatient.weight} kg`} />
                  <InfoCard label="Atividade" value={`${selectedPatient.activityLevel}x`} />
                </View>
                <View style={styles.summaryGrid}>
                  <InfoCard label="Proteína" value={`${selectedPatient.macroGoals?.protein ?? calcMacroGoals(selectedPatient).protein} g`} />
                  <InfoCard label="Carboidratos" value={`${selectedPatient.macroGoals?.carbs ?? calcMacroGoals(selectedPatient).carbs} g`} />
                  <InfoCard label="Gorduras" value={`${selectedPatient.macroGoals?.fat ?? calcMacroGoals(selectedPatient).fat} g`} />
                  <InfoCard label="Calorias" value={`${selectedPatient.macroGoals?.kcal ?? calcMacroGoals(selectedPatient).kcal} kcal`} />
                </View>
              </View>
            ) : null}

            {selectedPatient ? (
              <View style={styles.panel}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitleNoMargin}>Planos alimentares</Text>
                  <TouchableOpacity style={styles.chatBtn} onPress={() => setFoodPlanOpen(true)}>
                    <MaterialIcons name="add" size={18} color={Colors.green600} />
                    <Text style={styles.chatBtnText}>Adicionar</Text>
                  </TouchableOpacity>
                </View>
                {foodPlans.length === 0 ? (
                  <Text style={styles.mutedText}>Nenhum plano alimentar criado para este paciente.</Text>
                ) : (
                  foodPlans.slice(0, 3).map((plan) => (
                    <View key={plan.id} style={styles.planCard}>
                      <Text style={styles.planTitle}>{plan.title}</Text>
                      {plan.notes ? <Text style={styles.planNotes}>{plan.notes}</Text> : null}
                      {plan.meals[0] ? (
                        <Text style={styles.planNotes}>
                          {plan.meals[0].time ? `${plan.meals[0].time} · ` : ''}{plan.meals[0].title}
                        </Text>
                      ) : null}
                      {plan.totalNutrition ? (
                        <Text style={styles.planNutrition}>
                          {formatNutritionDetails(plan.totalNutrition, { includeKcal: true })}
                        </Text>
                      ) : null}
                      <Text style={styles.planMeta}>
                        {plan.meals.length} refeição(ões) · {plan.shoppingList.length} item(ns) na lista de compras
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}

            <View style={styles.panel}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitleNoMargin}>Registros do paciente</Text>
                  <Text style={styles.sectionSubtitle}>Últimos {PATIENT_LOG_LOOKBACK_DAYS} dias{logs.length > 0 ? ` · ${logs.length} dia(s) com registro` : ''}</Text>
                </View>
              </View>
              {loadingLogs ? (
                <ActivityIndicator color={Colors.green400} />
              ) : logs.length === 0 ? (
                <Text style={styles.mutedText}>Este paciente ainda não possui registros.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
                  {logs.map((log) => {
                    const active = log.date === selectedLog?.date;
                    return (
                      <TouchableOpacity
                        key={log.id}
                        style={[styles.dateChip, active && styles.dateChipActive]}
                        onPress={() => setSelectedDate(log.date)}
                      >
                        <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>{formatDateLabel(log.date)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {selectedLog ? (
              <>
                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Metas do dia</Text>
                  <ProgressRow label="Calorias" value={Math.round(selectedLog.totalNutrition.kcal)} goal={selectedLog.goals.kcal} unit="kcal" />
                  <ProgressRow label="Proteína" value={Math.round(selectedLog.totalNutrition.protein)} goal={selectedLog.goals.protein} unit="g" />
                  <ProgressRow label="Carboidratos" value={Math.round(selectedLog.totalNutrition.carbs)} goal={selectedLog.goals.carbs} unit="g" />
                  <ProgressRow label="Gorduras" value={Math.round(selectedLog.totalNutrition.fat)} goal={selectedLog.goals.fat} unit="g" />
                  <ProgressRow label="Fibras" value={Math.round(selectedLog.totalNutrition.fiber)} goal={selectedLog.goals.fiber} unit="g" />
                  <ProgressRow label="Água" value={selectedLog.waterMl ?? 0} goal={selectedLog.goals.water} unit="ml" />
                </View>

                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Nutrientes completos</Text>
                  <Text style={styles.nutritionText}>{formatNutritionDetails(selectedLog.totalNutrition, { includeKcal: true }) || 'Sem nutrientes registrados.'}</Text>
                </View>

                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Refeições e horários</Text>
                  {entriesByPeriod.length === 0 ? (
                    <Text style={styles.mutedText}>Nenhuma refeição registrada neste dia.</Text>
                  ) : (
                    entriesByPeriod.map(([period, entries]) => (
                      <View key={period} style={styles.periodBlock}>
                        <Text style={styles.periodTitle}>{PERIOD_LABELS[period] ?? period}</Text>
                        {entries.map((entry) => (
                          <View key={entry.id} style={styles.entryRow}>
                            <Text style={styles.entryEmoji}>{entry.emoji}</Text>
                            <View style={styles.entryBody}>
                              <Text style={styles.entryName}>{entry.foodName}</Text>
                              <Text style={styles.entryMeta}>
                                {formatBrasiliaTime(new Date(entry.addedAt))}
                                {' · '}
                                {formatNutritionDetails(entry.nutrition, { includeKcal: true })}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))
                  )}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      <NutritionistChatModal
        visible={Boolean(chatLink)}
        link={chatLink}
        currentUserId={user?.id}
        currentUserName={user?.name ?? 'Nutricionista'}
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
        onConfirm={handleSignOut}
      />
      <PatientEditModal
        visible={editPatientOpen}
        patient={selectedPatient}
        onClose={() => setEditPatientOpen(false)}
        onSave={handleSavePatientProfile}
      />
      <FoodPlanModal
        visible={foodPlanOpen}
        patient={selectedPatient}
        nutritionist={user ? { id: user.id, name: user.name } : null}
        onClose={() => setFoodPlanOpen(false)}
        onCreate={handleCreateFoodPlan}
      />
    </SafeAreaView>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ProgressRow({ label, value, goal, unit }: { label: string; value: number; goal: number; unit: string }) {
  const progress = Math.min(100, pct(value, goal));
  const over = goal > 0 && value > goal * 1.1;
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressTop}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={[styles.progressValue, over && styles.progressOver]}>{value}{unit} / {goal}{unit}</Text>
      </View>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: over ? Colors.danger : Colors.green400 }]} />
      </View>
    </View>
  );
}

function goalLabel(goal: UserProfile['goal']) {
  return goal === 'deficit' ? 'Emagrecer' :
    goal === 'muscle' ? 'Ganhar massa' :
    goal === 'bulk' ? 'Ganho de peso' :
    'Manter peso';
}

function formatDateLabel(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 900 : undefined,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerText: { flex: 1 },
  eyebrow: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gray800 },
  subtitle: { marginTop: 2, fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.green50, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 8 },
  logoutText: { color: Colors.green600, fontWeight: Typography.bold, fontSize: Typography.xs },
  scroll: { width: '100%', maxWidth: Platform.OS === 'web' ? 900 : undefined, alignSelf: 'center', padding: Spacing.base, paddingBottom: Spacing.xxl },
  panel: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.base, marginBottom: Spacing.sm, ...Shadows.sm },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800, marginBottom: Spacing.sm },
  sectionTitleNoMargin: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  sectionSubtitle: { marginTop: 3, fontSize: Typography.xs, color: Colors.gray400 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.md },
  patientActionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.xs, flex: 1 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.green50, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 7 },
  chatBtnText: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold },
  inviteRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  inviteInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, minHeight: 44, fontSize: Typography.sm, color: Colors.gray800 },
  inviteBtn: { minWidth: 92, minHeight: 44, borderRadius: Radius.md, backgroundColor: Colors.green400, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
  inviteBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.bold },
  btnDisabled: { opacity: 0.6 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, marginBottom: Spacing.sm },
  searchInput: { flex: 1, minHeight: 40, fontSize: Typography.sm, color: Colors.gray800 },
  patientRow: { gap: Spacing.sm },
  patientCard: { width: 180, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.sm, backgroundColor: Colors.gray50 },
  patientCardActive: { borderColor: Colors.green400, backgroundColor: Colors.green50 },
  patientNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  patientName: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  patientNameActive: { color: Colors.green600 },
  patientUnreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: Colors.green400, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  patientUnreadText: { fontSize: Typography.xs, color: Colors.white, fontWeight: Typography.bold },
  patientMeta: { marginTop: 3, fontSize: Typography.xs, color: Colors.gray400 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  infoCard: {
    flexGrow: 1,
    flexBasis: Platform.OS === 'web' ? '23%' : '47%',
    minWidth: Platform.OS === 'web' ? 150 : 136,
    minHeight: 76,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
  },
  infoLabel: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.bold, textTransform: 'uppercase', marginBottom: 6 },
  infoValue: { fontSize: Typography.md, color: Colors.gray800, fontWeight: Typography.bold, lineHeight: 20 },
  planCard: { backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing.sm, marginTop: Spacing.sm },
  planTitle: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  planNotes: { marginTop: 3, fontSize: Typography.xs, color: Colors.gray600, lineHeight: 17 },
  planNutrition: { marginTop: 5, fontSize: Typography.xs, color: Colors.gray800, lineHeight: 17 },
  planMeta: { marginTop: 4, fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.semibold },
  dateRow: { gap: Spacing.xs },
  dateChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8, backgroundColor: Colors.white },
  dateChipActive: { borderColor: Colors.green400, backgroundColor: Colors.green50 },
  dateChipText: { fontSize: Typography.sm, color: Colors.gray400, fontWeight: Typography.bold },
  dateChipTextActive: { color: Colors.green600 },
  progressRow: { marginBottom: Spacing.sm },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: 5 },
  progressLabel: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.semibold },
  progressValue: { fontSize: Typography.sm, color: Colors.gray600, fontWeight: Typography.bold },
  progressOver: { color: Colors.danger },
  progressBg: { height: 7, borderRadius: Radius.full, backgroundColor: Colors.gray50, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: Radius.full },
  nutritionText: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20 },
  periodBlock: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm, marginTop: Spacing.sm },
  periodTitle: { fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.bold, marginBottom: Spacing.xs },
  entryRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  entryEmoji: { width: 30, fontSize: 22, textAlign: 'center' },
  entryBody: { flex: 1 },
  entryName: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  entryMeta: { marginTop: 2, fontSize: Typography.xs, color: Colors.gray400, lineHeight: 16 },
  mutedText: { fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
  emptyState: { alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.xl },
  emptyTitle: { marginTop: Spacing.sm, fontSize: Typography.base, color: Colors.gray800, fontWeight: Typography.bold },
  emptyText: { marginTop: 4, fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center', lineHeight: 18 },
  modalBg: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    maxHeight: '92%',
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 760 : undefined,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.base,
    paddingBottom: Spacing.lg,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.base },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.sm },
  modalTitle: { fontSize: Typography.xl, color: Colors.gray800, fontWeight: Typography.bold },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  modalScroll: { paddingBottom: Spacing.base },
  modalSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  modalHint: { fontSize: Typography.xs, color: Colors.gray400, lineHeight: 17, backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing.sm },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  fieldWrap: { width: '48%' },
  fieldWrapWide: { width: '100%' },
  fieldLabel: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.gray600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, backgroundColor: Colors.white },
  fieldInput: { flex: 1, minHeight: 42, paddingVertical: Spacing.sm, fontSize: Typography.sm, color: Colors.gray800 },
  fieldSuffix: { fontSize: Typography.xs, color: Colors.gray400, marginLeft: 4 },
  multilineInput: { minHeight: 96, textAlignVertical: 'top' },
  segmentRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  segment: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.border },
  segmentActive: { backgroundColor: Colors.green50, borderColor: Colors.green400 },
  segmentText: { color: Colors.gray600, fontWeight: Typography.semibold },
  segmentTextActive: { color: Colors.green600 },
  segmentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.green50, borderColor: Colors.green400 },
  pillText: { color: Colors.gray600, fontWeight: Typography.semibold, fontSize: Typography.sm },
  pillTextActive: { color: Colors.green600 },
  recalcBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green400 },
  recalcText: { color: Colors.green600, fontWeight: Typography.bold, fontSize: Typography.sm },
  analyzeBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: Radius.md, backgroundColor: Colors.green600, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  analyzeText: { color: Colors.white, fontWeight: Typography.bold, fontSize: Typography.sm },
  planPreviewBox: { backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green100, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm },
  planPreviewTitle: { fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.bold, marginBottom: Spacing.sm },
  planPreviewRow: { marginBottom: Spacing.sm },
  planPreviewTop: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: 5 },
  planPreviewLabel: { fontSize: Typography.xs, color: Colors.gray800, fontWeight: Typography.semibold },
  planPreviewValue: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: Typography.bold },
  planPreviewDetails: { marginTop: Spacing.xs, fontSize: Typography.xs, color: Colors.gray600, lineHeight: 17 },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.gray600, fontWeight: Typography.semibold },
  saveBtn: { flex: 1.4, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.green400 },
  saveText: { color: Colors.white, fontWeight: Typography.bold },
});
