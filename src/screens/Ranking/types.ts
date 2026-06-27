import { Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CommunityPost, FoodNutrition, QuantityUnit } from '../../types';

export const GLOBAL_COMMUNITY_ID = 'global';

export const WEB_FIXED_COMMUNITY_FAB_STYLE = Platform.OS === 'web'
  ? ({ position: 'fixed' } as any)
  : null;

export const MEAL_LABELS: Record<CommunityPost['mealPeriod'], string> = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  dinner: 'Jantar',
  snack: 'Lanche',
  hydration: 'Hidratação',
};

export const VISIBILITY_OPTIONS: {
  key: NonNullable<CommunityPost['visibility']>;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}[] = [
  { key: 'public', label: 'Público', icon: 'public' },
  { key: 'friends', label: 'Amigos', icon: 'people' },
  { key: 'private', label: 'Só eu', icon: 'lock' },
];

export type FriendOption = {
  id: string;
  name: string;
  nickname?: string;
};

export type CommunityDetectedFood = {
  key: string;
  name: string;
  quantity: number;
  unit: QuantityUnit;
  nutrition: FoodNutrition;
  confidence?: number;
};
