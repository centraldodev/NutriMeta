import React from 'react';
import { Text, View } from 'react-native';
import { FoodNutrition } from '../../../types';
import { NutritionGoalRow } from '../types';
import { formatNutritionValue, getNutritionGoalStatus } from '../utils/analysisUtils';
import { styles } from '../styles';

export function NutritionGoalTable({
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
