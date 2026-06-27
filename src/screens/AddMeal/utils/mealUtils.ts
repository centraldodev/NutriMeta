import { calculateNutrition, UNIT_LABELS } from "../../../constants/foodDatabase";
import { PhotoMealAiItem } from "../../../services/photoMealAiService";
import { customFoodId } from "../../../services/customFoodService";
import { DailyLog, FoodItem, FoodNutrition, MealEntry, MealPeriod, QuantityUnit } from "../../../types";
import {
  formatBrasiliaDate,
  formatDate,
  generateId,
  getBrasiliaHour,
} from "../../../utils/nutrition";
import { MealDraft, MealEntryPayload, MEAL_PERIOD_LABELS, SpeechRecognitionModule } from "../types";
import { findAnyFood, findBestFood, getWaterMl } from "./foodSearch";

declare const require: (name: string) => any;

export function loadSpeechRecognitionModule(): SpeechRecognitionModule | null {
  try {
    return require("expo-speech-recognition").ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

export function mergeDailyLogs(
  primary: DailyLog[],
  secondary: DailyLog[],
): DailyLog[] {
  const byDate = new Map<string, DailyLog>();
  secondary.forEach((log) => byDate.set(log.date, log));
  primary.forEach((log) => byDate.set(log.date, log));
  return Array.from(byDate.values()).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}

export function formatDateChip(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return {
    day: formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), {
      day: "2-digit",
    }),
    weekday: formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), {
      weekday: "short",
    }).replace(".", ""),
  };
}

export function formatLogDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export function getFoodUnits(food: FoodItem | null): QuantityUnit[] {
  if (!food) return ["porcao", "colher_sopa", "xicara", "grama"];
  return Object.keys(food.nutritionPer) as QuantityUnit[];
}

export function getPreferredFoodUnit(food: FoodItem): QuantityUnit {
  return food.nutritionPer.porcao ? "porcao" : food.defaultUnit;
}

export function emptyNutrition(): ReturnType<typeof calculateNutrition> {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

export function normalizeAiFoodName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function markAiFood(food: FoodItem): FoodItem {
  return {
    ...food,
    source: food.source ?? "ai",
  };
}

export function createAiFood(item: PhotoMealAiItem, index: number): FoodItem | null {
  const nutrition = item.nutritionPerUnit;
  const name = normalizeAiFoodName(item.foodName);
  if (!name || !nutrition || nutrition.kcal <= 0) return null;

  return markAiFood({
    id: customFoodId(name),
    name,
    emoji: item.emoji?.trim() || "🍽️",
    aliases: [name.toLowerCase()],
    defaultUnit: item.unit,
    nutritionPer: {
      [item.unit]: nutrition,
    },
  });
}

export function createLocalEntry(
  userId: string,
  payload: MealEntryPayload,
): MealEntry {
  return {
    ...payload,
    id: generateId(),
    userId,
    addedAt: new Date(),
  };
}

export function firebaseErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  if (err?.code === "permission-denied") {
    return "O Firebase recusou a gravação por regra de permissão. Confira as Firestore Rules do projeto.";
  }
  if (err?.code === "unavailable" || err?.code === "deadline-exceeded") {
    return "O Firebase não respondeu agora. Verifique a conexão e tente novamente.";
  }
  if (err?.code) return `Erro do Firebase: ${err.code}.`;
  return err?.message
    ? `Erro: ${err.message}`
    : "Erro desconhecido ao sincronizar com o Firebase.";
}

export function recalcMealDraft(
  item: MealDraft,
  changes: Partial<MealDraft>,
): MealDraft {
  const next = { ...item, ...changes };
  if (!next.food) {
    return {
      ...next,
      foodFound: false,
      nutrition: emptyNutrition(),
    };
  }
  const unit = next.food.nutritionPer[next.unit]
    ? next.unit
    : next.food.defaultUnit;
  const quantity = next.quantity > 0 ? next.quantity : 0;
  const adjustedQuantity =
    next.food.defaultUnit === "mililitro" &&
    unit === "mililitro" &&
    !next.food.nutritionPer[next.unit] &&
    quantity === 1
      ? 200
      : quantity;
  return {
    ...next,
    foodFound: true,
    unit,
    quantityText: next.quantityText,
    quantity: adjustedQuantity,
    nutrition: calculateNutrition(next.food, adjustedQuantity, unit),
  };
}

export function divideNutrition(
  nutrition: FoodNutrition,
  quantity: number,
): FoodNutrition {
  const factor = quantity > 0 ? quantity : 1;
  const result = { ...emptyNutrition() } as FoodNutrition;
  (
    Object.entries(nutrition) as [keyof FoodNutrition, number | undefined][]
  ).forEach(([key, value]) => {
    if (typeof value !== "number") return;
    result[key] = (Math.round((value / factor) * 10) / 10) as never;
  });
  result.kcal = Math.round(result.kcal);
  return result;
}

export function editableFoodFromEntry(
  entry: MealEntry,
  customFoods: FoodItem[],
): FoodItem {
  const found =
    findAnyFood(entry.foodName.replace(/\(.+\)$/g, "").trim(), customFoods) ??
    findBestFood(entry.foodName, customFoods, 20);
  if (found) return found;
  return {
    id: `entry_${entry.id}`,
    name: entry.foodName.replace(/\(.+\)$/g, "").trim() || entry.foodName,
    emoji: entry.emoji,
    aliases: [entry.foodName.toLowerCase()],
    defaultUnit: entry.unit,
    nutritionPer: {
      [entry.unit]: divideNutrition(entry.nutrition, entry.quantity),
    },
    source: "entry",
  };
}

export function getDefaultMealPeriod(date = new Date()): MealPeriod {
  const hour = getBrasiliaHour(date);
  if (hour >= 5 && hour < 10) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 18 && hour < 22) return "dinner";
  return "snack";
}

export function getEntryMealPeriod(entry: MealEntry): MealPeriod {
  return entry.mealPeriod ?? getDefaultMealPeriod(new Date(entry.addedAt));
}

export function createMealGroupId(source: string) {
  return `${source}_${formatDate(new Date())}_${generateId()}`;
}

export function buildMealPayload({
  food,
  quantity,
  unit,
  nutrition,
  mealPeriod,
  source,
  mealGroupId,
  savedMealId,
}: {
  food: FoodItem;
  quantity: number;
  unit: QuantityUnit;
  nutrition: FoodNutrition;
  mealPeriod: MealPeriod;
  source: MealEntry["source"];
  mealGroupId: string;
  savedMealId?: string;
}): MealEntryPayload {
  const waterMl = getWaterMl(food, quantity, unit);
  const finalMealPeriod = waterMl ? "hydration" : mealPeriod;
  return {
    foodName: `${food.name} (${quantity} ${UNIT_LABELS[unit]})`,
    emoji: food.emoji,
    quantity,
    unit,
    nutrition,
    waterMl,
    mealPeriod: finalMealPeriod,
    mealGroupId: waterMl ? `${mealGroupId}_hydration` : mealGroupId,
    mealGroupLabel: MEAL_PERIOD_LABELS[finalMealPeriod],
    source,
    savedMealId,
  };
}
