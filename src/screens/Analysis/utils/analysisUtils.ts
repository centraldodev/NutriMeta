import { Colors } from '../../../constants/theme';
import { DailyLog, FoodNutrition, MacroGoals, MealPeriod } from '../../../types';
import { dateDaysAgoBrasilia, formatBrasiliaDate, sumNutrition } from '../../../utils/nutrition';
import {
  EMPTY_TOTAL,
  MEAL_PERIOD_LABELS,
  MEAL_PERIOD_ORDER,
  MealDistributionItem,
  NutritionGoalMode,
  WeekRange,
  WeeklyFoodSummary,
} from '../types';

export function averageNutrition(logs: DailyLog[]): FoodNutrition {
  if (logs.length === 0) return EMPTY_TOTAL;
  const total = sumNutrition(logs.map((log) => ({ nutrition: log.totalNutrition ?? EMPTY_TOTAL })));
  const average = { ...EMPTY_TOTAL } as FoodNutrition;
  (Object.entries(total) as [keyof FoodNutrition, number | undefined][]).forEach(([key, value]) => {
    if (typeof value !== 'number') return;
    average[key] = Math.round((value / logs.length) * 10) / 10 as never;
  });
  average.kcal = Math.round(average.kcal);
  average.sodium = Math.round(average.sodium ?? 0);
  return average;
}

export function mergeTodayLog(logs: DailyLog[], todayLog: DailyLog | null): DailyLog[] {
  if (!todayLog) return logs;
  const byDate = new Map(logs.map((log) => [log.date, log]));
  byDate.set(todayLog.date, todayLog);
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeLogLists(primary: DailyLog[], secondary: DailyLog[]): DailyLog[] {
  const byDate = new Map<string, DailyLog>();
  secondary.forEach((log) => byDate.set(log.date, log));
  primary.forEach((log) => byDate.set(log.date, log));
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function formatShortDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), {
    day: '2-digit',
    month: 'short',
  }).replace('.', '');
}

export function buildWeekRanges(): WeekRange[] {
  return Array.from({ length: 4 }, (_item, index) => {
    const endOffset = index * 7;
    const startOffset = endOffset + 6;
    const dates = Array.from({ length: 7 }, (_date, offset) => dateDaysAgoBrasilia(startOffset - offset));
    return {
      index,
      label: index === 0 ? 'Últimos 7 dias' : `${endOffset + 1}-${startOffset + 1} dias atrás`,
      rangeLabel: `${formatShortDate(dates[0])} - ${formatShortDate(dates[dates.length - 1])}`,
      dates,
    };
  });
}

export function averageNutritionForDates(dates: string[], byDate: Map<string, DailyLog>): FoodNutrition {
  if (dates.length === 0) return EMPTY_TOTAL;
  const total = sumNutrition(dates.map((date) => ({ nutrition: byDate.get(date)?.totalNutrition ?? EMPTY_TOTAL })));
  const average = { ...EMPTY_TOTAL } as FoodNutrition;
  (Object.entries(total) as [keyof FoodNutrition, number | undefined][]).forEach(([key, value]) => {
    if (typeof value !== 'number') return;
    average[key] = Math.round((value / dates.length) * 10) / 10 as never;
  });
  average.kcal = Math.round(average.kcal);
  average.sodium = Math.round(average.sodium ?? 0);
  return average;
}

export function averageWaterForDates(dates: string[], byDate: Map<string, DailyLog>): number {
  if (dates.length === 0) return 0;
  const total = dates.reduce((sum, date) => sum + (byDate.get(date)?.waterMl ?? 0), 0);
  return Math.round(total / dates.length);
}

export function totalNutritionForDates(dates: string[], byDate: Map<string, DailyLog>): FoodNutrition {
  return sumNutrition(dates.map((date) => ({ nutrition: byDate.get(date)?.totalNutrition ?? EMPTY_TOTAL })));
}

export function totalWaterForDates(dates: string[], byDate: Map<string, DailyLog>): number {
  return dates.reduce((sum, date) => sum + (byDate.get(date)?.waterMl ?? 0), 0);
}

export function formatNutritionValue(value: number, unit: string): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')}${unit}`;
}

export function formatDelta(value: number, unit = '') {
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(Math.abs(value) * 10) / 10;
  if (value > 0) return `+${rounded}${unit}`;
  if (value < 0) return `-${rounded}${unit}`;
  return `0${unit}`;
}

export function goalPct(current: number, goal: number) {
  if (!goal) return 0;
  return Math.round((current / goal) * 100);
}

export function daysMeetingTarget(dates: string[], byDate: Map<string, DailyLog>, key: keyof FoodNutrition, goal: number, mode: NutritionGoalMode) {
  if (!goal) return 0;
  return dates.reduce((count, date) => {
    const value = (byDate.get(date)?.totalNutrition?.[key] as number | undefined) ?? 0;
    if (mode === 'limit') return count + (value > goal ? 1 : 0);
    return count + (value >= goal * 0.9 ? 1 : 0);
  }, 0);
}

export function daysMeetingWaterTarget(dates: string[], byDate: Map<string, DailyLog>, goal: number) {
  if (!goal) return 0;
  return dates.reduce((count, date) => count + ((byDate.get(date)?.waterMl ?? 0) >= goal * 0.9 ? 1 : 0), 0);
}

export function buildTopFoods(logs: DailyLog[]): WeeklyFoodSummary[] {
  const map = new Map<string, WeeklyFoodSummary>();
  logs.forEach((log) => {
    log.entries.forEach((entry) => {
      if (entry.mealPeriod === 'hydration') return;
      const key = entry.foodName.trim().toLowerCase();
      const current = map.get(key) ?? {
        name: entry.foodName,
        emoji: entry.emoji,
        count: 0,
        kcal: 0,
        sodium: 0,
        sugar: 0,
      };
      current.count += 1;
      current.kcal += entry.nutrition.kcal ?? 0;
      current.sodium += entry.nutrition.sodium ?? 0;
      current.sugar += entry.nutrition.sugar ?? 0;
      map.set(key, current);
    });
  });
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      kcal: Math.round(item.kcal),
      sodium: Math.round(item.sodium),
      sugar: Math.round(item.sugar * 10) / 10,
    }))
    .sort((a, b) => b.kcal - a.kcal || b.count - a.count)
    .slice(0, 5);
}

export function buildMealDistribution(logs: DailyLog[]): MealDistributionItem[] {
  const totalKcal = logs.reduce((sum, log) => sum + (log.totalNutrition?.kcal ?? 0), 0);
  const map = new Map<MealPeriod, { kcal: number; count: number }>();
  logs.forEach((log) => {
    log.entries.forEach((entry) => {
      const period = entry.mealPeriod;
      const current = map.get(period) ?? { kcal: 0, count: 0 };
      current.kcal += entry.nutrition.kcal ?? 0;
      current.count += 1;
      map.set(period, current);
    });
  });
  return Array.from(map.entries())
    .map(([period, item]) => ({
      period,
      label: MEAL_PERIOD_LABELS[period],
      kcal: Math.round(item.kcal),
      count: item.count,
      pct: totalKcal > 0 ? Math.round((item.kcal / totalKcal) * 100) : 0,
    }))
    .sort((a, b) => (MEAL_PERIOD_ORDER.get(a.period) ?? 99) - (MEAL_PERIOD_ORDER.get(b.period) ?? 99));
}

export function buildWeeklyAlerts(dates: string[], byDate: Map<string, DailyLog>, goals: MacroGoals) {
  const proteinDays = daysMeetingTarget(dates, byDate, 'protein', goals.protein, 'target');
  const fiberLowDays = dates.length - daysMeetingTarget(dates, byDate, 'fiber', goals.fiber, 'target');
  const sodiumHighDays = daysMeetingTarget(dates, byDate, 'sodium', goals.sodium, 'limit');
  const sugarHighDays = daysMeetingTarget(dates, byDate, 'sugar', goals.sugar, 'limit');
  const waterDays = daysMeetingWaterTarget(dates, byDate, goals.water);

  return [
    { label: 'Proteína na meta', value: `${proteinDays}/${dates.length} dias`, tone: proteinDays >= 4 ? 'good' : 'warn' },
    { label: 'Fibra baixa', value: `${fiberLowDays}/${dates.length} dias`, tone: fiberLowDays >= 4 ? 'warn' : 'good' },
    { label: 'Sódio acima', value: `${sodiumHighDays}/${dates.length} dias`, tone: sodiumHighDays >= 3 ? 'warn' : 'good' },
    { label: 'Açúcar acima', value: `${sugarHighDays}/${dates.length} dias`, tone: sugarHighDays >= 3 ? 'warn' : 'good' },
    { label: 'Água na meta', value: `${waterDays}/${dates.length} dias`, tone: waterDays >= 4 ? 'good' : 'warn' },
  ];
}

export function getNutritionGoalStatus(current: number, goal: number, mode: NutritionGoalMode, overPct = 110) {
  const pct = goal > 0 ? Math.round((current / goal) * 100) : 0;

  if (mode === 'limit') {
    if (current > goal) return { pct, label: 'Passou', color: Colors.danger, bg: Colors.proteinL };
    if (current > 0) return { pct, label: 'Bom', color: Colors.green600, bg: Colors.green50 };
    return { pct, label: 'Sem consumo', color: Colors.gray400, bg: Colors.gray50 };
  }

  if (pct > overPct) return { pct, label: 'Passou', color: Colors.warning, bg: Colors.fatL };
  if (pct >= 90) return { pct, label: 'Bom', color: Colors.green600, bg: Colors.green50 };
  return { pct, label: 'Em progresso', color: Colors.info, bg: Colors.carbsL };
}
