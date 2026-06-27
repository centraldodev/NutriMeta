import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../../../constants/theme';

const RING_SIZE = 160;
const RING_STROKE = 14;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

export { RING_SIZE };

export function RingChart({ pct, color }: { pct: number; color: string }) {
  const dash = (pct / 100) * CIRCUMFERENCE;
  const centerPoint = RING_SIZE / 2;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle
        cx={centerPoint}
        cy={centerPoint}
        r={RING_R}
        stroke={Colors.gray50}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <Circle
        cx={centerPoint}
        cy={centerPoint}
        r={RING_R}
        stroke={color}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${centerPoint} ${centerPoint})`}
      />
    </Svg>
  );
}
