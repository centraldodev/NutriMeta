// ─── User & Auth ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role?: 'user' | 'nutritionist';
  avatarUrl?: string;
  createdAt: Date;
}

export type BiologicalSex = 'M' | 'F';
export type GoalType = 'deficit' | 'maintain' | 'muscle' | 'bulk';
export type ActivityLevel = 1.2 | 1.375 | 1.55 | 1.725 | 1.9;

export interface UserProfile {
  userId: string;
  name: string;
  age: number;
  weight: number;       // kg
  height: number;       // cm
  sex: BiologicalSex;
  goal: GoalType;
  activityLevel: ActivityLevel;
  onboardingComplete: boolean;
  groupIds: string[];
  communityPrivacy?: CommunityPrivacy;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityPrivacy {
  showProtein: boolean;
  showFiber: boolean;
  showCalories: boolean;
  showStreak: boolean;
  showLimits: boolean;
}

// ─── Nutrition Goals ─────────────────────────────────────────────────────────

export interface MacroGoals {
  kcal: number;
  protein: number;     // g
  carbs: number;       // g
  fat: number;         // g
  fiber: number;       // g
  water: number;       // ml
  sugar: number;       // g, daily limit
  sodium: number;      // mg, daily limit
}

// ─── Food & Meals ────────────────────────────────────────────────────────────

export type QuantityUnit =
  | 'colher_sopa'
  | 'colher_cha'
  | 'xicara'
  | 'concha'
  | 'fatia'
  | 'unidade'
  | 'porcao'
  | 'file'
  | 'bife_pequeno'
  | 'bife_medio'
  | 'bife_grande'
  | 'mililitro'
  | 'litro'
  | 'grama';

export type BifeSizeFactor = {
  pequeno: number;
  medio: number;
  grande: number;
};

export interface FoodNutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium?: number;
  sugar?: number;
  calcium?: number;     // mg
  iron?: number;        // mg
  potassium?: number;   // mg
  magnesium?: number;   // mg
  zinc?: number;        // mg
  vitaminA?: number;    // mcg RAE
  vitaminC?: number;    // mg
  vitaminD?: number;    // mcg
  vitaminE?: number;    // mg
  vitaminB12?: number;  // mcg
  folate?: number;      // mcg
}

export interface FoodItem {
  id: string;
  name: string;
  emoji: string;
  aliases: string[];                             // for voice/text matching
  nutritionPer: Partial<Record<QuantityUnit, FoodNutrition>>;
  defaultUnit: QuantityUnit;
}

export interface MealEntry {
  id: string;
  userId: string;
  foodName: string;
  emoji: string;
  quantity: number;
  unit: QuantityUnit;
  nutrition: FoodNutrition;                      // calculated total
  waterMl?: number;
  addedAt: Date;
  mealPeriod: MealPeriod;
  source: 'manual' | 'voice' | 'photo' | 'saved';
  savedMealId?: string;
}

export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'hydration';

export interface SavedMeal {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  entries: Omit<MealEntry, 'id' | 'userId' | 'addedAt' | 'savedMealId'>[];
  totalNutrition: FoodNutrition;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Daily Log ───────────────────────────────────────────────────────────────

export interface DailyLog {
  id: string;                                    // userId_YYYY-MM-DD
  userId: string;
  date: string;                                  // YYYY-MM-DD
  entries: MealEntry[];
  totalNutrition: FoodNutrition;
  waterMl?: number;
  goals: MacroGoals;
  completedGoals: (keyof MacroGoals)[];
  updatedAt: Date;
}

// ─── Groups & Ranking ────────────────────────────────────────────────────────

export interface Group {
  id: string;
  name: string;
  emoji: string;
  ownerId: string;
  memberIds: string[];
  inviteCode: string;
  createdAt: Date;
}

export interface GroupMemberStats {
  userId: string;
  name: string;
  avatarInitials: string;
  avatarColor: string;
  totalNutrition: FoodNutrition;
  goals: MacroGoals;
  completedGoals: (keyof MacroGoals)[];
  streakDays?: number;
  privacy?: CommunityPrivacy;
  points: number;
  rank: number;
  date: string;
}

export interface GroupNotification {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  type: 'goal_hit' | 'rank_change' | 'streak' | 'app_tip' | 'weekly_insight' | 'nutritionist_feedback';
  macro?: keyof MacroGoals;
  message: string;
  createdAt: Date;
  read: boolean;
}

export interface CommunityComment {
  id: string;
  groupId: string;
  targetUserId: string;
  authorId: string;
  authorName: string;
  message: string;
  createdAt: Date;
}

export interface CommunityPost {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  imageUrl: string;
  caption?: string;
  nutrition: FoodNutrition;
  foodNames: string[];
  mealPeriod: MealPeriod;
  createdAt: Date;
}

// ─── Voice ──────────────────────────────────────────────────────────────────

export interface VoiceParseResult {
  foodName: string;
  quantity: number;
  unit: QuantityUnit;
  confidence: number;
  rawText: string;
}

// ─── Navigation ──────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  AddMeal: undefined;
  Ranking: undefined;
};

export type AddMealStackParamList = {
  AddMealHome: undefined;
  EditSavedMeal: { mealId: string };
  FoodSearch: undefined;
  VoiceInput: undefined;
};

// ─── Store (Zustand) ─────────────────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  authLoading: boolean;
  isAuthenticated: boolean;
}

export interface NutritionState {
  todayLog: DailyLog | null;
  goals: MacroGoals | null;
  savedMeals: SavedMeal[];
  nutritionLoading: boolean;
}

export interface GroupState {
  groups: Group[];
  memberStats: GroupMemberStats[];
  notifications: GroupNotification[];
  groupLoading: boolean;
}
