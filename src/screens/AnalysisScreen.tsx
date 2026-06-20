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

import { Colors, MacroColors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { isFirebaseConfigured } from '../config';
import { generateNutritionInsights, NutritionInsight } from '../services/analysisAiService';
import { getRecentDailyLogs } from '../services/nutritionService';
import { getCachedRecentDailyLogs } from '../services/dailyLogStorage';
import { useStore, selectGoals } from '../store';
import { DailyLog, FoodNutrition, MacroGoals } from '../types';
import { calcGoalProgressPercent, dateDaysAgoBrasilia, formatBrasiliaDate, formatDate, macroPercent, sumNutrition } from '../utils/nutrition';
import { AI_LIMIT_MESSAGE, AI_LIMIT_TITLE, isAiLimitError } from '../utils/aiErrors';

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

function dateDaysAgo(daysAgo: number): string {
  return dateDaysAgoBrasilia(daysAgo);
}

function getLastNDates(days: number): string[] {
  return Array.from({ length: days }, (_, index) => dateDaysAgo(days - index - 1));
}

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

const MICRO_NUTRIENTS: { key: keyof FoodNutrition; label: string; unit: string }[] = [
  { key: 'calcium', label: 'Cálcio', unit: 'mg' },
  { key: 'iron', label: 'Ferro', unit: 'mg' },
  { key: 'potassium', label: 'Potássio', unit: 'mg' },
  { key: 'magnesium', label: 'Magnésio', unit: 'mg' },
  { key: 'zinc', label: 'Zinco', unit: 'mg' },
  { key: 'vitaminA', label: 'Vitamina A', unit: 'mcg' },
  { key: 'vitaminC', label: 'Vitamina C', unit: 'mg' },
  { key: 'vitaminD', label: 'Vitamina D', unit: 'mcg' },
  { key: 'vitaminE', label: 'Vitamina E', unit: 'mg' },
  { key: 'vitaminB12', label: 'Vitamina B12', unit: 'mcg' },
  { key: 'folate', label: 'Folato', unit: 'mcg' },
];

function shortWeekday(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return formatBrasiliaDate(new Date(Date.UTC(year, month - 1, day, 12)), { weekday: 'short' }).replace('.', '');
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

function MacroAverage({ label, current, goal, color, unit = 'g' }: {
  label: string;
  current: number;
  goal: number;
  color: string;
  unit?: string;
}) {
  const pct = macroPercent(current, goal);
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroTop}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={[styles.macroPct, { color }]}>{pct}%</Text>
      </View>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.macroHint}>{Math.round(current)}{unit} de {Math.round(goal)}{unit} em média</Text>
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
  const weekDates = useMemo(() => getLastNDates(7), []);
  const weekLogs = useMemo(() => weekDates.map((date) => byDate.get(date)).filter(Boolean) as DailyLog[], [byDate, weekDates]);
  const monthAverage = useMemo(() => averageNutrition(mergedLogs), [mergedLogs]);
  const weekAverage = useMemo(() => averageNutrition(weekLogs), [weekLogs]);
  const todayAnalysisLog = useMemo(() => byDate.get(formatDate(new Date())), [byDate]);
  const localInsight = useMemo(() => buildLocalInsight(todayAnalysisLog, safeGoals, weekAverage), [todayAnalysisLog, safeGoals, weekAverage]);

  const bestDay = useMemo(() => {
    return mergedLogs
      .map((log) => ({ log, pct: calcGoalProgressPercent(log.totalNutrition ?? EMPTY_TOTAL, log.goals ?? safeGoals) }))
      .sort((a, b) => b.pct - a.pct)[0];
  }, [mergedLogs, safeGoals]);

  const frequentFoods = useMemo(() => {
    const counts = new Map<string, { name: string; emoji: string; count: number }>();
    mergedLogs.forEach((log) => {
      log.entries.forEach((entry) => {
        const cleanName = entry.foodName.replace(/\s+\(.+\)$/, '');
        const current = counts.get(cleanName);
        counts.set(cleanName, {
          name: cleanName,
          emoji: entry.emoji,
          count: (current?.count ?? 0) + 1,
        });
      });
    });
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [mergedLogs]);

  const visibleMicros = useMemo(() => (
    MICRO_NUTRIENTS
      .map((nutrient) => ({
        ...nutrient,
        value: monthAverage[nutrient.key] as number | undefined,
      }))
      .filter((nutrient) => (nutrient.value ?? 0) > 0)
  ), [monthAverage]);

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
        Alert.alert(AI_LIMIT_TITLE, AI_LIMIT_MESSAGE);
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
            <Text style={styles.emptyText}>Registre refeições por alguns dias para comparar evolução, médias e alimentos mais consumidos.</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <StatCard label="Dias registrados" value={String(mergedLogs.length)} hint="até 31 dias" />
              <StatCard label="Média diária" value={`${monthAverage.kcal} kcal`} hint="no período salvo" />
              <StatCard label="Média semanal" value={`${weekAverage.kcal} kcal`} hint="últimos 7 dias" />
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
              <Text style={styles.sectionTitle}>Últimos 7 dias</Text>
              <View style={styles.weekChart}>
                {weekDates.map((date) => {
                  const log = byDate.get(date);
                  const kcal = log?.totalNutrition?.kcal ?? 0;
                  const pct = macroPercent(kcal, safeGoals.kcal);
                  return (
                    <View key={date} style={styles.dayBarItem}>
                      <View style={styles.dayBarTrack}>
                        <View style={[styles.dayBarFill, { height: `${Math.max(4, pct)}%` }]} />
                      </View>
                      <Text style={styles.dayBarLabel}>{shortWeekday(date)}</Text>
                      <Text style={styles.dayBarKcal}>{Math.round(kcal)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Média dos macros</Text>
              <MacroAverage label="Proteína" current={monthAverage.protein} goal={safeGoals.protein} color={MacroColors.protein.primary} />
              <MacroAverage label="Carboidratos" current={monthAverage.carbs} goal={safeGoals.carbs} color={MacroColors.carbs.primary} />
              <MacroAverage label="Gorduras" current={monthAverage.fat} goal={safeGoals.fat} color={MacroColors.fat.primary} />
              <MacroAverage label="Fibras" current={monthAverage.fiber} goal={safeGoals.fiber} color={MacroColors.fiber.primary} />
            </View>

            {visibleMicros.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Micronutrientes estimados</Text>
                <View style={styles.microGrid}>
                  {visibleMicros.map((nutrient) => (
                    <View key={nutrient.key} style={styles.microCard}>
                      <Text style={styles.microLabel}>{nutrient.label}</Text>
                      <Text style={styles.microValue}>
                        {Math.round((nutrient.value ?? 0) * 10) / 10}{nutrient.unit}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.microNote}>Média do período com base nos alimentos cadastrados e nas estimativas da IA.</Text>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mais consumidos</Text>
              {frequentFoods.length === 0 ? (
                <Text style={styles.emptyText}>Sem alimentos suficientes ainda.</Text>
              ) : (
                frequentFoods.map((food) => (
                  <View key={food.name} style={styles.foodRow}>
                    <Text style={styles.foodEmoji}>{food.emoji}</Text>
                    <Text style={styles.foodName}>{food.name}</Text>
                    <Text style={styles.foodCount}>{food.count}x</Text>
                  </View>
                ))
              )}
            </View>
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
  weekChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 170 },
  dayBarItem: { alignItems: 'center', flex: 1 },
  dayBarTrack: { width: 22, height: 110, borderRadius: 12, backgroundColor: Colors.gray50, justifyContent: 'flex-end', overflow: 'hidden' },
  dayBarFill: { width: '100%', borderRadius: 12, backgroundColor: Colors.green400 },
  dayBarLabel: { fontSize: Typography.xs, color: Colors.gray400, marginTop: Spacing.xs },
  dayBarKcal: { fontSize: 10, color: Colors.gray600, fontWeight: Typography.semibold, marginTop: 2 },
  macroRow: { marginBottom: Spacing.md },
  macroTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  macroLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold },
  macroPct: { fontSize: Typography.sm, fontWeight: Typography.bold },
  progressBg: { height: 8, backgroundColor: Colors.gray50, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  macroHint: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 4 },
  microGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  microCard: { width: Platform.OS === 'web' ? '23%' : '48%', backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing.sm },
  microLabel: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.semibold },
  microValue: { fontSize: Typography.md, color: Colors.gray800, fontWeight: Typography.bold, marginTop: 3 },
  microNote: { fontSize: Typography.xs, color: Colors.gray400, lineHeight: 18, marginTop: Spacing.sm },
  foodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  foodEmoji: { fontSize: 22, width: 34 },
  foodName: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold },
  foodCount: { fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.bold },
});
