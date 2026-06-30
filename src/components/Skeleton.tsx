import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Colors, Radius } from '../constants/theme';

export function SkeletonLine({
  width = '100%',
  height = 12,
  style,
}: {
  width?: ViewStyle['width'];
  height?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: Radius.full,
          backgroundColor: Colors.gray50,
          borderWidth: 1,
          borderColor: Colors.border,
          opacity: 0.92,
        },
        style,
      ]}
    />
  );
}

export function SkeletonBlock({
  height,
  style,
}: {
  height: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          height,
          borderRadius: Radius.md,
          backgroundColor: Colors.gray50,
          borderWidth: 1,
          borderColor: Colors.border,
          opacity: 0.92,
        },
        style,
      ]}
    />
  );
}
