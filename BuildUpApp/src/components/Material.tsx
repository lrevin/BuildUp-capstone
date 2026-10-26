// 자재 요청: 상태 표시, 요약 문구, 목록 카드
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Building2, CalendarClock, Siren } from 'lucide-react-native';
import { colors, radius, shadow } from '../theme';
import { MaterialItem, MaterialRequest, MaterialStatus } from '../types';
import { formatTime } from '../utils/format';
import { daysBetween, parseYMD } from '../utils/plan';
import { Text } from './Text';

export const MATERIAL_STATUS_META: Record<
  MaterialStatus,
  { label: string; color: string; bg: string }
> = {
  requested: { label: '요청', color: '#B7800A', bg: colors.yellowSoft },
  approved: { label: '승인', color: colors.success, bg: '#E3F4EA' },
  rejected: { label: '반려', color: colors.danger, bg: '#FDECEC' },
};

// 처리할 때 고르는 반려 사유
export const REJECT_REASONS = [
  '재고가 부족해요',
  '수량을 다시 확인해 주세요',
  '이미 요청된 자재예요',
  '이번 주에는 반입이 어려워요',
];

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 9/28(월)
export function shortDate(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// 필요일까지 남은 날: 'D-2', '오늘', '2일 지남'
export function dDay(ymd: string) {
  const n = daysBetween(startOfToday(), parseYMD(ymd));
  if (n === 0) {
    return { text: '오늘', overdue: false, soon: true };
  }
  return n > 0
    ? { text: `D-${n}`, overdue: false, soon: n <= 1 }
    : { text: `${-n}일 지남`, overdue: true, soon: false };
}

// 수량: 5 → '5', 2.5 → '2.5'
export const formatQty = (q: number) =>
  Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100);

// '철근 HD13 5톤 외 1건'
export function itemsSummary(items: MaterialItem[]) {
  if (items.length === 0) {
    return '';
  }
  const [first] = items;
  const head = `${first.name} ${formatQty(first.quantity)}${first.unit}`;
  return items.length > 1 ? `${head} 외 ${items.length - 1}건` : head;
}

// 지금 누구의 처리를 기다리는지
export function waitingText(m: MaterialRequest) {
  if (m.status !== 'requested') {
    return '';
  }
  if (m.canCancel && !m.canApprove && m.hqLinked) {
    return '본사 승인 대기'; // 관리자 본인 요청
  }
  return m.hqLinked ? '현장 관리자·본사 승인 대기' : '현장 관리자 승인 대기';
}

const VERB: Record<MaterialStatus, string> = {
  requested: '요청',
  approved: '승인',
  rejected: '반려',
};

export type MaterialAction = 'approve' | 'reject' | 'cancel';

interface CardProps {
  request: MaterialRequest;
  busy?: boolean;
  showSite?: boolean; // 본사 화면: 현장 이름 표시
  onAction?: (action: MaterialAction) => void;
}

export function MaterialCard({
  request: m,
  busy,
  showSite,
  onAction,
}: CardProps) {
  const meta = MATERIAL_STATUS_META[m.status];
  const open = m.status === 'requested';
  const due = m.neededBy ? dDay(m.neededBy) : null;
  const last = m.timeline[m.timeline.length - 1];

  // 로그인한 사람이 지금 할 수 있는 처리
  const actions: {
    key: MaterialAction;
    label: string;
    tone: 'primary' | 'plain' | 'danger';
  }[] = [];
  if (m.canReject) {
    actions.push({ key: 'reject', label: '반려', tone: 'danger' });
  }
  if (m.canApprove) {
    actions.push({ key: 'approve', label: '승인', tone: 'primary' });
  }
  if (m.canCancel) {
    actions.push({ key: 'cancel', label: '요청 취소', tone: 'plain' });
  }

  return (
    <View style={styles.card}>
      {showSite ? (
        <View style={styles.siteRow}>
          <Building2 size={13} color={colors.textSub} />
          <Text style={styles.siteText} numberOfLines={1}>
            {m.siteName}
          </Text>
        </View>
      ) : null}

      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>
        {m.urgent && open ? (
          <View style={[styles.badge, styles.urgent]}>
            <Siren size={12} color={colors.danger} strokeWidth={2.4} />
            <Text style={[styles.badgeText, { color: colors.danger }]}>
              긴급
            </Text>
          </View>
        ) : null}
        <View style={[styles.badge, styles.process]}>
          <Text style={styles.processText}>{m.processName ?? '공통'}</Text>
        </View>
        <Text style={styles.time}>
          {shortDate(new Date(m.createdAt))} {formatTime(m.createdAt)}
        </Text>
      </View>

      <View style={styles.items}>
        {m.items.map((it, i) => (
          <View key={`${it.name}-${i}`} style={styles.itemRow}>
            <Text style={styles.itemName} numberOfLines={1}>
              {it.name}
            </Text>
            <Text style={styles.itemQty}>
              {formatQty(it.quantity)}
              <Text style={styles.itemUnit}> {it.unit}</Text>
            </Text>
          </View>
        ))}
      </View>

      {open ? <Text style={styles.waiting}>{waitingText(m)}</Text> : null}

      {due ? (
        <View style={styles.dueRow}>
          <CalendarClock
            size={15}
            color={open && due.overdue ? colors.danger : colors.textSub}
          />
          <Text style={styles.dueText}>
            필요일 {shortDate(parseYMD(m.neededBy!))}
          </Text>
          {open ? (
            <Text
              style={[
                styles.dueTag,
                due.soon && styles.dueSoon,
                due.overdue && styles.dueOver,
              ]}
            >
              {due.text}
            </Text>
          ) : null}
        </View>
      ) : null}

      {m.note ? <Text style={styles.note}>{m.note}</Text> : null}

      <Text style={styles.people}>
        {m.author} 요청
        {last && last.status !== 'requested'
          ? `  ·  ${last.by}${last.byHq ? '(본사)' : ''} ${
              VERB[last.status]
            } ${shortDate(new Date(last.at))}`
          : ''}
      </Text>
      {m.status === 'rejected' && m.rejectReason ? (
        <View style={styles.reason}>
          <Text style={styles.reasonText}>반려 사유 · {m.rejectReason}</Text>
        </View>
      ) : null}

      {actions.length > 0 && onAction ? (
        <View style={styles.actions}>
          {busy ? (
            <ActivityIndicator color={colors.navy} style={styles.busy} />
          ) : (
            actions.map(a => (
              <Pressable
                key={a.key}
                onPress={() => onAction(a.key)}
                style={({ pressed }) => [
                  styles.action,
                  a.tone === 'primary' && styles.actionPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.actionText,
                    a.tone === 'danger' && { color: colors.danger },
                  ]}
                >
                  {a.label}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 8,
    ...shadow,
  },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  siteText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textSub },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  urgent: { backgroundColor: '#FDECEC' },
  process: { backgroundColor: colors.fill },
  processText: { fontSize: 12, fontWeight: '600', color: colors.textSub },
  time: { marginLeft: 'auto', fontSize: 12, color: colors.textMuted },

  items: { marginTop: 14, gap: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemName: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  itemQty: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  itemUnit: { fontSize: 14, fontWeight: '500', color: colors.textSub },

  waiting: {
    fontSize: 13,
    color: '#8A5E00',
    fontWeight: '600',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  dueText: { fontSize: 14, color: colors.textSub },
  dueTag: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSub,
    backgroundColor: colors.fill,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  dueSoon: { color: '#B7800A', backgroundColor: colors.yellowSoft },
  dueOver: { color: colors.danger, backgroundColor: '#FDECEC' },
  note: { fontSize: 14, color: colors.text, lineHeight: 21, marginTop: 10 },
  people: { fontSize: 12, color: colors.textMuted, marginTop: 10 },
  reason: {
    backgroundColor: '#FDECEC',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },
  reasonText: { fontSize: 13, color: colors.danger },

  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  busy: { flex: 1, height: 44 },
  action: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: colors.yellow },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.text },
  pressed: { opacity: 0.8 },
});
