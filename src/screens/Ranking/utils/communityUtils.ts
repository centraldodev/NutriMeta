import { FoodNutrition, MealPeriod } from '../../../types';
import { formatBrasiliaDate, getBrasiliaHour } from '../../../utils/nutrition';

export function getDefaultMealPeriod(): MealPeriod {
  const hour = getBrasiliaHour();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 18) return 'snack';
  return 'dinner';
}

export function multiplyNutrition(nutrition: FoodNutrition | undefined, quantity: number): FoodNutrition {
  const base = nutrition ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 };
  const result = {} as FoodNutrition;
  (Object.entries(base) as [keyof FoodNutrition, number | undefined][]).forEach(([key, value]) => {
    if (typeof value === 'number') result[key] = Math.round(value * quantity * 10) / 10 as never;
  });
  result.kcal = Math.round(result.kcal ?? 0);
  return result;
}

export function postDateLabel(date: Date): string {
  return formatBrasiliaDate(date, { day: '2-digit', month: '2-digit' });
}
