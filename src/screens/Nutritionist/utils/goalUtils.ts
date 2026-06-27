import { FoodNutrition, MacroGoals } from "../../../types";
import { parseProfileNumber } from "../../../utils/profileValidation";
import { formatBrasiliaDate } from "../../../utils/nutrition";
import {
  DEFAULT_GOALS,
  EDITABLE_GOAL_ROWS,
  EditableGoalKey,
} from "../types";

export function parseNumber(value: string, fallback: number) {
  return parseProfileNumber(value, fallback);
}

export function formatShortDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  return formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), {
    day: "2-digit",
    month: "short",
  }).replace(".", "");
}

export function buildGoalsFromInputs(
  inputs: Record<EditableGoalKey, string>,
  fallback: MacroGoals = DEFAULT_GOALS,
): MacroGoals {
  const goals: MacroGoals = {
    ...fallback,
    kcal: Math.round(parseNumber(inputs.kcal, fallback.kcal)),
    protein: Math.round(parseNumber(inputs.protein, fallback.protein)),
    carbs: Math.round(parseNumber(inputs.carbs, fallback.carbs)),
    fat: Math.round(parseNumber(inputs.fat, fallback.fat)),
    fiber: Math.round(parseNumber(inputs.fiber, fallback.fiber)),
    water: Math.round(parseNumber(inputs.water, fallback.water)),
    sugar: Math.round(parseNumber(inputs.sugar, fallback.sugar)),
    sodium: Math.round(parseNumber(inputs.sodium, fallback.sodium)),
  };

  EDITABLE_GOAL_ROWS.forEach(({ key }) => {
    if (key in DEFAULT_GOALS) return;
    const fallbackValue = fallback[key];
    const value = parseNumber(
      inputs[key],
      typeof fallbackValue === "number" ? fallbackValue : 0,
    );
    goals[key] = Math.round(value) as never;
  });

  return goals;
}

export function formatGoalInputs(goals: MacroGoals): Record<EditableGoalKey, string> {
  return EDITABLE_GOAL_ROWS.reduce(
    (inputs, item) => ({
      ...inputs,
      [item.key]:
        typeof goals[item.key] === "number" ? String(goals[item.key]) : "",
    }),
    {} as Record<EditableGoalKey, string>,
  );
}

export function maskTimeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function isValidMealTime(value: string) {
  if (!value.trim()) return true;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function dailyNutrientGoal(
  key: keyof FoodNutrition,
  goals: MacroGoals,
): number | undefined {
  const goal = goals[key as EditableGoalKey];
  return typeof goal === "number" && goal > 0 ? goal : undefined;
}

export function formatPlanNutritionValue(value: number) {
  return value >= 10
    ? String(Math.round(value))
    : String(Math.round(value * 10) / 10).replace(".", ",");
}
