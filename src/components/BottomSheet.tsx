import React from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors, Radius, Spacing, Typography } from "../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  /** "pill" = text button on the right (AddMeal style), "icon" = X button (default) */
  closeType?: "pill" | "icon";
  closeLabel?: string;
  /** Forces the sheet to occupy 92% of screen height (needed when body uses flex: 1) */
  fillHeight?: boolean;
  maxWidth?: number;
  children: React.ReactNode;
};

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  closeType = "icon",
  closeLabel = "Fechar",
  fillHeight = false,
  maxWidth = 760,
  children,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.bg}>
        <TouchableOpacity style={s.backdrop} onPress={onClose} />
        <View
          style={[
            s.sheet,
            { maxWidth: Platform.OS === "web" ? maxWidth : undefined },
            fillHeight ? s.sheetFixed : s.sheetAuto,
          ]}
        >
          <View style={s.handle} />
          <View style={[s.header, closeType === "pill" && s.headerTop]}>
            <View style={s.titleGroup}>
              {typeof title === "string" ? (
                <Text style={s.title}>{title}</Text>
              ) : (
                title
              )}
              {subtitle != null &&
                (typeof subtitle === "string" ? (
                  <Text style={s.subtitle}>{subtitle}</Text>
                ) : (
                  subtitle
                ))}
            </View>
            {closeType === "pill" ? (
              <TouchableOpacity style={s.closePill} onPress={onClose}>
                <Text style={s.closePillText}>{closeLabel}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.closeIcon} onPress={onClose}>
                <MaterialIcons name="close" size={20} color={Colors.gray600} />
              </TouchableOpacity>
            )}
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    width: "100%",
    alignSelf: "center",
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.base,
    paddingBottom: Spacing.lg,
  },
  sheetFixed: { height: "92%" },
  sheetAuto: { maxHeight: "92%" },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.base,
    flexShrink: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    flexShrink: 0,
  },
  headerTop: { alignItems: "flex-start", marginBottom: Spacing.base },
  titleGroup: { flex: 1 },
  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.gray800,
  },
  subtitle: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3 },
  closePill: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  closePillText: {
    color: Colors.gray600,
    fontWeight: Typography.semibold,
    fontSize: Typography.sm,
  },
  closeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.gray50,
  },
});
