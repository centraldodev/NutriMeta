import {
  UserProfile,
  MacroGoals,
  FoodNutrition,
  GoalType,
} from '../types';

export const BRASILIA_TIME_ZONE = 'America/Sao_Paulo';

// ─── TMB (Taxa Metabólica Basal) — Mifflin-St Jeor ───────────────────────────

export function calcTMB(profile: Pick<UserProfile, 'weight' | 'height' | 'age' | 'sex'>): number {
  const { weight, height, age, sex } = profile;
  // kg, cm, years
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === 'M' ? base + 5 : base - 161;
}

// ─── TDEE (Total Daily Energy Expenditure) ───────────────────────────────────

export function calcTDEE(tmb: number, activityLevel: number): number {
  return Math.round(tmb * activityLevel);
}

// ─── Caloric target based on goal ────────────────────────────────────────────

function getCalorieFloor(profile: UserProfile): number {
  return profile.sex === 'M' ? 1500 : 1200;
}

function calcKcalTarget(tdee: number, profile: UserProfile): number {
  if (profile.goal === 'deficit') {
    const deficit = clamp(tdee * 0.2, 300, 500);
    return Math.max(tdee - deficit, getCalorieFloor(profile));
  }

  if (profile.goal === 'muscle') {
    return tdee + clamp(tdee * 0.1, 150, 300);
  }

  if (profile.goal === 'bulk') {
    return tdee + clamp(tdee * 0.15, 250, 500);
  }

  return tdee;
}

// ─── Macro split recommendations ─────────────────────────────────────────────
// Targets stay inside DRI/AMDR ranges. Goal and activity only move the target
// within those public-health ranges; they do not create clinical prescriptions.

const AMDR_ADULT = {
  protein: { min: 0.10, max: 0.35 },
  carbs: { min: 0.45, max: 0.65 },
  fat: { min: 0.20, max: 0.35 },
} as const;

const AMDR_TEEN = {
  protein: { min: 0.10, max: 0.30 },
  carbs: { min: 0.45, max: 0.65 },
  fat: { min: 0.25, max: 0.35 },
} as const;

const GOAL_PROTEIN_PCT: Record<GoalType, { active: number; inactive: number }> = {
  deficit: { active: 0.25, inactive: 0.22 },
  maintain: { active: 0.18, inactive: 0.15 },
  muscle: { active: 0.25, inactive: 0.22 },
  bulk: { active: 0.20, inactive: 0.18 },
};

const GOAL_FAT_PCT: Record<GoalType, number> = {
  deficit:  0.25,
  maintain: 0.30,
  muscle:   0.25,
  bulk:     0.28,
};

const DRI_GOALS = {
  vitaminD: {
    adult: 15,
    olderAdult: 20,
  },
  vitaminE: 15,
  vitaminB12: 2.4,
  folate: 400,
  sodiumLimit: 2300,
} as const;

function calcMicronutrientGoals(profile: Pick<UserProfile, 'age' | 'sex'>): Pick<
  MacroGoals,
  | 'calcium'
  | 'iron'
  | 'potassium'
  | 'magnesium'
  | 'zinc'
  | 'vitaminA'
  | 'vitaminC'
  | 'vitaminD'
  | 'vitaminE'
  | 'vitaminB12'
  | 'folate'
> {
  const age = Math.max(0, profile.age);
  const male = profile.sex === 'M';

  const calcium =
    age <= 18 ? 1300 : age >= 71 || (!male && age >= 51) ? 1200 : 1000;
  const iron =
    age <= 18 ? (male ? 11 : 15) : !male && age <= 50 ? 18 : 8;
  const potassium = male ? (age <= 18 ? 3000 : 3400) : age <= 18 ? 2300 : 2600;
  const magnesium =
    age <= 18 ? (male ? 410 : 360) : age <= 30 ? (male ? 400 : 310) : male ? 420 : 320;
  const zinc = male ? 11 : age <= 18 ? 9 : 8;
  const vitaminA = male ? 900 : 700;
  const vitaminC = age <= 18 ? (male ? 75 : 65) : male ? 90 : 75;
  const vitaminD = age >= 71 ? DRI_GOALS.vitaminD.olderAdult : DRI_GOALS.vitaminD.adult;

  return {
    calcium,
    iron,
    potassium,
    magnesium,
    zinc,
    vitaminA,
    vitaminC,
    vitaminD,
    vitaminE: DRI_GOALS.vitaminE,
    vitaminB12: DRI_GOALS.vitaminB12,
    folate: DRI_GOALS.folate,
  };
}

function getAmdr(profile: Pick<UserProfile, 'age'>) {
  return profile.age <= 18 ? AMDR_TEEN : AMDR_ADULT;
}

function macroGramsFromPct(kcal: number, pct: number, kcalPerGram: number): number {
  return Math.round((kcal * pct) / kcalPerGram);
}

function calcMacroDistribution(profile: UserProfile, kcal: number) {
  const amdr = getAmdr(profile);
  const isActive = profile.activityLevel >= 1.55;
  const desiredProteinPct = GOAL_PROTEIN_PCT[profile.goal][isActive ? 'active' : 'inactive'];
  const minProteinPctFromRda = (profile.weight * 0.8 * 4) / kcal;
  let proteinPct = clamp(
    Math.max(desiredProteinPct, minProteinPctFromRda),
    amdr.protein.min,
    amdr.protein.max,
  );
  let fatPct = clamp(GOAL_FAT_PCT[profile.goal], amdr.fat.min, amdr.fat.max);
  let carbsPct = 1 - proteinPct - fatPct;

  if (carbsPct < amdr.carbs.min) {
    const deficit = amdr.carbs.min - carbsPct;
    const proteinRoom = Math.max(0, proteinPct - amdr.protein.min);
    const proteinReduction = Math.min(deficit, proteinRoom);
    proteinPct -= proteinReduction;
    const remaining = deficit - proteinReduction;
    if (remaining > 0) fatPct = Math.max(amdr.fat.min, fatPct - remaining);
    carbsPct = 1 - proteinPct - fatPct;
  }

  if (carbsPct > amdr.carbs.max) {
    const excess = carbsPct - amdr.carbs.max;
    fatPct = Math.min(amdr.fat.max, fatPct + excess);
    carbsPct = 1 - proteinPct - fatPct;
  }

  return {
    protein: macroGramsFromPct(kcal, proteinPct, 4),
    carbs: Math.max(macroGramsFromPct(kcal, carbsPct, 4), 130),
    fat: macroGramsFromPct(kcal, fatPct, 9),
  };
}

// ─── Main calculator ─────────────────────────────────────────────────────────

export function calcMacroGoals(profile: UserProfile): MacroGoals {
  const tmb  = calcTMB(profile);
  const tdee = calcTDEE(tmb, profile.activityLevel);
  const kcal = roundToNearest(calcKcalTarget(tdee, profile), 10);

  const macros = calcMacroDistribution(profile, kcal);

  const fiber  = Math.max(profile.sex === 'M' ? 30 : 25, Math.round((kcal / 1000) * 14));
  const water  = profile.sex === 'M' ? 3700 : 2700;
  const sugar  = Math.floor((kcal * 0.1) / 4);
  const sodium = DRI_GOALS.sodiumLimit;
  const micronutrients = calcMicronutrientGoals(profile);

  return {
    kcal,
    protein: macros.protein,
    carbs:   macros.carbs,
    fat:     macros.fat,
    fiber,
    water,
    sugar,
    sodium,
    ...micronutrients,
  };
}

// ─── Sum daily nutrition ──────────────────────────────────────────────────────

export function sumNutrition(entries: { nutrition: FoodNutrition }[]): FoodNutrition {
  return entries.reduce((acc, e) => {
    (Object.entries(e.nutrition) as [keyof FoodNutrition, number | undefined][]).forEach(([key, value]) => {
      if (typeof value !== 'number') return;
      acc[key] = round1(((acc[key] as number | undefined) ?? 0) + value) as never;
    });
    acc.kcal = Math.round(acc.kcal);
    acc.sodium = Math.round(acc.sodium ?? 0);
    return acc;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 } as FoodNutrition);
}

// ─── Progress percentage ──────────────────────────────────────────────────────

export function macroPercent(current: number, goal: number): number {
  if (goal === 0) return 0;
  return Math.min(Math.round((current / goal) * 100), 100);
}

// ─── Completed goals ─────────────────────────────────────────────────────────

export function getCompletedGoals(
  total: FoodNutrition,
  goals: MacroGoals
): (keyof MacroGoals)[] {
  const completed: (keyof MacroGoals)[] = [];
  if (total.kcal   >= goals.kcal    * 0.95) completed.push('kcal');
  if (total.protein >= goals.protein * 0.95) completed.push('protein');
  if (total.carbs   >= goals.carbs   * 0.95) completed.push('carbs');
  if (total.fat     >= goals.fat     * 0.90) completed.push('fat');
  if (total.fiber   >= goals.fiber   * 0.95) completed.push('fiber');
  return completed;
}

export function calcGoalProgressPercent(
  total: FoodNutrition,
  goals: MacroGoals
): number {
  const targetPercents = [
    macroPercent(total.kcal, goals.kcal),
    macroPercent(total.protein, goals.protein),
    macroPercent(total.carbs, goals.carbs),
    macroPercent(total.fat, goals.fat),
    macroPercent(total.fiber, goals.fiber),
  ];

  return Math.round(
    targetPercents.reduce((sum, pct) => sum + pct, 0) / targetPercents.length
  );
}

// ─── Ranking points ──────────────────────────────────────────────────────────

export function calcRankingPoints(
  total: FoodNutrition,
  goals: MacroGoals,
  completedGoals: (keyof MacroGoals)[]
): number {
  let pts = 0;

  // Points for each macro % achieved (up to 100%)
  pts += Math.min(macroPercent(total.protein, goals.protein), 100);
  pts += Math.min(macroPercent(total.carbs,   goals.carbs),   100) * 0.5;
  pts += Math.min(macroPercent(total.fiber,   goals.fiber),   100) * 0.8;

  // Bonus for completing goals
  pts += completedGoals.length * 50;

  // Bonus for hitting kcal target (not under OR over by >10%)
  const kcalPct = total.kcal / goals.kcal;
  if (kcalPct >= 0.85 && kcalPct <= 1.1) pts += 30;

  return Math.round(pts);
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function formatDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRASILIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function getBrasiliaHour(date = new Date()): number {
  const hour = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRASILIA_TIME_ZONE,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  return Number(hour);
}

export function formatBrasiliaDate(
  date: Date,
  options: Intl.DateTimeFormatOptions
): string {
  return date.toLocaleDateString('pt-BR', { ...options, timeZone: BRASILIA_TIME_ZONE });
}

export function formatBrasiliaTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
): string {
  return date.toLocaleTimeString('pt-BR', { ...options, timeZone: BRASILIA_TIME_ZONE });
}

export function addDaysToDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return formatDate(date);
}

export function dateDaysAgoBrasilia(daysAgo: number): string {
  return addDaysToDateString(formatDate(new Date()), -daysAgo);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

export function formatKcal(kcal: number): string {
  return kcal >= 1000
    ? (kcal / 1000).toFixed(1).replace('.', ',') + 'k'
    : String(Math.round(kcal));
}

export function formatGrams(g: number): string {
  return `${Math.round(g)}g`;
}

const NUTRIENT_DISPLAY: {
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
  { key: 'vitaminA', label: 'Vit. A', unit: 'mcg' },
  { key: 'vitaminC', label: 'Vit. C', unit: 'mg' },
  { key: 'vitaminD', label: 'Vit. D', unit: 'mcg' },
  { key: 'vitaminE', label: 'Vit. E', unit: 'mg' },
  { key: 'vitaminB12', label: 'Vit. B12', unit: 'mcg' },
  { key: 'folate', label: 'Folato', unit: 'mcg' },
];

function formatNutrientValue(value: number): string {
  return value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10).replace('.', ',');
}

export function formatNutritionDetails(
  nutrition: FoodNutrition,
  options: { includeKcal?: boolean } = {}
): string {
  return NUTRIENT_DISPLAY
    .filter((item) => options.includeKcal || item.key !== 'kcal')
    .map((item) => {
      const value = nutrition[item.key];
      if (typeof value !== 'number' || value <= 1) return null;
      return `${item.label}: ${formatNutrientValue(value)}${item.unit}`;
    })
    .filter((item): item is string => Boolean(item))
    .join(' · ');
}
