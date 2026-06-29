import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/theme";
import { MealPeriod } from "../../../types";
import { MEAL_PERIODS } from "../types";
import { modal } from "../modalStyles";

export function MealPeriodPicker({
  value,
  onChange,
}: {
  value: MealPeriod;
  onChange: (period: MealPeriod) => void;
}) {
  return (
    <View style={modal.periodBox}>
      <Text style={modal.label}>Refeição</Text>
      <View style={modal.periodRow}>
        {MEAL_PERIODS.map((period) => {
          const active = period.key === value;
          return (
            <TouchableOpacity
              key={period.key}
              style={[modal.periodChip, active && modal.periodChipActive]}
              onPress={() => onChange(period.key)}
            >
              <MaterialIcons
                name={period.icon as any}
                size={16}
                color={active ? Colors.white : Colors.gray600}
              />
              <Text
                style={[modal.periodText, active && modal.periodTextActive]}
              >
                {period.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
