// 보고 상세(진행률 변화·메모·사진 크게 보기·메모 수정·삭제)
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../components/Text';
import { Download, FileText, ImageOff, Trash2 } from 'lucide-react-native';
import { deleteReport, updateReportMemo } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import PhotoViewer from '../components/PhotoViewer';
import { AppHeader, Avatar, Card, IconButton } from '../components/ui';
import { WEATHER_META } from '../components/WorkLog';
import { ReviewCard } from '../components/Review';
import { fileSize } from './ReportScreen';

function InfoRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string | null;
  last?: boolean;
}) {
  return (
    <View style={[infoStyles.row, !last && infoStyles.border]}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={[infoStyles.value, !value && infoStyles.empty]}>
        {value ?? '기록 없음'}
      </Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: 11 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  label: { width: 84, fontSize: 15, color: colors.textSub },
  value: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  empty: { color: colors.textMuted, fontWeight: '400' },
});
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import { formatDate, formatTime, pct } from '../utils/format';

const GRID_GAP = 6;

// 사진 촬영 시각: 9/24 12:00
function shortTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} 촬영`;
}

export default function ReportDetailScreen({
  navigation,
  route,
}: ScreenProps<'ReportDetail'>) {
  const [report, setReport] = useState(route.params.report);
  const { width } = useWindowDimensions();
  const [viewing, setViewing] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(report.memo);
  const [busy, setBusy] = useState(false);
  const dialog = useDialog();

  const onSaveMemo = async () => {
    setBusy(true);
    try {
      setReport(await updateReportMemo(report.id, draft));
      setEditing(false);
      dialog.toast('메모를 수정했어요', 'success');
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '수정하지 못했어요',
        message: errorMessage(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const ok = await dialog.confirm({
      title: '이 보고를 삭제할까요?',
      message: `${report.processName} 진행률이 ${pct(report.to)} → ${pct(
        report.from,
      )}로 되돌아가요.`,
      confirmText: '삭제',
      danger: true,
    });
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await deleteReport(report.id);
      dialog.toast('보고를 삭제했어요');
      navigation.goBack();
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '삭제하지 못했어요',
        message: errorMessage(e),
      });
      setBusy(false);
    }
  };

  const diff = report.to - report.from;
  // 카드 안쪽 폭을 3칸으로 나눈 정사각형 썸네일
  const cell = (width - 20 * 2 - 20 * 2 - GRID_GAP * 2) / 3;

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <AppHeader
        title="보고 상세"
        onBack={() => navigation.goBack()}
        right={
          report.canDelete ? (
            <IconButton label="보고 삭제" onPress={onDelete}>
              <Trash2 size={20} color={colors.textSub} strokeWidth={2} />
            </IconButton>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {report.review ? (
          <View style={styles.reviewGap}>
            <ReviewCard report={report} onChange={setReport} />
          </View>
        ) : null}
        <Card>
          <View style={styles.authorRow}>
            <Avatar name={report.author} size={40} />
            <View style={styles.flex}>
              <Text style={styles.author}>{report.author}</Text>
              <Text style={styles.date}>
                {formatDate(new Date(report.createdAt))}{' '}
                {formatTime(report.createdAt)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.label}>진행한 작업</Text>
          <Text style={styles.work}>{report.work || report.processName}</Text>

          <Text style={[styles.label, styles.labelGap]}>현장 전체 진행률</Text>
          <View style={styles.progressRow}>
            <Text style={styles.from}>{pct(report.from)}</Text>
            <Text style={styles.arrow}>→</Text>
            <Text style={styles.to}>{pct(report.to)}</Text>
            <Text style={styles.diff}>+{diff.toFixed(1)}%p</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fillBase, { width: `${report.from}%` }]} />
            <View style={[styles.fillToday, { width: `${diff}%` }]} />
          </View>
        </Card>

        <Card style={styles.gap}>
          <Text style={styles.cardTitle}>작업 정보</Text>
          <InfoRow
            label="날씨"
            value={
              report.workLog.weather
                ? WEATHER_META[report.workLog.weather].label
                : null
            }
          />
          <InfoRow
            label="투입 인원"
            value={
              report.workLog.workers ? `${report.workLog.workers}명` : null
            }
          />
          <InfoRow label="장비" value={report.workLog.equipment || null} />
          <Pressable
            disabled={!report.location}
            onPress={() =>
              report.location &&
              Linking.openURL(
                `https://maps.google.com/?q=${report.location.latitude},${report.location.longitude}`,
              )
            }
          >
            <InfoRow
              label="제출 위치"
              value={
                report.location
                  ? `지도에서 보기${
                      report.location.accuracy
                        ? ` (오차 ${Math.round(report.location.accuracy)}m)`
                        : ''
                    }`
                  : null
              }
              last
            />
          </Pressable>
        </Card>

        <Card style={styles.gap}>
          <View style={styles.titleRow}>
            <Text style={[styles.cardTitle, styles.noMargin]}>
              작업 메모
              {report.updatedAt ? (
                <Text style={styles.edited}> 수정됨</Text>
              ) : null}
            </Text>
            {report.canEdit && !editing ? (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setDraft(report.memo);
                  setEditing(true);
                }}
              >
                <Text style={styles.link}>수정</Text>
              </Pressable>
            ) : null}
          </View>
          {editing ? (
            <>
              <TextInput
                style={styles.memoInput}
                value={draft}
                onChangeText={setDraft}
                multiline
                autoFocus
                textAlignVertical="top"
                placeholder="작업 내용, 특이사항"
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.editButtons}>
                <Pressable
                  style={[styles.smallBtn, styles.smallGhost]}
                  onPress={() => setEditing(false)}
                  disabled={busy}
                >
                  <Text style={styles.smallGhostText}>취소</Text>
                </Pressable>
                <Pressable
                  style={[styles.smallBtn, styles.smallPrimary]}
                  onPress={onSaveMemo}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.navy} />
                  ) : (
                    <Text style={styles.smallPrimaryText}>저장</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={report.memo ? styles.memo : styles.empty}>
              {report.memo || '메모가 없어요.'}
            </Text>
          )}
        </Card>

        <Card style={styles.gap}>
          <Text style={styles.cardTitle}>
            현장 사진{' '}
            <Text style={styles.count}>{report.photoUris.length}</Text>
          </Text>
          {report.photoUris.length > 0 ? (
            <View style={styles.grid}>
              {report.photoUris.map((uri, i) => {
                const taken = report.photos?.[i]?.takenAt;
                return (
                  <Pressable key={uri} onPress={() => setViewing(i)}>
                    <Image
                      source={{ uri }}
                      style={[styles.photo, { width: cell, height: cell }]}
                    />
                    {/* 촬영 시각(사진에 기록된 값) */}
                    {taken ? (
                      <View style={[styles.takenBar, { width: cell }]}>
                        <Text style={styles.takenText} numberOfLines={1}>
                          {shortTime(taken)}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.noPhoto}>
              <ImageOff size={20} color={colors.textMuted} />
              <Text style={styles.empty}>첨부된 사진이 없어요.</Text>
            </View>
          )}
        </Card>

        {report.files?.length ? (
          <Card style={styles.gap}>
            <Text style={styles.cardTitle}>
              첨부 파일 <Text style={styles.count}>{report.files.length}</Text>
            </Text>
            {report.files.map(f => (
              <Pressable
                key={f.url}
                style={({ pressed }) => [
                  styles.fileRow,
                  pressed && styles.filePressed,
                ]}
                onPress={() =>
                  Linking.openURL(f.url).catch(() =>
                    dialog.toast('파일을 열 수 있는 앱이 없어요', 'error'),
                  )
                }
                accessibilityLabel={`${f.name} 내려받기`}
              >
                <FileText size={20} color={colors.textSub} />
                <View style={styles.flex}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text style={styles.fileMeta}>{fileSize(f.size)}</Text>
                </View>
                <Download size={18} color={colors.text} />
              </Pressable>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <PhotoViewer
        uris={report.photoUris}
        index={viewing}
        onClose={() => setViewing(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  gap: { marginTop: 12 },
  reviewGap: { marginBottom: 12 },
  takenBar: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderBottomLeftRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  takenText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  author: { fontSize: 16, fontWeight: '700', color: colors.text },
  date: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 18 },
  label: { fontSize: 13, color: colors.textSub },
  labelGap: { marginTop: 18 },
  work: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 26,
    marginTop: 4,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 6,
  },
  from: { fontSize: 18, color: colors.textSub },
  arrow: { fontSize: 16, color: colors.textMuted },
  to: { fontSize: 26, fontWeight: '800', color: colors.text },
  diff: {
    marginLeft: 'auto',
    fontSize: 15,
    fontWeight: '700',
    color: '#B7800A',
  },
  track: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: 14,
  },
  fillBase: { height: '100%', backgroundColor: colors.navy },
  fillToday: { height: '100%', backgroundColor: colors.yellow },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  count: { color: colors.textMuted, fontWeight: '600' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  noMargin: { marginBottom: 0 },
  edited: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  link: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  memoInput: {
    minHeight: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navy,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  smallBtn: {
    height: 38,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallGhost: { borderWidth: 1, borderColor: colors.border },
  smallGhostText: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  smallPrimary: { backgroundColor: colors.yellow },
  smallPrimaryText: { fontSize: 14, fontWeight: '700', color: colors.navy },
  memo: { fontSize: 15, color: colors.text, lineHeight: 23 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.fill,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  filePressed: { opacity: 0.7 },
  fileName: { fontSize: 14, fontWeight: '600', color: colors.text },
  fileMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  empty: { fontSize: 14, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  photo: { borderRadius: radius.sm, backgroundColor: colors.track },
  noPhoto: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
