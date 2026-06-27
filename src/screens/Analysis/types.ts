import { MealPeriod } from '../../types';

export {
  DEFAULT_GOALS,
  EMPTY_TOTAL,
  MEAL_PERIOD_LABELS,
} from '../../constants/nutrition';

export type { NutritionGoalMode, NutritionGoalRow } from '../../constants/nutrition';

export type WeekRange = {
  index: number;
  label: string;
  rangeLabel: string;
  dates: string[];
};

export type WeeklyFoodSummary = {
  name: string;
  emoji: string;
  count: number;
  kcal: number;
  sodium: number;
  sugar: number;
};

export type MealDistributionItem = {
  period: MealPeriod;
  label: string;
  kcal: number;
  count: number;
  pct: number;
};

export const MEAL_PERIOD_ORDER = new Map<MealPeriod, number>([
  ['breakfast', 0],
  ['lunch', 1],
  ['snack', 2],
  ['dinner', 3],
  ['hydration', 4],
]);
