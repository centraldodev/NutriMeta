import { parseQuantityFromText, calculateNutrition } from "../../../constants/foodDatabase";
import { FoodItem, QuantityUnit } from "../../../types";
import { MealDraft } from "../types";
import {
  normalizeFoodText,
  foodTokens,
  findBestFood,
  findAnyFood,
  findCompositePartFood,
  isCompositeFoodQuery,
  splitCompositeFoodQuery,
} from "./foodSearch";
import { emptyNutrition, getPreferredFoodUnit } from "./mealUtils";

export const QUANTITY_WORDS: Record<string, number> = {
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

export function parseVoiceQuantity(
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

export function splitVoiceText(
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

export function parseVoiceMeal(
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

export function expandCompositeVoiceSegment(
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

export function compatibleDetectedUnit(
  food: FoodItem,
  detectedUnit: QuantityUnit,
): QuantityUnit {
  if (food.nutritionPer[detectedUnit]) return detectedUnit;
  return getPreferredFoodUnit(food);
}
