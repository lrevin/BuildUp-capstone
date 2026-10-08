// 원형 진행률(현장 상세 상단). planned를 주면 원 위에 흰 눈금도 그린다
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { colors } from '../theme';
import { Text } from './Text';

export default function ProgressRing({
  value,
  planned,
  size = 104,
  stroke = 10,
  track = 'rgba(255,255,255,0.14)',
  color = colors.yellow,
  textColor = colors.white,
}: {
  value: number; // 0~100
  planned?: number | null; // 계획 진행률(없으면 눈금 없음)
  size?: number;
  stroke?: number;
  track?: string;
  color?: string;
  textColor?: string;
}) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  // 계획 눈금: 12시 방향에서 시계 방향
  const tick =
    planned == null
      ? null
      : (() => {
          const a =
            (Math.max(0, Math.min(100, planned)) / 100) * 2 * Math.PI -
            Math.PI / 2;
          const inner = r - stroke / 2 - 2;
          const outer = r + stroke / 2 + 2;
          return {
            x1: c + inner * Math.cos(a),
            y1: c + inner * Math.sin(a),
            x2: c + outer * Math.cos(a),
            y2: c + outer * Math.sin(a),
          };
        })();

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityLabel={`전체 진행률 ${v.toFixed(1)}%${
        planned != null ? `, 계획 ${planned.toFixed(1)}%` : ''
      }`}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={track}
          strokeWidth={stroke}
          fill="none"
        />
        {/* 0%면 둥근 끝 때문에 점이 하나 보이므로 그리지 않는다 */}
        {v > 0 ? (
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(len * v) / 100} ${len}`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        ) : null}
        {tick ? (
          <Line
            {...tick}
            stroke={colors.white}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ) : null}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.value, { color: textColor }]}>
          {v.toFixed(1)}
          <Text style={styles.unit}>%</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 22, fontWeight: '800' },
  unit: { fontSize: 13, fontWeight: '700', color: '#A9B0C0' },
});
