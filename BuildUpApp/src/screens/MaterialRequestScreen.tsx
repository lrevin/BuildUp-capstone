// 자재 요청 작성: 자재(이름·수량·단위) 여러 줄, 필요일, 긴급, 메모
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays, Plus, Siren, X } from 'lucide-react-native';
import { fetchSite, requestMaterials } from '../api/buildup';
import { useUser } from '../auth';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import { formatQty, shortDate } from '../components/Material';
import { Text } from '../components/Text';
import { AppHeader, BottomBar, Button, Card } from '../components/ui';
import { MAX_MATERIAL_ITEMS } from '../data/dummy';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import { MaterialItem } from '../types';
import { addDays, parseYMD, toYMD } from '../utils/plan';


// 자주 쓰는 자재(누르면 이름·단위가 채워진다)
const PRESETS: { name: string; unit: string }[] = [
  { name: '철근', unit: '톤' },
  { name: '레미콘', unit: '㎥' },
  { name: '합판', unit: '장' },
  { name: '각재', unit: '본' },
  { name: '시멘트', unit: '포' },
  { name: '전선', unit: '롤' },
  { name: 'PVC관', unit: '본' },
  { name: '석고보드', unit: '장' },
];

interface Row {
  id: number;
  name: string;
  qty: string; // 입력 중인 글자 그대로
  unit: string;
}

let rowSeq = 1;
const emptyRow = (): Row => ({ id: rowSeq++, name: '', qty: '', unit: '' });

const parseQty = (s: string) => Number(s.replace(',', '.'));

export default function MaterialRequestScreen({
  navigation,
  route,
}: ScreenProps<'MaterialRequest'>) {
  const { siteId, siteName } = route.params;
  const dialog = useDialog();
  const user = useUser();
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    fetchSite(siteId)
      .then(s => {
        setIsOwner(s.ownerId === user.id);
      })
      .catch(() => {});
  }, [siteId, user.id]);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [neededBy, setNeededBy] = useState<string | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [note, setNote] = useState('');
  const [noteFocused, setNoteFocused] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date();
  const quickDays = [
    { label: '오늘', ymd: toYMD(today) },
    { label: '내일', ymd: toYMD(addDays(today, 1)) },
    { label: '모레', ymd: toYMD(addDays(today, 2)) },
  ];
  const customDate =
    neededBy && !quickDays.some(d => d.ymd === neededBy) ? neededBy : null;

  const update = (id: number, patch: Partial<Row>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () => {
    if (rows.length >= MAX_MATERIAL_ITEMS) {
      dialog.toast(`자재는 한 번에 ${MAX_MATERIAL_ITEMS}개까지 요청할 수 있어요`, 'error');
      return;
    }
    setRows(prev => [...prev, emptyRow()]);
  };

  const removeRow = (id: number) =>
    setRows(prev =>
      prev.length === 1 ? [emptyRow()] : prev.filter(r => r.id !== id),
    );

  // 빈 줄이 있으면 거기에, 없으면 새 줄로
  const applyPreset = (p: { name: string; unit: string }) => {
    const blank = rows.find(r => !r.name.trim());
    if (blank) {
      update(blank.id, { name: p.name, unit: p.unit });
    } else if (rows.length < MAX_MATERIAL_ITEMS) {
      setRows(prev => [...prev, { ...emptyRow(), name: p.name, unit: p.unit }]);
    }
  };

  const pickDate = () =>
    DateTimePickerAndroid.open({
      value: neededBy ? parseYMD(neededBy) : addDays(today, 3),
      minimumDate: today,
      onValueChange: (_event, date) => setNeededBy(toYMD(date)),
    });

  // 이름이 있는 줄만 보낸다
  const filled = rows.filter(r => r.name.trim());
  const badQty = filled.find(r => !(parseQty(r.qty) > 0));
  const canSubmit = filled.length > 0;

  const onSubmit = async () => {
    if (badQty) {
      dialog.toast(`${badQty.name.trim()}의 수량을 입력해 주세요`, 'error');
      return;
    }
    const items: MaterialItem[] = filled.map(r => ({
      name: r.name.trim(),
      quantity: parseQty(r.qty),
      unit: r.unit.trim(),
    }));
    const ok = await dialog.confirm({
      title: urgent ? '긴급 자재 요청을 보낼까요?' : '자재 요청을 보낼까요?',
      message:
        items
          .map(i => `· ${i.name} ${formatQty(i.quantity)}${i.unit}`)
          .join('\n') +
        (neededBy ? `\n필요일 ${shortDate(parseYMD(neededBy))}` : ''),
      confirmText: '보내기',
    });
    if (!ok) {
      return;
    }
    setSubmitting(true);
    try {
      const created = await requestMaterials({
        siteId,
        processKey: null,
        items,
        neededBy,
        urgent,
        note: note.trim(),
      });
      const next = await dialog.show({
        icon: 'success',
        title: '자재 요청을 보냈어요',
        // 총관리자가 직접 요청하면 바로 승인 상태로 등록된다
        message:
          created.status === 'approved'
            ? '현장 총관리자 요청이라 바로 승인됐어요.'
            : !created.hqLinked
            ? '현장 총관리자가 승인하면 목록에서 상태가 바뀌어요.'
            : isOwner
            ? '본사가 승인하면 목록에서 상태가 바뀌어요.'
            : '현장 총관리자나 본사가 승인하면 목록에서 상태가 바뀌어요.',
        actions: [
          { label: '요청 목록', value: 'list', variant: 'secondary' },
          { label: '확인', value: 'ok', variant: 'primary' },
        ],
      });
      if (next === 'list') {
        navigation.popTo('Materials', { siteId, siteName });
      } else {
        navigation.goBack();
      }
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '요청하지 못했어요',
        message: errorMessage(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );

  const input = (key: string, extra: object) => ({
    placeholderTextColor: colors.textMuted,
    onFocus: () => setFocused(key),
    onBlur: () => setFocused(f => (f === key ? null : f)),
    ...extra,
  });

  return (
    <View style={styles.root}>
      <AppHeader
        title="자재 요청"
        subtitle={siteName}
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitleInline}>필요한 자재</Text>
              <Text style={styles.counter}>
                {filled.length}/{MAX_MATERIAL_ITEMS}
              </Text>
            </View>

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
                  {...input(`n${r.id}`, {})}
                  style={[
                    styles.input,
                    styles.flex,
                    focused === `n${r.id}` && styles.inputFocused,
                  ]}
                  value={r.name}
                  onChangeText={t => update(r.id, { name: t })}
                  placeholder={i === 0 ? '예) 철근 HD13' : '자재명'}
                  maxLength={50}
                />
                <TextInput
                  {...input(`q${r.id}`, {})}
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
                  maxLength={8}
                />
                <TextInput
                  {...input(`u${r.id}`, {})}
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

            <Text style={styles.subLabel}>자주 쓰는 자재</Text>
            <View style={styles.chips}>
              {PRESETS.map(p => (
                <Pressable
                  key={p.name}
                  onPress={() => applyPreset(p)}
                  style={({ pressed }) => [
                    styles.preset,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.presetText}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <Card style={styles.gap}>
            <Text style={styles.cardTitle}>필요일</Text>
            <View style={styles.chips}>
              {chip('미정', neededBy === null, () => setNeededBy(null))}
              {quickDays.map(d =>
                chip(d.label, neededBy === d.ymd, () => setNeededBy(d.ymd)),
              )}
              <Pressable
                onPress={pickDate}
                style={[styles.chip, styles.dateChip, customDate && styles.chipActive]}
              >
                <CalendarDays
                  size={15}
                  color={customDate ? colors.white : colors.textSub}
                />
                <Text
                  style={[styles.chipText, customDate && styles.chipTextActive]}
                >
                  {customDate ? shortDate(parseYMD(customDate)) : '날짜 선택'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.urgentRow}>
              <View style={[styles.urgentIcon, urgent && styles.urgentIconOn]}>
                <Siren
                  size={18}
                  color={urgent ? colors.danger : colors.textMuted}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.urgentTitle}>긴급 요청</Text>
                <Text style={styles.urgentSub}>
                  관리자 목록 맨 위에 빨간 표시로 보여요
                </Text>
              </View>
              <Switch
                value={urgent}
                onValueChange={setUrgent}
                trackColor={{ false: colors.track, true: '#F3A5A8' }}
                thumbColor={urgent ? colors.danger : colors.white}
              />
            </View>
          </Card>

          <Card style={styles.gap}>
            <Text style={styles.cardTitle}>요청 메모</Text>
            <TextInput
              style={[styles.memo, noteFocused && styles.memoFocused]}
              value={note}
              onChangeText={setNote}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              placeholder="사용 위치, 반입 시간, 하차 장소 등"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
          </Card>
        </ScrollView>

        <BottomBar>
          <Button
            title={
              filled.length > 0
                ? `자재 ${filled.length}건 요청 보내기`
                : '요청 보내기'
            }
            onPress={onSubmit}
            disabled={!canSubmit}
            loading={submitting}
          />
        </BottomBar>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  gap: { marginTop: 12 },
  pressed: { opacity: 0.7 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitleInline: { fontSize: 16, fontWeight: '700', color: colors.text },
  counter: { fontSize: 13, color: colors.textMuted },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.textSub },
  chipTextActive: { color: colors.white, fontWeight: '700' },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },

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
  preset: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.fill,
    justifyContent: 'center',
  },
  presetText: { fontSize: 13, fontWeight: '600', color: colors.text },

  urgentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  urgentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentIconOn: { backgroundColor: '#FDECEC' },
  urgentTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  urgentSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  memo: {
    minHeight: 96,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.fill,
    padding: 14,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  memoFocused: { backgroundColor: colors.white, borderColor: colors.navy },
});
