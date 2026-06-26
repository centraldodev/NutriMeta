import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { FoodIcon } from '../components/FoodIcon';
import { isFirebaseConfigured } from '../config';
import { getRecentDailyLogs } from '../services/nutritionService';
import { getCachedRecentDailyLogs } from '../services/dailyLogStorage';
import { useStore, selectGoals } from '../store';
import { DailyLog, FoodNutrition, MacroGoals, MealPeriod } from '../types';
import { dateDaysAgoBrasilia, formatBrasiliaDate, sumNutrition } from '../utils/nutrition';

const EMPTY_TOTAL: FoodNutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 };
const DEFAULT_GOALS: MacroGoals = {
  kcal: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  fiber: 25,
  water: 2500,
  sugar: 50,
  sodium: 2300,
  calcium: 1000,
  iron: 18,
  potassium: 2600,
  magnesium: 320,
  zinc: 8,
  vitaminA: 700,
  vitaminC: 75,
  vitaminD: 15,
  vitaminE: 15,
  vitaminB12: 2.4,
  folate: 400,
};

function averageNutrition(logs: DailyLog[]): FoodNutrition {
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

function mergeTodayLog(logs: DailyLog[], todayLog: DailyLog | null): DailyLog[] {
  if (!todayLog) return logs;
  const byDate = new Map(logs.map((log) => [log.date, log]));
  byDate.set(todayLog.date, todayLog);
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeLogLists(primary: DailyLog[], secondary: DailyLog[]): DailyLog[] {
  const byDate = new Map<string, DailyLog>();
  secondary.forEach((log) => byDate.set(log.date, log));
  primary.forEach((log) => byDate.set(log.date, log));
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

type NutritionGoalMode = 'target' | 'limit';

type NutritionGoalRow = {
  key: keyof FoodNutrition | 'waterMl';
  label: string;
  unit: string;
  goal: number;
  mode: NutritionGoalMode;
  section: 'Energia e macros' | 'Limites' | 'Vitaminas e minerais';
  overPct?: number;
};

type WeekRange = {
  index: number;
  label: string;
  rangeLabel: string;
  dates: string[];
};

type WeeklyFoodSummary = {
  name: string;
  emoji: string;
  count: number;
  kcal: number;
  sodium: number;
  sugar: number;
};

type MealDistributionItem = {
  period: MealPeriod;
  label: string;
  kcal: number;
  count: number;
  pct: number;
};

const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  dinner: 'Jantar',
  snack: 'Lanche',
  hydration: 'Hidratação',
};

const MEAL_PERIOD_ORDER = new Map<MealPeriod, number>([
  ['breakfast', 0],
  ['lunch', 1],
  ['snack', 2],
  ['dinner', 3],
  ['hydration', 4],
]);

function formatShortDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), {
    day: '2-digit',
    month: 'short',
  }).replace('.', '');
}

function buildWeekRanges(): WeekRange[] {
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

function averageNutritionForDates(dates: string[], byDate: Map<string, DailyLog>): FoodNutrition {
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

function averageWaterForDates(dates: string[], byDate: Map<string, DailyLog>): number {
  if (dates.length === 0) return 0;
  const total = dates.reduce((sum, date) => sum + (byDate.get(date)?.waterMl ?? 0), 0);
  return Math.round(total / dates.length);
}

function totalNutritionForDates(dates: string[], byDate: Map<string, DailyLog>): FoodNutrition {
  return sumNutrition(dates.map((date) => ({ nutrition: byDate.get(date)?.totalNutrition ?? EMPTY_TOTAL })));
}

function totalWaterForDates(dates: string[], byDate: Map<string, DailyLog>): number {
  return dates.reduce((sum, date) => sum + (byDate.get(date)?.waterMl ?? 0), 0);
}

function formatNutritionValue(value: number, unit: string): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')}${unit}`;
}

function formatDelta(value: number, unit = '') {
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(Math.abs(value) * 10) / 10;
  if (value > 0) return `+${rounded}${unit}`;
  if (value < 0) return `-${rounded}${unit}`;
  return `0${unit}`;
}

function goalPct(current: number, goal: number) {
  if (!goal) return 0;
  return Math.round((current / goal) * 100);
}

function daysMeetingTarget(dates: string[], byDate: Map<string, DailyLog>, key: keyof FoodNutrition, goal: number, mode: NutritionGoalMode) {
  if (!goal) return 0;
  return dates.reduce((count, date) => {
    const value = (byDate.get(date)?.totalNutrition?.[key] as number | undefined) ?? 0;
    if (mode === 'limit') return count + (value > goal ? 1 : 0);
    return count + (value >= goal * 0.9 ? 1 : 0);
  }, 0);
}

function daysMeetingWaterTarget(dates: string[], byDate: Map<string, DailyLog>, goal: number) {
  if (!goal) return 0;
  return dates.reduce((count, date) => count + ((byDate.get(date)?.waterMl ?? 0) >= goal * 0.9 ? 1 : 0), 0);
}

function buildTopFoods(logs: DailyLog[]): WeeklyFoodSummary[] {
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

function buildMealDistribution(logs: DailyLog[]): MealDistributionItem[] {
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

function buildWeeklyAlerts(dates: string[], byDate: Map<string, DailyLog>, goals: MacroGoals) {
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

function getNutritionGoalStatus(current: number, goal: number, mode: NutritionGoalMode, overPct = 110) {
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

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statHint}>{hint}</Text>
    </View>
  );
}

function NutritionGoalTable({
  rows,
  totals,
  waterMl,
  subtitle,
}: {
  rows: NutritionGoalRow[];
  totals: FoodNutrition;
  waterMl: number;
  subtitle: string;
}) {
  const sections = ['Energia e macros', 'Limites', 'Vitaminas e minerais'] as const;

  return (
    <View style={styles.nutritionPanel}>
      <View style={styles.nutritionHeader}>
        <View>
          <Text style={styles.nutritionTitle}>Média de nutrientes</Text>
          <Text style={styles.nutritionSubtitle}>{subtitle}</Text>
        </View>
      </View>

      {sections.map((section) => {
        const sectionRows = rows.filter((row) => row.section === section);
        return (
          <View key={section} style={styles.nutritionSection}>
            <Text style={styles.nutritionSectionTitle}>{section}</Text>
            {sectionRows.map((row) => {
              const current = row.key === 'waterMl' ? waterMl : ((totals[row.key] as number | undefined) ?? 0);
              const status = getNutritionGoalStatus(current, row.goal, row.mode, row.overPct);
              const barPct = Math.min(status.pct, 100);

              return (
                <View key={row.key} style={styles.nutritionRow}>
                  <View style={styles.nutritionRowTop}>
                    <Text style={styles.nutritionName}>{row.label}</Text>
                    <Text style={styles.nutritionValues}>
                      {formatNutritionValue(current, row.unit)}
                      <Text style={styles.nutritionGoalText}> / {formatNutritionValue(row.goal, row.unit)}</Text>
                    </Text>
                  </View>
                  <View style={styles.nutritionMetaRow}>
                    <View style={styles.nutritionBarBg}>
                      <View style={[styles.nutritionBarFill, { width: `${barPct}%`, backgroundColor: status.color }]} />
                    </View>
                    <Text style={[styles.nutritionStatus, { color: status.color, backgroundColor: status.bg }]}>{status.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

export function AnalysisScreen() {
  const user = useStore((s) => s.user);
  const todayLog = useStore((s) => s.todayLog);
  const goals = useStore(selectGoals);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);

  const safeGoals = { ...DEFAULT_GOALS, ...(goals ?? {}) };

  async function loadLogs() {
    if (!user) return;
    setLoading(true);
    try {
      const cached = await getCachedRecentDailyLogs(user.id, 31);
      if (cached.length > 0) setLogs(cached);

      if (isFirebaseConfigured && user.id !== 'dev_user') {
        const recent = await getRecentDailyLogs(user.id, 31);
        setLogs(mergeLogLists(recent, cached));
      } else {
        setLogs(mergeLogLists(todayLog ? [todayLog] : [], cached));
      }
    } catch (error) {
      console.warn('Failed to load analysis logs', error);
      const cached = await getCachedRecentDailyLogs(user.id, 31);
      setLogs(mergeLogLists(todayLog ? [todayLog] : [], cached));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, [user?.id, todayLog?.updatedAt]);

  const mergedLogs = useMemo(() => mergeTodayLog(logs, todayLog), [logs, todayLog]);
  const byDate = useMemo(() => new Map(mergedLogs.map((log) => [log.date, log])), [mergedLogs]);
  const periodDates = useMemo(() => Array.from({ length: 31 }, (_item, index) => dateDaysAgoBrasilia(index)).reverse(), []);
  const weekRanges = useMemo(buildWeekRanges, []);
  const selectedWeek = weekRanges[selectedWeekIndex] ?? weekRanges[0];
  const previousWeek = weekRanges[selectedWeekIndex + 1];
  const periodAverage = useMemo(() => averageNutritionForDates(periodDates, byDate), [byDate, periodDates]);
  const periodAverageWaterMl = useMemo(() => averageWaterForDates(periodDates, byDate), [byDate, periodDates]);
  const selectedWeekLogs = useMemo(() => selectedWeek.dates.map((date) => byDate.get(date)).filter(Boolean) as DailyLog[], [byDate, selectedWeek]);
  const selectedWeekAverage = useMemo(() => averageNutritionForDates(selectedWeek.dates, byDate), [byDate, selectedWeek]);
  const selectedWeekTotal = useMemo(() => totalNutritionForDates(selectedWeek.dates, byDate), [byDate, selectedWeek]);
  const selectedWeekWaterTotal = useMemo(() => totalWaterForDates(selectedWeek.dates, byDate), [byDate, selectedWeek]);
  const previousWeekAverage = useMemo(() => previousWeek ? averageNutritionForDates(previousWeek.dates, byDate) : EMPTY_TOTAL, [byDate, previousWeek]);
  const previousWeekWaterAverage = useMemo(() => previousWeek ? averageWaterForDates(previousWeek.dates, byDate) : 0, [byDate, previousWeek]);
  const selectedWeekWaterAverage = useMemo(() => averageWaterForDates(selectedWeek.dates, byDate), [byDate, selectedWeek]);
  const selectedWeekTopFoods = useMemo(() => buildTopFoods(selectedWeekLogs), [selectedWeekLogs]);
  const selectedWeekMealDistribution = useMemo(() => buildMealDistribution(selectedWeekLogs), [selectedWeekLogs]);
  const selectedWeekAlerts = useMemo(() => buildWeeklyAlerts(selectedWeek.dates, byDate, safeGoals), [byDate, safeGoals, selectedWeek]);
  const nutritionGoalRows = useMemo<NutritionGoalRow[]>(() => [
    { key: 'kcal', label: 'Calorias', unit: ' kcal', goal: safeGoals.kcal, mode: 'target', section: 'Energia e macros' },
    { key: 'protein', label: 'Proteína', unit: 'g', goal: safeGoals.protein, mode: 'target', section: 'Energia e macros', overPct: 130 },
    { key: 'carbs', label: 'Carboidratos', unit: 'g', goal: safeGoals.carbs, mode: 'target', section: 'Energia e macros', overPct: 120 },
    { key: 'fat', label: 'Gorduras', unit: 'g', goal: safeGoals.fat, mode: 'target', section: 'Energia e macros', overPct: 120 },
    { key: 'fiber', label: 'Fibras', unit: 'g', goal: safeGoals.fiber, mode: 'target', section: 'Energia e macros', overPct: 160 },
    { key: 'waterMl', label: 'Água', unit: 'ml', goal: safeGoals.water, mode: 'target', section: 'Energia e macros', overPct: 140 },
    { key: 'sugar', label: 'Açúcar', unit: 'g', goal: safeGoals.sugar, mode: 'limit', section: 'Limites' },
    { key: 'sodium', label: 'Sódio', unit: 'mg', goal: safeGoals.sodium, mode: 'limit', section: 'Limites' },
    { key: 'calcium', label: 'Cálcio', unit: 'mg', goal: 1300, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'iron', label: 'Ferro', unit: 'mg', goal: 18, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'potassium', label: 'Potássio', unit: 'mg', goal: 4700, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'magnesium', label: 'Magnésio', unit: 'mg', goal: 420, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'zinc', label: 'Zinco', unit: 'mg', goal: 11, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminA', label: 'Vitamina A', unit: 'mcg', goal: 900, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminC', label: 'Vitamina C', unit: 'mg', goal: 90, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminD', label: 'Vitamina D', unit: 'mcg', goal: 20, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminE', label: 'Vitamina E', unit: 'mg', goal: 15, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminB12', label: 'Vitamina B12', unit: 'mcg', goal: 2.4, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'folate', label: 'Folato', unit: 'mcg', goal: 400, mode: 'target', section: 'Vitaminas e minerais' },
  ], [safeGoals]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Análise</Text>
        <Text style={styles.headerSub}>Últimos 31 dias salvos</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadLogs} tintColor={Colors.green400} />}
      >
        {loading && logs.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.green400} />
            <Text style={styles.emptyText}>Carregando análise...</Text>
          </View>
        ) : mergedLogs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Ainda não há dados suficientes</Text>
            <Text style={styles.emptyText}>Registre refeições por alguns dias para comparar evolução e médias de nutrientes.</Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.weekAnalysisHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Análise semanal</Text>
                  <Text style={styles.weekAnalysisSub}>{selectedWeek.rangeLabel}</Text>
                </View>
                <View style={styles.weekRegisteredPill}>
                  <Text style={styles.weekRegisteredValue}>{selectedWeekLogs.length}/7</Text>
                  <Text style={styles.weekRegisteredLabel}>dias</Text>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekSelectorScroll}>
                <View style={styles.weekSelector}>
                  {weekRanges.map((week) => {
                    const active = week.index === selectedWeekIndex;
                    return (
                      <TouchableOpacity
                        key={week.index}
                        style={[styles.weekChip, active && styles.weekChipActive]}
                        onPress={() => setSelectedWeekIndex(week.index)}
                      >
                        <Text style={[styles.weekChipText, active && styles.weekChipTextActive]}>{week.label}</Text>
                        <Text style={[styles.weekChipRange, active && styles.weekChipRangeActive]}>{week.rangeLabel}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.weekSummaryGrid}>
                <StatCard label="Total da semana" value={`${Math.round(selectedWeekTotal.kcal)} kcal`} hint={`${selectedWeekLogs.length} dia(s) com registro`} />
                <StatCard label="Média diária" value={`${selectedWeekAverage.kcal} kcal`} hint="na semana selecionada" />
                <StatCard label="Água total" value={`${Math.round(selectedWeekWaterTotal)} ml`} hint={`${selectedWeekWaterAverage} ml/dia`} />
                <StatCard label="Vs semana anterior" value={previousWeek ? formatDelta(selectedWeekAverage.kcal - previousWeekAverage.kcal, ' kcal') : 'sem dados'} hint={previousWeek ? `água ${formatDelta(selectedWeekWaterAverage - previousWeekWaterAverage, ' ml')}` : 'compare outra semana'} />
              </View>

              <Text style={styles.weekBlockTitle}>Aderência às metas</Text>
              <View style={styles.adherenceGrid}>
                {[
                  { label: 'Calorias', value: goalPct(selectedWeekAverage.kcal, safeGoals.kcal), tone: 'neutral' },
                  { label: 'Proteína', value: goalPct(selectedWeekAverage.protein, safeGoals.protein), tone: 'neutral' },
                  { label: 'Fibra', value: goalPct(selectedWeekAverage.fiber, safeGoals.fiber), tone: 'neutral' },
                  { label: 'Água', value: goalPct(selectedWeekWaterAverage, safeGoals.water), tone: 'neutral' },
                  { label: 'Sódio', value: goalPct(selectedWeekAverage.sodium ?? 0, safeGoals.sodium), tone: (selectedWeekAverage.sodium ?? 0) > safeGoals.sodium ? 'warn' : 'good' },
                  { label: 'Açúcar', value: goalPct(selectedWeekAverage.sugar ?? 0, safeGoals.sugar), tone: (selectedWeekAverage.sugar ?? 0) > safeGoals.sugar ? 'warn' : 'good' },
                ].map((item) => (
                  <View key={item.label} style={styles.adherenceItem}>
                    <Text style={styles.adherenceLabel}>{item.label}</Text>
                    <Text style={[styles.adherenceValue, item.tone === 'warn' && styles.adherenceWarn, item.tone === 'good' && styles.adherenceGood]}>{item.value}%</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.weekBlockTitle}>Alertas objetivos</Text>
              <View style={styles.alertGrid}>
                {selectedWeekAlerts.map((alert) => (
                  <View key={alert.label} style={[styles.alertChip, alert.tone === 'warn' ? styles.alertChipWarn : styles.alertChipGood]}>
                    <Text style={[styles.alertValue, alert.tone === 'warn' ? styles.alertValueWarn : styles.alertValueGood]}>{alert.value}</Text>
                    <Text style={styles.alertLabel}>{alert.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.weekColumns}>
                <View style={styles.weekColumn}>
                  <Text style={styles.weekBlockTitle}>Distribuição por refeição</Text>
                  {selectedWeekMealDistribution.length === 0 ? (
                    <Text style={styles.emptyText}>Sem refeições nessa semana.</Text>
                  ) : (
                    selectedWeekMealDistribution.map((item) => (
                      <View key={item.period} style={styles.distributionRow}>
                        <View style={styles.distributionTop}>
                          <Text style={styles.distributionName}>{item.label}</Text>
                          <Text style={styles.distributionValue}>{item.pct}%</Text>
                        </View>
                        <View style={styles.distributionBarBg}>
                          <View style={[styles.distributionBarFill, { width: `${item.pct}%` }]} />
                        </View>
                        <Text style={styles.distributionMeta}>{item.kcal} kcal · {item.count} item(ns)</Text>
                      </View>
                    ))
                  )}
                </View>

                <View style={styles.weekColumn}>
                  <Text style={styles.weekBlockTitle}>Top alimentos</Text>
                  {selectedWeekTopFoods.length === 0 ? (
                    <Text style={styles.emptyText}>Sem alimentos nessa semana.</Text>
                  ) : (
                    selectedWeekTopFoods.map((item, index) => (
                      <View key={item.name} style={styles.topFoodRow}>
                        <Text style={styles.topFoodRank}>{index + 1}</Text>
                        <View style={styles.topFoodEmoji}>
                          <FoodIcon name={item.name} emoji={item.emoji} size={18} />
                        </View>
                        <View style={styles.topFoodInfo}>
                          <Text style={styles.topFoodName}>{item.name}</Text>
                          <Text style={styles.topFoodMeta}>{item.count}x · {item.kcal} kcal · {item.sodium}mg sódio</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>

            <NutritionGoalTable
              rows={nutritionGoalRows}
              totals={periodAverage}
              waterMl={periodAverageWaterMl}
              subtitle="Média diária dos últimos 31 dias"
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  headerBar: { width: '100%', maxWidth: Platform.OS === 'web' ? 900 : undefined, alignSelf: 'center', backgroundColor: Colors.white, padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.bold },
  headerSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  scroll: { width: '100%', maxWidth: Platform.OS === 'web' ? 900 : undefined, alignSelf: 'center', padding: Spacing.base, paddingBottom: 110 },
  loadingBox: { alignItems: 'center', padding: Spacing.xl, gap: Spacing.sm },
  emptyBox: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, marginBottom: Spacing.xs },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400, lineHeight: 20 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  statCard: {
    width: Platform.OS === 'web' ? '24%' : '48%',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  statLabel: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.semibold },
  statValue: { fontSize: Typography.xl, fontWeight: Typography.bold, marginTop: 4 },
  statHint: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3 },
  section: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, marginBottom: Spacing.md },
  weekAnalysisHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.sm },
  weekAnalysisSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: -Spacing.sm },
  weekRegisteredPill: { minWidth: 68, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.green50, paddingHorizontal: Spacing.sm, paddingVertical: 7 },
  weekRegisteredValue: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.green600 },
  weekRegisteredLabel: { fontSize: Typography.xs, color: Colors.gray400, marginTop: -2 },
  weekSelectorScroll: { marginBottom: Spacing.sm },
  weekSelector: { flexDirection: 'row', gap: Spacing.sm, paddingRight: Spacing.sm },
  weekChip: { minWidth: 132, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 8, backgroundColor: Colors.white },
  weekChipActive: { borderColor: Colors.green400, backgroundColor: Colors.green50 },
  weekChipText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray600 },
  weekChipTextActive: { color: Colors.green600 },
  weekChipRange: { fontSize: 10, color: Colors.gray400, marginTop: 2 },
  weekChipRangeActive: { color: Colors.green600 },
  weekSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  weekBlockTitle: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  adherenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  adherenceItem: { width: Platform.OS === 'web' ? '15.5%' : '31%', minHeight: 70, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.gray50, padding: Spacing.sm, justifyContent: 'center' },
  adherenceLabel: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.semibold },
  adherenceValue: { fontSize: Typography.lg, color: Colors.gray800, fontWeight: Typography.bold, marginTop: 4 },
  adherenceWarn: { color: Colors.warning },
  adherenceGood: { color: Colors.green600 },
  alertGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  alertChip: { minWidth: Platform.OS === 'web' ? 126 : '47%', flex: Platform.OS === 'web' ? 1 : undefined, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm },
  alertChipGood: { backgroundColor: Colors.green50, borderColor: Colors.green400 },
  alertChipWarn: { backgroundColor: Colors.fatL, borderColor: '#F6C36A' },
  alertValue: { fontSize: Typography.md, fontWeight: Typography.bold },
  alertValueGood: { color: Colors.green600 },
  alertValueWarn: { color: Colors.warning },
  alertLabel: { fontSize: Typography.xs, color: Colors.gray600, marginTop: 2, fontWeight: Typography.semibold },
  weekColumns: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: Spacing.md, marginTop: Spacing.sm },
  weekColumn: { flex: 1 },
  distributionRow: { borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: Spacing.sm },
  distributionTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  distributionName: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray800 },
  distributionValue: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.green600 },
  distributionBarBg: { height: 6, backgroundColor: Colors.gray50, borderRadius: Radius.full, overflow: 'hidden', marginTop: 6 },
  distributionBarFill: { height: 6, backgroundColor: Colors.green400, borderRadius: Radius.full },
  distributionMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 4 },
  topFoodRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: Spacing.sm },
  topFoodRank: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.green50, color: Colors.green600, textAlign: 'center', lineHeight: 22, fontSize: Typography.xs, fontWeight: Typography.bold },
  topFoodEmoji: { width: 34, alignItems: 'center' },
  topFoodInfo: { flex: 1 },
  topFoodName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray800 },
  topFoodMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  nutritionPanel: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  nutritionHeader: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  nutritionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  nutritionSubtitle: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  nutritionSection: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  nutritionSectionTitle: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 6,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.green600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    backgroundColor: Colors.green50,
  },
  nutritionRow: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  nutritionRowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  nutritionName: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gray800 },
  nutritionValues: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray800 },
  nutritionGoalText: { fontSize: Typography.xs, fontWeight: Typography.regular, color: Colors.gray400 },
  nutritionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 6 },
  nutritionBarBg: { flex: 1, height: 6, backgroundColor: Colors.gray50, borderRadius: Radius.full, overflow: 'hidden' },
  nutritionBarFill: { height: 6, borderRadius: Radius.full },
  nutritionStatus: {
    minWidth: 78,
    overflow: 'hidden',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    textAlign: 'center',
  },
});
