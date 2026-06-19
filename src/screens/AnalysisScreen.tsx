import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, MacroColors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { isFirebaseConfigured } from '../config';
import { getRecentDailyLogs } from '../services/nutritionService';
import { useStore, selectGoals } from '../store';
import { DailyLog, FoodNutrition, MacroGoals } from '../types';
import { calcGoalProgressPercent, formatDate, macroPercent, sumNutrition } from '../utils/nutrition';

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
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return formatDate(date);
}

function getLastNDates(days: number): string[] {
  return Array.from({ length: days }, (_, index) => dateDaysAgo(days - index - 1));
}

function averageNutrition(logs: DailyLog[]): FoodNutrition {
  if (logs.length === 0) return EMPTY_TOTAL;
  const total = sumNutrition(logs.map((log) => ({ nutrition: log.totalNutrition ?? EMPTY_TOTAL })));
  return {
    kcal: Math.round(total.kcal / logs.length),
    protein: Math.round((total.protein / logs.length) * 10) / 10,
    carbs: Math.round((total.carbs / logs.length) * 10) / 10,
    fat: Math.round((total.fat / logs.length) * 10) / 10,
    fiber: Math.round((total.fiber / logs.length) * 10) / 10,
    sodium: Math.round(((total.sodium ?? 0) / logs.length)),
    sugar: Math.round(((total.sugar ?? 0) / logs.length) * 10) / 10,
  };
}

function shortWeekday(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
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

export function AnalysisScreen() {
  const user = useStore((s) => s.user);
  const todayLog = useStore((s) => s.todayLog);
  const goals = useStore(selectGoals);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(false);

  const safeGoals = { ...DEFAULT_GOALS, ...(goals ?? {}) };

  async function loadLogs() {
    if (!user) return;
    setLoading(true);
    try {
      if (isFirebaseConfigured && user.id !== 'dev_user') {
        const recent = await getRecentDailyLogs(user.id, 31);
        setLogs(recent);
      } else {
        setLogs(todayLog ? [todayLog] : []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, [user?.id, todayLog?.updatedAt]);

  const byDate = useMemo(() => new Map(logs.map((log) => [log.date, log])), [logs]);
  const weekDates = useMemo(() => getLastNDates(7), []);
  const weekLogs = useMemo(() => weekDates.map((date) => byDate.get(date)).filter(Boolean) as DailyLog[], [byDate, weekDates]);
  const monthAverage = useMemo(() => averageNutrition(logs), [logs]);
  const weekAverage = useMemo(() => averageNutrition(weekLogs), [weekLogs]);

  const bestDay = useMemo(() => {
    return logs
      .map((log) => ({ log, pct: calcGoalProgressPercent(log.totalNutrition ?? EMPTY_TOTAL, log.goals ?? safeGoals) }))
      .sort((a, b) => b.pct - a.pct)[0];
  }, [logs, safeGoals]);

  const frequentFoods = useMemo(() => {
    const counts = new Map<string, { name: string; emoji: string; count: number }>();
    logs.forEach((log) => {
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
  }, [logs]);

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
        ) : logs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Ainda não há dados suficientes</Text>
            <Text style={styles.emptyText}>Registre refeições por alguns dias para comparar evolução, médias e alimentos mais consumidos.</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <StatCard label="Dias registrados" value={String(logs.length)} hint="até 31 dias" />
              <StatCard label="Média diária" value={`${monthAverage.kcal} kcal`} hint="no período salvo" />
              <StatCard label="Média semanal" value={`${weekAverage.kcal} kcal`} hint="últimos 7 dias" />
              <StatCard label="Melhor dia" value={bestDay ? `${bestDay.pct}%` : '0%'} hint={bestDay?.log.date ?? 'sem registro'} />
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
  foodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  foodEmoji: { fontSize: 22, width: 34 },
  foodName: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold },
  foodCount: { fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.bold },
});
