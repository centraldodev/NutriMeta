import React, { useEffect, useMemo, useState } from "react";
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
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import {
  Colors,
  Radius,
  Shadows,
  Spacing,
  Typography,
} from "../constants/theme";
import { isFirebaseConfigured } from "../config";
import { signOut } from "../services/authService";
import {
  createFoodPlan,
  getPatientRecentLogs,
  subscribePatientFoodPlans,
  updateFoodPlan,
  updatePatientProfile,
} from "../services/nutritionistService";
import {
  getLinkedPatientProfiles,
  sendNutritionistInvite,
  subscribeLinkedPatientProfiles,
  subscribeNutritionistAcceptedLinks,
} from "../services/nutritionistLinkService";
import { subscribeUnreadChatCountByLink } from "../services/nutritionistChatService";
import { getCustomFoods } from "../services/customFoodService";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FoodIcon } from "../components/FoodIcon";
import { NativeTimePicker } from "../components/NativeTimePicker";
import { NutritionistChatModal } from "../components/NutritionistChatModal";
import { useStore } from "../store";
import {
  ActivityLevel,
  BiologicalSex,
  DailyLog,
  FoodItem,
  FoodNutrition,
  FoodPlan,
  FoodPlanMeal,
  FoodPlanMealItem,
  GoalType,
  MacroGoals,
  MealEntry,
  NutritionistPatientLink,
  QuantityUnit,
  ShoppingListItem,
  UserProfile,
} from "../types";
import { calculateNutrition, UNIT_LABELS } from "../constants/foodDatabase";
import {
  calcMacroGoals,
  dateDaysAgoBrasilia,
  formatBrasiliaDate,
  formatBrasiliaTime,
  formatNutritionDetails,
  sumNutrition,
} from "../utils/nutrition";
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
} from "../utils/profileValidation";

const PERIOD_LABELS: Record<MealEntry["mealPeriod"], string> = {
  breakfast: "Café da manhã",
  lunch: "Almoço",
  dinner: "Jantar",
  snack: "Lanche",
  hydration: "Hidratação",
};

function pct(value: number, goal?: number) {
  if (!goal || goal <= 0) return 0;
  return Math.round((value / goal) * 100);
}

type WeekRange = {
  index: number;
  label: string;
  rangeLabel: string;
  dates: string[];
};

type WeeklyFoodSummary = {
  name: string;
  emoji: string;
  count: number;
  kcal: number;
  sodium: number;
};

type MealDistributionItem = {
  period: MealEntry["mealPeriod"];
  label: string;
  kcal: number;
  count: number;
  pct: number;
};

type PlanSelectedFood = {
  key: string;
  food: FoodItem;
  quantityText: string;
  quantity: number;
  unit: QuantityUnit;
  nutrition: FoodNutrition;
};

type EditableGoalKey = keyof MacroGoals;

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

const EDITABLE_GOAL_ROWS: {
  key: EditableGoalKey;
  label: string;
  unit: string;
}[] = [
  { key: "kcal", label: "Calorias", unit: "kcal" },
  { key: "protein", label: "Proteína", unit: "g" },
  { key: "carbs", label: "Carboidratos", unit: "g" },
  { key: "fat", label: "Gorduras", unit: "g" },
  { key: "fiber", label: "Fibras", unit: "g" },
  { key: "water", label: "Água", unit: "ml" },
  { key: "sugar", label: "Açúcar máx.", unit: "g" },
  { key: "sodium", label: "Sódio máx.", unit: "mg" },
  { key: "calcium", label: "Cálcio", unit: "mg" },
  { key: "iron", label: "Ferro", unit: "mg" },
  { key: "potassium", label: "Potássio", unit: "mg" },
  { key: "magnesium", label: "Magnésio", unit: "mg" },
  { key: "zinc", label: "Zinco", unit: "mg" },
  { key: "vitaminA", label: "Vitamina A", unit: "mcg" },
  { key: "vitaminC", label: "Vitamina C", unit: "mg" },
  { key: "vitaminD", label: "Vitamina D", unit: "mcg" },
  { key: "vitaminE", label: "Vitamina E", unit: "mg" },
  { key: "vitaminB12", label: "Vitamina B12", unit: "mcg" },
  { key: "folate", label: "Folato", unit: "mcg" },
];

const PATIENT_LOG_LOOKBACK_DAYS = 31;

const EMPTY_TOTAL: FoodNutrition = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sodium: 0,
  sugar: 0,
};

const MEAL_PERIOD_OPTIONS: { key: MealEntry["mealPeriod"]; label: string }[] = [
  { key: "breakfast", label: "Café da manhã" },
  { key: "lunch", label: "Almoço" },
  { key: "dinner", label: "Jantar" },
  { key: "snack", label: "Lanche" },
];

function parseNumber(value: string, fallback: number) {
  return parseProfileNumber(value, fallback);
}

function formatShortDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  return formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), {
    day: "2-digit",
    month: "short",
  }).replace(".", "");
}

function buildWeekRanges(): WeekRange[] {
  return Array.from({ length: 4 }, (_item, index) => {
    const endOffset = index * 7;
    const startOffset = endOffset + 6;
    const dates = Array.from({ length: 7 }, (_date, offset) =>
      dateDaysAgoBrasilia(startOffset - offset),
    );
    return {
      index,
      label:
        index === 0
          ? "Últimos 7 dias"
          : `${endOffset + 1}-${startOffset + 1} dias atrás`,
      rangeLabel: `${formatShortDate(dates[0])} - ${formatShortDate(dates[dates.length - 1])}`,
      dates,
    };
  });
}

function averageNutritionForDates(
  dates: string[],
  byDate: Map<string, DailyLog>,
): FoodNutrition {
  if (dates.length === 0) return EMPTY_TOTAL;
  const total = sumNutrition(
    dates.map((date) => ({
      nutrition: byDate.get(date)?.totalNutrition ?? EMPTY_TOTAL,
    })),
  );
  const average = { ...EMPTY_TOTAL } as FoodNutrition;
  (
    Object.entries(total) as [keyof FoodNutrition, number | undefined][]
  ).forEach(([key, value]) => {
    if (typeof value !== "number") return;
    average[key] = (Math.round((value / dates.length) * 10) / 10) as never;
  });
  average.kcal = Math.round(average.kcal);
  average.sodium = Math.round(average.sodium ?? 0);
  return average;
}

function averageWaterForDates(
  dates: string[],
  byDate: Map<string, DailyLog>,
): number {
  if (dates.length === 0) return 0;
  const total = dates.reduce(
    (sum, date) => sum + (byDate.get(date)?.waterMl ?? 0),
    0,
  );
  return Math.round(total / dates.length);
}

function totalNutritionForDates(
  dates: string[],
  byDate: Map<string, DailyLog>,
): FoodNutrition {
  return sumNutrition(
    dates.map((date) => ({
      nutrition: byDate.get(date)?.totalNutrition ?? EMPTY_TOTAL,
    })),
  );
}

function totalWaterForDates(
  dates: string[],
  byDate: Map<string, DailyLog>,
): number {
  return dates.reduce((sum, date) => sum + (byDate.get(date)?.waterMl ?? 0), 0);
}

function goalPct(value: number, goal: number) {
  if (!goal) return 0;
  return Math.round((value / goal) * 100);
}

function mealPeriodOrder(period: MealEntry["mealPeriod"]) {
  const index = MEAL_PERIOD_OPTIONS.findIndex((item) => item.key === period);
  return index >= 0 ? index : 99;
}

function formatDelta(value: number, unit = "") {
  const rounded =
    Math.abs(value) >= 10
      ? Math.round(Math.abs(value))
      : Math.round(Math.abs(value) * 10) / 10;
  if (value > 0) return `+${rounded}${unit}`;
  if (value < 0) return `-${rounded}${unit}`;
  return `0${unit}`;
}

function countTargetDays(
  dates: string[],
  byDate: Map<string, DailyLog>,
  key: keyof FoodNutrition,
  goal: number,
  mode: "target" | "limit",
) {
  if (!goal) return 0;
  return dates.reduce((count, date) => {
    const value =
      (byDate.get(date)?.totalNutrition?.[key] as number | undefined) ?? 0;
    const reached = mode === "limit" ? value > goal : value >= goal * 0.9;
    return count + (reached ? 1 : 0);
  }, 0);
}

function countWaterTargetDays(
  dates: string[],
  byDate: Map<string, DailyLog>,
  goal: number,
) {
  if (!goal) return 0;
  return dates.reduce(
    (count, date) =>
      count + ((byDate.get(date)?.waterMl ?? 0) >= goal * 0.9 ? 1 : 0),
    0,
  );
}

function buildWeeklyAlerts(
  dates: string[],
  byDate: Map<string, DailyLog>,
  goals: MacroGoals,
) {
  const proteinDays = countTargetDays(
    dates,
    byDate,
    "protein",
    goals.protein,
    "target",
  );
  const fiberLowDays =
    dates.length -
    countTargetDays(dates, byDate, "fiber", goals.fiber, "target");
  const sodiumHighDays = countTargetDays(
    dates,
    byDate,
    "sodium",
    goals.sodium,
    "limit",
  );
  const sugarHighDays = countTargetDays(
    dates,
    byDate,
    "sugar",
    goals.sugar,
    "limit",
  );
  const waterDays = countWaterTargetDays(dates, byDate, goals.water);
  return [
    {
      label: "Proteína na meta",
      value: `${proteinDays}/${dates.length} dias`,
      tone: proteinDays >= 4 ? "good" : "warn",
    },
    {
      label: "Fibra baixa",
      value: `${fiberLowDays}/${dates.length} dias`,
      tone: fiberLowDays >= 4 ? "warn" : "good",
    },
    {
      label: "Sódio acima",
      value: `${sodiumHighDays}/${dates.length} dias`,
      tone: sodiumHighDays >= 3 ? "warn" : "good",
    },
    {
      label: "Açúcar acima",
      value: `${sugarHighDays}/${dates.length} dias`,
      tone: sugarHighDays >= 3 ? "warn" : "good",
    },
    {
      label: "Água na meta",
      value: `${waterDays}/${dates.length} dias`,
      tone: waterDays >= 4 ? "good" : "warn",
    },
  ];
}

function buildTopFoods(logs: DailyLog[]): WeeklyFoodSummary[] {
  const items = new Map<string, WeeklyFoodSummary>();
  logs.forEach((log) => {
    log.entries.forEach((entry) => {
      if (entry.mealPeriod === "hydration") return;
      const key = entry.foodName.trim().toLowerCase();
      const current = items.get(key) ?? {
        name: entry.foodName,
        emoji: entry.emoji,
        count: 0,
        kcal: 0,
        sodium: 0,
      };
      current.count += 1;
      current.kcal += entry.nutrition.kcal ?? 0;
      current.sodium += entry.nutrition.sodium ?? 0;
      items.set(key, current);
    });
  });
  return Array.from(items.values())
    .map((item) => ({
      ...item,
      kcal: Math.round(item.kcal),
      sodium: Math.round(item.sodium),
    }))
    .sort((a, b) => b.kcal - a.kcal || b.count - a.count)
    .slice(0, 5);
}

function buildMealDistribution(logs: DailyLog[]): MealDistributionItem[] {
  const totalKcal = logs.reduce(
    (sum, log) => sum + (log.totalNutrition?.kcal ?? 0),
    0,
  );
  const items = new Map<
    MealEntry["mealPeriod"],
    { kcal: number; count: number }
  >();
  logs.forEach((log) => {
    log.entries.forEach((entry) => {
      const current = items.get(entry.mealPeriod) ?? { kcal: 0, count: 0 };
      current.kcal += entry.nutrition.kcal ?? 0;
      current.count += 1;
      items.set(entry.mealPeriod, current);
    });
  });
  return Array.from(items.entries())
    .map(([period, item]) => ({
      period,
      label: PERIOD_LABELS[period] ?? period,
      kcal: Math.round(item.kcal),
      count: item.count,
      pct: totalKcal > 0 ? Math.round((item.kcal / totalKcal) * 100) : 0,
    }))
    .sort((a, b) => mealPeriodOrder(a.period) - mealPeriodOrder(b.period));
}

function buildGoalsFromInputs(
  inputs: Record<EditableGoalKey, string>,
  fallback: MacroGoals = DEFAULT_GOALS,
): MacroGoals {
  const goals: MacroGoals = {
    ...fallback,
    kcal: Math.round(parseNumber(inputs.kcal, fallback.kcal)),
    protein: Math.round(parseNumber(inputs.protein, fallback.protein)),
    carbs: Math.round(parseNumber(inputs.carbs, fallback.carbs)),
    fat: Math.round(parseNumber(inputs.fat, fallback.fat)),
    fiber: Math.round(parseNumber(inputs.fiber, fallback.fiber)),
    water: Math.round(parseNumber(inputs.water, fallback.water)),
    sugar: Math.round(parseNumber(inputs.sugar, fallback.sugar)),
    sodium: Math.round(parseNumber(inputs.sodium, fallback.sodium)),
  };

  EDITABLE_GOAL_ROWS.forEach(({ key }) => {
    if (key in DEFAULT_GOALS) return;
    const fallbackValue = fallback[key];
    const value = parseNumber(
      inputs[key],
      typeof fallbackValue === "number" ? fallbackValue : 0,
    );
    goals[key] = Math.round(value) as never;
  });

  return goals;
}

function formatGoalInputs(goals: MacroGoals): Record<EditableGoalKey, string> {
  return EDITABLE_GOAL_ROWS.reduce(
    (inputs, item) => ({
      ...inputs,
      [item.key]:
        typeof goals[item.key] === "number" ? String(goals[item.key]) : "",
    }),
    {} as Record<EditableGoalKey, string>,
  );
}

function maskTimeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
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

function normalizeFoodSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function searchPlanFoods(query: string, foods: FoodItem[]) {
  const normalized = normalizeFoodSearchText(query);
  if (!normalized) return foods.slice(0, 12);
  return foods
    .filter((food) => normalizeFoodSearchText(food.name).includes(normalized))
    .sort((a, b) => {
      const aName = normalizeFoodSearchText(a.name);
      const bName = normalizeFoodSearchText(b.name);
      const aExact = aName === normalized ? 0 : 1;
      const bExact = bName === normalized ? 0 : 1;
      return aExact - bExact || a.name.length - b.name.length;
    })
    .slice(0, 30);
}

function getFoodUnits(food: FoodItem): QuantityUnit[] {
  const units = Object.keys(food.nutritionPer) as QuantityUnit[];
  return Array.from(new Set([food.defaultUnit, ...units])).filter(
    (unit) => food.nutritionPer[unit],
  );
}

function parseOptionalPlanQuantity(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function recalcPlanFood(
  item: PlanSelectedFood,
  changes: Partial<
    Pick<PlanSelectedFood, "quantityText" | "quantity" | "unit">
  >,
): PlanSelectedFood {
  const next = { ...item, ...changes };
  return {
    ...next,
    nutrition: calculateNutrition(next.food, next.quantity, next.unit),
  };
}

function buildShoppingList(items: PlanSelectedFood[]): ShoppingListItem[] {
  return items.map((item) => ({
    name: item.food.name,
    quantity: item.quantityText,
    unit: UNIT_LABELS[item.unit],
  }));
}

function selectedFoodsFromPlan(
  plan: FoodPlan,
  foods: FoodItem[],
): PlanSelectedFood[] {
  const meal = plan.meals[0];
  if (!meal) return [];

  return meal.items.map((item, index) => {
    const unit = item.unit ?? "porcao";
    const quantity =
      item.quantityValue ?? (parseOptionalPlanQuantity(item.quantity) || 1);
    const food =
      foods.find(
        (candidate) =>
          candidate.id === item.foodId ||
          normalizeFoodSearchText(candidate.name) ===
            normalizeFoodSearchText(item.name),
      ) ??
      ({
        id: item.foodId ?? `plan_${plan.id}_${index}`,
        name: item.name,
        emoji: item.emoji ?? "🍽️",
        aliases: [item.name.toLowerCase()],
        defaultUnit: unit,
        nutritionPer: {
          [unit]: item.nutrition ?? EMPTY_TOTAL,
        },
        source: "plan",
      } satisfies FoodItem);

    const selectedUnit = food.nutritionPer[unit] ? unit : food.defaultUnit;
    return {
      key: `${food.id}_${plan.id}_${index}`,
      food,
      quantityText: item.quantityValue
        ? String(item.quantityValue).replace(".", ",")
        : item.quantity.split(" ")[0] || "1",
      quantity,
      unit: selectedUnit,
      nutrition:
        item.nutrition ?? calculateNutrition(food, quantity, selectedUnit),
    };
  });
}

const PLAN_NUTRITION_ROWS: {
  key: keyof FoodNutrition;
  label: string;
  unit: string;
}[] = [
  { key: "kcal", label: "Cal", unit: "kcal" },
  { key: "protein", label: "Prot", unit: "g" },
  { key: "carbs", label: "Carb", unit: "g" },
  { key: "fat", label: "Gord", unit: "g" },
  { key: "fiber", label: "Fibra", unit: "g" },
  { key: "sugar", label: "Açúcar", unit: "g" },
  { key: "sodium", label: "Sódio", unit: "mg" },
  { key: "calcium", label: "Cálcio", unit: "mg" },
  { key: "iron", label: "Ferro", unit: "mg" },
  { key: "potassium", label: "Potássio", unit: "mg" },
  { key: "magnesium", label: "Magnésio", unit: "mg" },
  { key: "zinc", label: "Zinco", unit: "mg" },
  { key: "vitaminA", label: "Vit. A", unit: "mcg" },
  { key: "vitaminC", label: "Vit. C", unit: "mg" },
  { key: "vitaminD", label: "Vit. D", unit: "mcg" },
  { key: "vitaminE", label: "Vit. E", unit: "mg" },
  { key: "vitaminB12", label: "B12", unit: "mcg" },
  { key: "folate", label: "Folato", unit: "mcg" },
];

const DAILY_NUTRIENT_ROWS: {
  key: keyof FoodNutrition;
  label: string;
  unit: string;
}[] = [
  { key: "kcal", label: "Calorias", unit: "kcal" },
  { key: "protein", label: "Proteína", unit: "g" },
  { key: "carbs", label: "Carboidratos", unit: "g" },
  { key: "fat", label: "Gorduras", unit: "g" },
  { key: "fiber", label: "Fibras", unit: "g" },
  { key: "sugar", label: "Açúcar", unit: "g" },
  { key: "sodium", label: "Sódio", unit: "mg" },
  { key: "calcium", label: "Cálcio", unit: "mg" },
  { key: "iron", label: "Ferro", unit: "mg" },
  { key: "potassium", label: "Potássio", unit: "mg" },
  { key: "magnesium", label: "Magnésio", unit: "mg" },
  { key: "zinc", label: "Zinco", unit: "mg" },
  { key: "vitaminA", label: "Vitamina A", unit: "mcg" },
  { key: "vitaminC", label: "Vitamina C", unit: "mg" },
  { key: "vitaminD", label: "Vitamina D", unit: "mcg" },
  { key: "vitaminE", label: "Vitamina E", unit: "mg" },
  { key: "vitaminB12", label: "Vitamina B12", unit: "mcg" },
  { key: "folate", label: "Folato", unit: "mcg" },
];

function dailyNutrientGoal(
  key: keyof FoodNutrition,
  goals: MacroGoals,
): number | undefined {
  const goal = goals[key as EditableGoalKey];
  return typeof goal === "number" && goal > 0 ? goal : undefined;
}

function formatPlanNutritionValue(value: number) {
  return value >= 10
    ? String(Math.round(value))
    : String(Math.round(value * 10) / 10).replace(".", ",");
}

function PlanNutritionChips({ nutrition }: { nutrition: FoodNutrition }) {
  const rows = PLAN_NUTRITION_ROWS.map((item) => ({
    ...item,
    value: nutrition[item.key],
  })).filter(
    (
      item,
    ): item is {
      key: keyof FoodNutrition;
      label: string;
      unit: string;
      value: number;
    } => typeof item.value === "number" && item.value > 0,
  );

  if (rows.length === 0)
    return <Text style={styles.planFoodMeta}>Sem nutrientes cadastrados.</Text>;

  return (
    <View style={styles.planNutritionChips}>
      {rows.map((item) => (
        <Text key={item.key} style={styles.planNutritionChip}>
          {item.label}: {formatPlanNutritionValue(item.value)}
          {item.unit}
        </Text>
      ))}
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
        <TextInput
          {...props}
          style={[styles.fieldInput, props.style]}
          placeholderTextColor={Colors.gray400}
        />
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
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [sex, setSex] = useState<BiologicalSex>("M");
  const [goalType, setGoalType] = useState<GoalType>("maintain");
  const [activity, setActivity] = useState<ActivityLevel>(1.55);
  const [goalInputs, setGoalInputs] = useState<
    Record<EditableGoalKey, string>
  >(formatGoalInputs(DEFAULT_GOALS));
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

  function updateGoalInput(key: EditableGoalKey, value: string) {
    setGoalInputs((current) => ({ ...current, [key]: value }));
  }

  function handleRecalculateGoals() {
    if (!patient) return;
    const error = validateProfileBasics({ name, age, weight, height });
    if (error) {
      Alert.alert("Confira os dados", error);
      return;
    }
    const profileValues = buildValidatedProfileValues({
      age,
      weight,
      height,
      fallback: patient,
    });
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
      Alert.alert("Confira os dados", error);
      return;
    }
    const profileValues = buildValidatedProfileValues({
      age,
      weight,
      height,
      fallback: patient,
    });
    const profileBase: UserProfile = {
      ...patient,
      name: name.trim() || patient.name,
      age: profileValues.age,
      weight: profileValues.weight,
      height: profileValues.height,
      sex,
      goal: goalType,
      activityLevel: activity,
      updatedAt: new Date(),
    };
    const fallbackGoals = {
      ...calcMacroGoals(profileBase),
      ...(patient.macroGoals ?? {}),
    };
    const nextProfile: UserProfile = {
      ...profileBase,
      macroGoals: buildGoalsFromInputs(goalInputs, fallbackGoals),
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
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
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScroll}
          >
            <View style={styles.fieldGrid}>
              <NutritionistField
                label="Nome"
                value={name}
                onChangeText={(v) => setName(maskNameInput(v))}
              />
              <NutritionistField
                label="Idade"
                value={age}
                onChangeText={(v) => setAge(maskAgeInput(v))}
                keyboardType="numeric"
                maxLength={3}
              />
              <NutritionistField
                label="Peso"
                value={weight}
                onChangeText={(v) => setWeight(maskWeightInput(v))}
                keyboardType="decimal-pad"
                suffix="kg"
              />
              <NutritionistField
                label="Altura"
                value={height}
                onChangeText={(v) => setHeight(maskHeightInput(v))}
                keyboardType="numeric"
                maxLength={4}
                suffix="m"
              />
            </View>

            <Text style={styles.fieldLabel}>Sexo biológico</Text>
            <View style={styles.segmentRow}>
              {(["M", "F"] as BiologicalSex[]).map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.segment, sex === item && styles.segmentActive]}
                  onPress={() => setSex(item)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      sex === item && styles.segmentTextActive,
                    ]}
                  >
                    {item === "M" ? "Masculino" : "Feminino"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Objetivo</Text>
            <View style={styles.segmentWrap}>
              {(
                [
                  ["deficit", "Emagrecer"],
                  ["maintain", "Manter"],
                  ["muscle", "Massa"],
                  ["bulk", "Volume"],
                ] as [GoalType, string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.pill, goalType === value && styles.pillActive]}
                  onPress={() => setGoalType(value)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      goalType === value && styles.pillTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Atividade</Text>
            <View style={styles.segmentWrap}>
              {(
                [
                  [1.2, "Sedentário"],
                  [1.375, "Leve"],
                  [1.55, "Moderado"],
                  [1.725, "Intenso"],
                  [1.9, "Atleta"],
                ] as [ActivityLevel, string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={String(value)}
                  style={[styles.pill, activity === value && styles.pillActive]}
                  onPress={() => setActivity(value)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      activity === value && styles.pillTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalSectionHeader}>
              <Text style={styles.sectionTitleNoMargin}>
                Metas nutricionais
              </Text>
              <TouchableOpacity
                style={styles.recalcBtn}
                onPress={handleRecalculateGoals}
              >
                <Text style={styles.recalcText}>Recalcular</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.fieldGrid}>
              {EDITABLE_GOAL_ROWS.map((item) => (
                <NutritionistField
                  key={item.key}
                  label={item.label}
                  value={goalInputs[item.key]}
                  onChangeText={(v) => updateGoalInput(item.key, v)}
                  keyboardType="numeric"
                  suffix={item.unit}
                />
              ))}
            </View>
          </ScrollView>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveText}>
                {saving ? "Salvando..." : "Salvar"}
              </Text>
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
  initialPlan,
  onClose,
  onSave,
}: {
  visible: boolean;
  patient: UserProfile | null;
  nutritionist: { id: string; name: string } | null;
  initialPlan?: FoodPlan | null;
  onClose: () => void;
  onSave: (
    plan: Omit<FoodPlan, "id" | "createdAt" | "updatedAt"> | FoodPlan,
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [mealPeriod, setMealPeriod] =
    useState<MealEntry["mealPeriod"]>("breakfast");
  const [mealTime, setMealTime] = useState("");
  const [foodQuery, setFoodQuery] = useState("");
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [loadingFoods, setLoadingFoods] = useState(false);
  const [selectedFoods, setSelectedFoods] = useState<PlanSelectedFood[]>([]);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const meal = initialPlan?.meals[0];
    setTitle(initialPlan?.title ?? "");
    setNotes(initialPlan?.notes ?? "");
    setMealPeriod(meal?.period ?? "breakfast");
    setMealTime(meal?.time ?? "");
    setFoodQuery("");
    setSelectedFoods(
      initialPlan ? selectedFoodsFromPlan(initialPlan, foods) : [],
    );
    setTimePickerOpen(false);
  }, [foods, initialPlan, visible]);

  useEffect(() => {
    let active = true;
    async function loadFoods() {
      if (!visible || !nutritionist) return;
      setLoadingFoods(true);
      try {
        const loaded = await getCustomFoods(nutritionist.id);
        if (active) setFoods(loaded);
      } catch (error) {
        console.warn("Failed to load plan foods", error);
        if (active) setFoods([]);
      } finally {
        if (active) setLoadingFoods(false);
      }
    }
    loadFoods();
    return () => {
      active = false;
    };
  }, [nutritionist, visible]);

  const suggestions = useMemo(
    () => searchPlanFoods(foodQuery, foods),
    [foodQuery, foods],
  );
  const planTotal = useMemo(
    () =>
      sumNutrition(
        selectedFoods.map((item) => ({ nutrition: item.nutrition })),
      ),
    [selectedFoods],
  );

  function addFoodToPlan(food: FoodItem) {
    const unit = food.defaultUnit;
    setSelectedFoods((items) => [
      ...items,
      {
        key: `${food.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        food,
        quantityText: "1",
        quantity: 1,
        unit,
        nutrition: calculateNutrition(food, 1, unit),
      },
    ]);
  }

  function updateSelectedFood(
    key: string,
    changes: { quantityText?: string; unit?: QuantityUnit },
  ) {
    setSelectedFoods((items) =>
      items.map((item) => {
        if (item.key !== key) return item;
        if (changes.unit) return recalcPlanFood(item, { unit: changes.unit });
        if (changes.quantityText !== undefined) {
          return recalcPlanFood(item, {
            quantityText: changes.quantityText,
            quantity: parseOptionalPlanQuantity(changes.quantityText),
          });
        }
        return item;
      }),
    );
  }

  function selectedTimeDate() {
    const [hour = 7, minute = 0] = mealTime.split(":").map(Number);
    const date = new Date();
    date.setHours(
      Number.isFinite(hour) ? hour : 7,
      Number.isFinite(minute) ? minute : 0,
      0,
      0,
    );
    return date;
  }

  function handleTimeChange(date: Date | null, dismissed: boolean) {
    if (Platform.OS === "android") setTimePickerOpen(false);
    if (dismissed || !date) return;
    setMealTime(formatBrasiliaTime(date));
  }

  function buildMealsForPlan(): FoodPlanMeal[] | null {
    if (!patient) return null;
    if (!title.trim() || selectedFoods.length === 0) {
      Alert.alert(
        "Plano incompleto",
        "Informe o título do plano e adicione ao menos um alimento.",
      );
      return null;
    }
    if (
      selectedFoods.some(
        (item) => !item.quantityText.trim() || item.quantity <= 0,
      )
    ) {
      Alert.alert(
        "Quantidade inválida",
        "Informe uma quantidade maior que zero para todos os alimentos.",
      );
      return null;
    }
    if (!isValidMealTime(mealTime)) {
      Alert.alert(
        "Horário inválido",
        "Informe o horário no formato HH:mm, por exemplo 07:30.",
      );
      return null;
    }
    const items: FoodPlanMealItem[] = selectedFoods.map((item) => ({
      foodId: item.food.id,
      name: item.food.name,
      emoji: item.food.emoji,
      quantity: `${item.quantityText} ${UNIT_LABELS[item.unit]}`,
      quantityValue: item.quantity,
      unit: item.unit,
      nutrition: item.nutrition,
    }));
    return [
      {
        period: mealPeriod,
        title: PERIOD_LABELS[mealPeriod] ?? title.trim(),
        time: mealTime.trim() || undefined,
        instructions: notes.trim() || undefined,
        items,
        totalNutrition: planTotal,
      },
    ];
  }

  async function handleCreate() {
    if (!patient || !nutritionist) return;
    const meals = buildMealsForPlan();
    if (!meals) return;

    setSaving(true);
    try {
      const payload = {
        patientId: patient.userId,
        nutritionistId: nutritionist.id,
        nutritionistName: nutritionist.name,
        title: title.trim(),
        notes: notes.trim() || undefined,
        meals,
        shoppingList: buildShoppingList(selectedFoods),
        totalNutrition: planTotal,
      };
      await onSave(
        initialPlan
          ? { ...initialPlan, ...payload, updatedAt: new Date() }
          : payload,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBg}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {initialPlan ? "Editar plano alimentar" : "Novo plano alimentar"}
            </Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.modalBodyScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScroll}
          >
            <NutritionistField
              label="Título do plano"
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: Jantar low carb"
              wide
            />
            <NutritionistField
              label="Observações"
              value={notes}
              onChangeText={setNotes}
              placeholder="Ex: beber água entre as refeições"
              multiline
              wide
            />

            <Text style={styles.fieldLabel}>Refeição</Text>
            <View style={styles.segmentWrap}>
              {MEAL_PERIOD_OPTIONS.map((period) => (
                <TouchableOpacity
                  key={period.key}
                  style={[
                    styles.pill,
                    mealPeriod === period.key && styles.pillActive,
                  ]}
                  onPress={() => setMealPeriod(period.key)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      mealPeriod === period.key && styles.pillTextActive,
                    ]}
                  >
                    {period.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Horário</Text>
            {Platform.OS === "web" ? (
              <View style={[styles.fieldBox, styles.timeInputBox]}>
                <TextInput
                  style={styles.fieldInput}
                  value={mealTime}
                  onChangeText={(value) => setMealTime(maskTimeInput(value))}
                  placeholder="07:30"
                  placeholderTextColor={Colors.gray400}
                  maxLength={5}
                  {...({ type: "time" } as any)}
                />
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.timePickerButton}
                  onPress={() => setTimePickerOpen(true)}
                >
                  <MaterialIcons
                    name="schedule"
                    size={18}
                    color={Colors.green600}
                  />
                  <Text
                    style={[
                      styles.timePickerText,
                      !mealTime && styles.timePickerPlaceholder,
                    ]}
                  >
                    {mealTime || "Selecionar horário"}
                  </Text>
                </TouchableOpacity>
                {timePickerOpen ? (
                  <NativeTimePicker
                    value={selectedTimeDate()}
                    onChange={handleTimeChange}
                  />
                ) : null}
              </>
            )}

            <View style={styles.planFoodSearchPanel}>
              <Text style={styles.fieldLabel}>Adicionar alimento</Text>
              <View style={styles.searchRow}>
                <MaterialIcons name="search" size={18} color={Colors.gray400} />
                <TextInput
                  style={styles.searchInput}
                  value={foodQuery}
                  onChangeText={setFoodQuery}
                  placeholder="Buscar alimento da base"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
              {loadingFoods ? (
                <ActivityIndicator color={Colors.green400} />
              ) : suggestions.length === 0 ? (
                <Text style={styles.mutedText}>
                  Nenhum alimento encontrado na base.
                </Text>
              ) : (
                <View style={styles.planFoodResults}>
                  {suggestions.map((food) => {
                    const unit = food.defaultUnit;
                    const previewNutrition = calculateNutrition(food, 1, unit);
                    return (
                      <View key={food.id} style={styles.planFoodOption}>
                        <View style={styles.planFoodEmoji}>
                          <FoodIcon name={food.name} emoji={food.emoji} />
                        </View>
                        <View style={styles.planFoodInfo}>
                          <Text style={styles.planFoodName}>{food.name}</Text>
                          <Text style={styles.planFoodMeta}>
                            1 {UNIT_LABELS[unit]}
                          </Text>
                          <PlanNutritionChips nutrition={previewNutrition} />
                        </View>
                        <TouchableOpacity
                          style={styles.planFoodAddBtn}
                          onPress={() => addFoodToPlan(food)}
                        >
                          <MaterialIcons
                            name="add"
                            size={20}
                            color={Colors.white}
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
          <View style={styles.planSelectedBox}>
            <View style={styles.planSelectedHeader}>
              <Text style={styles.sectionTitleNoMargin}>
                Alimentos adicionados
              </Text>
              <Text style={styles.planSelectedTotal}>
                {Math.round(planTotal.kcal)} kcal
              </Text>
            </View>
            {selectedFoods.length === 0 ? (
              <Text style={styles.mutedText}>
                Use o botão + para montar esta refeição do plano.
              </Text>
            ) : (
              <ScrollView
                style={styles.planSelectedScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {selectedFoods.map((item) => (
                  <View key={item.key} style={styles.planSelectedItem}>
                    <View style={styles.planSelectedTop}>
                      <View style={styles.planFoodEmoji}>
                        <FoodIcon
                          name={item.food.name}
                          emoji={item.food.emoji}
                        />
                      </View>
                      <View style={styles.planFoodInfo}>
                        <View style={styles.planSelectedNameRow}>
                          <Text style={styles.planFoodName}>
                            {item.food.name}
                          </Text>
                          <Text style={styles.planSelectedQtyBadge}>
                            {item.quantityText || "0"} {UNIT_LABELS[item.unit]}
                          </Text>
                        </View>
                        <PlanNutritionChips nutrition={item.nutrition} />
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          setSelectedFoods((items) =>
                            items.filter((current) => current.key !== item.key),
                          )
                        }
                      >
                        <MaterialIcons
                          name="close"
                          size={20}
                          color={Colors.gray400}
                        />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.planSelectedControls}>
                      <View style={styles.planQtyBox}>
                        <TextInput
                          style={styles.planQtyInput}
                          value={item.quantityText}
                          onChangeText={(value) =>
                            updateSelectedFood(item.key, {
                              quantityText: value,
                            })
                          }
                          keyboardType="decimal-pad"
                          placeholder="1"
                          placeholderTextColor={Colors.gray400}
                        />
                      </View>
                      <View style={styles.planUnitWrap}>
                        {getFoodUnits(item.food).map((unitOption) => (
                          <TouchableOpacity
                            key={unitOption}
                            style={[
                              styles.planUnitChip,
                              item.unit === unitOption &&
                                styles.planUnitChipActive,
                            ]}
                            onPress={() =>
                              updateSelectedFood(item.key, { unit: unitOption })
                            }
                          >
                            <Text
                              style={[
                                styles.planUnitChipText,
                                item.unit === unitOption &&
                                  styles.planUnitChipTextActive,
                              ]}
                            >
                              {UNIT_LABELS[unitOption]}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleCreate}
              disabled={saving}
            >
              <Text style={styles.saveText}>
                {saving
                  ? "Salvando..."
                  : initialPlan
                    ? "Salvar alterações"
                    : "Criar plano"}
              </Text>
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
  const { width: viewportWidth } = useWindowDimensions();
  const [patients, setPatients] = useState<UserProfile[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    dateDaysAgoBrasilia(0),
  );
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [acceptedLinks, setAcceptedLinks] = useState<NutritionistPatientLink[]>(
    [],
  );
  const [unreadChatCounts, setUnreadChatCounts] = useState<
    Record<string, number>
  >({});
  const [chatLink, setChatLink] = useState<NutritionistPatientLink | null>(
    null,
  );
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [foodPlanOpen, setFoodPlanOpen] = useState(false);
  const [editingFoodPlan, setEditingFoodPlan] = useState<FoodPlan | null>(null);
  const [foodPlans, setFoodPlans] = useState<FoodPlan[]>([]);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [activePatientView, setActivePatientView] = useState<
    "summary" | "plans" | "records" | "weekly"
  >("summary");
  const [nutrientsExpanded, setNutrientsExpanded] = useState(false);
  const patientDateScrollRef = React.useRef<ScrollView>(null);
  const compactAdherenceLayout = viewportWidth < 560;

  const selectedPatient =
    patients.find((patient) => patient.userId === selectedPatientId) ?? null;
  const logsByDate = useMemo(
    () => new Map(logs.map((log) => [log.date, log])),
    [logs],
  );
  const selectedLog = logsByDate.get(selectedDate) ?? null;
  const selectedPatientLink =
    acceptedLinks.find((link) => link.patientId === selectedPatientId) ?? null;
  const patientGoals = useMemo(
    () =>
      selectedPatient?.macroGoals ??
      (selectedPatient ? calcMacroGoals(selectedPatient) : DEFAULT_GOALS),
    [selectedPatient],
  );
  const patientDates = useMemo(
    () =>
      Array.from({ length: PATIENT_LOG_LOOKBACK_DAYS }, (_item, index) =>
        dateDaysAgoBrasilia(PATIENT_LOG_LOOKBACK_DAYS - 1 - index),
      ),
    [],
  );
  const weekRanges = useMemo(buildWeekRanges, []);
  const selectedWeek = weekRanges[selectedWeekIndex] ?? weekRanges[0];
  const previousWeek = weekRanges[selectedWeekIndex + 1];
  const selectedWeekLogs = useMemo(
    () =>
      selectedWeek.dates
        .map((date) => logsByDate.get(date))
        .filter(Boolean) as DailyLog[],
    [logsByDate, selectedWeek],
  );
  const selectedWeekAverage = useMemo(
    () => averageNutritionForDates(selectedWeek.dates, logsByDate),
    [logsByDate, selectedWeek],
  );
  const selectedWeekTotal = useMemo(
    () => totalNutritionForDates(selectedWeek.dates, logsByDate),
    [logsByDate, selectedWeek],
  );
  const selectedWeekWaterTotal = useMemo(
    () => totalWaterForDates(selectedWeek.dates, logsByDate),
    [logsByDate, selectedWeek],
  );
  const selectedWeekWaterAverage = useMemo(
    () => averageWaterForDates(selectedWeek.dates, logsByDate),
    [logsByDate, selectedWeek],
  );
  const previousWeekAverage = useMemo(
    () =>
      previousWeek
        ? averageNutritionForDates(previousWeek.dates, logsByDate)
        : EMPTY_TOTAL,
    [logsByDate, previousWeek],
  );
  const previousWeekWaterAverage = useMemo(
    () =>
      previousWeek ? averageWaterForDates(previousWeek.dates, logsByDate) : 0,
    [logsByDate, previousWeek],
  );
  const periodAverage = useMemo(
    () => averageNutritionForDates(patientDates, logsByDate),
    [logsByDate, patientDates],
  );
  const periodAverageWaterMl = useMemo(
    () => averageWaterForDates(patientDates, logsByDate),
    [logsByDate, patientDates],
  );
  const selectedWeekAlerts = useMemo(
    () => buildWeeklyAlerts(selectedWeek.dates, logsByDate, patientGoals),
    [logsByDate, patientGoals, selectedWeek],
  );
  const selectedWeekTopFoods = useMemo(
    () => buildTopFoods(selectedWeekLogs),
    [selectedWeekLogs],
  );
  const selectedWeekMealDistribution = useMemo(
    () => buildMealDistribution(selectedWeekLogs),
    [selectedWeekLogs],
  );

  async function loadPatients() {
    if (!isFirebaseConfigured || !user) return;
    setLoadingPatients(true);
    try {
      const loaded = await getLinkedPatientProfiles(user.id);
      setPatients(loaded);
      setSelectedPatientId((current) => {
        if (current && loaded.some((patient) => patient.userId === current))
          return current;
        return loaded[0]?.userId ?? null;
      });
    } catch (error) {
      console.warn("Failed to load nutritionist patients", error);
      Alert.alert("Erro", "Não foi possível carregar os pacientes agora.");
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
          if (current && loaded.some((patient) => patient.userId === current))
            return current;
          return loaded[0]?.userId ?? null;
        });
        setLoadingPatients(false);
      },
      (error) => {
        console.warn("Failed to load nutritionist patients", error);
        Alert.alert("Erro", "Não foi possível carregar os pacientes agora.");
        setLoadingPatients(false);
      },
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
        const loaded = await getPatientRecentLogs(
          selectedPatientId,
          PATIENT_LOG_LOOKBACK_DAYS,
        );
        if (!active) return;
        setLogs(loaded);
        setSelectedDate(dateDaysAgoBrasilia(0));
        setSelectedWeekIndex(0);
        setNutrientsExpanded(false);
      } catch (error) {
        console.warn("Failed to load patient logs", error);
        Alert.alert(
          "Erro",
          "Não foi possível carregar os registros deste paciente.",
        );
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
    return patients.filter((patient) =>
      patient.name.toLowerCase().includes(normalized),
    );
  }, [patients, search]);

  const entriesByPeriod = useMemo(() => {
    const groups = new Map<MealEntry["mealPeriod"], MealEntry[]>();
    selectedLog?.entries.forEach((entry) => {
      groups.set(entry.mealPeriod, [
        ...(groups.get(entry.mealPeriod) ?? []),
        entry,
      ]);
    });
    return Array.from(groups.entries())
      .map(
        ([period, entries]) =>
          [
            period,
            entries
              .slice()
              .sort(
                (a, b) =>
                  new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime(),
              ),
          ] as [MealEntry["mealPeriod"], MealEntry[]],
      )
      .sort(
        ([periodA], [periodB]) =>
          mealPeriodOrder(periodA) - mealPeriodOrder(periodB),
      );
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
      setInviteEmail("");
      setInviteModalOpen(false);
      Alert.alert(
        "Solicitação enviada",
        "O paciente receberá o convite nas notificações da página inicial.",
      );
      await loadPatients();
    } catch (error: any) {
      const message =
        error?.message === "patient_not_found"
          ? "Não encontramos um paciente cadastrado com esse e-mail."
          : error?.message === "patient_is_nutritionist"
            ? "Esse e-mail pertence a uma conta de nutricionista."
            : error?.message === "self_invite"
              ? "Você não pode enviar convite para sua própria conta."
              : error?.message === "already_accepted"
                ? "Esse paciente já aceitou seu acesso."
                : "Não foi possível enviar a solicitação agora.";
      Alert.alert("Convite não enviado", message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleSavePatientProfile(nextProfile: UserProfile) {
    try {
      await updatePatientProfile(nextProfile);
      const savedProfile = { ...nextProfile, updatedAt: new Date() };
      setPatients((items) =>
        items.map((item) =>
          item.userId === savedProfile.userId ? savedProfile : item,
        ),
      );
      Alert.alert(
        "Paciente atualizado",
        "Dados e metas nutricionais foram salvos.",
      );
    } catch (error) {
      console.warn("Failed to update patient profile", error);
      Alert.alert(
        "Erro",
        "Não foi possível salvar os dados do paciente agora.",
      );
      throw error;
    }
  }

  async function handleCreateFoodPlan(
    plan: Omit<FoodPlan, "id" | "createdAt" | "updatedAt">,
  ) {
    try {
      await createFoodPlan(plan);
      Alert.alert(
        "Plano criado",
        "O plano alimentar e a lista de compras já estão disponíveis para o paciente.",
      );
    } catch (error) {
      console.warn("Failed to create food plan", error);
      Alert.alert("Erro", "Não foi possível criar o plano alimentar agora.");
      throw error;
    }
  }

  async function handleSaveFoodPlan(
    plan: Omit<FoodPlan, "id" | "createdAt" | "updatedAt"> | FoodPlan,
  ) {
    if ("id" in plan) {
      try {
        await updateFoodPlan(plan);
        Alert.alert(
          "Plano atualizado",
          "O paciente será notificado sobre a alteração.",
        );
      } catch (error) {
        console.warn("Failed to update food plan", error);
        Alert.alert(
          "Erro",
          "Não foi possível atualizar o plano alimentar agora.",
        );
        throw error;
      }
      return;
    }
    await handleCreateFoodPlan(plan);
  }

  function openNewFoodPlan() {
    setEditingFoodPlan(null);
    setFoodPlanOpen(true);
  }

  function openEditFoodPlan(plan: FoodPlan) {
    setEditingFoodPlan(plan);
    setFoodPlanOpen(true);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <View style={styles.headerAvatar}>
            <MaterialIcons
              name="medical-services"
              size={20}
              color={Colors.green600}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Nutricionista</Text>
            <Text style={styles.title} numberOfLines={1}>
              {user?.name || "Nutricionista"}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            accessibilityLabel="Adicionar paciente"
            style={styles.headerAddBtn}
            onPress={() => setInviteModalOpen(true)}
          >
            <MaterialIcons name="add" size={24} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Sair"
            style={styles.logoutBtn}
            onPress={() => setLogoutConfirmOpen(true)}
          >
            <MaterialIcons name="logout" size={19} color={Colors.green600} />
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {!isFirebaseConfigured ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="cloud-off" size={38} color={Colors.gray400} />
            <Text style={styles.emptyTitle}>Firebase necessário</Text>
            <Text style={styles.emptyText}>
              O acesso do nutricionista usa dados sincronizados dos pacientes.
            </Text>
          </View>
        ) : (
          <>
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
                <Text style={styles.mutedText}>
                  Nenhum paciente vinculado ainda. Envie uma solicitação e
                  aguarde o aceite.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.patientRow}
                >
                  {filteredPatients.map((patient) => {
                    const active = patient.userId === selectedPatientId;
                    const patientLink = acceptedLinks.find(
                      (link) => link.patientId === patient.userId,
                    );
                    const unread = patientLink
                      ? (unreadChatCounts[patientLink.id] ?? 0)
                      : 0;
                    return (
                      <TouchableOpacity
                        key={patient.userId}
                        style={[
                          styles.patientCard,
                          active && styles.patientCardActive,
                        ]}
                        onPress={() => setSelectedPatientId(patient.userId)}
                      >
                        <View style={styles.patientNameRow}>
                          <Text
                            style={[
                              styles.patientName,
                              active && styles.patientNameActive,
                            ]}
                          >
                            {patient.name}
                          </Text>
                          {unread > 0 ? (
                            <View style={styles.patientUnreadBadge}>
                              <Text style={styles.patientUnreadText}>
                                {unread}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.patientMeta}>
                          {patient.age} anos · {patient.weight}kg
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {selectedPatient ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.patientViewTabs}
              >
                {[
                  { key: "summary", label: "Resumo", icon: "person" },
                  {
                    key: "plans",
                    label: "Plano alimentar",
                    icon: "restaurant-menu",
                  },
                  {
                    key: "records",
                    label: "Registros",
                    icon: "event-note",
                  },
                  { key: "weekly", label: "Análise semanal", icon: "insights" },
                ].map((item) => {
                  const active = activePatientView === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.patientViewTab,
                        active && styles.patientViewTabActive,
                      ]}
                      onPress={() =>
                        setActivePatientView(
                          item.key as typeof activePatientView,
                        )
                      }
                    >
                      <MaterialIcons
                        name={item.icon as any}
                        size={17}
                        color={active ? Colors.white : Colors.green600}
                      />
                      <Text
                        style={[
                          styles.patientViewTabText,
                          active && styles.patientViewTabTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            {selectedPatient && activePatientView === "summary" ? (
              <View style={styles.panel}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitleNoMargin}>
                    Resumo do paciente
                  </Text>
                  <View style={styles.patientActionRow}>
                    <TouchableOpacity
                      style={styles.chatBtn}
                      onPress={() => setEditPatientOpen(true)}
                    >
                      <MaterialIcons
                        name="edit"
                        size={17}
                        color={Colors.green600}
                      />
                      <Text style={styles.chatBtnText}>Editar</Text>
                    </TouchableOpacity>
                    {selectedPatientLink ? (
                      <TouchableOpacity
                        style={styles.chatBtn}
                        onPress={() => setChatLink(selectedPatientLink)}
                      >
                        <MaterialIcons
                          name="chat"
                          size={17}
                          color={Colors.green600}
                        />
                        <Text style={styles.chatBtnText}>
                          Chat
                          {(unreadChatCounts[selectedPatientLink.id] ?? 0) > 0
                            ? ` (${unreadChatCounts[selectedPatientLink.id]})`
                            : ""}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
                <View style={styles.summaryGrid}>
                  <InfoCard
                    label="Objetivo"
                    value={goalLabel(selectedPatient.goal)}
                  />
                  <InfoCard
                    label="Altura"
                    value={`${selectedPatient.height} cm`}
                  />
                  <InfoCard
                    label="Peso"
                    value={`${selectedPatient.weight} kg`}
                  />
                  <InfoCard
                    label="Atividade"
                    value={`${selectedPatient.activityLevel}x`}
                  />
                </View>
                <View style={styles.summaryGrid}>
                  <InfoCard
                    label="Proteína"
                    value={`${selectedPatient.macroGoals?.protein ?? calcMacroGoals(selectedPatient).protein} g`}
                  />
                  <InfoCard
                    label="Carboidratos"
                    value={`${selectedPatient.macroGoals?.carbs ?? calcMacroGoals(selectedPatient).carbs} g`}
                  />
                  <InfoCard
                    label="Gorduras"
                    value={`${selectedPatient.macroGoals?.fat ?? calcMacroGoals(selectedPatient).fat} g`}
                  />
                  <InfoCard
                    label="Calorias"
                    value={`${selectedPatient.macroGoals?.kcal ?? calcMacroGoals(selectedPatient).kcal} kcal`}
                  />
                </View>
              </View>
            ) : null}

            {selectedPatient && activePatientView === "plans" ? (
              <View style={styles.panel}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitleNoMargin}>
                    Planos alimentares
                  </Text>
                  <TouchableOpacity
                    style={styles.chatBtn}
                    onPress={openNewFoodPlan}
                  >
                    <MaterialIcons
                      name="add"
                      size={18}
                      color={Colors.green600}
                    />
                    <Text style={styles.chatBtnText}>Adicionar</Text>
                  </TouchableOpacity>
                </View>
                {foodPlans.length === 0 ? (
                  <Text style={styles.mutedText}>
                    Nenhum plano alimentar criado para este paciente.
                  </Text>
                ) : (
                  foodPlans.slice(0, 3).map((plan) => (
                    <View key={plan.id} style={styles.planCard}>
                      <View style={styles.planCardHeader}>
                        <Text style={styles.planTitle}>{plan.title}</Text>
                        <TouchableOpacity
                          style={styles.planEditBtn}
                          onPress={() => openEditFoodPlan(plan)}
                        >
                          <MaterialIcons
                            name="edit"
                            size={16}
                            color={Colors.green600}
                          />
                          <Text style={styles.planEditText}>Editar</Text>
                        </TouchableOpacity>
                      </View>
                      {plan.notes ? (
                        <Text style={styles.planNotes}>{plan.notes}</Text>
                      ) : null}
                      {plan.meals[0] ? (
                        <Text style={styles.planNotes}>
                          {plan.meals[0].time ? `${plan.meals[0].time} · ` : ""}
                          {plan.meals[0].title}
                        </Text>
                      ) : null}
                      {plan.totalNutrition ? (
                        <Text style={styles.planNutrition}>
                          {formatNutritionDetails(plan.totalNutrition, {
                            includeKcal: true,
                          })}
                        </Text>
                      ) : null}
                      <Text style={styles.planMeta}>
                        {plan.meals.length} refeição(ões) ·{" "}
                        {plan.shoppingList.length} item(ns) na lista de compras
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}

            {selectedPatient ? (
              <>
                {activePatientView === "weekly" ? (
                  <>
                    <View style={styles.panel}>
                    <View style={styles.sectionHeaderRow}>
                      <View>
                        <Text style={styles.sectionTitleNoMargin}>
                          Análise semanal do paciente
                        </Text>
                        <Text style={styles.sectionSubtitle}>
                          {selectedWeek.rangeLabel}
                        </Text>
                      </View>
                      <View style={styles.weekRegisteredPill}>
                        <Text style={styles.weekRegisteredValue}>
                          {selectedWeekLogs.length}/7
                        </Text>
                        <Text style={styles.weekRegisteredLabel}>dias</Text>
                      </View>
                    </View>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.weekSelector}
                    >
                      {weekRanges.map((week) => {
                        const active = week.index === selectedWeekIndex;
                        return (
                          <TouchableOpacity
                            key={week.index}
                            style={[
                              styles.weekChip,
                              active && styles.weekChipActive,
                            ]}
                            onPress={() => setSelectedWeekIndex(week.index)}
                          >
                            <Text
                              style={[
                                styles.weekChipText,
                                active && styles.weekChipTextActive,
                              ]}
                            >
                              {week.label}
                            </Text>
                            <Text
                              style={[
                                styles.weekChipRange,
                                active && styles.weekChipRangeActive,
                              ]}
                            >
                              {week.rangeLabel}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <View style={styles.summaryGrid}>
                      <InfoCard
                        label="Total da semana"
                        value={`${Math.round(selectedWeekTotal.kcal)} kcal`}
                      />
                      <InfoCard
                        label="Média diária"
                        value={`${selectedWeekAverage.kcal} kcal`}
                      />
                      <InfoCard
                        label="Água total"
                        value={`${Math.round(selectedWeekWaterTotal)} ml`}
                      />
                      <InfoCard
                        label="Vs semana anterior"
                        value={
                          previousWeek
                            ? formatDelta(
                                selectedWeekAverage.kcal -
                                  previousWeekAverage.kcal,
                                " kcal",
                              )
                            : "sem dados"
                        }
                      />
                    </View>
                    {previousWeek ? (
                      <Text style={styles.weekCompareText}>
                        Água média:{" "}
                        {formatDelta(
                          selectedWeekWaterAverage - previousWeekWaterAverage,
                          " ml",
                        )}{" "}
                        vs semana anterior
                      </Text>
                    ) : null}

                    <Text style={styles.analysisBlockTitle}>
                      Aderência às metas
                    </Text>
                    <View style={styles.adherenceGrid}>
                      {[
                        {
                          label: "Calorias",
                          value: goalPct(
                            selectedWeekAverage.kcal,
                            patientGoals.kcal,
                          ),
                          tone: "neutral",
                        },
                        {
                          label: "Proteína",
                          value: goalPct(
                            selectedWeekAverage.protein,
                            patientGoals.protein,
                          ),
                          tone: "neutral",
                        },
                        {
                          label: "Fibra",
                          value: goalPct(
                            selectedWeekAverage.fiber,
                            patientGoals.fiber,
                          ),
                          tone: "neutral",
                        },
                        {
                          label: "Água",
                          value: goalPct(
                            selectedWeekWaterAverage,
                            patientGoals.water,
                          ),
                          tone: "neutral",
                        },
                        {
                          label: "Sódio",
                          value: goalPct(
                            selectedWeekAverage.sodium ?? 0,
                            patientGoals.sodium,
                          ),
                          tone:
                            (selectedWeekAverage.sodium ?? 0) >
                            patientGoals.sodium
                              ? "warn"
                              : "good",
                        },
                        {
                          label: "Açúcar",
                          value: goalPct(
                            selectedWeekAverage.sugar ?? 0,
                            patientGoals.sugar,
                          ),
                          tone:
                            (selectedWeekAverage.sugar ?? 0) >
                            patientGoals.sugar
                              ? "warn"
                              : "good",
                        },
                      ].map((item) => (
                        <View
                          key={item.label}
                          style={[
                            styles.adherenceItem,
                            compactAdherenceLayout &&
                              styles.adherenceItemCompact,
                          ]}
                        >
                          <View style={styles.adherenceTop}>
                            <Text style={styles.adherenceLabel}>
                              {item.label}
                            </Text>
                            <Text
                              style={[
                                styles.adherenceValue,
                                item.tone === "warn" && styles.adherenceWarn,
                                item.tone === "good" && styles.adherenceGood,
                              ]}
                            >
                              {item.value}%
                            </Text>
                          </View>
                          <View style={styles.adherenceBarBg}>
                            <View
                              style={[
                                styles.adherenceBarFill,
                                item.tone === "warn" &&
                                  styles.adherenceBarWarn,
                                item.tone === "good" &&
                                  styles.adherenceBarGood,
                                { width: `${Math.min(item.value, 100)}%` },
                              ]}
                            />
                          </View>
                        </View>
                      ))}
                    </View>

                    <Text style={styles.analysisBlockTitle}>
                      Alertas objetivos
                    </Text>
                    <View style={styles.alertGrid}>
                      {selectedWeekAlerts.map((alert) => (
                        <View
                          key={alert.label}
                          style={[
                            styles.alertChip,
                            alert.tone === "warn"
                              ? styles.alertChipWarn
                              : styles.alertChipGood,
                          ]}
                        >
                          <Text
                            style={[
                              styles.alertValue,
                              alert.tone === "warn"
                                ? styles.alertValueWarn
                                : styles.alertValueGood,
                            ]}
                          >
                            {alert.value}
                          </Text>
                          <Text style={styles.alertLabel}>{alert.label}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.analysisColumns}>
                      <View style={styles.analysisColumn}>
                        <Text style={styles.analysisBlockTitle}>
                          Distribuição por refeição
                        </Text>
                        {selectedWeekMealDistribution.length === 0 ? (
                          <Text style={styles.mutedText}>
                            Sem refeições nessa semana.
                          </Text>
                        ) : (
                          selectedWeekMealDistribution.map((item) => (
                            <View
                              key={item.period}
                              style={styles.distributionRow}
                            >
                              <View style={styles.distributionTop}>
                                <Text style={styles.distributionName}>
                                  {item.label}
                                </Text>
                                <Text style={styles.distributionValue}>
                                  {item.pct}%
                                </Text>
                              </View>
                              <View style={styles.distributionBarBg}>
                                <View
                                  style={[
                                    styles.distributionBarFill,
                                    { width: `${item.pct}%` },
                                  ]}
                                />
                              </View>
                              <Text style={styles.distributionMeta}>
                                {item.kcal} kcal · {item.count} item(ns)
                              </Text>
                            </View>
                          ))
                        )}
                      </View>

                      <View style={styles.analysisColumn}>
                        <Text style={styles.analysisBlockTitle}>
                          Top alimentos
                        </Text>
                        {selectedWeekTopFoods.length === 0 ? (
                          <Text style={styles.mutedText}>
                            Sem alimentos nessa semana.
                          </Text>
                        ) : (
                          selectedWeekTopFoods.map((item, index) => (
                            <View key={item.name} style={styles.topFoodRow}>
                              <Text style={styles.topFoodRank}>
                                {index + 1}
                              </Text>
                              <View style={styles.topFoodEmoji}>
                                <FoodIcon
                                  name={item.name}
                                  emoji={item.emoji}
                                  size={18}
                                />
                              </View>
                              <View style={styles.topFoodInfo}>
                                <Text style={styles.topFoodName}>
                                  {item.name}
                                </Text>
                                <Text style={styles.topFoodMeta}>
                                  {item.count}x · {item.kcal} kcal ·{" "}
                                  {item.sodium}mg sódio
                                </Text>
                              </View>
                            </View>
                          ))
                        )}
                      </View>
                    </View>
                    </View>

                    <View style={styles.panel}>
                    <Text style={styles.sectionTitle}>Média de nutrientes</Text>
                    <Text style={styles.sectionSubtitle}>
                      Média diária dos últimos {PATIENT_LOG_LOOKBACK_DAYS} dias
                    </Text>
                    {DAILY_NUTRIENT_ROWS.map((item) => {
                      const value = periodAverage[item.key];
                      if (typeof value !== "number") return null;
                      return (
                        <ProgressRow
                          key={item.key}
                          label={item.label}
                          value={value}
                          goal={dailyNutrientGoal(item.key, patientGoals)}
                          unit={item.unit}
                        />
                      );
                    })}
                    <ProgressRow
                      label="Água"
                      value={periodAverageWaterMl}
                      goal={patientGoals.water}
                      unit="ml"
                    />
                    </View>
                  </>
                ) : null}

                {activePatientView === "records" ? (
                  <>
                <View style={styles.panel}>
                  <View style={styles.sectionHeaderRow}>
                    <View>
                      <Text style={styles.sectionTitleNoMargin}>
                        Registros do paciente
                      </Text>
                      <Text style={styles.sectionSubtitle}>
                        Últimos {PATIENT_LOG_LOOKBACK_DAYS} dias
                        {logs.length > 0
                          ? ` · ${logs.length} dia(s) com registro`
                          : ""}
                      </Text>
                    </View>
                  </View>
                  {loadingLogs ? (
                    <ActivityIndicator color={Colors.green400} />
                  ) : (
                    <>
                      {logs.length === 0 ? (
                        <Text style={styles.mutedText}>
                          Este paciente ainda não possui registros.
                        </Text>
                      ) : null}
                      <ScrollView
                        ref={patientDateScrollRef}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.dateRow}
                        onContentSizeChange={() =>
                          patientDateScrollRef.current?.scrollToEnd({
                            animated: false,
                          })
                        }
                      >
                        {patientDates.map((date) => {
                          const active = date === selectedDate;
                          const hasLog = logsByDate.has(date);
                          return (
                            <TouchableOpacity
                              key={date}
                              style={[
                                styles.dateChip,
                                active && styles.dateChipActive,
                              ]}
                              onPress={() => {
                                setSelectedDate(date);
                                setNutrientsExpanded(false);
                              }}
                            >
                              <Text
                                style={[
                                  styles.dateChipText,
                                  active && styles.dateChipTextActive,
                                ]}
                              >
                                {formatDateLabel(date)}
                              </Text>
                              <View
                                style={[
                                  styles.dateDot,
                                  hasLog && styles.dateDotFilled,
                                  active && styles.dateDotActive,
                                ]}
                              />
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </>
                  )}
                </View>
            {selectedLog ? (
              <>
                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Metas do dia</Text>
                  <ProgressRow
                    label="Calorias"
                    value={Math.round(selectedLog.totalNutrition.kcal)}
                    goal={selectedLog.goals.kcal}
                    unit="kcal"
                  />
                  <ProgressRow
                    label="Proteína"
                    value={Math.round(selectedLog.totalNutrition.protein)}
                    goal={selectedLog.goals.protein}
                    unit="g"
                  />
                  <ProgressRow
                    label="Carboidratos"
                    value={Math.round(selectedLog.totalNutrition.carbs)}
                    goal={selectedLog.goals.carbs}
                    unit="g"
                  />
                  <ProgressRow
                    label="Gorduras"
                    value={Math.round(selectedLog.totalNutrition.fat)}
                    goal={selectedLog.goals.fat}
                    unit="g"
                  />
                  <ProgressRow
                    label="Fibras"
                    value={Math.round(selectedLog.totalNutrition.fiber)}
                    goal={selectedLog.goals.fiber}
                    unit="g"
                  />
                  <ProgressRow
                    label="Água"
                    value={selectedLog.waterMl ?? 0}
                    goal={selectedLog.goals.water}
                    unit="ml"
                  />

                  {nutrientsExpanded ? (
                    <View style={styles.expandedNutrients}>
                      <Text style={styles.expandedNutrientsTitle}>
                        Nutrientes completos
                      </Text>
                      {DAILY_NUTRIENT_ROWS.filter(
                        (item) =>
                          ![
                            "kcal",
                            "protein",
                            "carbs",
                            "fat",
                            "fiber",
                          ].includes(item.key),
                      ).map((item) => {
                        const value = selectedLog.totalNutrition[item.key] ?? 0;
                        return (
                          <ProgressRow
                            key={item.key}
                            label={item.label}
                            value={Math.round(value)}
                            goal={dailyNutrientGoal(item.key, selectedLog.goals)}
                            unit={item.unit}
                          />
                        );
                      })}
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={styles.expandNutrientsBtn}
                    onPress={() => setNutrientsExpanded((current) => !current)}
                  >
                    <Text style={styles.expandNutrientsText}>
                      {nutrientsExpanded
                        ? "Ocultar nutrientes completos"
                        : "Ver nutrientes completos"}
                    </Text>
                    <MaterialIcons
                      name={nutrientsExpanded ? "expand-less" : "expand-more"}
                      size={22}
                      color={Colors.green600}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Refeições e horários</Text>
                  {entriesByPeriod.length === 0 ? (
                    <Text style={styles.mutedText}>
                      Nenhuma refeição registrada neste dia.
                    </Text>
                  ) : (
                    entriesByPeriod.map(([period, entries]) => (
                      <View key={period} style={styles.periodBlock}>
                        <Text style={styles.periodTitle}>
                          {PERIOD_LABELS[period] ?? period}
                        </Text>
                        {entries.map((entry) => (
                          <View key={entry.id} style={styles.entryRow}>
                            <View style={styles.entryEmoji}>
                              <FoodIcon
                                name={entry.foodName}
                                emoji={entry.emoji}
                                size={18}
                              />
                            </View>
                            <View style={styles.entryBody}>
                              <Text style={styles.entryName}>
                                {entry.foodName}
                              </Text>
                              <Text style={styles.entryMeta}>
                                {formatBrasiliaTime(new Date(entry.addedAt))}
                                {" · "}
                                {formatNutritionDetails(entry.nutrition, {
                                  includeKcal: true,
                                })}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))
                  )}
                </View>
              </>
            ) : (
              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Refeições e horários</Text>
                <Text style={styles.mutedText}>
                  Nenhuma refeição registrada em {formatDateLabel(selectedDate)}.
                </Text>
              </View>
            )}
                  </>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      <Modal
        visible={inviteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteModalOpen(false)}
      >
        <View style={styles.centerModalBg}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            onPress={() => setInviteModalOpen(false)}
          />
          <View style={styles.inviteModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Adicionar paciente</Text>
                <Text style={styles.inviteModalSubtitle}>
                  Envie uma solicitação usando o e-mail cadastrado pelo
                  paciente.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setInviteModalOpen(false)}
              >
                <MaterialIcons name="close" size={20} color={Colors.gray600} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>E-mail do paciente</Text>
            <View style={styles.inviteModalInputBox}>
              <MaterialIcons name="email" size={19} color={Colors.gray400} />
              <TextInput
                style={styles.inviteModalInput}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="email@paciente.com"
                placeholderTextColor={Colors.gray400}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>
            <View style={styles.inviteModalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setInviteModalOpen(false)}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (!inviteEmail.trim() || inviteLoading) && styles.btnDisabled,
                ]}
                onPress={handleSendInvite}
                disabled={!inviteEmail.trim() || inviteLoading}
              >
                {inviteLoading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.saveText}>Enviar solicitação</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <NutritionistChatModal
        visible={Boolean(chatLink)}
        link={chatLink}
        currentUserId={user?.id}
        currentUserName={user?.name ?? "Nutricionista"}
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
        initialPlan={editingFoodPlan}
        onClose={() => {
          setFoodPlanOpen(false);
          setEditingFoodPlan(null);
        }}
        onSave={handleSaveFoodPlan}
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

function ProgressRow({
  label,
  value,
  goal,
  unit,
}: {
  label: string;
  value: number;
  goal?: number;
  unit: string;
}) {
  const hasGoal = typeof goal === "number" && goal > 0;
  const progress = hasGoal ? Math.min(100, pct(value, goal)) : value > 0 ? 100 : 0;
  const over = hasGoal && value > goal * 1.1;
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressTop}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={[styles.progressValue, over && styles.progressOver]}>
          {formatPlanNutritionValue(value)}
          {unit}
          {hasGoal ? ` / ${formatPlanNutritionValue(goal)}${unit}` : ""}
        </Text>
      </View>
      <View style={styles.progressBg}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progress}%`,
              backgroundColor: over ? Colors.danger : Colors.green400,
            },
          ]}
        />
      </View>
    </View>
  );
}

function goalLabel(goal: UserProfile["goal"]) {
  return goal === "deficit"
    ? "Emagrecer"
    : goal === "muscle"
      ? "Ganhar massa"
      : goal === "bulk"
        ? "Ganho de peso"
        : "Manter peso";
}

function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 900 : undefined,
    alignSelf: "center",
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.green50,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerAddBtn: {
    width: 40,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.green600,
    borderRadius: Radius.full,
  },
  eyebrow: {
    fontSize: Typography.xs,
    color: Colors.green600,
    fontWeight: Typography.bold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.gray800,
  },
  subtitle: {
    marginTop: 2,
    fontSize: Typography.sm,
    color: Colors.gray400,
    lineHeight: 18,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.green50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
  },
  logoutText: {
    color: Colors.green600,
    fontWeight: Typography.bold,
    fontSize: Typography.xs,
  },
  scroll: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 900 : undefined,
    alignSelf: "center",
    padding: Spacing.base,
    paddingBottom: Spacing.xxl,
  },
  panel: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.gray800,
    marginBottom: Spacing.sm,
  },
  sectionTitleNoMargin: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.gray800,
  },
  sectionSubtitle: {
    marginTop: 3,
    fontSize: Typography.xs,
    color: Colors.gray400,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  patientActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: Spacing.xs,
    flex: 1,
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.green50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
  },
  chatBtnText: {
    fontSize: Typography.xs,
    color: Colors.green600,
    fontWeight: Typography.bold,
  },
  inviteRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  inviteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
    fontSize: Typography.sm,
    color: Colors.gray800,
  },
  inviteBtn: {
    minWidth: 92,
    minHeight: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.green400,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  inviteBtnText: {
    color: Colors.white,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  btnDisabled: { opacity: 0.6 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    fontSize: Typography.sm,
    color: Colors.gray800,
  },
  patientRow: { gap: Spacing.sm },
  patientCard: {
    width: 180,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    backgroundColor: Colors.gray50,
  },
  patientCardActive: {
    borderColor: Colors.green400,
    backgroundColor: Colors.green50,
  },
  patientNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  patientName: {
    fontSize: Typography.sm,
    color: Colors.gray800,
    fontWeight: Typography.bold,
  },
  patientNameActive: { color: Colors.green600 },
  patientUnreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.green400,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  patientUnreadText: {
    fontSize: Typography.xs,
    color: Colors.white,
    fontWeight: Typography.bold,
  },
  patientMeta: { marginTop: 3, fontSize: Typography.xs, color: Colors.gray400 },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  infoCard: {
    flexGrow: 1,
    flexBasis: Platform.OS === "web" ? "23%" : "47%",
    minWidth: Platform.OS === "web" ? 150 : 136,
    minHeight: 76,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    justifyContent: "center",
  },
  infoLabel: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    fontWeight: Typography.bold,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  infoValue: {
    fontSize: Typography.md,
    color: Colors.gray800,
    fontWeight: Typography.bold,
    lineHeight: 20,
  },
  planCard: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  planCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  planTitle: {
    fontSize: Typography.sm,
    color: Colors.gray800,
    fontWeight: Typography.bold,
  },
  planEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.green50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  planEditText: {
    fontSize: Typography.xs,
    color: Colors.green600,
    fontWeight: Typography.bold,
  },
  planNotes: {
    marginTop: 3,
    fontSize: Typography.xs,
    color: Colors.gray600,
    lineHeight: 17,
  },
  planNutrition: {
    marginTop: 5,
    fontSize: Typography.xs,
    color: Colors.gray800,
    lineHeight: 17,
  },
  planMeta: {
    marginTop: 4,
    fontSize: Typography.xs,
    color: Colors.green600,
    fontWeight: Typography.semibold,
  },
  dateRow: { gap: Spacing.xs },
  dateChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: Colors.white,
  },
  dateChipActive: {
    borderColor: Colors.green400,
    backgroundColor: Colors.green50,
  },
  dateChipText: {
    fontSize: Typography.sm,
    color: Colors.gray400,
    fontWeight: Typography.bold,
  },
  dateChipTextActive: { color: Colors.green600 },
  dateDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginTop: 4,
  },
  dateDotFilled: { backgroundColor: Colors.green400 },
  dateDotActive: { backgroundColor: Colors.green600 },
  weekRegisteredPill: {
    minWidth: 68,
    alignItems: "center",
    borderRadius: Radius.md,
    backgroundColor: Colors.green50,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
  },
  weekRegisteredValue: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.green600,
  },
  weekRegisteredLabel: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    marginTop: -2,
  },
  weekSelector: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  weekChip: {
    minWidth: 132,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    backgroundColor: Colors.white,
  },
  weekChipActive: {
    borderColor: Colors.green400,
    backgroundColor: Colors.green50,
  },
  weekChipText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.gray600,
  },
  weekChipTextActive: { color: Colors.green600 },
  weekChipRange: { fontSize: 10, color: Colors.gray400, marginTop: 2 },
  weekChipRangeActive: { color: Colors.green600 },
  weekCompareText: {
    marginTop: Spacing.sm,
    fontSize: Typography.xs,
    color: Colors.gray400,
    fontWeight: Typography.semibold,
  },
  analysisBlockTitle: {
    fontSize: Typography.xs,
    color: Colors.gray600,
    fontWeight: Typography.bold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  adherenceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  adherenceItem: {
    width: Platform.OS === "web" ? "15.5%" : "31%",
    minHeight: 74,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.sm,
    justifyContent: "space-between",
  },
  adherenceItemCompact: {
    width: "47.5%",
    flexGrow: 1,
  },
  adherenceTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },
  adherenceLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: Typography.xs,
    color: Colors.gray400,
    fontWeight: Typography.semibold,
  },
  adherenceValue: {
    flexShrink: 0,
    fontSize: Typography.md,
    color: Colors.gray800,
    fontWeight: Typography.bold,
  },
  adherenceWarn: { color: Colors.warning },
  adherenceGood: { color: Colors.green600 },
  adherenceBarBg: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    overflow: "hidden",
    marginTop: Spacing.sm,
  },
  adherenceBarFill: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.green400,
  },
  adherenceBarWarn: { backgroundColor: Colors.warning },
  adherenceBarGood: { backgroundColor: Colors.green600 },
  alertGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  alertChip: {
    minWidth: Platform.OS === "web" ? 126 : "47%",
    flex: Platform.OS === "web" ? 1 : undefined,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  alertChipGood: {
    backgroundColor: Colors.green50,
    borderColor: Colors.green400,
  },
  alertChipWarn: { backgroundColor: Colors.fatL, borderColor: "#F6C36A" },
  alertValue: { fontSize: Typography.md, fontWeight: Typography.bold },
  alertValueGood: { color: Colors.green600 },
  alertValueWarn: { color: Colors.warning },
  alertLabel: {
    fontSize: Typography.xs,
    color: Colors.gray600,
    marginTop: 2,
    fontWeight: Typography.semibold,
  },
  analysisColumns: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  analysisColumn: { flex: 1 },
  distributionRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  distributionTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  distributionName: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.gray800,
  },
  distributionValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.green600,
  },
  distributionBarBg: {
    height: 6,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.full,
    overflow: "hidden",
    marginTop: 6,
  },
  distributionBarFill: {
    height: 6,
    backgroundColor: Colors.green400,
    borderRadius: Radius.full,
  },
  distributionMeta: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    marginTop: 4,
  },
  topFoodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  topFoodRank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.green50,
    color: Colors.green600,
    textAlign: "center",
    lineHeight: 22,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
  },
  topFoodEmoji: { width: 34, alignItems: "center" },
  topFoodInfo: { flex: 1 },
  topFoodName: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.gray800,
  },
  topFoodMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  progressRow: { marginBottom: Spacing.sm },
  progressTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: 5,
  },
  progressLabel: {
    fontSize: Typography.sm,
    color: Colors.gray800,
    fontWeight: Typography.semibold,
  },
  progressValue: {
    fontSize: Typography.sm,
    color: Colors.gray600,
    fontWeight: Typography.bold,
  },
  progressOver: { color: Colors.danger },
  progressBg: {
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray50,
    overflow: "hidden",
  },
  progressFill: { height: 7, borderRadius: Radius.full },
  nutritionText: {
    fontSize: Typography.sm,
    color: Colors.gray600,
    lineHeight: 20,
  },
  periodBlock: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  periodTitle: {
    fontSize: Typography.sm,
    color: Colors.green600,
    fontWeight: Typography.bold,
    marginBottom: Spacing.xs,
  },
  entryRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  entryEmoji: { width: 34, alignItems: "center" },
  entryBody: { flex: 1 },
  entryName: {
    fontSize: Typography.sm,
    color: Colors.gray800,
    fontWeight: Typography.bold,
  },
  entryMeta: {
    marginTop: 2,
    fontSize: Typography.xs,
    color: Colors.gray400,
    lineHeight: 16,
  },
  mutedText: { fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
  emptyState: {
    alignItems: "center",
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
  },
  emptyTitle: {
    marginTop: Spacing.sm,
    fontSize: Typography.base,
    color: Colors.gray800,
    fontWeight: Typography.bold,
  },
  emptyText: {
    marginTop: 4,
    fontSize: Typography.sm,
    color: Colors.gray400,
    textAlign: "center",
    lineHeight: 18,
  },
  modalBg: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    maxHeight: "92%",
    width: "100%",
    maxWidth: Platform.OS === "web" ? 760 : undefined,
    alignSelf: "center",
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.base,
    paddingBottom: Spacing.lg,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: Spacing.base,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: Typography.xl,
    color: Colors.gray800,
    fontWeight: Typography.bold,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.gray50,
  },
  modalBodyScroll: { flexShrink: 1 },
  modalScroll: { paddingBottom: Spacing.base },
  modalSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalHint: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    lineHeight: 17,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  fieldWrap: { width: "48%" },
  fieldWrapWide: { width: "100%" },
  fieldLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.gray600,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fieldBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.white,
  },
  fieldInput: {
    flex: 1,
    minHeight: 42,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sm,
    color: Colors.gray800,
  },
  fieldSuffix: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    marginLeft: 4,
  },
  timeInputBox: { marginBottom: Spacing.md },
  timePickerButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.white,
    marginBottom: Spacing.md,
  },
  timePickerText: {
    fontSize: Typography.sm,
    color: Colors.gray800,
    fontWeight: Typography.semibold,
  },
  timePickerPlaceholder: { color: Colors.gray400 },
  multilineInput: { minHeight: 96, textAlignVertical: "top" },
  segmentRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentActive: {
    backgroundColor: Colors.green50,
    borderColor: Colors.green400,
  },
  segmentText: { color: Colors.gray600, fontWeight: Typography.semibold },
  segmentTextActive: { color: Colors.green600 },
  segmentWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray50,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: { backgroundColor: Colors.green50, borderColor: Colors.green400 },
  pillText: {
    color: Colors.gray600,
    fontWeight: Typography.semibold,
    fontSize: Typography.sm,
  },
  pillTextActive: { color: Colors.green600 },
  recalcBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.green50,
    borderWidth: 1,
    borderColor: Colors.green400,
  },
  recalcText: {
    color: Colors.green600,
    fontWeight: Typography.bold,
    fontSize: Typography.sm,
  },
  planFoodSearchPanel: { marginTop: Spacing.sm, marginBottom: Spacing.md },
  planFoodResults: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: "hidden",
    backgroundColor: Colors.white,
  },
  planFoodOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  planFoodEmoji: { width: 38, alignItems: "center" },
  planFoodInfo: { flex: 1 },
  planFoodName: {
    fontSize: Typography.sm,
    color: Colors.gray800,
    fontWeight: Typography.bold,
  },
  planFoodMeta: {
    marginTop: 2,
    fontSize: Typography.xs,
    color: Colors.gray400,
    lineHeight: 16,
  },
  planNutritionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 6,
  },
  planNutritionChip: {
    overflow: "hidden",
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 10,
    color: Colors.gray600,
    fontWeight: Typography.semibold,
  },
  planFoodAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.green400,
  },
  planSelectedBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    backgroundColor: Colors.gray50,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    maxHeight: Platform.OS === "web" ? 280 : 260,
  },
  planSelectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  planSelectedTotal: {
    fontSize: Typography.sm,
    color: Colors.green600,
    fontWeight: Typography.bold,
  },
  planSelectedScroll: { flexShrink: 1 },
  planSelectedItem: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  planSelectedTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  planSelectedNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
  },
  planSelectedQtyBadge: {
    maxWidth: "42%",
    overflow: "hidden",
    borderRadius: Radius.full,
    backgroundColor: Colors.green50,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    color: Colors.green600,
    fontWeight: Typography.bold,
  },
  planSelectedControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  planQtyBox: { width: 72 },
  planQtyInput: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    color: Colors.gray800,
    backgroundColor: Colors.white,
  },
  planUnitWrap: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5 },
  planUnitChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: Colors.white,
  },
  planUnitChipActive: {
    borderColor: Colors.green400,
    backgroundColor: Colors.green50,
  },
  planUnitChipText: {
    fontSize: Typography.xs,
    color: Colors.gray600,
    fontWeight: Typography.semibold,
  },
  planUnitChipTextActive: { color: Colors.green600 },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: { color: Colors.gray600, fontWeight: Typography.semibold },
  saveBtn: {
    flex: 1.4,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.green400,
  },
  saveText: { color: Colors.white, fontWeight: Typography.bold },
  patientViewTabs: { paddingBottom: Spacing.sm, gap: 8 },
  patientViewTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  patientViewTabActive: {
    backgroundColor: Colors.green600,
    borderColor: Colors.green600,
  },
  patientViewTabText: {
    color: Colors.green600,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  patientViewTabTextActive: { color: Colors.white },
  expandedNutrients: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  expandedNutrientsTitle: {
    color: Colors.gray800,
    fontWeight: Typography.bold,
    fontSize: Typography.sm,
    marginBottom: 4,
  },
  expandNutrientsBtn: {
    minHeight: 44,
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.green50,
  },
  expandNutrientsText: {
    color: Colors.green600,
    fontWeight: Typography.bold,
    fontSize: Typography.sm,
  },
  nutrientLine: {
    height: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.green50,
    marginTop: 6,
  },
  centerModalBg: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.base,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  inviteModalCard: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    ...Shadows.sm,
  },
  inviteModalSubtitle: {
    marginTop: 3,
    maxWidth: 330,
    color: Colors.gray400,
    fontSize: Typography.sm,
    lineHeight: 18,
  },
  inviteModalInputBox: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.white,
  },
  inviteModalInput: {
    flex: 1,
    minWidth: 0,
    color: Colors.gray800,
    fontSize: Typography.base,
  },
  inviteModalActions: {
    marginTop: Spacing.base,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
});
