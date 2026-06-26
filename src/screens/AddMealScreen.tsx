import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors, Typography, Spacing, Radius } from "../constants/theme";
import { useStore, selectGoals, selectSavedMeals } from "../store";
import {
  getRecentDailyLogs,
  incrementMealUsage,
  removeMealEntry,
  updateMealEntry,
} from "../services/nutritionService";
import { addCommunityPost } from "../services/groupService";
import { getCachedRecentDailyLogs } from "../services/dailyLogStorage";
import { WaterModal } from "./HomeScreen";
import {
  removePendingMealEntryByEntryId,
  saveMealEntryOrQueue,
  subscribePendingMealEntries,
} from "../services/pendingSyncService";
import {
  analyzeMealPhoto,
  PhotoMealAiItem,
} from "../services/photoMealAiService";
import {
  customFoodId,
  getCustomFoods,
  saveCustomFood,
} from "../services/customFoodService";
import { generateFoodNutrition } from "../services/foodNutritionAiService";
import {
  parseQuantityFromText,
  calculateNutrition,
  UNIT_LABELS,
} from "../constants/foodDatabase";
import {
  DailyLog,
  FoodItem,
  FoodNutrition,
  MealEntry,
  MealPeriod,
  QuantityUnit,
} from "../types";
import {
  dateDaysAgoBrasilia,
  formatBrasiliaDate,
  formatBrasiliaTime,
  formatNutritionDetails,
  generateId,
  formatDate,
  getBrasiliaHour,
  sumNutrition,
} from "../utils/nutrition";
import { isAiLimitError, showAiLimitAlert } from "../utils/aiErrors";
import { isFirebaseConfigured } from "../config";
import { FoodIcon } from "../components/FoodIcon";

declare const require: (name: string) => any;

// No navegador, absolute acompanha o contêiner da página.
// fixed mantém o FAB preso à janela; no Android/iOS, absolute é o correto.
const VIEWPORT_POSITION: any =
  Platform.OS === "web" ? "fixed" : "absolute";

function mergeDailyLogs(
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

function formatDateChip(date: string) {
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

function formatLogDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

type SpeechRecognitionModule = {
  addListener: (
    eventName: string,
    listener: (event: any) => void,
  ) => { remove: () => void };
  isRecognitionAvailable: () => boolean;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (options: {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
  }) => void;
  stop: () => void;
};

function loadSpeechRecognitionModule(): SpeechRecognitionModule | null {
  try {
    return require("expo-speech-recognition").ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

function getFoodUnits(food: FoodItem | null): QuantityUnit[] {
  if (!food) return ["porcao", "colher_sopa", "xicara", "grama"];
  return Object.keys(food.nutritionPer) as QuantityUnit[];
}

function getPreferredFoodUnit(food: FoodItem): QuantityUnit {
  return food.nutritionPer.porcao ? "porcao" : food.defaultUnit;
}

const FOOD_MATCH_STOP_WORDS = new Set([
  "com",
  "sem",
  "de",
  "da",
  "do",
  "dos",
  "das",
  "tipo",
  "var",
  "mais",
  "tambem",
  "também",
  "um",
  "uma",
  "dois",
  "duas",
  "tres",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "colher",
  "colheres",
  "sopa",
  "cha",
  "chá",
  "xicara",
  "xícara",
  "copo",
  "garrafa",
  "lata",
  "concha",
  "fatia",
  "file",
  "filé",
  "bife",
  "medio",
  "médio",
  "unidade",
  "unidades",
  "porcao",
  "porção",
  "grama",
  "gramas",
  "quilo",
  "kg",
  "ml",
  "litro",
  "litros",
]);

const FOOD_SYNONYMS: Record<string, string[]> = {
  cafe: ["cafe", "café", "infusao", "infusão"],
  frances: ["frances", "francês", "trigo"],
  branco: ["tipo", "1", "branco"],
  refri: ["refrigerante", "cola", "guarana", "guaraná"],
  coca: ["refrigerante", "cola"],
  frango: ["frango", "galinha"],
  carne: ["carne", "bovina"],
  leite: ["leite", "vaca", "integral"],
  catupiry: ["requeijao", "cremoso"],
};

const FOOD_COMPONENT_ALIASES: Record<string, string[]> = {
  catupiry: ["requeijao cremoso"],
};

function normalizeFoodText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bmussarela\b/g, "mucarela")
    .replace(/\bmozarela\b/g, "mucarela")
    .replace(/\bcatupiri\b/g, "catupiry")
    .replace(/\s+/g, " ")
    .trim();
}

function foodTokens(value: string): string[] {
  return normalizeFoodText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !FOOD_MATCH_STOP_WORDS.has(token));
}

function expandFoodTokens(tokens: string[]): Set<string> {
  const expanded = new Set(tokens);
  tokens.forEach((token) => {
    FOOD_SYNONYMS[token]?.forEach((synonym) =>
      expanded.add(normalizeFoodText(synonym)),
    );
  });
  return expanded;
}

function foodSearchText(food: FoodItem) {
  return [food.name, ...(food.aliases ?? [])].join(" ");
}

function foodMatchScore(query: string, food: FoodItem): number {
  const queryTokens = expandFoodTokens(foodTokens(query));
  if (queryTokens.size === 0) return 0;

  const foodText = normalizeFoodText(foodSearchText(food));
  const targetTokens = expandFoodTokens(foodTokens(foodText));
  const exactText = normalizeFoodText(query);

  if (
    foodText === exactText ||
    food.aliases.some((alias) => normalizeFoodText(alias) === exactText)
  ) {
    return 100;
  }
  if (foodText.includes(exactText) && exactText.length >= 4) {
    return 80 + Math.min(10, exactText.length / 4);
  }

  let matches = 0;
  queryTokens.forEach((token) => {
    if (targetTokens.has(token)) matches += 1;
  });

  const coverage = matches / queryTokens.size;
  const extraPenalty = Math.max(0, targetTokens.size - matches) * 0.35;
  const preferredBonus =
    (queryTokens.has("cozido") && targetTokens.has("cozido") ? 4 : 0) +
    (queryTokens.has("cru") && targetTokens.has("cru") ? 4 : 0) +
    (queryTokens.has("assado") && targetTokens.has("assado") ? 4 : 0) +
    (queryTokens.has("grelhado") && targetTokens.has("grelhado") ? 4 : 0);

  return coverage * 70 + matches * 5 + preferredBonus - extraPenalty;
}

function findBestFood(
  query: string,
  customFoods: FoodItem[] = [],
  minScore = 30,
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;

  const ranked = customFoods
    .map((food) => ({ food, score: foodMatchScore(query, food) }))
    .filter((item) => item.score >= minScore)
    .sort(
      (a, b) => b.score - a.score || a.food.name.length - b.food.name.length,
    );

  return ranked[0]?.food;
}

function findAnyFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  return (
    customFoods.find(
      (food) =>
        normalizeFoodText(food.name) === normalized ||
        food.aliases.some((alias) => normalizeFoodText(alias) === normalized),
    ) ?? findBestFood(query, customFoods)
  );
}

function findExactFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  return customFoods.find(
    (food) =>
      normalizeFoodText(food.name) === normalized ||
      food.aliases.some((alias) => normalizeFoodText(alias) === normalized),
  );
}

function findLiteralFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  return customFoods.find(
    (food) => normalizeFoodText(food.name) === normalized,
  );
}

function findContainedFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  const tokenCount = foodTokens(normalized).length;
  const matches = customFoods
    .filter((food) => {
      const foodName = normalizeFoodText(food.name);
      if (foodName === normalized) return true;
      if (tokenCount < 2) return false;
      return foodName.includes(normalized);
    })
    .sort((a, b) => a.name.length - b.name.length);
  return matches[0];
}

function findCompositePartFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  const candidates = [
    normalized,
    ...(FOOD_COMPONENT_ALIASES[normalized] ?? []),
  ];
  for (const candidate of candidates) {
    const food =
      findLiteralFood(candidate, customFoods) ??
      findContainedFood(candidate, customFoods);
    if (food) return food;
  }
  return undefined;
}

function splitCompositeFoodQuery(query: string): string[] {
  return normalizeFoodText(query)
    .split(
      /\b(?:acompanhado de|acompanhada de|acompanhado|acompanhada|com|e|mais|junto)\b|[,;+&/]/g,
    )
    .map((part) => part.trim())
    .filter((part) => foodTokens(part).length > 0);
}

function findCompositeFoods(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem[] {
  const parts = splitCompositeFoodQuery(query);
  if (parts.length < 2) return [];

  const matches: FoodItem[] = [];
  const seen = new Set<string>();

  parts.forEach((part) => {
    const food = findCompositePartFood(part, customFoods);
    if (!food || seen.has(food.id)) return;
    seen.add(food.id);
    matches.push(food);
  });

  return matches.length >= 2 ? matches : [];
}

function isCompositeFoodQuery(query: string): boolean {
  return splitCompositeFoodQuery(query).length >= 2;
}

function searchFoods(query: string, customFoods: FoodItem[] = []): FoodItem[] {
  const q = query.trim();
  if (!q) return customFoods;
  const normalized = normalizeFoodText(q);

  const directMatches = customFoods
    .filter((food) => normalizeFoodText(food.name).includes(normalized))
    .sort((a, b) => {
      const aName = normalizeFoodText(a.name);
      const bName = normalizeFoodText(b.name);
      const aExact = aName === normalized ? 0 : 1;
      const bExact = bName === normalized ? 0 : 1;
      return aExact - bExact || a.name.length - b.name.length;
    });

  if (directMatches.length > 0) return directMatches;

  const aliasMatches = (FOOD_COMPONENT_ALIASES[normalized] ?? [])
    .map((alias) => findCompositePartFood(alias, customFoods))
    .filter((food): food is FoodItem => Boolean(food));
  if (aliasMatches.length > 0) return aliasMatches;

  return findCompositeFoods(q, customFoods);
}

function isWaterFood(food: Pick<FoodItem, "name" | "aliases"> | null): boolean {
  if (!food) return false;
  const terms = [food.name, ...food.aliases].map((term) =>
    term
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );
  return terms.some((term) => /\bagua\b|\bwater\b/.test(term));
}

export function getWaterMl(
  food: FoodItem | null,
  quantity: number,
  unit: QuantityUnit,
): number | undefined {
  if (!isWaterFood(food)) return undefined;
  if (unit === "litro") return Math.round(quantity * 1000);
  if (unit === "mililitro") return Math.round(quantity);
  if (unit === "xicara") return Math.round(quantity * 200);
  if (unit === "porcao") return Math.round(quantity * 200);
  if (unit === "unidade") return Math.round(quantity * 200);
  return undefined;
}

function parseQtyInput(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseOptionalQtyInput(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export type MealDraft = {
  key: string;
  food: FoodItem | null;
  foodText: string;
  foodFound: boolean;
  quantityText: string;
  quantity: number;
  unit: QuantityUnit;
  nutrition: ReturnType<typeof calculateNutrition>;
  sourceNote?: string;
  resolving?: boolean;
  resolveFailed?: boolean;
};

type MealEntryPayload = Omit<MealEntry, "id" | "userId" | "addedAt">;

type ManualMealSelection = {
  key: string;
  food: FoodItem;
  quantityText: string;
  quantity: number;
  unit: QuantityUnit;
  nutrition: FoodNutrition;
};

const MEAL_PERIODS: { key: MealPeriod; label: string; icon: string }[] = [
  { key: "breakfast", label: "Café da manhã", icon: "wb-sunny" },
  { key: "lunch", label: "Almoço", icon: "restaurant" },
  { key: "dinner", label: "Jantar", icon: "nightlight" },
  { key: "snack", label: "Lanche", icon: "bakery-dining" },
  { key: "hydration", label: "Hidratação", icon: "local-drink" },
];

const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  breakfast: "Café da manhã",
  lunch: "Almoço",
  dinner: "Jantar",
  snack: "Lanche",
  hydration: "Hidratação",
};

function getDefaultMealPeriod(date = new Date()): MealPeriod {
  const hour = getBrasiliaHour(date);
  if (hour >= 5 && hour < 10) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 18 && hour < 22) return "dinner";
  return "snack";
}

function getEntryMealPeriod(entry: MealEntry): MealPeriod {
  return entry.mealPeriod ?? getDefaultMealPeriod(new Date(entry.addedAt));
}

function createMealGroupId(source: string) {
  return `${source}_${formatDate(new Date())}_${generateId()}`;
}

function buildMealPayload({
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

const QUANTITY_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

function hasExplicitUnit(text: string): boolean {
  return /colher|colheres|xicara|xícara|copo|garrafa|lata|concha|fatia|fil[eé]|bife|ovo|ovos|unidade|por[cç][aã]o|grama|gramas|\d+\s*g\b|kg|ml|litro/.test(
    text.toLowerCase(),
  );
}

function extractSpokenNumber(text: string): number | null {
  const digit = text.match(/\d+(?:[,.]\d+)?/);
  if (digit) return Number(digit[0].replace(",", "."));
  const normalized = text.toLowerCase();
  for (const [word, value] of Object.entries(QUANTITY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(normalized)) return value;
  }
  return null;
}

function cleanVoiceSegment(text: string): string {
  return text
    .replace(
      /\b(eu|comi|comer|almocei|jantei|tomei|bebi|lanchei|coloquei|foi|foram|hoje|no|na|meu|minha|prato|refeicao|refeição)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function parseVoiceQuantity(
  segment: string,
  food: FoodItem,
): { quantity: number; unit: QuantityUnit } {
  const parsed = parseQuantityFromText(segment);
  if (hasExplicitUnit(segment)) return parsed;
  return {
    quantity: extractSpokenNumber(segment) ?? 1,
    unit: food.defaultUnit,
  };
}

function splitVoiceText(
  rawText: string,
  customFoods: FoodItem[] = [],
): string[] {
  const normalized = rawText
    .replace(/\bcafe com leite\b/gi, "cafe_com_leite")
    .replace(/\bcafé com leite\b/gi, "cafe_com_leite")
    .replace(/\barroz com feij[aã]o\b/gi, "arroz_com_feijao");

  const base = normalized
    .split(/[,;]/)
    .map(cleanVoiceSegment)
    .map((segment) =>
      segment
        .replace(/cafe_com_leite/gi, "café com leite")
        .replace(/arroz_com_feijao/gi, "arroz com feijão"),
    )
    .filter(Boolean);

  if (base.length > 1) return base;

  const text = cleanVoiceSegment(rawText);
  const matches = customFoods
    .flatMap((food) =>
      [food.name, ...food.aliases].map((term) => ({ food, term })),
    )
    .map(({ food, term }) => {
      const index = text.toLowerCase().indexOf(term.toLowerCase());
      return index >= 0 ? { food, term, index } : null;
    })
    .filter(Boolean) as { food: FoodItem; term: string; index: number }[];

  if (matches.length <= 1) return [text].filter(Boolean);

  return matches
    .sort((a, b) => a.index - b.index)
    .map((match, index, list) => {
      const start = Math.max(0, index === 0 ? 0 : match.index - 12);
      const end = list[index + 1]?.index ?? text.length;
      return text.slice(start, end).trim();
    })
    .filter(Boolean);
}

function parseVoiceMeal(
  rawText: string,
  customFoods: FoodItem[] = [],
): MealDraft[] {
  return splitVoiceText(rawText, customFoods).flatMap(
    (segment, index): MealDraft[] => {
      const composite = expandCompositeVoiceSegment(
        segment,
        customFoods,
        index,
      );
      if (composite.length > 0) return composite;

      const food =
        findBestFood(segment, customFoods, 24) ??
        findAnyFood(segment, customFoods);
      const parsed = food
        ? parseVoiceQuantity(segment, food)
        : parseQuantityFromText(segment);
      const quantity = parsed.quantity > 0 ? parsed.quantity : 1;
      if (!food) {
        const isComposite = isCompositeFoodQuery(segment);
        return [
          {
            key: `voice_missing_${index}_${segment}_${quantity}_${parsed.unit}`,
            food: null,
            foodText: segment,
            foodFound: false,
            quantityText: String(quantity).replace(".", ","),
            quantity,
            unit: parsed.unit,
            nutrition: emptyNutrition(),
            sourceNote: isComposite
              ? "IA vai cadastrar esta refeição completa nos seus alimentos."
              : "IA vai cadastrar este alimento nos seus alimentos.",
            resolving: false,
          },
        ];
      }
      const unit = compatibleDetectedUnit(food, parsed.unit);
      return [
        {
          key: `${food.id}_${index}_${quantity}_${unit}`,
          food,
          foodText: food.name,
          foodFound: true,
          quantityText: String(quantity).replace(".", ","),
          quantity,
          unit,
          nutrition: calculateNutrition(food, quantity, unit),
          sourceNote: `Falado: ${segment}`,
        },
      ];
    },
  );
}

function expandCompositeVoiceSegment(
  segment: string,
  customFoods: FoodItem[],
  index: number,
): MealDraft[] {
  const normalized = normalizeFoodText(segment);
  const parts: { term: string; quantity: number; unit?: QuantityUnit }[] = [];

  if (normalized.includes("cafe com leite")) {
    parts.push(
      { term: "café", quantity: 1, unit: "porcao" },
      { term: "leite", quantity: 50, unit: "mililitro" },
    );
  } else if (normalized.includes("arroz com feijao")) {
    parts.push(
      { term: "arroz cozido", quantity: 1, unit: "porcao" },
      { term: "feijão cozido", quantity: 1, unit: "porcao" },
    );
  }

  if (parts.length === 0) {
    const compositeParts = splitCompositeFoodQuery(segment);
    if (compositeParts.length >= 2) {
      const drafts = compositeParts.map((part, partIndex): MealDraft | null => {
        const food =
          findCompositePartFood(part, customFoods) ??
          findBestFood(part, customFoods, 24) ??
          findAnyFood(part, customFoods);
        if (!food) return null;
        const parsed = parseVoiceQuantity(part, food);
        const quantity = parsed.quantity > 0 ? parsed.quantity : 1;
        const unit = compatibleDetectedUnit(food, parsed.unit);
        return {
          key: `${food.id}_${index}_${partIndex}_${quantity}_${unit}`,
          food,
          foodText: food.name,
          foodFound: true,
          quantityText: String(quantity).replace(".", ","),
          quantity,
          unit,
          nutrition: calculateNutrition(food, quantity, unit),
          sourceNote: `Falado: ${segment}`,
        };
      });

      if (drafts.every(Boolean)) return drafts as MealDraft[];
    }
  }

  return parts.flatMap((part, partIndex): MealDraft[] => {
    const food =
      findBestFood(part.term, customFoods, 24) ??
      findAnyFood(part.term, customFoods);
    if (!food) return [];
    const unit = compatibleDetectedUnit(food, part.unit ?? food.defaultUnit);
    return [
      {
        key: `${food.id}_${index}_${partIndex}_${part.quantity}_${unit}`,
        food,
        foodText: food.name,
        foodFound: true,
        quantityText: String(part.quantity).replace(".", ","),
        quantity: part.quantity,
        unit,
        nutrition: calculateNutrition(food, part.quantity, unit),
        sourceNote: `Falado: ${segment}`,
      },
    ];
  });
}

function compatibleDetectedUnit(
  food: FoodItem,
  detectedUnit: QuantityUnit,
): QuantityUnit {
  if (food.nutritionPer[detectedUnit]) return detectedUnit;
  return getPreferredFoodUnit(food);
}

function emptyNutrition(): ReturnType<typeof calculateNutrition> {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

function normalizeAiFoodName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function markAiFood(food: FoodItem): FoodItem {
  return {
    ...food,
    source: food.source ?? "ai",
  };
}

function createAiFood(item: PhotoMealAiItem, index: number): FoodItem | null {
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

function createLocalEntry(
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

function firebaseErrorMessage(error: unknown): string {
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

function recalcMealDraft(
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

// ─── Add Meal Modal ───────────────────────────────────────────────────────────

function AddMealModal({
  visible,
  onClose,
  onAdded,
  customFoods,
  onCreateFood,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: (entry: MealEntry) => void;
  customFoods: FoodItem[];
  onCreateFood: (
    foodName: string,
    preferredUnit: QuantityUnit,
  ) => Promise<FoodItem>;
}) {
  const goals = useStore(selectGoals);
  const user = useStore((s) => s.user);
  const todayLog = useStore((s) => s.todayLog);
  const savedMeals = useStore(selectSavedMeals);
  const addEntry = useStore((s) => s.addEntry);

  const [foodQuery, setFoodQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [addingFoodId, setAddingFoodId] = useState<string | null>(null);
  const [listeningSearch, setListeningSearch] = useState(false);
  const [foodItem, setFoodItem] = useState<FoodItem | null>(null);
  const [selectedFoods, setSelectedFoods] = useState<ManualMealSelection[]>([]);
  const selectedFoodsRef = React.useRef<ManualMealSelection[]>([]);
  const speechModule = React.useMemo(loadSpeechRecognitionModule, []);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(
    getDefaultMealPeriod(),
  );

  const suggestions = React.useMemo(
    () => searchFoods(foodQuery, customFoods),
    [customFoods, foodQuery],
  );
  const exactFoodMatch = React.useMemo(
    () => findExactFood(foodQuery, customFoods),
    [customFoods, foodQuery],
  );
  const frequentFoods = React.useMemo(() => {
    const counts = new Map<string, { food: FoodItem; count: number }>();
    const addFood = (foodName: string, amount = 1) => {
      const food = findAnyFood(foodName, customFoods);
      if (!food) return;
      const current = counts.get(food.id);
      counts.set(food.id, { food, count: (current?.count ?? 0) + amount });
    };

    todayLog?.entries.forEach((entry) => addFood(entry.foodName, 2));
    savedMeals.forEach((meal) => {
      meal.entries.forEach((entry) =>
        addFood(entry.foodName, Math.max(1, meal.usageCount + 1)),
      );
    });

    const ranked = Array.from(counts.values())
      .sort(
        (a, b) => b.count - a.count || a.food.name.localeCompare(b.food.name),
      )
      .map((item) => item.food);

    return ranked.length > 0 ? ranked.slice(0, 10) : customFoods.slice(0, 10);
  }, [customFoods, savedMeals, todayLog]);

  React.useEffect(() => {
    if (!visible) return;
    speechModule?.stop?.();
    setListeningSearch(false);
    setFoodQuery("");
    setFoodItem(null);
    updateSelectedFoods([]);
    setMealPeriod(getDefaultMealPeriod());
  }, [visible]);

  React.useEffect(() => {
    if (!speechModule) return undefined;

    const startSub = speechModule.addListener("start", () =>
      setListeningSearch(true),
    );
    const endSub = speechModule.addListener("end", () =>
      setListeningSearch(false),
    );
    const resultSub = speechModule.addListener("result", (event) => {
      const transcript = event.results[0]?.transcript?.trim() ?? "";
      if (transcript) {
        setFoodQuery(transcript);
        setFoodItem(null);
      }
    });
    const errorSub = speechModule.addListener("error", (event) => {
      setListeningSearch(false);
      console.warn("Meal search voice error", event);
    });

    return () => {
      startSub.remove();
      endSub.remove();
      resultSub.remove();
      errorSub.remove();
    };
  }, [speechModule]);

  React.useEffect(() => {
    if (visible) return undefined;
    speechModule?.stop?.();
    setListeningSearch(false);
    return undefined;
  }, [speechModule, visible]);

  function updateSelectedFoods(
    next:
      | ManualMealSelection[]
      | ((items: ManualMealSelection[]) => ManualMealSelection[]),
  ) {
    const nextItems =
      typeof next === "function" ? next(selectedFoodsRef.current) : next;
    selectedFoodsRef.current = nextItems;
    setSelectedFoods(nextItems);
  }

  function handleSelectFood(food: FoodItem) {
    setFoodItem(food);
    setFoodQuery(food.name);
  }

  function handleFoodQuery(value: string) {
    setFoodQuery(value);
    if (foodItem && value !== foodItem.name) {
      setFoodItem(null);
    }
  }

  async function toggleSearchVoice() {
    if (!speechModule || !speechModule.isRecognitionAvailable()) {
      Alert.alert(
        "Microfone indisponível",
        "O reconhecimento de voz precisa de uma development build para funcionar.",
      );
      return;
    }

    if (listeningSearch) {
      speechModule.stop();
      setListeningSearch(false);
      return;
    }

    try {
      const permission = await speechModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permissão necessária",
          "Autorize o microfone para buscar alimentos por voz.",
        );
        return;
      }
      setFoodQuery("");
      setFoodItem(null);
      speechModule.start({
        lang: "pt-BR",
        interimResults: true,
        continuous: false,
      });
    } catch (error) {
      setListeningSearch(false);
      console.warn("Meal search voice fallback", error);
      Alert.alert(
        "Não consegui ouvir agora",
        "Tente novamente ou digite o alimento no campo de busca.",
      );
    }
  }

  async function resolveCurrentFood({
    createWithAi = false,
  }: { createWithAi?: boolean } = {}): Promise<FoodItem> {
    let food = createWithAi
      ? findExactFood(foodQuery, customFoods)
      : foodItem ?? findAnyFood(foodQuery, customFoods);
    if (!food) {
      if (!createWithAi) {
        throw new Error("food_not_found");
      }
      food = await onCreateFood(foodQuery, "porcao");
      setFoodItem(food);
      setFoodQuery(food.name);
    }
    return food;
  }

  function selectionFromFood(
    food: FoodItem,
    options: { quantityText?: string; preferredUnit?: QuantityUnit } = {},
  ): ManualMealSelection {
    const requestedUnit = options.preferredUnit ?? getPreferredFoodUnit(food);
    const selectedUnit = food.nutritionPer[requestedUnit]
      ? requestedUnit
      : food.defaultUnit;
    const requestedQuantity = options.quantityText ?? "1";
    const typedQuantity = parseQtyInput(requestedQuantity);
    const parsedQuantity =
      food.defaultUnit === "mililitro" &&
      selectedUnit === "mililitro" &&
      !food.nutritionPer[requestedUnit] &&
      typedQuantity === 1
        ? 200
        : typedQuantity;

    return {
      key: `${food.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      food,
      quantityText: String(parsedQuantity).replace(".", ","),
      quantity: parsedQuantity,
      unit: selectedUnit,
      nutrition: calculateNutrition(food, parsedQuantity, selectedUnit),
    };
  }

  function updateSelectedFood(
    key: string,
    changes: { quantityText?: string; unit?: QuantityUnit },
  ) {
    updateSelectedFoods((items) =>
      items.map((item) => {
        if (item.key !== key) return item;
        const nextUnit = changes.unit ?? item.unit;
        const quantityText =
          changes.quantityText !== undefined
            ? changes.quantityText
            : item.quantityText;
        const quantity =
          changes.quantityText !== undefined
            ? parseOptionalQtyInput(changes.quantityText)
            : item.quantity;
        return {
          ...item,
          quantityText,
          quantity,
          unit: nextUnit,
          nutrition: calculateNutrition(item.food, quantity, nextUnit),
        };
      }),
    );
  }

  async function handleAddFoodOption(food: FoodItem) {
    if (selecting || saving || addingFoodId) return;
    setAddingFoodId(food.id);
    try {
      const preferredUnit = getPreferredFoodUnit(food);
      const selection = selectionFromFood(food, { preferredUnit });
      updateSelectedFoods((items) => [...items, selection]);
      if (foodItem?.id === food.id) {
        setFoodQuery("");
        setFoodItem(null);
      }
    } catch (error) {
      console.warn("Failed to add food option", error);
      if (isAiLimitError(error)) showAiLimitAlert();
      else
        Alert.alert("Erro", "Não foi possível adicionar este alimento agora.");
    } finally {
      setAddingFoodId(null);
    }
  }

  async function handleSelectCurrentFood() {
    if (isEmpty || selecting) return;
    setSelecting(true);
    try {
      const food = await resolveCurrentFood({ createWithAi: true });
      const selection = selectionFromFood(food);
      updateSelectedFoods((items) => [...items, selection]);
      setFoodQuery("");
      setFoodItem(null);
    } catch (error) {
      console.warn("AI food creation failed", error);
      if (isAiLimitError(error)) {
        showAiLimitAlert();
        return;
      }
      Alert.alert(
        "Alimento não encontrado",
        "Não consegui cadastrar este alimento automaticamente agora. Tente outro nome ou seja mais específico.",
      );
    } finally {
      setSelecting(false);
    }
  }

  async function handleAdd() {
    if (!user || !goals) return;
    let itemsToSave = selectedFoodsRef.current;
    if (itemsToSave.length === 0 && !isEmpty) {
      try {
        setSaving(true);
        const food = await resolveCurrentFood();
        itemsToSave = [selectionFromFood(food)];
      } catch (error) {
        if ((error as Error)?.message === "food_not_found") {
          Alert.alert(
            "Alimento não encontrado",
            "Selecione um alimento da lista ou use o botão Cadastrar com IA para criar um novo alimento.",
          );
        } else {
          console.warn("Failed to resolve current food", error);
          Alert.alert("Erro", "Não foi possível adicionar este alimento agora.");
        }
        setSaving(false);
        return;
      }
    }

    if (itemsToSave.length === 0) {
      Alert.alert(
        "Nenhum alimento selecionado",
        "Selecione um ou mais alimentos antes de adicionar a refeição.",
      );
      return;
    }
    if (
      itemsToSave.some(
        (item) => !item.quantityText.trim() || item.quantity <= 0,
      )
    ) {
      Alert.alert(
        "Quantidade inválida",
        "Informe uma quantidade maior que zero para todos os alimentos.",
      );
      return;
    }

    setSaving(true);
    try {
      const mealGroupId = createMealGroupId("manual");
      let queuedError: unknown = null;
      let lastEntry: MealEntry | null = null;

      for (const item of itemsToSave) {
        const payload = buildMealPayload({
          food: item.food,
          quantity: item.quantity,
          unit: item.unit,
          nutrition: item.nutrition,
          mealPeriod,
          source: "manual",
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
          queuedError ??= result.queued ? result.error : null;
        } catch (error) {
          console.warn("Manual meal save failed, using local entry", error);
          entry = createLocalEntry(user.id, payload);
          queuedError ??= error;
        }
        addEntry(entry);
        lastEntry = entry;
      }

      if (queuedError) {
        console.warn(
          "Manual meal queued for Firebase sync",
          firebaseErrorMessage(queuedError),
        );
      }
      setFoodQuery("");
      setFoodItem(null);
      updateSelectedFoods([]);
      if (lastEntry) {
        onClose();
        onAdded(lastEntry);
      }
    } catch (error) {
      console.warn("Manual meal save failed", error);
      Alert.alert("Erro", "Não foi possível adicionar esta refeição agora.");
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = !foodQuery.trim();
  const canCreateWithAi =
    !isEmpty && !exactFoodMatch && suggestions.length === 0;
  const selectedTotal = React.useMemo(
    () =>
      sumNutrition(
        selectedFoods.map((item) => ({ nutrition: item.nutrition })),
      ),
    [selectedFoods],
  );
  const canSaveMeal =
    selectedFoods.length > 0 && !saving && !selecting && !addingFoodId;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modal.bg}>
        <TouchableOpacity style={modal.backdrop} onPress={onClose} />
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <View style={modal.modalHeader}>
            <View>
              <Text style={modal.title}>Adicionar alimentos</Text>
              <Text style={modal.subtitle}>
                {selectedFoods.length > 0
                  ? `${selectedFoods.length} alimento(s) selecionado(s)`
                  : "Monte a refeição antes de salvar"}
              </Text>
            </View>
            <TouchableOpacity style={modal.closePill} onPress={onClose}>
              <Text style={modal.closePillText}>Concluir</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={modal.body}
            contentContainerStyle={modal.bodyContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <View style={modal.searchPanel}>
              <Text style={modal.label}>Alimento</Text>
              <View
                style={[
                  modal.searchInputWrap,
                  listeningSearch && modal.searchInputWrapActive,
                ]}
              >
                <TextInput
                  style={modal.searchInput}
                  value={foodQuery}
                  onChangeText={handleFoodQuery}
                  placeholder={
                    listeningSearch
                      ? "Ouvindo..."
                      : "Busque: arroz, file frango, brocoli..."
                  }
                  placeholderTextColor={Colors.gray400}
                  autoFocus
                />
                <TouchableOpacity
                  style={[
                    modal.searchMicButton,
                    listeningSearch && modal.searchMicButtonActive,
                  ]}
                  onPress={toggleSearchVoice}
                  accessibilityRole="button"
                  accessibilityLabel={
                    listeningSearch
                      ? "Parar busca por voz"
                      : "Buscar alimento por voz"
                  }
                >
                  <MaterialIcons
                    name={listeningSearch ? "stop" : "mic"}
                    size={20}
                    color={listeningSearch ? Colors.white : Colors.green600}
                  />
                </TouchableOpacity>
              </View>
              <Text style={modal.subLabel}>
                {todayLog?.entries.length || savedMeals.length
                  ? "Mais usados por você"
                  : "Atalhos populares"}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={modal.chipsScroll}
              >
                <View style={modal.chips}>
                  {frequentFoods.map((food) => (
                    <TouchableOpacity
                      key={food.id}
                      style={modal.chip}
                      onPress={() => handleSelectFood(food)}
                    >
                      <View style={modal.chipContent}>
                        <FoodIcon
                          name={food.name}
                          emoji={food.emoji}
                          size={15}
                          variant="plain"
                        />
                        <Text style={modal.chipText}>
                          {food.name.replace(
                            / cozido\/mexido| cozido| grelhado/g,
                            "",
                          )}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={modal.suggestionBox}>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {suggestions.map((food) => {
                  const selected = foodItem?.id === food.id;
                  const previewUnit = getPreferredFoodUnit(food);
                  const previewNutrition = calculateNutrition(
                    food,
                    1,
                    previewUnit,
                  );
                  return (
                    <TouchableOpacity
                      key={food.id}
                      style={[
                        modal.foodOption,
                        selected && modal.foodOptionActive,
                      ]}
                      onPress={() => handleSelectFood(food)}
                    >
                      <View style={modal.foodEmoji}>
                        <FoodIcon name={food.name} emoji={food.emoji} />
                      </View>
                      <View style={modal.foodInfo}>
                        <Text
                          style={[
                            modal.foodName,
                            selected && modal.foodNameActive,
                          ]}
                        >
                          {food.name}
                        </Text>
                        <Text style={modal.foodUnit}>
                          Padrão: {UNIT_LABELS[previewUnit]}
                        </Text>
                        <NutritionSummary nutrition={previewNutrition} />
                      </View>
                      <View style={modal.foodActions}>
                        {selected && (
                          <MaterialIcons
                            name="check-circle"
                            size={20}
                            color={Colors.green600}
                          />
                        )}
                        <TouchableOpacity
                          style={[
                            modal.foodAddButton,
                            (saving || selecting || !!addingFoodId) &&
                              modal.foodAddButtonDisabled,
                          ]}
                          onPress={() => handleAddFoodOption(food)}
                          disabled={saving || selecting || !!addingFoodId}
                          accessibilityLabel={`Adicionar ${food.name}`}
                        >
                          {addingFoodId === food.id ? (
                            <ActivityIndicator
                              size="small"
                              color={Colors.white}
                            />
                          ) : (
                            <MaterialIcons
                              name="add"
                              size={20}
                              color={Colors.white}
                            />
                          )}
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {canCreateWithAi && (
                  <TouchableOpacity
                    style={modal.aiCreateOption}
                    onPress={handleSelectCurrentFood}
                    disabled={selecting || saving}
                  >
                    <View style={modal.aiIcon}>
                      {selecting ? (
                        <ActivityIndicator color={Colors.green600} />
                      ) : (
                        <MaterialIcons
                          name="auto-awesome"
                          size={20}
                          color={Colors.green600}
                        />
                      )}
                    </View>
                    <View style={modal.foodInfo}>
                      <Text style={modal.aiCreateTitle}>
                        Adicionar "{foodQuery.trim()}" com IA
                      </Text>
                      <Text style={modal.aiCreateText}>
                        Vou estimar os nutrientes, salvar o alimento e incluir
                        na refeição.
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {suggestions.length === 0 && isEmpty && (
                  <View style={modal.noResults}>
                    <Text style={modal.noResultsText}>
                      Digite um alimento para buscar ou cadastrar com IA.
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>

            <View style={modal.bottomPanel}>
              <MealPeriodPicker value={mealPeriod} onChange={setMealPeriod} />

              {selectedFoods.length === 0 ? (
                <View style={modal.emptySelection}>
                  <MaterialIcons
                    name="add-circle-outline"
                    size={24}
                    color={Colors.green600}
                  />
                  <Text style={modal.emptySelectionText}>
                    Use o botão + nos alimentos acima para montar a refeição.
                  </Text>
                </View>
              ) : (
                <View style={modal.selectedBox}>
                  <View style={modal.selectedHeader}>
                    <Text style={modal.selectedTitle}>
                      Itens desta refeição
                    </Text>
                    <Text style={modal.selectedTotal}>
                      {Math.round(selectedTotal.kcal)} kcal
                    </Text>
                  </View>
                  {selectedFoods.map((item) => (
                    <View key={item.key} style={modal.selectedItem}>
                      <View style={modal.selectedTopRow}>
                        <View style={modal.selectedEmoji}>
                          <FoodIcon
                            name={item.food.name}
                            emoji={item.food.emoji}
                            size={18}
                          />
                        </View>
                        <View style={modal.selectedInfo}>
                          <Text style={modal.selectedName}>
                            {item.food.name}
                          </Text>
                          <Text style={modal.selectedMeta}>
                            {Math.round(item.nutrition.kcal)} kcal
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={modal.selectedRemove}
                          onPress={() =>
                            updateSelectedFoods((items) =>
                              items.filter(
                                (current) => current.key !== item.key,
                              ),
                            )
                          }
                        >
                          <MaterialIcons
                            name="close"
                            size={18}
                            color={Colors.gray400}
                          />
                        </TouchableOpacity>
                      </View>
                      <View style={modal.selectedControls}>
                        <View style={modal.selectedQtyField}>
                          <Text style={modal.inlineLabel}>Qtd.</Text>
                          <TextInput
                            style={modal.selectedQtyInput}
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
                        <View style={modal.selectedUnits}>
                          {getFoodUnits(item.food).map((unitOption) => (
                            <TouchableOpacity
                              key={unitOption}
                              style={[
                                modal.unitChip,
                                item.unit === unitOption &&
                                  modal.unitChipActive,
                              ]}
                              onPress={() =>
                                updateSelectedFood(item.key, {
                                  unit: unitOption,
                                })
                              }
                            >
                              <Text
                                style={[
                                  modal.unitChipText,
                                  item.unit === unitOption &&
                                    modal.unitChipTextActive,
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
                </View>
              )}
            </View>
          </ScrollView>

          <View style={modal.actions}>
            <TouchableOpacity style={modal.btnCancel} onPress={onClose}>
              <Text style={modal.btnCancelText}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modal.btnAdd, !canSaveMeal && modal.btnDisabled]}
              onPress={handleAdd}
              disabled={!canSaveMeal}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={modal.btnAddText}>Adicionar refeição</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const NUTRITION_SUMMARY_ROWS: {
  key: keyof FoodNutrition;
  label: string;
  unit: string;
}[] = [
  { key: "sodium", label: "Sódio", unit: "mg" },
  { key: "calcium", label: "Ca", unit: "mg" },
  { key: "iron", label: "Fe", unit: "mg" },
  { key: "potassium", label: "K", unit: "mg" },
  { key: "magnesium", label: "Mg", unit: "mg" },
  { key: "zinc", label: "Zn", unit: "mg" },
  { key: "vitaminC", label: "Vit. C", unit: "mg" },
];

function NutritionSummary({ nutrition }: { nutrition: FoodNutrition }) {
  const macroText = [
    `${formatFactValue(nutrition.kcal)}kcal`,
    `P ${formatFactValue(nutrition.protein)}g`,
    `C ${formatFactValue(nutrition.carbs)}g`,
    `G ${formatFactValue(nutrition.fat)}g`,
    nutrition.fiber > 0 ? `Fib ${formatFactValue(nutrition.fiber)}g` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const microText = NUTRITION_SUMMARY_ROWS.map((row) => ({
    ...row,
    value: nutrition[row.key],
  }))
    .filter(
      (row): row is typeof row & { value: number } =>
        typeof row.value === "number" &&
        Number.isFinite(row.value) &&
        row.value > 0,
    )
    .slice(0, 3)
    .map((row) => `${row.label} ${formatFactValue(row.value)}${row.unit}`)
    .join(" · ");

  return (
    <>
      <Text style={modal.nutritionSummary} numberOfLines={1}>
        {macroText}
      </Text>
      {microText ? (
        <Text style={modal.nutritionMicroSummary} numberOfLines={1}>
          {microText}
        </Text>
      ) : null}
    </>
  );
}

function formatFactValue(value: number): string {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return String(Math.round(value * 10) / 10).replace(".", ",");
  if (value >= 1) return String(Math.round(value * 10) / 10).replace(".", ",");
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

function MealPeriodPicker({
  value,
  onChange,
}: {
  value: MealPeriod;
  onChange: (period: MealPeriod) => void;
}) {
  return (
    <View style={modal.periodBox}>
      <Text style={modal.label}>Refeição</Text>
      <View style={modal.periodRow}>
        {MEAL_PERIODS.map((period) => {
          const active = period.key === value;
          return (
            <TouchableOpacity
              key={period.key}
              style={[modal.periodChip, active && modal.periodChipActive]}
              onPress={() => onChange(period.key)}
            >
              <MaterialIcons
                name={period.icon as any}
                size={16}
                color={active ? Colors.white : Colors.gray600}
              />
              <Text
                style={[modal.periodText, active && modal.periodTextActive]}
              >
                {period.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Voice Modal ──────────────────────────────────────────────────────────────

function VoiceModal({
  visible,
  onClose,
  onConfirm,
  customFoods,
  onCreateFood,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (
    items: MealDraft[],
    mealPeriod: MealPeriod,
  ) => Promise<void> | void;
  customFoods: FoodItem[];
  onCreateFood: (
    foodName: string,
    preferredUnit: QuantityUnit,
  ) => Promise<FoodItem>;
}) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [editableDrafts, setEditableDrafts] = useState<MealDraft[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(
    getDefaultMealPeriod(),
  );
  const speechModule = React.useMemo(loadSpeechRecognitionModule, []);
  const hasInvalidDraft = editableDrafts.some((item) => !item.foodFound);

  React.useEffect(() => {
    if (!visible) return;
    setTranscript("");
    setEditableDrafts([]);
    setAddedCount(0);
    setConfirming(false);
    setMealPeriod(getDefaultMealPeriod());
  }, [visible]);

  React.useEffect(() => {
    setEditableDrafts(parseVoiceMeal(transcript, customFoods));
  }, [customFoods, transcript]);

  async function resolveDraftWithAi(item: MealDraft) {
    setEditableDrafts((items) =>
      items.map((draft) =>
        draft.key === item.key
          ? {
              ...draft,
              resolving: true,
              resolveFailed: false,
              sourceNote: "Cadastrando alimento com IA...",
            }
          : draft,
      ),
    );

    try {
      const food = await onCreateFood(item.foodText, item.unit);
      setEditableDrafts((items) =>
        items.map((draft) => {
          if (draft.key !== item.key) return draft;
          const unit = food.nutritionPer[draft.unit]
            ? draft.unit
            : food.defaultUnit;
          return recalcMealDraft(
            {
              ...draft,
              food,
              foodText: food.name,
              foodFound: true,
              resolving: false,
              resolveFailed: false,
              sourceNote: "IA cadastrou este alimento nos seus alimentos.",
            },
            { unit },
          );
        }),
      );
    } catch (error) {
      console.warn("Voice AI food creation failed", error);
      if (isAiLimitError(error)) {
        showAiLimitAlert();
      }
      setEditableDrafts((items) =>
        items.map((draft) =>
          draft.key === item.key
            ? {
                ...draft,
                resolving: false,
                resolveFailed: true,
                sourceNote: isAiLimitError(error)
                  ? "Limite de IA atingido. Revise o alimento manualmente."
                  : "Não consegui cadastrar este alimento automaticamente.",
              }
            : draft,
        ),
      );
    }
  }

  React.useEffect(() => {
    if (!speechModule) return undefined;

    const startSub = speechModule.addListener("start", () =>
      setListening(true),
    );
    const endSub = speechModule.addListener("end", () => setListening(false));
    const resultSub = speechModule.addListener("result", (event) => {
      setTranscript(event.results[0]?.transcript ?? "");
    });
    const errorSub = speechModule.addListener("error", (event) => {
      setListening(false);
      console.warn("Voice error", event);
    });

    return () => {
      startSub.remove();
      endSub.remove();
      resultSub.remove();
      errorSub.remove();
    };
  }, [speechModule]);

  async function toggle() {
    if (!speechModule || !speechModule.isRecognitionAvailable()) {
      Alert.alert(
        "Voz indisponível no Expo Go",
        "O reconhecimento de voz precisa de uma development build. Preenchi um exemplo para você testar a confirmação.",
      );
      setTranscript(
        "4 colheres de arroz, 1 concha de feijão e 1 filé de frango",
      );
      return;
    }

    if (listening) {
      speechModule.stop();
      setListening(false);
    } else {
      setTranscript("");
      try {
        const permission = await speechModule.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Permissão necessária",
            "Autorize o microfone para registrar refeições por voz.",
          );
          return;
        }
        speechModule.start({
          lang: "pt-BR",
          interimResults: true,
          continuous: false,
        });
      } catch (e) {
        // Fallback simulation in dev
        console.warn("Voice fallback", e);
        setTranscript("4 colheres de arroz e 1 filé de frango médio");
      }
    }
  }

  async function confirm() {
    const itemsToSave = editableDrafts;
    setConfirming(true);
    try {
      await onConfirm(itemsToSave, mealPeriod);
      setAddedCount((count) => count + itemsToSave.length);
      setTranscript("");
      setEditableDrafts([]);
    } finally {
      setConfirming(false);
    }
  }

  function updateDraft(key: string, updater: (item: MealDraft) => MealDraft) {
    setEditableDrafts((items) =>
      items.map((item) => (item.key === key ? updater(item) : item)),
    );
  }

  function removeDraft(key: string) {
    setEditableDrafts((items) => items.filter((item) => item.key !== key));
  }

  function updateDraftFood(key: string, value: string) {
    updateDraft(key, (item) => {
      const found =
        findBestFood(value, customFoods, 24) ?? findAnyFood(value, customFoods);
      if (!found) {
        return {
          ...item,
          foodText: value,
          foodFound: false,
          resolveFailed: false,
        };
      }
      const unit = compatibleDetectedUnit(found, item.unit);
      return recalcMealDraft(item, {
        food: found,
        foodText: value,
        foodFound: true,
        unit,
      });
    });
  }

  function updateDraftQuantity(key: string, value: string) {
    updateDraft(key, (item) =>
      recalcMealDraft(item, {
        quantityText: value,
        quantity: parseOptionalQtyInput(value),
      }),
    );
  }

  function updateDraftUnit(key: string, nextUnit: QuantityUnit) {
    updateDraft(key, (item) => recalcMealDraft(item, { unit: nextUnit }));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modal.bg}>
        <TouchableOpacity style={modal.backdrop} onPress={onClose} />
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <View style={modal.modalHeader}>
            <View>
              <Text style={modal.title}>Fale o que você comeu</Text>
              <Text style={modal.subtitle}>
                {addedCount > 0
                  ? `${addedCount} alimento(s) adicionados hoje`
                  : "Diga vários alimentos na mesma frase."}
              </Text>
            </View>
            <TouchableOpacity style={modal.closePill} onPress={onClose}>
              <Text style={modal.closePillText}>Concluir</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={modal.body}
            contentContainerStyle={modal.bodyContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity
              style={[voiceModal.circle, listening && voiceModal.circleActive]}
              onPress={toggle}
            >
              <MaterialIcons
                name={listening ? "stop" : "mic"}
                size={40}
                color={listening ? Colors.white : Colors.purpleD}
              />
            </TouchableOpacity>

            <Text style={voiceModal.tip}>
              {listening
                ? "Ouvindo... fale agora"
                : "Toque para começar a falar"}
            </Text>

            <View style={voiceModal.transcript}>
              <Text style={voiceModal.transcriptText}>
                {transcript || "Aguardando..."}
              </Text>
            </View>

            <View style={voiceModal.previewBox}>
              <MealPeriodPicker value={mealPeriod} onChange={setMealPeriod} />
              <Text style={voiceModal.exTitle}>Itens detectados</Text>
              {editableDrafts.length === 0 ? (
                <Text style={voiceModal.previewEmpty}>
                  Fale algo como: "4 colheres de arroz, 1 concha de feijão e 1
                  filé de frango".
                </Text>
              ) : (
                editableDrafts.map((item) => (
                  <View key={item.key} style={voiceModal.editCard}>
                    <View style={voiceModal.editHeader}>
                      <View style={voiceModal.previewEmoji}>
                        <FoodIcon
                          name={item.food?.name ?? item.foodText}
                          emoji={item.food?.emoji}
                        />
                      </View>
                      <View style={voiceModal.previewInfo}>
                        <TextInput
                          style={[
                            voiceModal.foodInput,
                            !item.foodFound && voiceModal.inputError,
                          ]}
                          value={item.foodText}
                          onChangeText={(value) =>
                            updateDraftFood(item.key, value)
                          }
                          placeholder="Alimento"
                          placeholderTextColor={Colors.gray400}
                        />
                        {!item.foodFound && (
                          <Text style={voiceModal.errorText}>
                            {item.resolving
                              ? "Cadastrando com IA..."
                              : "Alimento ainda sem cadastro."}
                          </Text>
                        )}
                        {!item.foodFound && !item.resolving && (
                          <TouchableOpacity
                            style={voiceModal.aiCreateBtn}
                            onPress={() => resolveDraftWithAi(item)}
                          >
                            <MaterialIcons
                              name="auto-awesome"
                              size={15}
                              color={Colors.green600}
                            />
                            <Text style={voiceModal.aiCreateText}>
                              Cadastrar com IA
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <TouchableOpacity
                        style={voiceModal.removeBtn}
                        onPress={() => removeDraft(item.key)}
                      >
                        <MaterialIcons
                          name="close"
                          size={18}
                          color={Colors.gray600}
                        />
                      </TouchableOpacity>
                    </View>

                    <View style={voiceModal.editRow}>
                      <View style={voiceModal.quantityEdit}>
                        <Text style={voiceModal.smallLabel}>Qtd.</Text>
                        <TextInput
                          style={voiceModal.quantityInput}
                          value={item.quantityText}
                          onChangeText={(value) =>
                            updateDraftQuantity(item.key, value)
                          }
                          keyboardType="decimal-pad"
                          placeholder="1"
                          placeholderTextColor={Colors.gray400}
                        />
                      </View>
                      <View style={voiceModal.unitEdit}>
                        <Text style={voiceModal.smallLabel}>Unidade</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                        >
                          <View style={voiceModal.unitRow}>
                            {getFoodUnits(item.food).map((unitOption) => (
                              <TouchableOpacity
                                key={unitOption}
                                style={[
                                  voiceModal.unitMiniChip,
                                  item.unit === unitOption &&
                                    voiceModal.unitMiniChipActive,
                                ]}
                                onPress={() =>
                                  updateDraftUnit(item.key, unitOption)
                                }
                              >
                                <Text
                                  style={[
                                    voiceModal.unitMiniText,
                                    item.unit === unitOption &&
                                      voiceModal.unitMiniTextActive,
                                  ]}
                                >
                                  {UNIT_LABELS[unitOption]}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    </View>

                    <Text style={voiceModal.previewMeta}>
                      {formatNutritionDetails(item.nutrition, {
                        includeKcal: true,
                      })}
                    </Text>
                    {item.sourceNote ? (
                      <Text style={voiceModal.spokenText}>
                        {item.sourceNote}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            <Text style={voiceModal.exTitle}>Dicas rápidas</Text>
            <Text style={voiceModal.example}>
              Use frases como "2 ovos", "100 gramas de frango", "1 xícara de
              leite".
            </Text>
            <Text style={voiceModal.example}>
              Se não falar quantidade, o app usa a porção padrão daquele
              alimento.
            </Text>
          </ScrollView>

          <View style={modal.actions}>
            <TouchableOpacity style={modal.btnCancel} onPress={onClose}>
              <Text style={modal.btnCancelText}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                modal.btnAdd,
                (editableDrafts.length === 0 ||
                  hasInvalidDraft ||
                  confirming) &&
                  modal.btnDisabled,
              ]}
              onPress={confirm}
              disabled={
                editableDrafts.length === 0 || hasInvalidDraft || confirming
              }
            >
              {confirming ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={modal.btnAddText}>Adicionar e continuar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Photo Modal ──────────────────────────────────────────────────────────────

export function PhotoModal({
  visible,
  onClose,
  onConfirm,
  customFoods,
  onCreateFood,
  allowPhotoOnlyPost = false,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (
    items: MealDraft[],
    mealPeriod: MealPeriod,
    photo?: {
      imageUri: string;
      mimeType?: string;
      summary: string;
      caption: string;
    },
  ) => Promise<void> | void;
  customFoods: FoodItem[];
  onCreateFood?: (
    foodName: string,
    preferredUnit: QuantityUnit,
  ) => Promise<FoodItem>;
  allowPhotoOnlyPost?: boolean;
}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | undefined>();
  const [summary, setSummary] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [editableDrafts, setEditableDrafts] = useState<MealDraft[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(
    getDefaultMealPeriod(),
  );
  const hasInvalidDraft = editableDrafts.some((item) => !item.foodFound);
  const canConfirmPhotoOnly =
    allowPhotoOnlyPost && Boolean(imageUri) && postCaption.trim().length > 0;
  const canConfirm =
    !analyzing &&
    !confirming &&
    !hasInvalidDraft &&
    (editableDrafts.length > 0 || canConfirmPhotoOnly);

  React.useEffect(() => {
    if (!visible) return;
    setImageUri(null);
    setImageMimeType(undefined);
    setSummary("");
    setPostCaption("");
    setAnalyzing(false);
    setEditableDrafts([]);
    setAddedCount(0);
    setConfirming(false);
    setMealPeriod(getDefaultMealPeriod());
  }, [visible]);

  async function pickImage(source: "camera" | "library") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permissão necessária",
        source === "camera"
          ? "Autorize a câmera para registrar refeições por foto."
          : "Autorize o acesso às fotos para escolher uma imagem do prato.",
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.65,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.65,
            base64: true,
          });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      Alert.alert(
        "Imagem inválida",
        "Não consegui preparar esta foto para análise.",
      );
      return;
    }

    setImageUri(asset.uri);
    setImageMimeType(asset.mimeType ?? "image/jpeg");
    await analyzePhoto(asset.base64, asset.mimeType ?? "image/jpeg");
  }

  async function analyzePhoto(base64: string, mimeType: string) {
    setAnalyzing(true);
    setSummary("");
    setPostCaption("");
    setEditableDrafts([]);
    try {
      const result = await analyzeMealPhoto(base64, mimeType);
      setSummary(result.summary ?? "");
      const drafts = result.items.map((item, index) => {
        const foundFood =
          findBestFood(item.foodName, customFoods, 24) ??
          findAnyFood(item.foodName, customFoods);
        const food = foundFood ?? createAiFood(item, index);
        const unit = food ? compatibleDetectedUnit(food, item.unit) : item.unit;
        const quantity = item.quantity > 0 ? item.quantity : 1;
        const isAiCreated = !foundFood && Boolean(food);
        const linkedToBase = Boolean(foundFood);
        return {
          key: `photo_${index}_${item.foodName}_${quantity}_${unit}`,
          food,
          foodText: food?.name ?? item.foodName,
          foodFound: Boolean(food),
          quantityText: String(quantity).replace(".", ","),
          quantity,
          unit,
          nutrition: food
            ? calculateNutrition(food, quantity, unit)
            : emptyNutrition(),
          sourceNote: item.notes
            ? `IA: ${item.notes}${linkedToBase ? ` · vinculado à base como ${food?.name}` : ""}${isAiCreated ? " · alimento cadastrado por estimativa" : ""}${item.confidence != null ? ` · confiança ${Math.round(item.confidence * 100)}%` : ""}`
            : item.confidence != null
              ? `IA: ${linkedToBase ? `vinculado à base · ` : ""}${isAiCreated ? "alimento cadastrado por estimativa · " : ""}confiança ${Math.round(item.confidence * 100)}%`
              : linkedToBase
                ? `IA: vinculado à base como ${food?.name}`
                : isAiCreated
                  ? "IA: alimento cadastrado por estimativa nutricional"
                  : undefined,
        };
      });
      setEditableDrafts(drafts);
      if (drafts.length === 0) {
        Alert.alert(
          "Nada identificado",
          "Tente uma foto mais clara do prato ou adicione manualmente.",
        );
      }
    } catch (e) {
      console.warn("Photo meal analysis failed", e);
      if (isAiLimitError(e)) {
        showAiLimitAlert();
        return;
      }
      Alert.alert(
        "Erro ao analisar foto",
        "Não consegui identificar o prato agora. Tente novamente ou use a entrada manual.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function confirm() {
    const itemsToSave = editableDrafts;
    const caption = postCaption.trim() || summary;
    const photo = imageUri
      ? { imageUri, mimeType: imageMimeType, summary, caption }
      : undefined;
    setConfirming(true);
    try {
      await onConfirm(itemsToSave, mealPeriod, photo);
      setAddedCount((count) => count + itemsToSave.length);
      setImageUri(null);
      setImageMimeType(undefined);
      setSummary("");
      setPostCaption("");
      setEditableDrafts([]);
    } finally {
      setConfirming(false);
    }
  }

  function updateDraft(key: string, updater: (item: MealDraft) => MealDraft) {
    setEditableDrafts((items) =>
      items.map((item) => (item.key === key ? updater(item) : item)),
    );
  }

  function removeDraft(key: string) {
    setEditableDrafts((items) => items.filter((item) => item.key !== key));
  }

  async function resolveDraftWithAi(item: MealDraft) {
    if (!onCreateFood) return;
    setEditableDrafts((items) =>
      items.map((draft) =>
        draft.key === item.key
          ? {
              ...draft,
              resolving: true,
              resolveFailed: false,
              sourceNote: "Cadastrando alimento com IA...",
            }
          : draft,
      ),
    );

    try {
      const food = await onCreateFood(item.foodText, item.unit);
      setEditableDrafts((items) =>
        items.map((draft) => {
          if (draft.key !== item.key) return draft;
          const unit = food.nutritionPer[draft.unit]
            ? draft.unit
            : food.defaultUnit;
          return recalcMealDraft(
            {
              ...draft,
              food,
              foodText: food.name,
              foodFound: true,
              resolving: false,
              resolveFailed: false,
              sourceNote: "IA cadastrou este alimento nos seus alimentos.",
            },
            { unit },
          );
        }),
      );
    } catch (error) {
      console.warn("Photo AI food creation failed", error);
      if (isAiLimitError(error)) {
        showAiLimitAlert();
      }
      setEditableDrafts((items) =>
        items.map((draft) =>
          draft.key === item.key
            ? {
                ...draft,
                resolving: false,
                resolveFailed: true,
                sourceNote: isAiLimitError(error)
                  ? "Limite de IA atingido. Revise o alimento manualmente."
                  : "Não consegui cadastrar este alimento automaticamente.",
              }
            : draft,
        ),
      );
    }
  }

  function updateDraftFood(key: string, value: string) {
    updateDraft(key, (item) => {
      const found =
        findBestFood(value, customFoods, 24) ?? findAnyFood(value, customFoods);
      if (!found) {
        return {
          ...item,
          food: null,
          foodText: value,
          foodFound: false,
          resolveFailed: false,
          nutrition: emptyNutrition(),
        };
      }
      const unit = compatibleDetectedUnit(found, item.unit);
      return recalcMealDraft(item, {
        food: found,
        foodText: value,
        foodFound: true,
        unit,
      });
    });
  }

  function updateDraftQuantity(key: string, value: string) {
    updateDraft(key, (item) =>
      recalcMealDraft(item, {
        quantityText: value,
        quantity: parseOptionalQtyInput(value),
      }),
    );
  }

  function updateDraftUnit(key: string, nextUnit: QuantityUnit) {
    updateDraft(key, (item) => recalcMealDraft(item, { unit: nextUnit }));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modal.bg}>
        <TouchableOpacity style={modal.backdrop} onPress={onClose} />
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <View style={modal.modalHeader}>
            <View>
              <Text style={modal.title}>Foto do prato</Text>
              <Text style={modal.subtitle}>
                {addedCount > 0
                  ? `${addedCount} alimento(s) adicionados hoje`
                  : "A IA identifica e você confere antes de salvar."}
              </Text>
            </View>
            <TouchableOpacity style={modal.closePill} onPress={onClose}>
              <Text style={modal.closePillText}>Concluir</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={modal.body}
            contentContainerStyle={modal.bodyContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <View style={photoModal.photoActions}>
              <TouchableOpacity
                style={photoModal.photoButton}
                onPress={() => pickImage("camera")}
                disabled={analyzing}
              >
                <MaterialIcons
                  name="photo-camera"
                  size={22}
                  color={Colors.green600}
                />
                <Text style={photoModal.photoButtonText}>Tirar foto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={photoModal.photoButton}
                onPress={() => pickImage("library")}
                disabled={analyzing}
              >
                <MaterialIcons
                  name="photo-library"
                  size={22}
                  color={Colors.green600}
                />
                <Text style={photoModal.photoButtonText}>Galeria</Text>
              </TouchableOpacity>
            </View>

            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={photoModal.previewImage}
                resizeMode="cover"
              />
            ) : (
              <View style={photoModal.emptyImage}>
                <MaterialIcons
                  name="restaurant"
                  size={34}
                  color={Colors.gray400}
                />
                <Text style={photoModal.emptyImageText}>
                  Escolha uma foto clara do prato para começar.
                </Text>
              </View>
            )}

            {analyzing && (
              <View style={photoModal.loadingBox}>
                <ActivityIndicator color={Colors.green400} />
                <Text style={photoModal.loadingText}>
                  Analisando alimentos e porções...
                </Text>
              </View>
            )}

            {summary ? <Text style={photoModal.summary}>{summary}</Text> : null}

            {imageUri ? (
              <View style={photoModal.captionBox}>
                <Text style={photoModal.captionLabel}>
                  Título ou descrição do post
                </Text>
                <TextInput
                  style={photoModal.captionInput}
                  value={postCaption}
                  onChangeText={setPostCaption}
                  placeholder="Ex: Almoço de hoje com arroz, feijão e frango"
                  placeholderTextColor={Colors.gray400}
                  multiline
                  maxLength={180}
                />
              </View>
            ) : null}

            <View style={voiceModal.previewBox}>
              <MealPeriodPicker value={mealPeriod} onChange={setMealPeriod} />
              <Text style={voiceModal.exTitle}>Itens detectados</Text>
              {editableDrafts.length === 0 ? (
                <Text style={voiceModal.previewEmpty}>
                  {allowPhotoOnlyPost
                    ? "Se a IA não identificar alimentos, você ainda pode publicar a foto usando a descrição acima."
                    : "Depois da análise, confira os alimentos aqui e ajuste o que precisar."}
                </Text>
              ) : (
                editableDrafts.map((item) => (
                  <View key={item.key} style={voiceModal.editCard}>
                    <View style={voiceModal.editHeader}>
                      <View style={voiceModal.previewEmoji}>
                        <FoodIcon
                          name={item.food?.name ?? item.foodText}
                          emoji={item.food?.emoji}
                        />
                      </View>
                      <View style={voiceModal.previewInfo}>
                        <TextInput
                          style={[
                            voiceModal.foodInput,
                            !item.foodFound && voiceModal.inputError,
                          ]}
                          value={item.foodText}
                          onChangeText={(value) =>
                            updateDraftFood(item.key, value)
                          }
                          placeholder="Alimento"
                          placeholderTextColor={Colors.gray400}
                        />
                        {!item.foodFound && (
                          <Text style={voiceModal.errorText}>
                            {item.resolving
                              ? "Cadastrando com IA..."
                              : "Alimento não encontrado na base."}
                          </Text>
                        )}
                        {!item.foodFound && !item.resolving && onCreateFood && (
                          <TouchableOpacity
                            style={voiceModal.aiCreateBtn}
                            onPress={() => resolveDraftWithAi(item)}
                          >
                            <MaterialIcons
                              name="auto-awesome"
                              size={15}
                              color={Colors.green600}
                            />
                            <Text style={voiceModal.aiCreateText}>
                              Cadastrar com IA
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <TouchableOpacity
                        style={voiceModal.removeBtn}
                        onPress={() => removeDraft(item.key)}
                      >
                        <MaterialIcons
                          name="close"
                          size={18}
                          color={Colors.gray600}
                        />
                      </TouchableOpacity>
                    </View>

                    <View style={voiceModal.editRow}>
                      <View style={voiceModal.quantityEdit}>
                        <Text style={voiceModal.smallLabel}>Qtd.</Text>
                        <TextInput
                          style={voiceModal.quantityInput}
                          value={item.quantityText}
                          onChangeText={(value) =>
                            updateDraftQuantity(item.key, value)
                          }
                          keyboardType="decimal-pad"
                          placeholder="1"
                          placeholderTextColor={Colors.gray400}
                        />
                      </View>
                      <View style={voiceModal.unitEdit}>
                        <Text style={voiceModal.smallLabel}>Unidade</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                        >
                          <View style={voiceModal.unitRow}>
                            {getFoodUnits(item.food).map((unitOption) => (
                              <TouchableOpacity
                                key={unitOption}
                                style={[
                                  voiceModal.unitMiniChip,
                                  item.unit === unitOption &&
                                    voiceModal.unitMiniChipActive,
                                ]}
                                onPress={() =>
                                  updateDraftUnit(item.key, unitOption)
                                }
                              >
                                <Text
                                  style={[
                                    voiceModal.unitMiniText,
                                    item.unit === unitOption &&
                                      voiceModal.unitMiniTextActive,
                                  ]}
                                >
                                  {UNIT_LABELS[unitOption]}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    </View>

                    <Text style={voiceModal.previewMeta}>
                      {formatNutritionDetails(item.nutrition, {
                        includeKcal: true,
                      })}
                    </Text>
                    {item.sourceNote ? (
                      <Text style={voiceModal.spokenText}>
                        {item.sourceNote}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          <View style={modal.actions}>
            <TouchableOpacity style={modal.btnCancel} onPress={onClose}>
              <Text style={modal.btnCancelText}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modal.btnAdd, !canConfirm && modal.btnDisabled]}
              onPress={confirm}
              disabled={!canConfirm}
            >
              {confirming ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={modal.btnAddText}>
                  {editableDrafts.length === 0 && canConfirmPhotoOnly
                    ? "Publicar foto"
                    : "Adicionar e continuar"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Today Log ────────────────────────────────────────────────────────────────

function TodayEntry({
  entry,
  onDelete,
  onEdit,
}: {
  entry: MealEntry;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const time = formatBrasiliaTime(new Date(entry.addedAt));
  const mealPeriod = getEntryMealPeriod(entry);
  const nutritionDetails = formatNutritionDetails(entry.nutrition);

  return (
    <View style={logStyle.row}>
      <View style={logStyle.emoji}>
        <FoodIcon name={entry.foodName} emoji={entry.emoji} />
      </View>
      <View style={logStyle.info}>
        <View style={logStyle.infoTop}>
          <View style={logStyle.periodBadge}>
            <Text style={logStyle.periodTxt}>
              {MEAL_PERIOD_LABELS[mealPeriod]}
            </Text>
          </View>
          <View style={logStyle.timeBadge}>
            <Text style={logStyle.timeTxt}>{time}</Text>
          </View>
        </View>
        <Text style={logStyle.name}>{entry.foodName}</Text>
        {nutritionDetails ? (
          <Text style={logStyle.macros}>{nutritionDetails}</Text>
        ) : null}
      </View>
      <View style={logStyle.right}>
        <Text style={logStyle.kcal}>{Math.round(entry.nutrition.kcal)}</Text>
        <Text style={logStyle.kcalLabel}>kcal</Text>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} style={logStyle.editBtn}>
            <MaterialIcons name="edit" size={16} color={Colors.green600} />
          </TouchableOpacity>
        ) : null}
        {onDelete ? (
          <TouchableOpacity onPress={onDelete} style={logStyle.delBtn}>
            <Text style={logStyle.delTxt}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function divideNutrition(
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

function editableFoodFromEntry(
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

function EditMealEntryModal({
  visible,
  entry,
  customFoods,
  onClose,
  onSave,
}: {
  visible: boolean;
  entry: MealEntry | null;
  customFoods: FoodItem[];
  onClose: () => void;
  onSave: (entry: MealEntry) => Promise<void>;
}) {
  const [quantityText, setQuantityText] = React.useState("");
  const [unit, setUnit] = React.useState<QuantityUnit>("porcao");
  const [mealPeriod, setMealPeriod] = React.useState<MealPeriod>("snack");
  const [saving, setSaving] = React.useState(false);

  const food = React.useMemo(
    () => (entry ? editableFoodFromEntry(entry, customFoods) : null),
    [customFoods, entry],
  );
  const quantity = parseOptionalQtyInput(quantityText);
  const nutrition = food
    ? calculateNutrition(food, quantity, unit)
    : emptyNutrition();

  React.useEffect(() => {
    if (!visible || !entry) return;
    setQuantityText(String(entry.quantity).replace(".", ","));
    setUnit(entry.unit);
    setMealPeriod(getEntryMealPeriod(entry));
  }, [entry, visible]);

  async function handleSave() {
    if (!entry || !food) return;
    if (!quantityText.trim() || quantity <= 0) {
      Alert.alert(
        "Quantidade inválida",
        "Informe uma quantidade maior que zero.",
      );
      return;
    }
    setSaving(true);
    try {
      const waterMl = getWaterMl(food, quantity, unit);
      const finalPeriod = waterMl ? "hydration" : mealPeriod;
      await onSave({
        ...entry,
        foodName: `${food.name} (${quantityText} ${UNIT_LABELS[unit]})`,
        emoji: food.emoji,
        quantity,
        unit,
        nutrition,
        waterMl,
        mealPeriod: finalPeriod,
        mealGroupLabel: MEAL_PERIOD_LABELS[finalPeriod],
      });
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
      <View style={modal.bg}>
        <TouchableOpacity style={modal.backdrop} onPress={onClose} />
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <View style={modal.modalHeader}>
            <View>
              <Text style={modal.title}>Editar refeição</Text>
              <Text style={modal.subtitle}>
                {food?.emoji} {food?.name}
              </Text>
            </View>
            <TouchableOpacity style={modal.closePill} onPress={onClose}>
              <Text style={modal.closePillText}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <View style={modal.bodyContent}>
            <MealPeriodPicker value={mealPeriod} onChange={setMealPeriod} />
            <View style={modal.selectedItem}>
              <Text style={modal.inlineLabel}>Quantidade</Text>
              <TextInput
                style={modal.selectedQtyInput}
                value={quantityText}
                onChangeText={setQuantityText}
                keyboardType="decimal-pad"
                placeholder="1"
                placeholderTextColor={Colors.gray400}
              />
              <View style={modal.selectedUnits}>
                {getFoodUnits(food).map((unitOption) => (
                  <TouchableOpacity
                    key={unitOption}
                    style={[
                      modal.unitChip,
                      unit === unitOption && modal.unitChipActive,
                    ]}
                    onPress={() => setUnit(unitOption)}
                  >
                    <Text
                      style={[
                        modal.unitChipText,
                        unit === unitOption && modal.unitChipTextActive,
                      ]}
                    >
                      {UNIT_LABELS[unitOption]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={modal.selectedMeta}>
                {formatNutritionDetails(nutrition, { includeKcal: true })}
              </Text>
            </View>
          </View>
          <View style={modal.actions}>
            <TouchableOpacity style={modal.btnCancel} onPress={onClose}>
              <Text style={modal.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modal.btnAdd, saving && modal.btnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={modal.btnAddText}>Salvar alterações</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    position: "relative",
    backgroundColor: Colors.bg,
  },
  pageScroll: { flex: 1 },
  headerBar: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 760 : undefined,
    alignSelf: "center",
    backgroundColor: Colors.white,
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    zIndex: 20,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.bold },
  headerSubtitle: {
    marginTop: 2,
    fontSize: Typography.xs,
    color: Colors.warning,
    fontWeight: Typography.semibold,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pendingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.fatL,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  pendingPillText: {
    color: Colors.warning,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
  },
  syncedPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.green50,
  },
  fabBackdrop: {
    position: VIEWPORT_POSITION,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
  },
  fabLayer: {
    position: VIEWPORT_POSITION,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 20,
  },
  fabInner: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 760 : undefined,
    alignSelf: "center",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.base,
  },
  fabActions: {
    alignItems: "flex-end",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  fabActionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
  fabActionDisabled: { opacity: 0.45 },
  fabActionLabel: {
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabActionText: {
    color: Colors.gray800,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  fabActionButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.green400,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.green400,
    borderWidth: 1,
    borderColor: Colors.green400,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  fabButtonOpen: {
    backgroundColor: Colors.green600,
    borderColor: Colors.green600,
  },
  scroll: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 760 : undefined,
    alignSelf: "center",
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
  },

  sectionLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.gray400,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },

  datePanel: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  datePanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  datePanelTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.gray800,
    textTransform: "capitalize",
  },
  dateTotalPill: {
    minWidth: 68,
    alignItems: "center",
    borderRadius: Radius.md,
    backgroundColor: Colors.green50,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
  },
  dateTotalKcal: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.green600,
  },
  dateTotalLabel: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    marginTop: -2,
  },
  dateChips: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  dateChip: {
    width: 56,
    minHeight: 72,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  dateChipActive: {
    borderColor: Colors.green400,
    backgroundColor: Colors.green50,
  },
  dateChipWeekday: {
    fontSize: 10,
    color: Colors.gray400,
    textTransform: "uppercase",
    fontWeight: Typography.semibold,
  },
  dateChipDay: {
    fontSize: Typography.lg,
    color: Colors.gray800,
    fontWeight: Typography.bold,
    marginTop: 2,
  },
  dateChipTextActive: { color: Colors.green600 },
  dateChipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
    marginTop: 5,
  },
  dateChipDotFilled: { backgroundColor: Colors.green400 },
  dateChipDotActive: { backgroundColor: Colors.green600 },

  savedCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  savedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  savedEmoji: { width: 38, alignItems: "center" },
  savedName: { fontSize: Typography.md, fontWeight: Typography.semibold },
  savedInfo: { fontSize: Typography.xs, color: Colors.gray400 },
  quickAddBtn: {
    backgroundColor: Colors.green50,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.green400,
  },
  quickAddTxt: {
    color: Colors.green600,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },

  emptyLog: { alignItems: "center", padding: Spacing.xl },
  emptyLogText: { color: Colors.gray400, fontSize: Typography.md },

  logList: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
});

const logStyle = StyleSheet.create({
  group: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.green50,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  groupTitle: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.green600,
  },
  groupCount: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.green600,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  emoji: { width: 40, alignItems: "center" },
  info: { flex: 1 },
  infoTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 2,
  },
  periodBadge: {
    backgroundColor: Colors.green50,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  periodTxt: {
    fontSize: Typography.xs,
    color: Colors.green600,
    fontWeight: Typography.semibold,
  },
  timeBadge: {
    backgroundColor: Colors.gray50,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timeTxt: { fontSize: Typography.xs, color: Colors.gray400 },
  name: { fontSize: Typography.md, fontWeight: Typography.semibold },
  macros: { fontSize: Typography.xs, color: Colors.gray400 },
  right: { alignItems: "flex-end", gap: 2 },
  kcal: { fontSize: Typography.md, fontWeight: Typography.bold },
  kcalLabel: { fontSize: Typography.xs, color: Colors.gray400 },
  editBtn: {
    marginTop: 4,
    padding: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.green50,
  },
  delBtn: { marginTop: 4, padding: 4 },
  delTxt: { color: Colors.gray400, fontSize: Typography.sm },
});

const modal = StyleSheet.create({
  bg: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    height: "92%",
    width: "100%",
    maxWidth: Platform.OS === "web" ? 720 : undefined,
    alignSelf: "center",
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.base,
    paddingBottom: Spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.base,
    flexShrink: 0,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: Spacing.base,
    flexShrink: 0,
  },
  body: { flex: 1, minHeight: 0 },
  bodyContent: { paddingBottom: Spacing.lg },
  title: { fontSize: Typography.lg, fontWeight: Typography.bold },
  subtitle: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3 },
  closePill: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  closePillText: {
    color: Colors.gray600,
    fontWeight: Typography.semibold,
    fontSize: Typography.sm,
  },
  label: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.gray400,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  subLabel: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    fontWeight: Typography.semibold,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    fontSize: Typography.base,
    marginBottom: Spacing.sm,
  },
  chipsScroll: { marginBottom: Spacing.sm },
  chips: { flexDirection: "row", gap: 6, paddingRight: Spacing.base },
  chip: {
    backgroundColor: Colors.green50,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipContent: { flexDirection: "row", alignItems: "center", gap: 5 },
  chipText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.green600,
  },
  searchPanel: { flexShrink: 0 },
  suggestionBox: {
    minHeight: 150,
    maxHeight: 280,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
  },
  foodOption: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  foodOptionActive: { backgroundColor: Colors.green50 },
  foodEmoji: { width: 38, alignItems: "center", marginTop: 1 },
  foodInfo: { flex: 1 },
  foodActions: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginLeft: 4,
  },
  foodAddButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.green600,
  },
  foodAddButtonDisabled: { opacity: 0.5 },
  foodName: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.gray800,
  },
  foodNameActive: { color: Colors.green600 },
  foodUnit: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  noResults: { padding: Spacing.md, alignItems: "center" },
  noResultsText: { fontSize: Typography.sm, color: Colors.gray400 },
  aiCreateOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.green50,
  },
  aiIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.green400,
  },
  aiCreateTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.green600,
  },
  aiCreateText: {
    fontSize: Typography.xs,
    color: Colors.gray600,
    marginTop: 2,
    lineHeight: 16,
  },
  bottomPanel: {
    flexShrink: 0,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  emptySelection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.green50,
  },
  emptySelectionText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.gray600,
    lineHeight: 18,
    fontWeight: Typography.semibold,
  },
  unitChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    backgroundColor: Colors.white,
  },
  unitChipActive: {
    borderColor: Colors.green400,
    backgroundColor: Colors.green50,
  },
  unitChipText: {
    fontSize: Typography.xs,
    color: Colors.gray600,
    fontWeight: Typography.semibold,
  },
  unitChipTextActive: { color: Colors.green600 },
  selectedBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    overflow: "hidden",
  },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    backgroundColor: Colors.gray50,
  },
  selectedTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.gray600,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectedTotal: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.green600,
  },
  selectedItem: {
    padding: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  selectedTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  selectedEmoji: { width: 34, alignItems: "center" },
  selectedInfo: { flex: 1 },
  selectedName: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.gray800,
  },
  selectedMeta: {
    marginTop: 2,
    fontSize: Typography.xs,
    color: Colors.gray400,
  },
  selectedRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.gray50,
  },
  selectedControls: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "flex-start",
    marginTop: Spacing.sm,
  },
  selectedQtyField: { width: 82 },
  inlineLabel: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    fontWeight: Typography.bold,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  selectedQtyInput: {
    height: 38,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    fontSize: Typography.sm,
    color: Colors.gray800,
    backgroundColor: Colors.white,
  },
  selectedUnits: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 18,
  },
  periodBox: { marginBottom: Spacing.sm },
  periodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  periodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    backgroundColor: Colors.white,
  },
  periodChipActive: {
    backgroundColor: Colors.green400,
    borderColor: Colors.green400,
  },
  periodText: {
    fontSize: Typography.xs,
    color: Colors.gray600,
    fontWeight: Typography.semibold,
  },
  periodTextActive: { color: Colors.white },

  nutritionSummary: {
    marginTop: 4,
    fontSize: Typography.xs,
    color: Colors.gray600,
    fontWeight: Typography.semibold,
  },
  nutritionMicroSummary: {
    marginTop: 2,
    fontSize: Typography.xs,
    color: Colors.gray400,
  },

  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
    flexShrink: 0,
  },
  btnCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnCancelText: { fontSize: Typography.base, color: Colors.gray600 },
  btnAdd: {
    flex: 2,
    backgroundColor: Colors.green400,
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.4 },
  btnAddText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },
});

const voiceModal = StyleSheet.create({
  circle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.purpleL,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    borderWidth: 3,
    borderColor: Colors.purple,
    marginVertical: Spacing.md,
  },
  circleActive: { backgroundColor: Colors.purple },
  tip: {
    textAlign: "center",
    fontSize: Typography.sm,
    color: Colors.gray400,
    marginBottom: Spacing.sm,
  },
  transcript: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    minHeight: 60,
    marginBottom: Spacing.md,
  },
  transcriptText: { fontSize: Typography.md, color: Colors.gray800 },
  exTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.gray400,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  example: {
    fontSize: Typography.sm,
    color: Colors.gray600,
    fontStyle: "italic",
    marginBottom: 4,
    backgroundColor: Colors.gray50,
    borderRadius: 6,
    padding: 6,
  },
  previewBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  previewEmpty: {
    fontSize: Typography.sm,
    color: Colors.gray400,
    lineHeight: 18,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  previewEmoji: { width: 40, alignItems: "center" },
  previewInfo: { flex: 1 },
  previewName: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.gray800,
  },
  previewMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  editCard: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  editHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  foodInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    fontSize: Typography.sm,
    color: Colors.gray800,
    backgroundColor: Colors.white,
  },
  inputError: { borderColor: Colors.danger, backgroundColor: Colors.proteinL },
  errorText: { fontSize: Typography.xs, color: Colors.danger, marginTop: 3 },
  aiCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.green400,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.green50,
  },
  aiCreateText: {
    fontSize: Typography.xs,
    color: Colors.green600,
    fontWeight: Typography.bold,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.gray50,
  },
  editRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  quantityEdit: { width: 86 },
  unitEdit: { flex: 1 },
  smallLabel: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    fontWeight: Typography.semibold,
    marginBottom: 4,
  },
  quantityInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    fontSize: Typography.sm,
    color: Colors.gray800,
  },
  unitRow: { flexDirection: "row", gap: 6, paddingRight: Spacing.sm },
  unitMiniChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    backgroundColor: Colors.white,
  },
  unitMiniChipActive: {
    borderColor: Colors.green400,
    backgroundColor: Colors.green50,
  },
  unitMiniText: {
    fontSize: Typography.xs,
    color: Colors.gray600,
    fontWeight: Typography.semibold,
  },
  unitMiniTextActive: { color: Colors.green600 },
  spokenText: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    marginTop: 3,
    fontStyle: "italic",
  },
});

const photoModal = StyleSheet.create({
  photoActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  photoButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.green400,
    borderRadius: Radius.md,
    backgroundColor: Colors.green50,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.xs,
  },
  photoButtonText: {
    color: Colors.green600,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  previewImage: {
    width: "100%",
    height: 170,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    marginBottom: Spacing.sm,
  },
  emptyImage: {
    height: 150,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptyImageText: {
    marginTop: Spacing.xs,
    fontSize: Typography.sm,
    color: Colors.gray400,
    textAlign: "center",
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.green50,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  loadingText: {
    fontSize: Typography.sm,
    color: Colors.green600,
    fontWeight: Typography.semibold,
  },
  summary: {
    fontSize: Typography.sm,
    color: Colors.gray600,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  captionBox: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  captionLabel: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    fontWeight: Typography.bold,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  captionInput: {
    minHeight: 58,
    fontSize: Typography.sm,
    color: Colors.gray800,
    lineHeight: 19,
    textAlignVertical: "top",
  },
});
