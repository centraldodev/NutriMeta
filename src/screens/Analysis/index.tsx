import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing } from '../../constants/theme';
import { FoodIcon } from '../../components/FoodIcon';
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton';
import { isFirebaseConfigured } from '../../config';
import { getRecentDailyLogs } from '../../services/nutritionService';
import { getCachedRecentDailyLogs } from '../../services/dailyLogStorage';
import { useStore, selectGoals } from '../../store';
import { DailyLog } from '../../types';
import { dateDaysAgoBrasilia } from '../../utils/nutrition';
import { DEFAULT_GOALS, NutritionGoalRow } from './types';
import {
  averageNutritionForDates,
  averageWaterForDates,
  buildMealDistribution,
  buildTopFoods,
  buildWeeklyAlerts,
  buildWeekRanges,
  formatDelta,
  goalPct,
  mergeLogLists,
  mergeTodayLog,
  totalNutritionForDates,
  totalWaterForDates,
} from './utils/analysisUtils';
import { StatCard } from './components/StatCard';
import { NutritionGoalTable } from './components/NutritionGoalTable';
import { styles } from './styles';

function AnalysisSkeleton({
  statCardStyle,
}: {
  statCardStyle: ViewStyle;
}) {
  return (
    <>
      <View style={styles.section}>
        <View style={styles.weekAnalysisHeader}>
          <View style={{ flex: 1 }}>
            <SkeletonLine width={140} height={16} />
            <SkeletonLine width={92} height={10} style={{ marginTop: 8 }} />
          </View>
          <SkeletonBlock height={48} style={{ width: 68 }} />
        </View>
        <View style={styles.weekSummaryGrid}>
          {[0, 1, 2, 3].map((item) => (
            <View key={item} style={[styles.statCard, statCardStyle]}>
              <SkeletonLine width="58%" height={10} />
              <SkeletonLine width="78%" height={18} style={{ marginTop: 10 }} />
              <SkeletonLine width="64%" height={10} style={{ marginTop: 8 }} />
            </View>
          ))}
        </View>
        <SkeletonLine width={130} height={10} style={{ marginTop: Spacing.sm, marginBottom: Spacing.sm }} />
        <View style={styles.adherenceGrid}>
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <SkeletonBlock key={item} height={68} style={{ width: '31%' }} />
          ))}
        </View>
        <SkeletonLine width={120} height={10} style={{ marginTop: Spacing.md, marginBottom: Spacing.sm }} />
        <SkeletonBlock height={92} />
      </View>
      <View style={styles.nutritionPanel}>
        <View style={styles.nutritionHeader}>
          <SkeletonLine width={160} height={16} />
          <SkeletonLine width={116} height={10} style={{ marginTop: 8 }} />
        </View>
        {[0, 1, 2, 3, 4].map((item) => (
          <View key={item} style={styles.nutritionRow}>
            <SkeletonLine width="44%" height={12} />
            <SkeletonLine width="100%" height={6} style={{ marginTop: 10 }} />
          </View>
        ))}
      </View>
    </>
  );
}

export function AnalysisScreen() {
  const user = useStore((s) => s.user);
  const todayLog = useStore((s) => s.todayLog);
  const goals = useStore(selectGoals);
  const { width } = useWindowDimensions();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);

  const safeGoals = { ...DEFAULT_GOALS, ...(goals ?? {}) };
  const compact = width < 720;
  const veryCompact = width < 420;
  const statCardStyle: ViewStyle = {
    width: compact ? (veryCompact ? '100%' : '48%') : '23.8%',
  };
  const adherenceItemStyle: ViewStyle = {
    width: compact ? (veryCompact ? '48%' : '31%') : '15.5%',
  };
  const alertChipStyle: ViewStyle = {
    width: compact ? (veryCompact ? '100%' : '48%') : undefined,
    flex: compact ? undefined : 1,
  };

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
  const previousWeekAverage = useMemo(() => previousWeek ? averageNutritionForDates(previousWeek.dates, byDate) : { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 }, [byDate, previousWeek]);
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
          <AnalysisSkeleton statCardStyle={statCardStyle} />
        ) : mergedLogs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Ainda não há dados suficientes</Text>
            <Text style={styles.emptyText}>Registre refeições por alguns dias para comparar evolução e médias de nutrientes.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.section, compact && styles.sectionCompact]}>
              <View style={[styles.weekAnalysisHeader, veryCompact && styles.weekAnalysisHeaderCompact]}>
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
                        style={[styles.weekChip, compact && styles.weekChipCompact, active && styles.weekChipActive]}
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
                <StatCard style={statCardStyle} label="Total da semana" value={`${Math.round(selectedWeekTotal.kcal)} kcal`} hint={`${selectedWeekLogs.length} dia(s) com registro`} />
                <StatCard style={statCardStyle} label="Média diária" value={`${selectedWeekAverage.kcal} kcal`} hint="na semana selecionada" />
                <StatCard style={statCardStyle} label="Água total" value={`${Math.round(selectedWeekWaterTotal)} ml`} hint={`${selectedWeekWaterAverage} ml/dia`} />
                <StatCard style={statCardStyle} label="Vs semana anterior" value={previousWeek ? formatDelta(selectedWeekAverage.kcal - previousWeekAverage.kcal, ' kcal') : 'sem dados'} hint={previousWeek ? `água ${formatDelta(selectedWeekWaterAverage - previousWeekWaterAverage, ' ml')}` : 'compare outra semana'} />
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
                  <View key={item.label} style={[styles.adherenceItem, adherenceItemStyle]}>
                    <Text style={styles.adherenceLabel}>{item.label}</Text>
                    <Text style={[styles.adherenceValue, item.tone === 'warn' && styles.adherenceWarn, item.tone === 'good' && styles.adherenceGood]}>{item.value}%</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.weekBlockTitle}>Alertas objetivos</Text>
              <View style={styles.alertGrid}>
                {selectedWeekAlerts.map((alert) => (
                  <View key={alert.label} style={[styles.alertChip, alertChipStyle, alert.tone === 'warn' ? styles.alertChipWarn : styles.alertChipGood]}>
                    <Text style={[styles.alertValue, alert.tone === 'warn' ? styles.alertValueWarn : styles.alertValueGood]}>{alert.value}</Text>
                    <Text style={styles.alertLabel}>{alert.label}</Text>
                  </View>
                ))}
              </View>

              <View style={[styles.weekColumns, compact && styles.weekColumnsCompact]}>
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

export default AnalysisScreen;
