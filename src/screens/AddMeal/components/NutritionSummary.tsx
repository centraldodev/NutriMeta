import React from "react";
import { Text } from "react-native";
import { FoodNutrition } from "../../../types";
import { modal } from "../modalStyles";

const NUTRITION_SUMMARY_ROWS: {
  key: keyof FoodNutrition;
  label: string;
  unit: string;
}[] = [
  { key: "sodium", label: "Sódio", unit: "mg" },
  { key: "calcium", label: "Ca", unit: "mg" },
  { key: "iron", label: "Fe", unit: "mg" },
  { key: "potassium", label: "K", unit: "mg" },
  { key: "magnesium", label: "Mg", unit: "mg" },
  { key: "zinc", label: "Zn", unit: "mg" },
  { key: "vitaminC", label: "Vit. C", unit: "mg" },
];

function formatFactValue(value: number): string {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return String(Math.round(value * 10) / 10).replace(".", ",");
  if (value >= 1) return String(Math.round(value * 10) / 10).replace(".", ",");
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

export function NutritionSummary({ nutrition }: { nutrition: FoodNutrition }) {
  const macroText = [
    `${formatFactValue(nutrition.kcal)}kcal`,
    `P ${formatFactValue(nutrition.protein)}g`,
    `C ${formatFactValue(nutrition.carbs)}g`,
    `G ${formatFactValue(nutrition.fat)}g`,
    nutrition.fiber > 0 ? `Fib ${formatFactValue(nutrition.fiber)}g` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const microText = NUTRITION_SUMMARY_ROWS.map((row) => ({
    ...row,
    value: nutrition[row.key],
  }))
    .filter(
      (row): row is typeof row & { value: number } =>
        typeof row.value === "number" &&
        Number.isFinite(row.value) &&
        row.value > 0,
    )
    .slice(0, 3)
    .map((row) => `${row.label} ${formatFactValue(row.value)}${row.unit}`)
    .join(" · ");

  return (
    <>
      <Text style={modal.nutritionSummary} numberOfLines={1}>
        {macroText}
      </Text>
      {microText ? (
        <Text style={modal.nutritionMicroSummary} numberOfLines={1}>
          {microText}
        </Text>
      ) : null}
    </>
  );
}
