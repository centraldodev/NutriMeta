import React from 'react';
import { Text, View, ViewStyle } from 'react-native';
import { styles } from '../styles';

export function StatCard({
  label,
  value,
  hint,
  style,
}: {
  label: string;
  value: string;
  hint: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.statCard, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statHint}>{hint}</Text>
    </View>
  );
}
