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
  macroGoals?: MacroGoals;
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
  calcium?: number;    // mg
  iron?: number;       // mg
  potassium?: number;  // mg
  magnesium?: number;  // mg
  zinc?: number;       // mg
  vitaminA?: number;   // mcg RAE
  vitaminC?: number;   // mg
  vitaminD?: number;   // mcg
  vitaminE?: number;   // mg
  vitaminB12?: number; // mcg
  folate?: number;     // mcg
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
  source?: string;
  category?: string;
  portionReference?: string;
  ingredients?: { nome: string; quantidade_g?: number }[];
  originalData?: Record<string, unknown>;
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
  mealGroupId?: string;
  mealGroupLabel?: string;
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
  groupId?: string;
  userId: string;
  userName: string;
  targetUserIds?: string[];
  type: 'goal_hit' | 'rank_change' | 'streak' | 'app_tip' | 'weekly_insight' | 'nutritionist_feedback' | 'food_plan_created' | 'food_plan_updated';
  macro?: keyof MacroGoals;
  message: string;
  createdAt: Date;
  read: boolean;
}

export type NutritionistLinkStatus = 'pending' | 'accepted' | 'rejected';

export interface NutritionistPatientLink {
  id: string;
  nutritionistId: string;
  nutritionistName: string;
  nutritionistEmail: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  status: NutritionistLinkStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface NutritionistChatMessage {
  id: string;
  linkId: string;
  nutritionistId: string;
  patientId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  text: string;
  readBy: string[];
  createdAt: Date;
}

export type FoodPlanMealPeriod = MealPeriod;

export interface FoodPlanMealItem {
  foodId?: string;
  name: string;
  emoji?: string;
  quantity: string;
  quantityValue?: number;
  unit?: QuantityUnit;
  notes?: string;
  nutrition?: FoodNutrition;
}

export interface FoodPlanMeal {
  period: FoodPlanMealPeriod;
  title: string;
  time?: string;
  instructions?: string;
  items: FoodPlanMealItem[];
  totalNutrition?: FoodNutrition;
}

export interface ShoppingListItem {
  name: string;
  quantity: string;
  unit?: string;
}

export interface FoodPlan {
  id: string;
  patientId: string;
  nutritionistId: string;
  nutritionistName: string;
  title: string;
  notes?: string;
  meals: FoodPlanMeal[];
  shoppingList: ShoppingListItem[];
  totalNutrition?: FoodNutrition;
  createdAt: Date;
  updatedAt: Date;
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
