import { FoodNutrition, MacroGoals, MealPeriod } from '../types';

export const DEFAULT_GOALS: MacroGoals = {
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

export const EMPTY_TOTAL: FoodNutrition = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sodium: 0,
  sugar: 0,
};

export type EditableGoalKey = keyof MacroGoals;

export const EDITABLE_GOAL_ROWS: {
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

export const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  dinner: 'Jantar',
  snack: 'Lanche',
  hydration: 'Hidratação',
};

export type NutritionGoalMode = 'target' | 'limit';

export type NutritionGoalRow = {
  key: keyof FoodNutrition | 'waterMl';
  label: string;
  unit: string;
  goal: number;
  mode: NutritionGoalMode;
  section: 'Energia e macros' | 'Limites' | 'Vitaminas e minerais';
  overPct?: number;
};
