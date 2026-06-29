import React from "react";
import { StyleSheet, TextInput, View, ViewStyle } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors, Radius, Spacing, Typography } from "../constants/theme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: ViewStyle;
};

export function SearchInput({ value, onChangeText, placeholder = "Buscar", style }: Props) {
  return (
    <View style={[s.row, style]}>
      <MaterialIcons name="search" size={18} color={Colors.gray400} />
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray400}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.gray800,
    padding: 0,
  },
});
