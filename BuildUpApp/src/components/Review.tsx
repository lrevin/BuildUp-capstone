// 보고 검토(승인·보완 요청) 배지와 검토 카드, 촬영 정보 확인 결과
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquareWarning,
} from 'lucide-react-native';
import { reviewReport } from '../api/buildup';
import { errorMessage } from '../api/client';
import { colors, radius } from '../theme';
import { Report, ReportCheck, ReviewStatus } from '../types';
import { formatDate, formatTime } from '../utils/format';
import { useDialog } from './Dialog';
import { Text } from './Text';

export const REVIEW_META: Record<
  ReviewStatus,
  { label: string; bg: string; fg: string }
> = {
  pending: { label: '검토 대기', bg: '#EAF0FF', fg: '#3457D5' },
  approved: { label: '승인', bg: '#E5F6EC', fg: '#1E8E4F' },
  revision: { label: '보완 요청', bg: '#FFF1DC', fg: '#C26D00' },
};

/** 보고 카드 오른쪽 위 작은 배지(승인·대기·보완 요청) */
export function ReviewBadge({ status }: { status?: ReviewStatus }) {
  if (!status) {
    return null;
  }
  const m = REVIEW_META[status];
  return (
    <View style={[styles.badge, { backgroundColor: m.bg }]}>
      <Text style={[styles.badgeText, { color: m.fg }]}>{m.label}</Text>
    </View>
  );
}

/** 촬영 시각·위치로 찾은 의심스러운 점 목록 */
export function CheckList({ checks }: { checks?: ReportCheck[] }) {
  if (!checks?.length) {
    return null;
  }
  return (
    <View style={styles.checks}>
      {checks.map(c => (
        <View key={c.type} style={styles.checkRow}>
          <AlertTriangle size={16} color="#C26D00" />
          <Text style={styles.checkText}>{c.message}</Text>
        </View>
      ))}
    </View>
  );
}

const QUICK_REASONS = [
  '사진을 현장에서 다시 찍어 주세요',
  '진행률을 다시 확인해 주세요',
  '작업 메모를 자세히 적어 주세요',
];

/**
 * 보고 상세의 검토 카드
 * - 검토할 수 있는 사람(본사·현장 총관리자): 승인 / 보완 요청(코멘트)
 * - 작성자: 보완 요청을 받으면 메모를 고쳐 다시 검토 요청
 */
export function ReviewCard({
  report,
  onChange,
}: {
  report: Report;
  onChange: (next: Report) => void;
}) {
  const dialog = useDialog();
  const [writing, setWriting] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'approved' | 'revision' | null>(null);
  const review = report.review;
  if (!review) {
    return null;
  }
  const meta = REVIEW_META[review.status];
  const Icon =
    review.status === 'approved'
      ? CheckCircle2
      : review.status === 'revision'
      ? MessageSquareWarning
      : Clock;

  const send = async (status: 'approved' | 'revision') => {
    if (status === 'revision' && !comment.trim()) {
      dialog.toast('무엇을 보완해야 하는지 적어 주세요', 'error');
      return;
    }
    setBusy(status);
    try {
      const next = await reviewReport(report.id, status, comment.trim());
      onChange(next);
      setWriting(false);
      setComment('');
      dialog.toast(
        status === 'approved' ? '보고를 승인했어요' : '보완을 요청했어요',
        'success',
      );
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '처리하지 못했어요',
        message: errorMessage(e),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.card, { borderColor: meta.fg + '33' }]}>
      <View style={styles.head}>
        <Icon size={20} color={meta.fg} />
        <Text style={[styles.status, { color: meta.fg }]}>{meta.label}</Text>
        {review.reviewer && review.reviewedAt && review.status !== 'pending' ? (
          <Text style={styles.by} numberOfLines={1}>
            {review.reviewer} · {formatDate(new Date(review.reviewedAt))}{' '}
            {formatTime(review.reviewedAt)}
          </Text>
        ) : null}
      </View>

      {review.comment ? (
        <Text style={styles.comment}>
          {/* 보완해서 다시 올린 보고: 전에 받은 보완 요청 */}
          {review.status === 'pending' ? (
            <Text style={styles.prev}>이전 보완 요청 · </Text>
          ) : null}
          “{review.comment}”
        </Text>
      ) : null}

      {review.status === 'revision' && report.canEdit ? (
        <Text style={styles.hint}>
          아래 작업 메모를 수정해 보완하면 다시 검토를 요청해요.
        </Text>
      ) : null}
      {review.status === 'pending' && !report.canReview ? (
        <Text style={styles.hint}>본사나 현장 총관리자가 확인하고 있어요.</Text>
      ) : null}

      <CheckList checks={report.checks} />

      {report.canReview ? (
        writing ? (
          <View style={styles.writeBox}>
            <View style={styles.quick}>
              {QUICK_REASONS.map(r => (
                <Pressable
                  key={r}
                  style={styles.quickChip}
                  onPress={() => setComment(r)}
                >
                  <Text style={styles.quickText}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={comment}
              onChangeText={setComment}
              placeholder="무엇을 보완해야 하나요?"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <View style={styles.buttons}>
              <Pressable
                style={[styles.btn, styles.ghost]}
                onPress={() => setWriting(false)}
                disabled={!!busy}
              >
                <Text style={styles.ghostText}>취소</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.revision]}
                onPress={() => send('revision')}
                disabled={!!busy}
              >
                {busy === 'revision' ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.revisionText}>보완 요청 보내기</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.buttons}>
            <Pressable
              style={[styles.btn, styles.ghost, styles.flex]}
              onPress={() => setWriting(true)}
              disabled={!!busy}
            >
              <Text style={styles.ghostText}>보완 요청</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.approve, styles.flex]}
              onPress={() => send('approved')}
              disabled={!!busy}
            >
              {busy === 'approved' ? (
                <ActivityIndicator color={colors.navy} />
              ) : (
                <Text style={styles.approveText}>승인</Text>
              )}
            </Pressable>
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 18,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 16, fontWeight: '800' },
  by: { flex: 1, textAlign: 'right', fontSize: 12, color: colors.textMuted },
  comment: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginTop: 10,
  },
  prev: { fontSize: 13, fontWeight: '700', color: colors.textSub },
  hint: { fontSize: 13, color: colors.textSub, marginTop: 8, lineHeight: 19 },
  checks: {
    backgroundColor: '#FFF8EC',
    borderRadius: radius.sm,
    padding: 12,
    gap: 6,
    marginTop: 12,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  checkText: { flex: 1, fontSize: 13, color: '#8A4B00', lineHeight: 19 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: {
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ghost: { borderWidth: 1, borderColor: colors.border },
  ghostText: { fontSize: 15, fontWeight: '700', color: colors.textSub },
  approve: { backgroundColor: colors.yellow },
  approveText: { fontSize: 15, fontWeight: '800', color: colors.navy },
  revision: { flex: 1, backgroundColor: '#C26D00' },
  revisionText: { fontSize: 15, fontWeight: '800', color: colors.white },
  writeBox: { marginTop: 12 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  quickChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  quickText: { fontSize: 12, color: colors.textSub },
  input: {
    minHeight: 80,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navy,
    padding: 12,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
});
