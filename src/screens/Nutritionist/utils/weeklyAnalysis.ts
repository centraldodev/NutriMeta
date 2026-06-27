import { DailyLog, FoodNutrition, MacroGoals, MealEntry } from "../../../types";
import { dateDaysAgoBrasilia, sumNutrition } from "../../../utils/nutrition";
import {
  EMPTY_TOTAL,
  MEAL_PERIOD_OPTIONS,
  PERIOD_LABELS,
  MealDistributionItem,
  WeeklyFoodSummary,
  WeekRange,
} from "../types";
import { formatShortDate } from "./goalUtils";

export function pct(value: number, goal?: number) {
  if (!goal || goal <= 0) return 0;
  return Math.round((value / goal) * 100);
}

export function buildWeekRanges(): WeekRange[] {
  return Array.from({ length: 4 }, (_item, index) => {
    const endOffset = index * 7;
    const startOffset = endOffset + 6;
    const dates = Array.from({ length: 7 }, (_date, offset) =>
      dateDaysAgoBrasilia(startOffset - offset),
    );
    return {
      index,
      label:
        index === 0
          ? "Últimos 7 dias"
          : `${endOffset + 1}-${startOffset + 1} dias atrás`,
      rangeLabel: `${formatShortDate(dates[0])} - ${formatShortDate(dates[dates.length - 1])}`,
      dates,
    };
  });
}

export function averageNutritionForDates(
  dates: string[],
  byDate: Map<string, DailyLog>,
): FoodNutrition {
  if (dates.length === 0) return EMPTY_TOTAL;
  const total = sumNutrition(
    dates.map((date) => ({
      nutrition: byDate.get(date)?.totalNutrition ?? EMPTY_TOTAL,
    })),
  );
  const average = { ...EMPTY_TOTAL } as FoodNutrition;
  (
    Object.entries(total) as [keyof FoodNutrition, number | undefined][]
  ).forEach(([key, value]) => {
    if (typeof value !== "number") return;
    average[key] = (Math.round((value / dates.length) * 10) / 10) as never;
  });
  average.kcal = Math.round(average.kcal);
  average.sodium = Math.round(average.sodium ?? 0);
  return average;
}

export function averageWaterForDates(
  dates: string[],
  byDate: Map<string, DailyLog>,
): number {
  if (dates.length === 0) return 0;
  const total = dates.reduce(
    (sum, date) => sum + (byDate.get(date)?.waterMl ?? 0),
    0,
  );
  return Math.round(total / dates.length);
}

export function totalNutritionForDates(
  dates: string[],
  byDate: Map<string, DailyLog>,
): FoodNutrition {
  return sumNutrition(
    dates.map((date) => ({
      nutrition: byDate.get(date)?.totalNutrition ?? EMPTY_TOTAL,
    })),
  );
}

export function totalWaterForDates(
  dates: string[],
  byDate: Map<string, DailyLog>,
): number {
  return dates.reduce((sum, date) => sum + (byDate.get(date)?.waterMl ?? 0), 0);
}

export function goalPct(value: number, goal: number) {
  if (!goal) return 0;
  return Math.round((value / goal) * 100);
}

export function mealPeriodOrder(period: MealEntry["mealPeriod"]) {
  const index = MEAL_PERIOD_OPTIONS.findIndex((item) => item.key === period);
  return index >= 0 ? index : 99;
}

export function formatDelta(value: number, unit = "") {
  const rounded =
    Math.abs(value) >= 10
      ? Math.round(Math.abs(value))
      : Math.round(Math.abs(value) * 10) / 10;
  if (value > 0) return `+${rounded}${unit}`;
  if (value < 0) return `-${rounded}${unit}`;
  return `0${unit}`;
}

export function countTargetDays(
  dates: string[],
  byDate: Map<string, DailyLog>,
  key: keyof FoodNutrition,
  goal: number,
  mode: "target" | "limit",
) {
  if (!goal) return 0;
  return dates.reduce((count, date) => {
    const value =
      (byDate.get(date)?.totalNutrition?.[key] as number | undefined) ?? 0;
    const reached = mode === "limit" ? value > goal : value >= goal * 0.9;
    return count + (reached ? 1 : 0);
  }, 0);
}

export function countWaterTargetDays(
  dates: string[],
  byDate: Map<string, DailyLog>,
  goal: number,
) {
  if (!goal) return 0;
  return dates.reduce(
    (count, date) =>
      count + ((byDate.get(date)?.waterMl ?? 0) >= goal * 0.9 ? 1 : 0),
    0,
  );
}

export function buildWeeklyAlerts(
  dates: string[],
  byDate: Map<string, DailyLog>,
  goals: MacroGoals,
) {
  const proteinDays = countTargetDays(
    dates,
    byDate,
    "protein",
    goals.protein,
    "target",
  );
  const fiberLowDays =
    dates.length -
    countTargetDays(dates, byDate, "fiber", goals.fiber, "target");
  const sodiumHighDays = countTargetDays(
    dates,
    byDate,
    "sodium",
    goals.sodium,
    "limit",
  );
  const sugarHighDays = countTargetDays(
    dates,
    byDate,
    "sugar",
    goals.sugar,
    "limit",
  );
  const waterDays = countWaterTargetDays(dates, byDate, goals.water);
  return [
    {
      label: "Proteína na meta",
      value: `${proteinDays}/${dates.length} dias`,
      tone: proteinDays >= 4 ? "good" : "warn",
    },
    {
      label: "Fibra baixa",
      value: `${fiberLowDays}/${dates.length} dias`,
      tone: fiberLowDays >= 4 ? "warn" : "good",
    },
    {
      label: "Sódio acima",
      value: `${sodiumHighDays}/${dates.length} dias`,
      tone: sodiumHighDays >= 3 ? "warn" : "good",
    },
    {
      label: "Açúcar acima",
      value: `${sugarHighDays}/${dates.length} dias`,
      tone: sugarHighDays >= 3 ? "warn" : "good",
    },
    {
      label: "Água na meta",
      value: `${waterDays}/${dates.length} dias`,
      tone: waterDays >= 4 ? "good" : "warn",
    },
  ];
}

export function buildTopFoods(logs: DailyLog[]): WeeklyFoodSummary[] {
  const items = new Map<string, WeeklyFoodSummary>();
  logs.forEach((log) => {
    log.entries.forEach((entry) => {
      if (entry.mealPeriod === "hydration") return;
      const key = entry.foodName.trim().toLowerCase();
      const current = items.get(key) ?? {
        name: entry.foodName,
        emoji: entry.emoji,
        count: 0,
        kcal: 0,
        sodium: 0,
      };
      current.count += 1;
      current.kcal += entry.nutrition.kcal ?? 0;
      current.sodium += entry.nutrition.sodium ?? 0;
      items.set(key, current);
    });
  });
  return Array.from(items.values())
    .map((item) => ({
      ...item,
      kcal: Math.round(item.kcal),
      sodium: Math.round(item.sodium),
    }))
    .sort((a, b) => b.kcal - a.kcal || b.count - a.count)
    .slice(0, 5);
}

export function buildMealDistribution(logs: DailyLog[]): MealDistributionItem[] {
  const totalKcal = logs.reduce(
    (sum, log) => sum + (log.totalNutrition?.kcal ?? 0),
    0,
  );
  const items = new Map<
    MealEntry["mealPeriod"],
    { kcal: number; count: number }
  >();
  logs.forEach((log) => {
    log.entries.forEach((entry) => {
      const current = items.get(entry.mealPeriod) ?? { kcal: 0, count: 0 };
      current.kcal += entry.nutrition.kcal ?? 0;
      current.count += 1;
      items.set(entry.mealPeriod, current);
    });
  });
  return Array.from(items.entries())
    .map(([period, item]) => ({
      period,
      label: PERIOD_LABELS[period] ?? period,
      kcal: Math.round(item.kcal),
      count: item.count,
      pct: totalKcal > 0 ? Math.round((item.kcal / totalKcal) * 100) : 0,
    }))
    .sort((a, b) => mealPeriodOrder(a.period) - mealPeriodOrder(b.period));
}
