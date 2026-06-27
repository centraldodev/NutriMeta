import { Platform } from 'react-native';
import { calculateNutrition } from '../../constants/foodDatabase';
import { FoodItem, FoodNutrition, MealEntry, MealPeriod, QuantityUnit } from '../../types';

export { MEAL_PERIOD_LABELS } from '../../constants/nutrition';

// No navegador, absolute acompanha o contêiner da página.
// fixed mantém o FAB preso à janela; no Android/iOS, absolute é o correto.
export const VIEWPORT_POSITION: any =
  Platform.OS === 'web' ? 'fixed' : 'absolute';

export type SpeechRecognitionModule = {
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

export type MealEntryPayload = Omit<MealEntry, 'id' | 'userId' | 'addedAt'>;

export type ManualMealSelection = {
  key: string;
  food: FoodItem;
  quantityText: string;
  quantity: number;
  unit: QuantityUnit;
  nutrition: FoodNutrition;
};

export const MEAL_PERIODS: { key: MealPeriod; label: string; icon: string }[] = [
  { key: 'breakfast', label: 'Café da manhã', icon: 'wb-sunny' },
  { key: 'lunch', label: 'Almoço', icon: 'restaurant' },
  { key: 'dinner', label: 'Jantar', icon: 'nightlight' },
  { key: 'snack', label: 'Lanche', icon: 'bakery-dining' },
  { key: 'hydration', label: 'Hidratação', icon: 'local-drink' },
];
