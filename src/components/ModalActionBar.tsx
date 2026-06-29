import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, Radius, Spacing, Typography } from "../constants/theme";

type Props = {
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel: string;
  loading?: boolean;
  disabled?: boolean;
};

export function ModalActionBar({
  onCancel,
  onConfirm,
  cancelLabel = "Cancelar",
  confirmLabel,
  loading = false,
  disabled = false,
}: Props) {
  return (
    <View style={s.row}>
      <TouchableOpacity style={s.cancel} onPress={onCancel}>
        <Text style={s.cancelText}>{cancelLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.confirm, (loading || disabled) && s.disabled]}
        onPress={onConfirm}
        disabled={loading || disabled}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} size="small" />
        ) : (
          <Text style={s.confirmText}>{confirmLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.base,
    flexShrink: 0,
  },
  cancel: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: "center",
  },
  cancelText: { color: Colors.gray600, fontWeight: Typography.semibold },
  confirm: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.green400,
    padding: Spacing.md,
    alignItems: "center",
  },
  confirmText: { color: Colors.white, fontWeight: Typography.bold },
  disabled: { opacity: 0.45 },
});
