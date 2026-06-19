import {
  UserProfile,
  MacroGoals,
  FoodNutrition,
  GoalType,
  ActivityLevel,
} from '../types';

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
    const deficit = clamp(tdee * 0.2, 300, 750);
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

const GOAL_FAT_PCT: Record<GoalType, number> = {
  deficit:  0.25,
  maintain: 0.30,
  muscle:   0.25,
  bulk:     0.28,
};

function getProteinPerKg(goal: GoalType, activityLevel: ActivityLevel): number {
  const isActive = activityLevel >= 1.55;

  if (goal === 'deficit') return isActive ? 2.0 : 1.8;
  if (goal === 'muscle') return isActive ? 2.0 : 1.8;
  if (goal === 'bulk') return isActive ? 1.8 : 1.6;

  return isActive ? 1.6 : 1.2;
}

// ─── Main calculator ─────────────────────────────────────────────────────────

export function calcMacroGoals(profile: UserProfile): MacroGoals {
  const tmb  = calcTMB(profile);
  const tdee = calcTDEE(tmb, profile.activityLevel);
  const kcal = roundToNearest(calcKcalTarget(tdee, profile), 10);

  // Practical targets derived from DRI/AMDR ranges and sports nutrition ranges.
  const protein = Math.round(profile.weight * getProteinPerKg(profile.goal, profile.activityLevel));
  let fat       = Math.round((kcal * GOAL_FAT_PCT[profile.goal]) / 9);
  let carbs     = Math.round((kcal - protein * 4 - fat * 9) / 4);

  if (carbs < 130) {
    carbs = 130;
    fat = Math.round((kcal - protein * 4 - carbs * 4) / 9);
  }

  const fiber  = Math.max(profile.sex === 'M' ? 30 : 25, Math.round((kcal / 1000) * 14));
  const water  = Math.round(clamp(profile.weight * 35, profile.sex === 'M' ? 2500 : 2000, profile.sex === 'M' ? 3700 : 2700));
  const sugar  = Math.floor((kcal * 0.1) / 4);
  const sodium = 2300;

  return {
    kcal,
    protein: Math.max(protein, Math.round(profile.weight * 0.8), 50),
    carbs:   Math.max(carbs, 130),
    fat:     Math.max(fat, 20),
    fiber,
    water,
    sugar,
    sodium,
  };
}

// ─── Sum daily nutrition ──────────────────────────────────────────────────────

export function sumNutrition(entries: { nutrition: FoodNutrition }[]): FoodNutrition {
  return entries.reduce(
    (acc, e) => ({
      kcal:    acc.kcal    + e.nutrition.kcal,
      protein: round1(acc.protein + e.nutrition.protein),
      carbs:   round1(acc.carbs   + e.nutrition.carbs),
      fat:     round1(acc.fat     + e.nutrition.fat),
      fiber:   round1(acc.fiber   + e.nutrition.fiber),
      sodium:  (acc.sodium  ?? 0) + (e.nutrition.sodium  ?? 0),
      sugar:   round1((acc.sugar ?? 0) + (e.nutrition.sugar ?? 0)),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 }
  );
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
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
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
