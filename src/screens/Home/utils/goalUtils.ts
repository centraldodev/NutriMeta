import { Colors } from '../../../constants/theme';
import { MacroGoals } from '../../../types';
import { parseProfileNumber } from '../../../utils/profileValidation';
import { DEFAULT_GOALS, EDITABLE_GOAL_ROWS, EditableGoalKey, NutritionGoalMode } from '../types';

export function formatNutritionValue(value: number, unit: string): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')}${unit}`;
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

export function parseNumber(value: string, fallback: number) {
  return parseProfileNumber(value, fallback);
}

export function formatGoalInputs(goals: MacroGoals): Record<EditableGoalKey, string> {
  return EDITABLE_GOAL_ROWS.reduce(
    (inputs, item) => ({
      ...inputs,
      [item.key]: typeof goals[item.key] === 'number' ? String(goals[item.key]) : '',
    }),
    {} as Record<EditableGoalKey, string>,
  );
}

export function buildGoalsFromInputs(
  inputs: Record<EditableGoalKey, string>,
  fallback: MacroGoals = DEFAULT_GOALS,
): MacroGoals {
  const goals = { ...fallback } as MacroGoals;
  EDITABLE_GOAL_ROWS.forEach(({ key }) => {
    const fallbackValue = fallback[key] ?? DEFAULT_GOALS[key] ?? 0;
    const value = parseNumber(inputs[key], typeof fallbackValue === 'number' ? fallbackValue : 0);
    goals[key] = Math.round(value) as never;
  });
  return goals;
}
