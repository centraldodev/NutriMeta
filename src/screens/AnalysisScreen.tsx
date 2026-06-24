import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { isFirebaseConfigured } from '../config';
import { generateNutritionInsights, NutritionInsight } from '../services/analysisAiService';
import { getRecentDailyLogs } from '../services/nutritionService';
import { getCachedRecentDailyLogs } from '../services/dailyLogStorage';
import { useStore, selectGoals } from '../store';
import { DailyLog, FoodNutrition, MacroGoals, MealEntry, MealPeriod } from '../types';
import { calcGoalProgressPercent, formatBrasiliaDate, formatDate, formatNutritionDetails, macroPercent, sumNutrition } from '../utils/nutrition';
import { isAiLimitError, showAiLimitAlert } from '../utils/aiErrors';

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

type MonthWeek = {
  index: number;
  label: string;
  rangeLabel: string;
  dates: string[];
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

function shortWeekday(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), { weekday: 'short' }).replace('.', '');
}

function formatSelectedDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function monthDayCount(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
}

function makeDateString(year: number, month: number, day: number): string {
  return formatDate(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatShortDayMonth(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), {
    day: '2-digit',
    month: 'short',
  }).replace('.', '');
}

function getMonthWeeks(referenceDate: string): MonthWeek[] {
  const [year, month, day] = referenceDate.split('-').map(Number);
  const daysInMonth = monthDayCount(year, month);
  const weekCount = Math.ceil(daysInMonth / 7);

  return Array.from({ length: weekCount }, (_, index) => {
    const startDay = index * 7 + 1;
    const endDay = Math.min(startDay + 6, daysInMonth);
    const dates = Array.from({ length: endDay - startDay + 1 }, (_item, offset) =>
      makeDateString(year, month, startDay + offset)
    );
    return {
      index,
      label: `Semana ${index + 1}`,
      rangeLabel: `${formatShortDayMonth(dates[0])} - ${formatShortDayMonth(dates[dates.length - 1])}`,
      dates,
    };
  });
}

function getMonthWeekIndex(referenceDate: string): number {
  const day = Number(referenceDate.split('-')[2] ?? 1);
  return Math.max(0, Math.ceil(day / 7) - 1);
}

function sortMealEntries(entries: MealEntry[]) {
  return [...entries].sort((a, b) => {
    const periodDiff = (MEAL_PERIOD_ORDER.get(a.mealPeriod) ?? 99) - (MEAL_PERIOD_ORDER.get(b.mealPeriod) ?? 99);
    if (periodDiff !== 0) return periodDiff;
    return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
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

function groupMealEntriesByPeriod(entries: MealEntry[]) {
  const groups = new Map<MealPeriod, MealEntry[]>();
  sortMealEntries(entries).forEach((entry) => {
    groups.set(entry.mealPeriod, [...(groups.get(entry.mealPeriod) ?? []), entry]);
  });
  return Array.from(groups.entries()).sort(([periodA], [periodB]) =>
    (MEAL_PERIOD_ORDER.get(periodA) ?? 99) - (MEAL_PERIOD_ORDER.get(periodB) ?? 99)
  );
}

function formatNutritionValue(value: number, unit: string): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')}${unit}`;
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

function buildLocalInsight(todayLog: DailyLog | undefined, goals: MacroGoals, weekAverage: FoodNutrition): NutritionInsight {
  if (!todayLog) {
    return {
      summary: 'Registre uma refeição para receber uma leitura do dia.',
      tips: ['Depois do primeiro registro, a análise compara seu dia com suas metas e com a média recente.'],
    };
  }

  const total = todayLog.totalNutrition ?? EMPTY_TOTAL;
  const tips: string[] = [];
  const waterMl = todayLog.waterMl ?? 0;
  const waterEntries = todayLog.entries.filter((entry) => (entry.waterMl ?? 0) > 0);
  if (waterMl < goals.water * 0.5) tips.push('Água ainda está baixa para sua meta; tente distribuir copos ao longo do dia em vez de deixar tudo para o fim.');
  if (waterEntries.length <= 1 && waterMl > 0) tips.push('Você registrou água em poucos horários; a regularidade ajuda a manter hidratação mais estável.');
  if (total.protein < goals.protein * 0.5) tips.push('Proteína ainda está baixa para a meta; uma fonte magra na próxima refeição pode ajudar.');
  if (total.fiber < goals.fiber * 0.5) tips.push('Fibras ainda estão baixas; legumes, frutas, feijões ou grãos integrais melhoram o equilíbrio do dia.');
  if ((total.sodium ?? 0) > goals.sodium) tips.push('Sódio passou do limite; priorize alimentos frescos e menos ultraprocessados no restante do dia.');
  if ((total.sugar ?? 0) > goals.sugar) tips.push('Açúcar passou da referência; vale equilibrar as próximas escolhas com alimentos menos doces.');
  if (total.kcal > goals.kcal * 1.1) tips.push('Calorias já passaram da meta; refeições mais leves e ricas em vegetais podem fechar melhor o dia.');
  if (weekAverage.kcal > 0 && total.kcal < weekAverage.kcal * 0.7) tips.push('Hoje está abaixo da sua média recente; acompanhe se isso combina com fome, treino e rotina.');
  if (tips.length === 0) tips.push('Seu dia está caminhando bem; mantenha variedade de alimentos para cobrir micronutrientes.');

  return {
    summary: `Hoje você registrou ${Math.round(total.kcal)} kcal em ${todayLog.entries.length} alimento(s).`,
    tips: tips.slice(0, 3),
  };
}

export function AnalysisScreen() {
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const todayLog = useStore((s) => s.todayLog);
  const goals = useStore(selectGoals);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<NutritionInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const todayDate = useMemo(() => formatDate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(() => getMonthWeekIndex(todayDate));

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
  const monthWeeks = useMemo(() => getMonthWeeks(todayDate), [todayDate]);
  const selectedWeek = monthWeeks[selectedWeekIndex] ?? monthWeeks[monthWeeks.length - 1];
  const weekDates = selectedWeek?.dates ?? [];
  const weekLogs = useMemo(() => weekDates.map((date) => byDate.get(date)).filter(Boolean) as DailyLog[], [byDate, weekDates]);
  const selectedLog = useMemo(() => byDate.get(selectedDate), [byDate, selectedDate]);
  const selectedEntryGroups = useMemo(() => groupMealEntriesByPeriod(selectedLog?.entries ?? []), [selectedLog]);
  const monthAverage = useMemo(() => averageNutrition(mergedLogs), [mergedLogs]);
  const weekAverage = useMemo(() => averageNutritionForDates(weekDates, byDate), [byDate, weekDates]);
  const weekAverageWaterMl = useMemo(() => averageWaterForDates(weekDates, byDate), [byDate, weekDates]);
  const todayAnalysisLog = useMemo(() => byDate.get(formatDate(new Date())), [byDate]);
  const localInsight = useMemo(() => buildLocalInsight(todayAnalysisLog, safeGoals, weekAverage), [todayAnalysisLog, safeGoals, weekAverage]);
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

  const bestDay = useMemo(() => {
    return mergedLogs
      .map((log) => ({ log, pct: calcGoalProgressPercent(log.totalNutrition ?? EMPTY_TOTAL, log.goals ?? safeGoals) }))
      .sort((a, b) => b.pct - a.pct)[0];
  }, [mergedLogs, safeGoals]);

  function selectWeek(week: MonthWeek) {
    setSelectedWeekIndex(week.index);
    if (week.dates.includes(selectedDate)) return;
    const preferredDate = week.dates.includes(todayDate)
      ? todayDate
      : week.dates.find((date) => byDate.has(date)) ?? week.dates[0];
    setSelectedDate(preferredDate);
  }

  async function handleGenerateInsight() {
    if (!user || mergedLogs.length === 0) return;
    if (!isFirebaseConfigured || user.id === 'dev_user') {
      setInsight(localInsight);
      return;
    }
    setInsightLoading(true);
    try {
      const generated = await generateNutritionInsights({ logs: mergedLogs, goals: safeGoals, profile });
      setInsight(generated.tips.length > 0 ? generated : localInsight);
    } catch (error) {
      console.warn('Nutrition insight generation failed', error);
      if (isAiLimitError(error)) {
        showAiLimitAlert();
      }
      setInsight(localInsight);
    } finally {
      setInsightLoading(false);
    }
  }

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
            <Text style={styles.emptyText}>Registre refeições por alguns dias para comparar evolução, semanas do mês e médias de nutrientes.</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <StatCard label="Dias registrados" value={String(mergedLogs.length)} hint="até 31 dias" />
              <StatCard label="Média diária" value={`${monthAverage.kcal} kcal`} hint="no período salvo" />
              <StatCard label="Média semanal" value={`${weekAverage.kcal} kcal`} hint={selectedWeek?.label ?? 'semana'} />
              <StatCard label="Melhor dia" value={bestDay ? `${bestDay.pct}%` : '0%'} hint={bestDay?.log.date ?? 'sem registro'} />
            </View>

            <View style={styles.section}>
              <View style={styles.insightHeader}>
                <View style={styles.insightTitleWrap}>
                  <Text style={styles.sectionTitle}>Dica inteligente</Text>
                  <Text style={styles.insightSub}>Compara hoje, metas e histórico recente.</Text>
                </View>
                <TouchableOpacity style={styles.insightBtn} onPress={handleGenerateInsight} disabled={insightLoading}>
                  {insightLoading ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.insightBtnText}>Gerar IA</Text>}
                </TouchableOpacity>
              </View>
              <Text style={styles.insightSummary}>{(insight ?? localInsight).summary}</Text>
              {(insight ?? localInsight).tips.map((tip) => (
                <Text key={tip} style={styles.insightTip}>- {tip}</Text>
              ))}
            </View>

            <View style={styles.section}>
              <View style={styles.weekHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Semanas do mês</Text>
                  <Text style={styles.weekSub}>{selectedWeek?.rangeLabel}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekSelectorScroll}>
                <View style={styles.weekSelector}>
                  {monthWeeks.map((week) => {
                    const active = week.index === selectedWeekIndex;
                    return (
                      <TouchableOpacity
                        key={week.index}
                        style={[styles.weekChip, active && styles.weekChipActive]}
                        onPress={() => selectWeek(week)}
                      >
                        <Text style={[styles.weekChipText, active && styles.weekChipTextActive]}>{week.label}</Text>
                        <Text style={[styles.weekChipRange, active && styles.weekChipRangeActive]}>{week.rangeLabel}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              <View style={styles.weekChart}>
                {weekDates.map((date) => {
                  const log = byDate.get(date);
                  const kcal = log?.totalNutrition?.kcal ?? 0;
                  const pct = macroPercent(kcal, safeGoals.kcal);
                  return (
                    <TouchableOpacity
                      key={date}
                      style={[styles.dayBarItem, selectedDate === date && styles.dayBarItemActive]}
                      onPress={() => setSelectedDate(date)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.dayBarTrack}>
                        <View style={[styles.dayBarFill, selectedDate === date && styles.dayBarFillActive, { height: `${Math.max(4, pct)}%` }]} />
                      </View>
                      <Text style={styles.dayBarLabel}>{shortWeekday(date)}</Text>
                      <Text style={styles.dayBarKcal}>{Math.round(kcal)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.selectedDayHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Refeições do dia</Text>
                  <Text style={styles.selectedDayDate}>{formatSelectedDate(selectedDate)}</Text>
                </View>
                <View style={styles.selectedDayTotal}>
                  <Text style={styles.selectedDayKcal}>{Math.round(selectedLog?.totalNutrition?.kcal ?? 0)}</Text>
                  <Text style={styles.selectedDayKcalLabel}>kcal</Text>
                </View>
              </View>
              {selectedLog ? (
                <>
                  <Text style={styles.selectedDaySummary}>
                    {formatNutritionDetails(selectedLog.totalNutrition ?? EMPTY_TOTAL, { includeKcal: true }) || 'Sem nutrientes registrados.'}
                  </Text>
                  {selectedEntryGroups.length === 0 ? (
                    <Text style={styles.emptyText}>Nenhuma refeição registrada nessa data.</Text>
                  ) : (
                    selectedEntryGroups.map(([period, entries]) => (
                      <View key={period} style={styles.mealGroup}>
                        <View style={styles.mealGroupHeader}>
                          <Text style={styles.mealGroupTitle}>{MEAL_PERIOD_LABELS[period]}</Text>
                          <Text style={styles.mealGroupCount}>{entries.length} item(ns)</Text>
                        </View>
                        {entries.map((entry) => (
                          <View key={entry.id} style={styles.mealRow}>
                            <Text style={styles.mealEmoji}>{entry.emoji}</Text>
                            <View style={styles.mealInfo}>
                              <Text style={styles.mealName}>{entry.foodName}</Text>
                              <Text style={styles.mealMeta}>{entry.quantity} {entry.unit}</Text>
                              <Text style={styles.mealNutrition}>
                                {formatNutritionDetails(entry.nutrition, { includeKcal: true }) || 'Sem nutrientes.'}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))
                  )}
                </>
              ) : (
                <Text style={styles.emptyText}>Nenhuma refeição registrada nessa data.</Text>
              )}
            </View>

            <NutritionGoalTable
              rows={nutritionGoalRows}
              totals={weekAverage}
              waterMl={weekAverageWaterMl}
              subtitle={`Média diária de ${selectedWeek?.label.toLowerCase() ?? 'semana'} (${selectedWeek?.rangeLabel ?? ''})`}
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
  insightHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.sm },
  insightTitleWrap: { flex: 1 },
  insightSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: -Spacing.sm },
  insightBtn: { minWidth: 86, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.green600, paddingHorizontal: Spacing.md },
  insightBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.bold },
  insightSummary: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.semibold, lineHeight: 20, marginBottom: Spacing.xs },
  insightTip: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20, marginTop: 3 },
  weekHeader: { marginBottom: Spacing.xs },
  weekSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: -Spacing.sm },
  weekSelectorScroll: { marginBottom: Spacing.sm },
  weekSelector: { flexDirection: 'row', gap: Spacing.sm, paddingRight: Spacing.sm },
  weekChip: { minWidth: 104, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 8, backgroundColor: Colors.white },
  weekChipActive: { borderColor: Colors.green400, backgroundColor: Colors.green50 },
  weekChipText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray600 },
  weekChipTextActive: { color: Colors.green600 },
  weekChipRange: { fontSize: 10, color: Colors.gray400, marginTop: 2 },
  weekChipRangeActive: { color: Colors.green600 },
  weekChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 170 },
  dayBarItem: { alignItems: 'center', flex: 1, borderRadius: Radius.md, paddingVertical: 6 },
  dayBarItemActive: { backgroundColor: Colors.green50 },
  dayBarTrack: { width: 22, height: 110, borderRadius: 12, backgroundColor: Colors.gray50, justifyContent: 'flex-end', overflow: 'hidden' },
  dayBarFill: { width: '100%', borderRadius: 12, backgroundColor: Colors.green400 },
  dayBarFillActive: { backgroundColor: Colors.green600 },
  dayBarLabel: { fontSize: Typography.xs, color: Colors.gray400, marginTop: Spacing.xs },
  dayBarKcal: { fontSize: 10, color: Colors.gray600, fontWeight: Typography.semibold, marginTop: 2 },
  selectedDayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  selectedDayDate: { fontSize: Typography.xs, color: Colors.gray400, marginTop: -Spacing.sm, textTransform: 'capitalize' },
  selectedDayTotal: { minWidth: 72, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.green50, paddingVertical: 8, paddingHorizontal: Spacing.sm },
  selectedDayKcal: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.green600 },
  selectedDayKcalLabel: { fontSize: Typography.xs, color: Colors.gray400, marginTop: -2 },
  selectedDaySummary: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20, marginBottom: Spacing.sm },
  mealGroup: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm, marginTop: Spacing.sm },
  mealGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  mealGroupTitle: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  mealGroupCount: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.semibold },
  mealRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm },
  mealEmoji: { width: 34, fontSize: 22, textAlign: 'center' },
  mealInfo: { flex: 1 },
  mealName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray800 },
  mealMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  mealNutrition: { fontSize: Typography.xs, color: Colors.gray600, marginTop: 3, lineHeight: 17 },
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
