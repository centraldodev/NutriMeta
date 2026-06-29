import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors, Spacing, Typography } from "../constants/theme";

type Props = {
  icon?: keyof typeof MaterialIcons.glyphMap;
  iconSize?: number;
  title?: string;
  description?: string;
  style?: ViewStyle;
};

export function EmptyState({
  icon,
  iconSize = 38,
  title,
  description,
  style,
}: Props) {
  return (
    <View style={[s.container, style]}>
      {icon && (
        <MaterialIcons name={icon} size={iconSize} color={Colors.gray400} />
      )}
      {title && <Text style={s.title}>{title}</Text>}
      {description && <Text style={s.description}>{description}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  container: { alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.lg },
  title: {
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    color: Colors.gray600,
    textAlign: "center",
  },
  description: {
    fontSize: Typography.sm,
    color: Colors.gray400,
    textAlign: "center",
    lineHeight: 20,
  },
});
