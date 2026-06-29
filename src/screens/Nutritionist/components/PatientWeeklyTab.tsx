import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { FoodNutrition, MacroGoals, DailyLog } from "../../../types";
import { FoodIcon } from "../../../components/FoodIcon";
import {
  WeekRange,
  WeeklyFoodSummary,
  MealDistributionItem,
  DAILY_NUTRIENT_ROWS,
  PATIENT_LOG_LOOKBACK_DAYS,
} from "../types";
import { goalPct, formatDelta } from "../utils/weeklyAnalysis";
import { dailyNutrientGoal } from "../utils/goalUtils";
import { InfoCard, ProgressRow } from "./ProgressRow";
import { styles } from "../styles";

type WeeklyAlert = { label: string; value: string; tone: string };

type Props = {
  selectedWeek: WeekRange;
  selectedWeekIndex: number;
  weekRanges: WeekRange[];
  selectedWeekLogs: DailyLog[];
  selectedWeekAverage: FoodNutrition;
  selectedWeekTotal: FoodNutrition;
  selectedWeekWaterTotal: number;
  selectedWeekWaterAverage: number;
  previousWeek: WeekRange | undefined;
  previousWeekAverage: FoodNutrition;
  previousWeekWaterAverage: number;
  periodAverage: FoodNutrition;
  periodAverageWaterMl: number;
  selectedWeekAlerts: WeeklyAlert[];
  selectedWeekTopFoods: WeeklyFoodSummary[];
  selectedWeekMealDistribution: MealDistributionItem[];
  patientGoals: MacroGoals;
  compactAdherenceLayout: boolean;
  onWeekSelect: (index: number) => void;
};

export function PatientWeeklyTab({
  selectedWeek,
  selectedWeekIndex,
  weekRanges,
  selectedWeekLogs,
  selectedWeekAverage,
  selectedWeekTotal,
  selectedWeekWaterTotal,
  selectedWeekWaterAverage,
  previousWeek,
  previousWeekAverage,
  previousWeekWaterAverage,
  periodAverage,
  periodAverageWaterMl,
  selectedWeekAlerts,
  selectedWeekTopFoods,
  selectedWeekMealDistribution,
  patientGoals,
  compactAdherenceLayout,
  onWeekSelect,
}: Props) {
  return (
    <>
      <View style={styles.panel}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitleNoMargin}>
              Análise semanal do paciente
            </Text>
            <Text style={styles.sectionSubtitle}>{selectedWeek.rangeLabel}</Text>
          </View>
          <View style={styles.weekRegisteredPill}>
            <Text style={styles.weekRegisteredValue}>
              {selectedWeekLogs.length}/7
            </Text>
            <Text style={styles.weekRegisteredLabel}>dias</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekSelector}
        >
          {weekRanges.map((week) => {
            const active = week.index === selectedWeekIndex;
            return (
              <TouchableOpacity
                key={week.index}
                style={[styles.weekChip, active && styles.weekChipActive]}
                onPress={() => onWeekSelect(week.index)}
              >
                <Text
                  style={[styles.weekChipText, active && styles.weekChipTextActive]}
                >
                  {week.label}
                </Text>
                <Text
                  style={[styles.weekChipRange, active && styles.weekChipRangeActive]}
                >
                  {week.rangeLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.summaryGrid}>
          <InfoCard
            label="Total da semana"
            value={`${Math.round(selectedWeekTotal.kcal)} kcal`}
          />
          <InfoCard
            label="Média diária"
            value={`${selectedWeekAverage.kcal} kcal`}
          />
          <InfoCard
            label="Água total"
            value={`${Math.round(selectedWeekWaterTotal)} ml`}
          />
          <InfoCard
            label="Vs semana anterior"
            value={
              previousWeek
                ? formatDelta(
                    selectedWeekAverage.kcal - previousWeekAverage.kcal,
                    " kcal",
                  )
                : "sem dados"
            }
          />
        </View>
        {previousWeek ? (
          <Text style={styles.weekCompareText}>
            Água média:{" "}
            {formatDelta(
              selectedWeekWaterAverage - previousWeekWaterAverage,
              " ml",
            )}{" "}
            vs semana anterior
          </Text>
        ) : null}

        <Text style={styles.analysisBlockTitle}>Aderência às metas</Text>
        <View style={styles.adherenceGrid}>
          {[
            {
              label: "Calorias",
              value: goalPct(selectedWeekAverage.kcal, patientGoals.kcal),
              tone: "neutral",
            },
            {
              label: "Proteína",
              value: goalPct(selectedWeekAverage.protein, patientGoals.protein),
              tone: "neutral",
            },
            {
              label: "Fibra",
              value: goalPct(selectedWeekAverage.fiber, patientGoals.fiber),
              tone: "neutral",
            },
            {
              label: "Água",
              value: goalPct(selectedWeekWaterAverage, patientGoals.water),
              tone: "neutral",
            },
            {
              label: "Sódio",
              value: goalPct(selectedWeekAverage.sodium ?? 0, patientGoals.sodium),
              tone:
                (selectedWeekAverage.sodium ?? 0) > patientGoals.sodium
                  ? "warn"
                  : "good",
            },
            {
              label: "Açúcar",
              value: goalPct(selectedWeekAverage.sugar ?? 0, patientGoals.sugar),
              tone:
                (selectedWeekAverage.sugar ?? 0) > patientGoals.sugar
                  ? "warn"
                  : "good",
            },
          ].map((item) => (
            <View
              key={item.label}
              style={[
                styles.adherenceItem,
                compactAdherenceLayout && styles.adherenceItemCompact,
              ]}
            >
              <View style={styles.adherenceTop}>
                <Text style={styles.adherenceLabel}>{item.label}</Text>
                <Text
                  style={[
                    styles.adherenceValue,
                    item.tone === "warn" && styles.adherenceWarn,
                    item.tone === "good" && styles.adherenceGood,
                  ]}
                >
                  {item.value}%
                </Text>
              </View>
              <View style={styles.adherenceBarBg}>
                <View
                  style={[
                    styles.adherenceBarFill,
                    item.tone === "warn" && styles.adherenceBarWarn,
                    item.tone === "good" && styles.adherenceBarGood,
                    { width: `${Math.min(item.value, 100)}%` },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.analysisBlockTitle}>Alertas objetivos</Text>
        <View style={styles.alertGrid}>
          {selectedWeekAlerts.map((alert) => (
            <View
              key={alert.label}
              style={[
                styles.alertChip,
                alert.tone === "warn" ? styles.alertChipWarn : styles.alertChipGood,
              ]}
            >
              <Text
                style={[
                  styles.alertValue,
                  alert.tone === "warn" ? styles.alertValueWarn : styles.alertValueGood,
                ]}
              >
                {alert.value}
              </Text>
              <Text style={styles.alertLabel}>{alert.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.analysisColumns}>
          <View style={styles.analysisColumn}>
            <Text style={styles.analysisBlockTitle}>
              Distribuição por refeição
            </Text>
            {selectedWeekMealDistribution.length === 0 ? (
              <Text style={styles.mutedText}>Sem refeições nessa semana.</Text>
            ) : (
              selectedWeekMealDistribution.map((item) => (
                <View key={item.period} style={styles.distributionRow}>
                  <View style={styles.distributionTop}>
                    <Text style={styles.distributionName}>{item.label}</Text>
                    <Text style={styles.distributionValue}>{item.pct}%</Text>
                  </View>
                  <View style={styles.distributionBarBg}>
                    <View
                      style={[
                        styles.distributionBarFill,
                        { width: `${item.pct}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.distributionMeta}>
                    {item.kcal} kcal · {item.count} item(ns)
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.analysisColumn}>
            <Text style={styles.analysisBlockTitle}>Top alimentos</Text>
            {selectedWeekTopFoods.length === 0 ? (
              <Text style={styles.mutedText}>Sem alimentos nessa semana.</Text>
            ) : (
              selectedWeekTopFoods.map((item, index) => (
                <View key={item.name} style={styles.topFoodRow}>
                  <Text style={styles.topFoodRank}>{index + 1}</Text>
                  <View style={styles.topFoodEmoji}>
                    <FoodIcon name={item.name} emoji={item.emoji} size={18} />
                  </View>
                  <View style={styles.topFoodInfo}>
                    <Text style={styles.topFoodName}>{item.name}</Text>
                    <Text style={styles.topFoodMeta}>
                      {item.count}x · {item.kcal} kcal · {item.sodium}mg sódio
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Média de nutrientes</Text>
        <Text style={styles.sectionSubtitle}>
          Média diária dos últimos {PATIENT_LOG_LOOKBACK_DAYS} dias
        </Text>
        {DAILY_NUTRIENT_ROWS.map((item) => {
          const value = periodAverage[item.key];
          if (typeof value !== "number") return null;
          return (
            <ProgressRow
              key={item.key}
              label={item.label}
              value={value}
              goal={dailyNutrientGoal(item.key, patientGoals)}
              unit={item.unit}
            />
          );
        })}
        <ProgressRow
          label="Água"
          value={periodAverageWaterMl}
          goal={patientGoals.water}
          unit="ml"
        />
      </View>
    </>
  );
}
