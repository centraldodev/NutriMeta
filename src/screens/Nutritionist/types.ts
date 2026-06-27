import { FoodItem, FoodNutrition, MealEntry, QuantityUnit } from '../../types';
import { MEAL_PERIOD_LABELS } from '../../constants/nutrition';

export {
  DEFAULT_GOALS,
  EMPTY_TOTAL,
  EDITABLE_GOAL_ROWS,
} from '../../constants/nutrition';

export type { EditableGoalKey } from '../../constants/nutrition';

// Alias local para compatibilidade com código da tela
export const PERIOD_LABELS = MEAL_PERIOD_LABELS;

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
};

export type MealDistributionItem = {
  period: MealEntry['mealPeriod'];
  label: string;
  kcal: number;
  count: number;
  pct: number;
};

export type PlanSelectedFood = {
  key: string;
  food: FoodItem;
  quantityText: string;
  quantity: number;
  unit: QuantityUnit;
  nutrition: FoodNutrition;
};

export type PlanMealOptionDraft = {
  id: string;
  title: string;
  selectedFoods: PlanSelectedFood[];
};

export const PATIENT_LOG_LOOKBACK_DAYS = 31;

export const MEAL_PERIOD_OPTIONS: { key: MealEntry['mealPeriod']; label: string }[] = [
  { key: 'breakfast', label: 'Café da manhã' },
  { key: 'lunch', label: 'Almoço' },
  { key: 'dinner', label: 'Jantar' },
  { key: 'snack', label: 'Lanche' },
];

export const PLAN_NUTRITION_ROWS: {
  key: keyof FoodNutrition;
  label: string;
  unit: string;
}[] = [
  { key: 'kcal', label: 'Cal', unit: 'kcal' },
  { key: 'protein', label: 'Prot', unit: 'g' },
  { key: 'carbs', label: 'Carb', unit: 'g' },
  { key: 'fat', label: 'Gord', unit: 'g' },
  { key: 'fiber', label: 'Fibra', unit: 'g' },
  { key: 'sugar', label: 'Açúcar', unit: 'g' },
  { key: 'sodium', label: 'Sódio', unit: 'mg' },
  { key: 'calcium', label: 'Cálcio', unit: 'mg' },
  { key: 'iron', label: 'Ferro', unit: 'mg' },
  { key: 'potassium', label: 'Potássio', unit: 'mg' },
  { key: 'magnesium', label: 'Magnésio', unit: 'mg' },
  { key: 'zinc', label: 'Zinco', unit: 'mg' },
  { key: 'vitaminA', label: 'Vit. A', unit: 'mcg' },
  { key: 'vitaminC', label: 'Vit. C', unit: 'mg' },
  { key: 'vitaminD', label: 'Vit. D', unit: 'mcg' },
  { key: 'vitaminE', label: 'Vit. E', unit: 'mg' },
  { key: 'vitaminB12', label: 'B12', unit: 'mcg' },
  { key: 'folate', label: 'Folato', unit: 'mcg' },
];

export const DAILY_NUTRIENT_ROWS: {
  key: keyof FoodNutrition;
  label: string;
  unit: string;
}[] = [
  { key: 'kcal', label: 'Calorias', unit: 'kcal' },
  { key: 'protein', label: 'Proteína', unit: 'g' },
  { key: 'carbs', label: 'Carboidratos', unit: 'g' },
  { key: 'fat', label: 'Gorduras', unit: 'g' },
  { key: 'fiber', label: 'Fibras', unit: 'g' },
  { key: 'sugar', label: 'Açúcar', unit: 'g' },
  { key: 'sodium', label: 'Sódio', unit: 'mg' },
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
