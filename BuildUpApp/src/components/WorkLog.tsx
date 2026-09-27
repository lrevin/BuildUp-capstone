// 작업일보 항목: 날씨·투입 인원·장비 입력 카드와 요약 표시
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  Cloud,
  CloudRain,
  Minus,
  Plus,
  Snowflake,
  Sun,
  Truck,
  Users,
} from 'lucide-react-native';
import { colors, radius } from '../theme';
import { Weather, WorkLog } from '../types';
import { Text } from './Text';

export const EMPTY_WORKLOG: WorkLog = {
  weather: null,
  workers: null,
  equipment: '',
};

export const WEATHER_META: Record<
  Weather,
  { label: string; Icon: typeof Sun }
> = {
  sunny: { label: '맑음', Icon: Sun },
  cloudy: { label: '흐림', Icon: Cloud },
  rain: { label: '비', Icon: CloudRain },
  snow: { label: '눈', Icon: Snowflake },
};

const WEATHERS: Weather[] = ['sunny', 'cloudy', 'rain', 'snow'];

export const isWorkLogEmpty = (w: WorkLog) =>
  !w.weather && !w.workers && !w.equipment.trim();

// "맑음 · 12명 · 타워크레인 1"
export function workLogSummary(w: WorkLog | undefined) {
  if (!w) {
    return '';
  }
  return [
    w.weather ? WEATHER_META[w.weather].label : null,
    w.workers ? `${w.workers}명` : null,
    w.equipment.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---- 입력 카드 내용 ----

export function WorkLogFields({
  value,
  onChange,
}: {
  value: WorkLog;
  onChange: (next: WorkLog) => void;
}) {
  const workers = value.workers ?? 0;
  const setWorkers = (n: number) =>
    onChange({ ...value, workers: n <= 0 ? null : Math.min(n, 999) });

  return (
    <View>
      <Text style={styles.label}>날씨</Text>
      <View style={styles.weatherRow}>
        {WEATHERS.map(w => {
          const active = value.weather === w;
          const { label, Icon } = WEATHER_META[w];
          return (
            <Pressable
              key={w}
              accessibilityLabel={`날씨 ${label}`}
              onPress={() => onChange({ ...value, weather: active ? null : w })}
              style={[styles.weather, active && styles.weatherActive]}
            >
              <Icon
                size={20}
                color={active ? colors.text : colors.textMuted}
                strokeWidth={2}
              />
              <Text style={[styles.weatherText, active && styles.textActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.row}>
        <Users size={18} color={colors.textMuted} />
        <Text style={styles.rowLabel}>투입 인원</Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityLabel="인원 줄이기"
            style={[styles.stepBtn, workers <= 0 && styles.disabled]}
            disabled={workers <= 0}
            onPress={() => setWorkers(workers - 1)}
          >
            <Minus size={16} color={colors.text} />
          </Pressable>
          <Text style={styles.count}>
            {workers}
            <Text style={styles.unit}>명</Text>
          </Text>
          <Pressable
            accessibilityLabel="인원 늘리기"
            style={styles.stepBtn}
            onPress={() => setWorkers(workers + 1)}
          >
            <Plus size={16} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.row}>
        <Truck size={18} color={colors.textMuted} />
        <Text style={styles.rowLabel}>장비</Text>
        <TextInput
          style={styles.equipment}
          value={value.equipment}
          onChangeText={t => onChange({ ...value, equipment: t })}
          placeholder="예) 타워크레인 1, 펌프카 1"
          placeholderTextColor={colors.textMuted}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: colors.textSub, marginBottom: 8 },
  weatherRow: { flexDirection: 'row', gap: 8 },
  weather: {
    flex: 1,
    height: 62,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.fill,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  weatherActive: { borderColor: colors.navy, backgroundColor: colors.white },
  weatherText: { fontSize: 13, color: colors.textSub },
  textActive: { color: colors.text, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  rowLabel: { width: 64, fontSize: 15, color: colors.textSub },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  count: {
    minWidth: 44,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  unit: { fontSize: 13, fontWeight: '500', color: colors.textSub },
  equipment: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.fill,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
  },
});
