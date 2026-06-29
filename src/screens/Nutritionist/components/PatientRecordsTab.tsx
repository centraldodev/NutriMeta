import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/theme";
import { DailyLog, MealEntry } from "../../../types";
import { formatNutritionDetails, formatBrasiliaTime } from "../../../utils/nutrition";
import { FoodIcon } from "../../../components/FoodIcon";
import { DAILY_NUTRIENT_ROWS, PATIENT_LOG_LOOKBACK_DAYS, PERIOD_LABELS } from "../types";
import { dailyNutrientGoal } from "../utils/goalUtils";
import { formatDateLabel, ProgressRow } from "./ProgressRow";
import { styles } from "../styles";

type Props = {
  logs: DailyLog[];
  loadingLogs: boolean;
  selectedDate: string;
  patientDates: string[];
  logsByDate: Map<string, DailyLog>;
  selectedLog: DailyLog | null;
  entriesByPeriod: [MealEntry["mealPeriod"], MealEntry[]][];
  nutrientsExpanded: boolean;
  patientDateScrollRef: React.RefObject<ScrollView | null>;
  onDateSelect: (date: string) => void;
  onToggleNutrients: () => void;
};

export function PatientRecordsTab({
  logs,
  loadingLogs,
  selectedDate,
  patientDates,
  logsByDate,
  selectedLog,
  entriesByPeriod,
  nutrientsExpanded,
  patientDateScrollRef,
  onDateSelect,
  onToggleNutrients,
}: Props) {
  return (
    <>
      <View style={styles.panel}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitleNoMargin}>Registros do paciente</Text>
            <Text style={styles.sectionSubtitle}>
              Últimos {PATIENT_LOG_LOOKBACK_DAYS} dias
              {logs.length > 0 ? ` · ${logs.length} dia(s) com registro` : ""}
            </Text>
          </View>
        </View>
        {loadingLogs ? (
          <ActivityIndicator color={Colors.green400} />
        ) : (
          <>
            {logs.length === 0 ? (
              <Text style={styles.mutedText}>
                Este paciente ainda não possui registros.
              </Text>
            ) : null}
            <ScrollView
              ref={patientDateScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateRow}
              onContentSizeChange={() =>
                patientDateScrollRef.current?.scrollToEnd({ animated: false })
              }
            >
              {patientDates.map((date) => {
                const active = date === selectedDate;
                const hasLog = logsByDate.has(date);
                return (
                  <TouchableOpacity
                    key={date}
                    style={[styles.dateChip, active && styles.dateChipActive]}
                    onPress={() => onDateSelect(date)}
                  >
                    <Text
                      style={[
                        styles.dateChipText,
                        active && styles.dateChipTextActive,
                      ]}
                    >
                      {formatDateLabel(date)}
                    </Text>
                    <View
                      style={[
                        styles.dateDot,
                        hasLog && styles.dateDotFilled,
                        active && styles.dateDotActive,
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
      </View>

      {selectedLog ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Metas do dia</Text>
            <ProgressRow
              label="Calorias"
              value={Math.round(selectedLog.totalNutrition.kcal)}
              goal={selectedLog.goals.kcal}
              unit="kcal"
            />
            <ProgressRow
              label="Proteína"
              value={Math.round(selectedLog.totalNutrition.protein)}
              goal={selectedLog.goals.protein}
              unit="g"
            />
            <ProgressRow
              label="Carboidratos"
              value={Math.round(selectedLog.totalNutrition.carbs)}
              goal={selectedLog.goals.carbs}
              unit="g"
            />
            <ProgressRow
              label="Gorduras"
              value={Math.round(selectedLog.totalNutrition.fat)}
              goal={selectedLog.goals.fat}
              unit="g"
            />
            <ProgressRow
              label="Fibras"
              value={Math.round(selectedLog.totalNutrition.fiber)}
              goal={selectedLog.goals.fiber}
              unit="g"
            />
            <ProgressRow
              label="Água"
              value={selectedLog.waterMl ?? 0}
              goal={selectedLog.goals.water}
              unit="ml"
            />

            {nutrientsExpanded ? (
              <View style={styles.expandedNutrients}>
                <Text style={styles.expandedNutrientsTitle}>
                  Nutrientes completos
                </Text>
                {DAILY_NUTRIENT_ROWS.filter(
                  (item) =>
                    !["kcal", "protein", "carbs", "fat", "fiber"].includes(
                      item.key,
                    ),
                ).map((item) => {
                  const value = selectedLog.totalNutrition[item.key] ?? 0;
                  return (
                    <ProgressRow
                      key={item.key}
                      label={item.label}
                      value={Math.round(value)}
                      goal={dailyNutrientGoal(item.key, selectedLog.goals)}
                      unit={item.unit}
                    />
                  );
                })}
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.expandNutrientsBtn}
              onPress={onToggleNutrients}
            >
              <Text style={styles.expandNutrientsText}>
                {nutrientsExpanded
                  ? "Ocultar nutrientes completos"
                  : "Ver nutrientes completos"}
              </Text>
              <MaterialIcons
                name={nutrientsExpanded ? "expand-less" : "expand-more"}
                size={22}
                color={Colors.green600}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Refeições e horários</Text>
            {entriesByPeriod.length === 0 ? (
              <Text style={styles.mutedText}>
                Nenhuma refeição registrada neste dia.
              </Text>
            ) : (
              entriesByPeriod.map(([period, entries]) => (
                <View key={period} style={styles.periodBlock}>
                  <Text style={styles.periodTitle}>
                    {PERIOD_LABELS[period] ?? period}
                  </Text>
                  {entries.map((entry) => (
                    <View key={entry.id} style={styles.entryRow}>
                      <View style={styles.entryEmoji}>
                        <FoodIcon
                          name={entry.foodName}
                          emoji={entry.emoji}
                          size={18}
                        />
                      </View>
                      <View style={styles.entryBody}>
                        <Text style={styles.entryName}>{entry.foodName}</Text>
                        <Text style={styles.entryMeta}>
                          {formatBrasiliaTime(new Date(entry.addedAt))}
                          {" · "}
                          {formatNutritionDetails(entry.nutrition, {
                            includeKcal: true,
                          })}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        </>
      ) : (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Refeições e horários</Text>
          <Text style={styles.mutedText}>
            Nenhuma refeição registrada em {formatDateLabel(selectedDate)}.
          </Text>
        </View>
      )}
    </>
  );
}
