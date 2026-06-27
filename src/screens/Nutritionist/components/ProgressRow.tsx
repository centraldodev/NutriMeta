import React from "react";
import { View, Text } from "react-native";
import { UserProfile } from "../../../types";
import { Colors } from "../../../constants/theme";
import { styles } from "../styles";
import { pct } from "../utils/weeklyAnalysis";
import { formatPlanNutritionValue } from "../utils/goalUtils";

export function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function ProgressRow({
  label,
  value,
  goal,
  unit,
}: {
  label: string;
  value: number;
  goal?: number;
  unit: string;
}) {
  const hasGoal = typeof goal === "number" && goal > 0;
  const progress = hasGoal ? Math.min(100, pct(value, goal)) : value > 0 ? 100 : 0;
  const over = hasGoal && value > goal * 1.1;
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressTop}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={[styles.progressValue, over && styles.progressOver]}>
          {formatPlanNutritionValue(value)}
          {unit}
          {hasGoal ? ` / ${formatPlanNutritionValue(goal)}${unit}` : ""}
        </Text>
      </View>
      <View style={styles.progressBg}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progress}%`,
              backgroundColor: over ? Colors.danger : Colors.green400,
            },
          ]}
        />
      </View>
    </View>
  );
}

export function goalLabel(goal: UserProfile["goal"]) {
  return goal === "deficit"
    ? "Emagrecer"
    : goal === "muscle"
      ? "Ganhar massa"
      : goal === "bulk"
        ? "Ganho de peso"
        : "Manter peso";
}

export function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}`;
}
