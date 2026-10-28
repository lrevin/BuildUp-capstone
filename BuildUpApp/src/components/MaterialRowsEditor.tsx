// 자재 여러 줄 입력(자재명 · 수량 · 단위): 보고의 '오늘 사용한 자재', 현장 자재 재고 입력에 같이 쓴다
// (모양은 자재 요청 화면의 '필요한 자재'와 같다)
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { Text } from './Text';
import { formatQty } from './Material';
import { colors } from '../theme';
import { MaterialItem } from '../types';

export interface MaterialRow {
  id: number;
  name: string;
  qty: string; // 입력 중인 글자 그대로
  unit: string;
}

let rowSeq = 1;
export const emptyMaterialRow = (): MaterialRow => ({
  id: rowSeq++,
  name: '',
  qty: '',
  unit: '',
});

export const rowsFromItems = (items: MaterialItem[]): MaterialRow[] =>
  items.map(i => ({
    id: rowSeq++,
    name: i.name,
    qty: formatQty(i.quantity),
    unit: i.unit,
  }));

const parseQty = (s: string) => Number(s.replace(',', '.'));

/**
 * 이름이 있는 줄만 자재 목록으로. 수량이 잘못된 줄이 있으면 { bad: 자재명 }
 * allowZero: 재고 입력은 0도 된다(사용량은 0보다 커야 함)
 */
export function itemsFromRows(
  rows: MaterialRow[],
  allowZero = false,
): { items: MaterialItem[]; bad: string | null } {
  const filled = rows.filter(r => r.name.trim());
  const bad = filled.find(r => {
    const n = parseQty(r.qty);
    return (
      !Number.isFinite(n) || r.qty.trim() === '' || (allowZero ? n < 0 : n <= 0)
    );
  });
  return {
    items: filled.map(r => ({
      name: r.name.trim(),
      quantity: parseQty(r.qty),
      unit: r.unit.trim(),
    })),
    bad: bad ? bad.name.trim() : null,
  };
}

// 자주 쓰는 자재(누르면 이름·단위가 채워진다, 자재 요청 화면과 같은 목록)
export const COMMON_MATERIALS: MaterialPreset[] = [
  { name: '철근', unit: '톤' },
  { name: '레미콘', unit: '㎥' },
  { name: '합판', unit: '장' },
  { name: '각재', unit: '본' },
  { name: '시멘트', unit: '포' },
  { name: '전선', unit: '롤' },
  { name: 'PVC관', unit: '본' },
  { name: '석고보드', unit: '장' },
];

export interface MaterialPreset {
  name: string;
  unit: string;
  /** 칩 옆에 작게 보일 글자(예: 남은 양) */
  note?: string;
}

export default function MaterialRowsEditor({
  rows,
  onChange,
  presets,
  presetLabel = '자주 쓰는 자재',
  max = 50,
  onFull,
  namePlaceholder = '예) 타일 300×600',
}: {
  rows: MaterialRow[];
  onChange: (rows: MaterialRow[]) => void;
  presets?: MaterialPreset[];
  presetLabel?: string;
  max?: number;
  onFull?: () => void;
  namePlaceholder?: string;
}) {
  const [focused, setFocused] = useState<string | null>(null);

  const update = (id: number, patch: Partial<MaterialRow>) =>
    onChange(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () => {
    if (rows.length >= max) {
      onFull?.();
      return;
    }
    onChange([...rows, emptyMaterialRow()]);
  };

  const removeRow = (id: number) =>
    onChange(
      rows.length === 1 ? [emptyMaterialRow()] : rows.filter(r => r.id !== id),
    );

  // 빈 줄이 있으면 거기에, 없으면 새 줄로(이미 있는 자재면 그 줄 수량칸으로)
  const applyPreset = (p: MaterialPreset) => {
    if (rows.some(r => r.name.trim() === p.name && r.unit.trim() === p.unit)) {
      return;
    }
    const blank = rows.find(r => !r.name.trim());
    if (blank) {
      update(blank.id, { name: p.name, unit: p.unit });
    } else if (rows.length < max) {
      onChange([
        ...rows,
        { ...emptyMaterialRow(), name: p.name, unit: p.unit },
      ]);
    } else {
      onFull?.();
    }
  };

  const input = (key: string) => ({
    placeholderTextColor: colors.textMuted,
    onFocus: () => setFocused(key),
    onBlur: () => setFocused(f => (f === key ? null : f)),
  });

  return (
    <View>
      <View style={styles.headRow}>
        <Text style={[styles.head, styles.headName, styles.flex]}>
          자재명·규격
        </Text>
        <Text style={[styles.head, styles.qtyCol]}>수량</Text>
        <Text style={[styles.head, styles.unitCol]}>단위</Text>
        <View style={styles.removeSpacer} />
      </View>
      {rows.map((r, i) => (
        <View key={r.id} style={styles.itemRow}>
          <TextInput
            {...input(`n${r.id}`)}
            style={[
              styles.input,
              styles.flex,
              focused === `n${r.id}` && styles.inputFocused,
            ]}
            value={r.name}
            onChangeText={t => update(r.id, { name: t })}
            placeholder={i === 0 ? namePlaceholder : '자재명'}
            maxLength={50}
          />
          <TextInput
            {...input(`q${r.id}`)}
            style={[
              styles.input,
              styles.qtyCol,
              styles.center,
              focused === `q${r.id}` && styles.inputFocused,
            ]}
            value={r.qty}
            onChangeText={t =>
              update(r.id, { qty: t.replace(/[^0-9.,]/g, '') })
            }
            placeholder="0"
            keyboardType="decimal-pad"
            maxLength={10}
          />
          <TextInput
            {...input(`u${r.id}`)}
            style={[
              styles.input,
              styles.unitCol,
              styles.center,
              focused === `u${r.id}` && styles.inputFocused,
            ]}
            value={r.unit}
            onChangeText={t => update(r.id, { unit: t })}
            placeholder="개"
            maxLength={10}
          />
          <Pressable
            style={styles.removeCol}
            onPress={() => removeRow(r.id)}
            hitSlop={6}
            accessibilityLabel={`${i + 1}번째 자재 지우기`}
          >
            <X size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}

      <Pressable
        style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
        onPress={addRow}
      >
        <Plus size={18} color={colors.text} />
        <Text style={styles.addRowText}>자재 추가</Text>
      </Pressable>

      {presets && presets.length > 0 ? (
        <>
          <Text style={styles.subLabel}>{presetLabel}</Text>
          <View style={styles.chips}>
            {presets.map(p => (
              <Pressable
                key={`${p.name}|${p.unit}`}
                onPress={() => applyPreset(p)}
                style={({ pressed }) => [
                  styles.preset,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.presetText}>
                  {p.name}
                  {p.note ? (
                    <Text style={styles.presetNote}> {p.note}</Text>
                  ) : null}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  headRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  head: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  headName: { textAlign: 'left' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  input: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.fill,
    backgroundColor: colors.fill,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
  },
  inputFocused: { backgroundColor: colors.white, borderColor: colors.navy },
  center: { textAlign: 'center', paddingHorizontal: 6 },
  qtyCol: { width: 64 },
  unitCol: { width: 52 },
  removeCol: {
    width: 24,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeSpacer: { width: 24 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginTop: 2,
  },
  addRowText: { fontSize: 14, fontWeight: '600', color: colors.text },
  subLabel: {
    fontSize: 13,
    color: colors.textSub,
    marginTop: 18,
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.fill,
    justifyContent: 'center',
  },
  presetText: { fontSize: 13, fontWeight: '600', color: colors.text },
  presetNote: { fontSize: 12, fontWeight: '400', color: colors.textSub },
});
