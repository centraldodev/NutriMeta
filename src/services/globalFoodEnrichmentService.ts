import { FoodItem, FoodNutrition } from '../types';
import { generateFoodNutrition } from './foodNutritionAiService';
import { getCustomFoods, saveCustomFood } from './customFoodService';
import { isAiLimitError } from '../utils/aiErrors';

const EXPANDED_NUTRIENT_KEYS: (keyof FoodNutrition)[] = [
  'sodium',
  'sugar',
  'calcium',
  'iron',
  'potassium',
  'magnesium',
  'zinc',
  'vitaminA',
  'vitaminC',
  'vitaminD',
  'vitaminE',
  'vitaminB12',
  'folate',
];

export function hasExpandedNutrition(food: FoodItem): boolean {
  const nutrition = food.nutritionPer[food.defaultUnit] ?? Object.values(food.nutritionPer)[0];
  if (!nutrition) return false;
  return EXPANDED_NUTRIENT_KEYS.filter((key) => ((nutrition[key] as number | undefined) ?? 0) > 0).length >= 6;
}

export function mergeExpandedFoodNutrition(original: FoodItem, generated: FoodItem): FoodItem {
  const originalUnit = original.defaultUnit;
  const originalNutrition = original.nutritionPer[originalUnit] ?? Object.values(original.nutritionPer)[0];
  const generatedNutrition = generated.nutritionPer[generated.defaultUnit] ?? Object.values(generated.nutritionPer)[0];

  if (!originalNutrition || !generatedNutrition) return original;

  const fillOptional = (key: keyof FoodNutrition) => {
    const current = originalNutrition[key] as number | undefined;
    const next = generatedNutrition[key] as number | undefined;
    return current && current > 0 ? current : next;
  };

  return {
    ...original,
    emoji: original.emoji || generated.emoji,
    aliases: Array.from(new Set([...original.aliases, ...generated.aliases, generated.name.toLowerCase()])),
    nutritionPer: {
      ...original.nutritionPer,
      [originalUnit]: {
        ...originalNutrition,
        sodium: fillOptional('sodium'),
        sugar: fillOptional('sugar'),
        calcium: fillOptional('calcium'),
        iron: fillOptional('iron'),
        potassium: fillOptional('potassium'),
        magnesium: fillOptional('magnesium'),
        zinc: fillOptional('zinc'),
        vitaminA: fillOptional('vitaminA'),
        vitaminC: fillOptional('vitaminC'),
        vitaminD: fillOptional('vitaminD'),
        vitaminE: fillOptional('vitaminE'),
        vitaminB12: fillOptional('vitaminB12'),
        folate: fillOptional('folate'),
      },
    },
  };
}

export async function enrichGlobalFood({
  userId,
  food,
}: {
  userId: string;
  food: FoodItem;
}): Promise<FoodItem> {
  if (hasExpandedNutrition(food)) return food;
  const generated = await generateFoodNutrition(`${food.name} tabela nutricional completa vitaminas minerais`, food.defaultUnit);
  const enrichedFood = mergeExpandedFoodNutrition(food, generated);
  await saveCustomFood(userId, enrichedFood);
  return enrichedFood;
}

export async function enrichGlobalFoodsBatch({
  userId,
  foods,
  limit = 8,
  skipIds = new Set<string>(),
  onFoodsUpdated,
}: {
  userId: string;
  foods?: FoodItem[];
  limit?: number;
  skipIds?: Set<string>;
  onFoodsUpdated?: (foods: FoodItem[]) => void;
}): Promise<{ enriched: number; remaining: number; pausedByAiLimit: boolean }> {
  const currentFoods = foods ?? await getCustomFoods(userId);
  const foodsToEnrich = currentFoods
    .filter((food) => !hasExpandedNutrition(food) && !skipIds.has(food.id))
    .slice(0, limit);

  let enriched = 0;
  let latestFoods = currentFoods;

  for (const food of foodsToEnrich) {
    skipIds.add(food.id);
    try {
      const generated = await generateFoodNutrition(`${food.name} tabela nutricional completa vitaminas minerais`, food.defaultUnit);
      const enrichedFood = mergeExpandedFoodNutrition(food, generated);
      latestFoods = await saveCustomFood(userId, enrichedFood);
      enriched += 1;
      onFoodsUpdated?.(latestFoods);
    } catch (error) {
      if (isAiLimitError(error)) {
        return {
          enriched,
          remaining: Math.max(0, currentFoods.filter((item) => !hasExpandedNutrition(item)).length - enriched),
          pausedByAiLimit: true,
        };
      }
      console.warn('Failed to enrich global food nutrition', food.name, error);
    }
  }

  return {
    enriched,
    remaining: Math.max(0, latestFoods.filter((food) => !hasExpandedNutrition(food)).length),
    pausedByAiLimit: false,
  };
}
