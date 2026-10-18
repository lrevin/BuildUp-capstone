// 진행률 계산 방식 고르기 + (자동 계산이면) 공정·가중치 입력
// 현장 만들기 화면과 '진행률 계산 방식' 화면에서 같이 쓴다
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, Plus, X } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { ProcessInput, ProgressMode } from '../types';
import { Text } from './Text';

/** 입력 중인 공정 한 줄(가중치는 입력 중 글자 그대로) */
export interface ProcessRow {
  id: string; // 화면에서만 쓰는 구분값
  key?: string; // 이미 있던 공정
  name: string;
  weight: string;
}

let seq = 0;
export const newRow = (name = '', weight = '', key?: string): ProcessRow => ({
  id: `row-${++seq}`,
  key,
  name,
  weight,
});

export const rowsFrom = (
  list: { key?: string; name: string; weight: number }[],
) => list.map(p => newRow(p.name, trimNum(p.weight), p.key));

const trimNum = (n: number) => String(Math.round(n * 10) / 10);

export const weightSum = (rows: ProcessRow[]) =>
  Math.round(
    rows.reduce((acc, r) => acc + (parseFloat(r.weight) || 0), 0) * 10,
  ) / 10;

/** 저장 전 확인: 문제가 있으면 안내 문구, 없으면 null */
export function checkRows(rows: ProcessRow[]): string | null {
  if (rows.length === 0) {
    return '공정을 하나 이상 넣어 주세요';
  }
  const names = new Set<string>();
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) {
      return '공정 이름을 모두 적어 주세요';
    }
    if (names.has(name)) {
      return `공정 이름 '${name}'이(가) 겹쳐요`;
    }
    names.add(name);
    if (!(parseFloat(r.weight) > 0)) {
      return `'${name}'의 가중치를 적어 주세요`;
    }
  }
  const sum = weightSum(rows);
  if (Math.abs(sum - 100) > 0.5) {
    return `가중치 합계가 100%가 되어야 해요 (지금 ${sum}%)`;
  }
  return null;
}

export const toInput = (rows: ProcessRow[]): ProcessInput[] =>
  rows.map(r => ({
    key: r.key,
    name: r.name.trim(),
    weight: parseFloat(r.weight),
  }));

export default function ProgressModeEditor({
  mode,
  onModeChange,
  rows,
  onRowsChange,
  onTemplate,
}: {
  mode: ProgressMode;
  onModeChange: (m: ProgressMode) => void;
  rows: ProcessRow[];
  onRowsChange: (rows: ProcessRow[]) => void;
  onTemplate: () => void; // 공사 종류에 맞는 기본 공정 넣기
}) {
  const sum = weightSum(rows);
  const sumOk = Math.abs(sum - 100) <= 0.5;
  const set = (id: string, patch: Partial<ProcessRow>) =>
    onRowsChange(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));

  // 가중치를 똑같이 나누기(소수 첫째 자리, 남는 값은 마지막 공정에)
  const splitEven = () => {
    if (rows.length === 0) {
      return;
    }
    const each = Math.floor((100 / rows.length) * 10) / 10;
    onRowsChange(
      rows.map((r, i) => ({
        ...r,
        weight: trimNum(
          i === rows.length - 1 ? 100 - each * (rows.length - 1) : each,
        ),
      })),
    );
  };

  return (
    <View>
      <Text style={styles.label}>진행률 계산 방식</Text>
      <Option
        active={mode === 'manual'}
        title="직접 입력"
        desc="보고하는 사람이 현장 전체 진행률을 직접 판단해서 적어요. 작은 공사에 알맞아요."
        onPress={() => onModeChange('manual')}
      />
      <Option
        active={mode === 'auto'}
        title="자동 계산 (공정 가중치)"
        desc="공정마다 가중치를 정해 두면, 공정별 진행률을 보고할 때 전체 진행률이 자동으로 계산돼요."
        onPress={() => onModeChange('auto')}
      />

      {mode === 'auto' ? (
        <View style={styles.editor}>
          <View style={styles.editorTop}>
            <Text style={styles.editorTitle}>공정과 가중치</Text>
            <Text style={[styles.sum, !sumOk && styles.sumBad]}>
              합계 {sum}%
            </Text>
          </View>
          <Text style={styles.formula}>
            전체 진행률 = Σ(공정 진행률 × 가중치) ÷ 100
          </Text>

          {rows.map((r, i) => (
            <View key={r.id} style={styles.row}>
              <Text style={styles.no}>{i + 1}</Text>
              <TextInput
                style={[styles.input, styles.nameInput]}
                value={r.name}
                onChangeText={t => set(r.id, { name: t.slice(0, 30) })}
                placeholder="공정 이름"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={[styles.input, styles.weightInput]}
                value={r.weight}
                onChangeText={t =>
                  set(r.id, { weight: t.replace(/[^0-9.]/g, '').slice(0, 5) })
                }
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
              <Text style={styles.pct}>%</Text>
              <Pressable
                onPress={() => onRowsChange(rows.filter(x => x.id !== r.id))}
                hitSlop={8}
                accessibilityLabel={`${r.name || '공정'} 빼기`}
              >
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}

          <View style={styles.actions}>
            {rows.length < 12 ? (
              <SmallButton
                label="공정 추가"
                icon
                onPress={() => onRowsChange([...rows, newRow()])}
              />
            ) : null}
            <SmallButton label="기본 공정 넣기" onPress={onTemplate} />
            {rows.length > 0 ? (
              <SmallButton label="똑같이 나누기" onPress={splitEven} />
            ) : null}
          </View>
          <Text style={styles.hint}>
            '기본 공정 넣기'를 누르면 공사 종류에 맞는 공정과 가중치를 채워
            줘요. 현장에 맞게 고쳐 쓰세요.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Option({
  active,
  title,
  desc,
  onPress,
}: {
  active: boolean;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, active && styles.optionActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.radio, active && styles.radioOn]}>
        {active ? (
          <Check size={13} color={colors.white} strokeWidth={3} />
        ) : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDesc}>{desc}</Text>
      </View>
    </Pressable>
  );
}

function SmallButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.small} onPress={onPress} hitSlop={4}>
      {icon ? <Plus size={14} color={colors.text} strokeWidth={2.6} /> : null}
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  optionActive: { borderColor: colors.navy },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  optionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  optionDesc: {
    fontSize: 13,
    color: colors.textSub,
    marginTop: 3,
    lineHeight: 19,
  },
  editor: {
    backgroundColor: colors.fill,
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  editorTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editorTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  sum: { fontSize: 14, fontWeight: '700', color: colors.success },
  sumBad: { color: colors.danger },
  formula: {
    fontSize: 12,
    color: colors.textSub,
    marginTop: 4,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  no: { width: 16, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: colors.text,
  },
  nameInput: { flex: 1 },
  weightInput: { width: 64, textAlign: 'right' },
  pct: { fontSize: 14, color: colors.textSub },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  small: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallText: { fontSize: 13, fontWeight: '600', color: colors.text },
  hint: { fontSize: 12, color: colors.textSub, lineHeight: 18, marginTop: 10 },
});
