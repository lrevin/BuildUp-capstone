// 총관리자: 공정 관리(현장에 맞게 공정을 직접 만든다: 이름·비중·계획 날짜·순서·삭제)
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import { fetchSite, updateProcesses } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import { Text } from '../components/Text';
import { AppHeader, BottomBar, Button, Card } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import { Process } from '../types';
import { daysBetween, parseYMD, plannedAt, toYMD } from '../utils/plan';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_PROCESSES = 30;
const WEIGHT_STEP = 5;

const label = (ymd: string | null) => {
  if (!ymd) {
    return null;
  }
  const d = parseYMD(ymd);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${
    DAYS[d.getDay()]
  })`;
};

// 화면에서 고치는 공정 한 줄
interface Row {
  id: string; // 화면용 구분값
  key?: string; // 이미 있는 공정이면 서버 key
  name: string;
  weight: number; // 비중(상대값, 1~100)
  planStart: string | null;
  planEnd: string | null;
  progress: number; // 현재 실적(새 공정은 0)
}

let rowSeq = 1;

// 서버 비중(0.4처럼 합이 1이거나 40처럼 자유 값) → 화면에서는 합계 기준 % 정수로
function toRows(processes: Process[]): Row[] {
  const total = processes.reduce((a, p) => a + p.weight, 0);
  return processes.map(p => ({
    id: `r${rowSeq++}`,
    key: p.key,
    name: p.name,
    weight:
      total > 0 ? Math.max(1, Math.round((p.weight / total) * 100)) : 10,
    planStart: p.planStart,
    planEnd: p.planEnd,
    progress: p.progress,
  }));
}

const sameRows = (a: Row[], b: Row[]) =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.key === b[i].key &&
      r.name === b[i].name &&
      r.weight === b[i].weight &&
      r.planStart === b[i].planStart &&
      r.planEnd === b[i].planEnd,
  );

export default function PlanScreen({ navigation, route }: ScreenProps<'Plan'>) {
  const { siteId } = route.params;
  const dialog = useDialog();
  const [rows, setRows] = useState<Row[] | null>(null);
  const original = useRef<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    fetchSite(siteId)
      .then(s => {
        const r = toRows(s.processes);
        original.current = r;
        setRows(r);
      })
      .catch(e => {
        dialog.toast(errorMessage(e), 'error');
        navigation.goBack();
      });
  }, [siteId, dialog, navigation]);

  const update = (id: string, patch: Partial<Row>) =>
    setRows(prev => prev && prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const move = (index: number, dir: -1 | 1) =>
    setRows(prev => {
      if (!prev) {
        return prev;
      }
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) {
        return prev;
      }
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const add = () => {
    if (!rows) {
      return;
    }
    if (rows.length >= MAX_PROCESSES) {
      dialog.toast(`공정은 ${MAX_PROCESSES}개까지 만들 수 있어요`, 'error');
      return;
    }
    const id = `r${rowSeq++}`;
    setRows([
      ...rows,
      {
        id,
        name: '',
        weight: 10,
        planStart: null,
        planEnd: null,
        progress: 0,
      },
    ]);
    setFocused(id);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const remove = async (r: Row) => {
    if (r.key) {
      const ok = await dialog.confirm({
        title: `'${r.name || '이름 없는 공정'}'을 삭제할까요?`,
        message:
          '저장을 눌러야 실제로 삭제돼요. 이미 보고가 있는 공정은 기록을 지키기 위해 삭제할 수 없어요.',
        confirmText: '삭제',
        danger: true,
      });
      if (!ok) {
        return;
      }
    }
    setRows(prev => prev && prev.filter(x => x.id !== r.id));
  };

  // 안드로이드 기본 달력으로 날짜 고르기
  const pickDate = (r: Row, field: 'planStart' | 'planEnd') => {
    const current = r[field] ?? (field === 'planEnd' ? r.planStart : null);
    DateTimePickerAndroid.open({
      value: current ? parseYMD(current) : new Date(),
      mode: 'date',
      minimumDate:
        field === 'planEnd' && r.planStart ? parseYMD(r.planStart) : undefined,
      maximumDate:
        field === 'planStart' && r.planEnd ? parseYMD(r.planEnd) : undefined,
      onValueChange: (_event, date) => update(r.id, { [field]: toYMD(date) }),
    });
  };

  const changed = !!rows && !sameRows(rows, original.current);
  const total = rows?.reduce((a, r) => a + r.weight, 0) ?? 0;

  const onSave = async () => {
    if (!rows) {
      return;
    }
    const empty = rows.findIndex(r => !r.name.trim());
    if (empty >= 0) {
      dialog.toast(`${empty + 1}번째 공정의 이름을 입력해 주세요`, 'error');
      return;
    }
    const names = rows.map(r => r.name.trim());
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) {
      dialog.toast(`'${dup}' 공정이 두 번 들어 있어요`, 'error');
      return;
    }
    const half = rows.find(r => !!r.planStart !== !!r.planEnd);
    if (half) {
      dialog.toast(`${half.name}의 시작일과 완료일을 모두 정해 주세요`, 'error');
      return;
    }
    setSaving(true);
    try {
      await updateProcesses(
        siteId,
        rows.map(r => ({
          key: r.key,
          name: r.name.trim(),
          weight: r.weight,
          planStart: r.planStart,
          planEnd: r.planEnd,
        })),
      );
      dialog.toast('공정을 저장했어요', 'success');
      navigation.goBack();
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '저장하지 못했어요',
        message: errorMessage(e),
      });
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="공정 관리" onBack={() => navigation.goBack()} />
      {!rows ? (
        <ActivityIndicator style={styles.loading} color={colors.navy} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.intro}>
              현장에 맞게 공정을 직접 만들어요. 비중은 전체 진행률에 반영되는
              정도이고, 시작일·완료일을 정하면 계획 대비 지연 여부를 알려
              드려요.
            </Text>

            {rows.length === 0 ? (
              <Text style={styles.empty}>
                아직 공정이 없어요. 아래 '공정 추가'를 눌러 만들어 주세요.
              </Text>
            ) : null}

            {rows.map((r, i) => {
              const duration =
                r.planStart && r.planEnd
                  ? daysBetween(parseYMD(r.planStart), parseYMD(r.planEnd)) + 1
                  : null;
              const todayPlan = plannedAt(r);
              const share = total > 0 ? Math.round((r.weight / total) * 100) : 0;
              return (
                <Card key={r.id} style={i > 0 ? styles.gap : undefined}>
                  {/* 이름 + 순서 + 삭제 */}
                  <View style={styles.titleRow}>
                    <Text style={styles.order}>{i + 1}</Text>
                    <TextInput
                      style={[
                        styles.nameInput,
                        focused === r.id && styles.inputFocused,
                      ]}
                      value={r.name}
                      onChangeText={t => update(r.id, { name: t })}
                      onFocus={() => setFocused(r.id)}
                      onBlur={() => setFocused(f => (f === r.id ? null : f))}
                      autoFocus={!r.key && focused === r.id}
                      placeholder="공정 이름 (예: 지하 2층 흙막이)"
                      placeholderTextColor={colors.textMuted}
                      maxLength={30}
                    />
                    <IconBtn
                      label="위로"
                      disabled={i === 0}
                      onPress={() => move(i, -1)}
                    >
                      <ChevronUp size={18} color={colors.text} />
                    </IconBtn>
                    <IconBtn
                      label="아래로"
                      disabled={i === rows.length - 1}
                      onPress={() => move(i, 1)}
                    >
                      <ChevronDown size={18} color={colors.text} />
                    </IconBtn>
                    <IconBtn label="삭제" onPress={() => remove(r)}>
                      <Trash2 size={17} color={colors.danger} />
                    </IconBtn>
                  </View>

                  {/* 비중 */}
                  <View style={styles.weightRow}>
                    <Text style={styles.caption}>비중</Text>
                    <Text style={styles.share}>전체의 {share}%</Text>
                    <View style={styles.stepper}>
                      <IconBtn
                        label="비중 줄이기"
                        disabled={r.weight <= 1}
                        onPress={() =>
                          update(r.id, {
                            weight: Math.max(1, r.weight - WEIGHT_STEP),
                          })
                        }
                      >
                        <Minus size={16} color={colors.text} />
                      </IconBtn>
                      <Text style={styles.weightValue}>{r.weight}</Text>
                      <IconBtn
                        label="비중 늘리기"
                        disabled={r.weight >= 100}
                        onPress={() =>
                          update(r.id, {
                            weight: Math.min(
                              100,
                              r.weight === 1 ? WEIGHT_STEP : r.weight + WEIGHT_STEP,
                            ),
                          })
                        }
                      >
                        <Plus size={16} color={colors.text} />
                      </IconBtn>
                    </View>
                  </View>

                  {/* 계획 날짜 */}
                  <View style={styles.dates}>
                    <DateButton
                      caption="시작일"
                      value={label(r.planStart)}
                      onPress={() => pickDate(r, 'planStart')}
                    />
                    <Text style={styles.tilde}>~</Text>
                    <DateButton
                      caption="완료일"
                      value={label(r.planEnd)}
                      onPress={() => pickDate(r, 'planEnd')}
                    />
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>
                      {duration !== null
                        ? `${duration}일 · 오늘 계획 ${todayPlan?.toFixed(1)}%`
                        : '계획 미설정'}
                      {r.key ? ` · 현재 실적 ${r.progress.toFixed(1)}%` : ' · 새 공정'}
                    </Text>
                    {r.planStart || r.planEnd ? (
                      <Pressable
                        hitSlop={8}
                        style={styles.clear}
                        onPress={() =>
                          update(r.id, { planStart: null, planEnd: null })
                        }
                        accessibilityLabel={`${r.name} 계획 지우기`}
                      >
                        <X size={14} color={colors.textMuted} />
                        <Text style={styles.clearText}>날짜 지우기</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Card>
              );
            })}

            <Pressable
              style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
              onPress={add}
            >
              <Plus size={18} color={colors.text} />
              <Text style={styles.addText}>공정 추가</Text>
            </Pressable>
          </ScrollView>
          <BottomBar>
            <Button
              title="저장"
              onPress={onSave}
              loading={saving}
              disabled={!changed}
            />
          </BottomBar>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function IconBtn({
  children,
  label: a11y,
  onPress,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityLabel={a11y}
      style={({ pressed }) => [
        styles.iconBtn,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

function DateButton({
  caption,
  value,
  onPress,
}: {
  caption: string;
  value: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.dateBtn, pressed && styles.pressed]}
      accessibilityLabel={`${caption} 선택`}
    >
      <Text style={styles.dateCaption}>{caption}</Text>
      <View style={styles.dateValueRow}>
        <CalendarDays
          size={15}
          color={value ? colors.text : colors.textMuted}
        />
        <Text style={[styles.dateValue, !value && styles.datePlaceholder]}>
          {value ?? '선택'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  loading: { marginTop: 40 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  gap: { marginTop: 12 },
  intro: {
    fontSize: 14,
    color: colors.textSub,
    lineHeight: 21,
    marginBottom: 16,
  },
  empty: {
    fontSize: 14,
    color: colors.textSub,
    textAlign: 'center',
    marginVertical: 24,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  order: {
    width: 22,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  nameInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.fill,
    backgroundColor: colors.fill,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 4,
  },
  inputFocused: { backgroundColor: colors.white, borderColor: colors.navy },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.6 },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  caption: { fontSize: 14, color: colors.textSub },
  share: { fontSize: 13, fontWeight: '700', color: colors.text },
  stepper: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weightValue: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  dates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  tilde: { fontSize: 15, color: colors.textMuted },
  dateBtn: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateCaption: { fontSize: 12, color: colors.textMuted },
  dateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  dateValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  datePlaceholder: { color: colors.textMuted, fontWeight: '400' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  meta: { flex: 1, fontSize: 13, color: colors.textSub },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  clearText: { fontSize: 13, color: colors.textMuted },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.white,
    marginTop: 12,
  },
  addText: { fontSize: 15, fontWeight: '700', color: colors.text },
});
