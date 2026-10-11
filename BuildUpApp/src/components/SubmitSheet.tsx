// 보고 제출 전 확인 시트
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from './Text';
import {
  Camera,
  CircleAlert,
  NotebookPen,
  Paperclip,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { splitWorks } from '../utils/works';

interface Props {
  visible: boolean;
  siteName: string;
  work: string; // 진행한 작업('방수, 도배')
  from: number;
  to: number;
  photoCount: number;
  fileCount: number;
  memo: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export default function SubmitSheet(props: Props) {
  const insets = useSafeAreaInsets();
  const diff = props.to - props.from;
  const memo = props.memo.trim();
  const warnings = [
    diff <= 0 ? '진행률 변화가 없어요' : null,
    props.photoCount === 0 ? '사진이 없어요' : null,
  ].filter(Boolean);

  // 제출 중에는 닫기 막기
  const close = () => {
    if (!props.submitting) {
      props.onClose();
    }
  };

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>보고를 제출할까요?</Text>
        <Text style={styles.subtitle}>{props.siteName}</Text>

        {/* 진행률 변화 요약 */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            {/* 진행한 작업 */}
            <Text style={styles.workText} numberOfLines={3}>
              {splitWorks(props.work)
                .join(' · ')}
            </Text>
            <View style={[styles.diffChip, diff <= 0 && styles.diffZero]}>
              <Text style={[styles.diffText, diff <= 0 && styles.diffZeroText]}>
                +{diff.toFixed(1)}%p
              </Text>
            </View>
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.from}>{props.from.toFixed(1)}%</Text>
            <Text style={styles.arrow}>→</Text>
            <Text style={styles.to}>{props.to.toFixed(1)}%</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fillBase, { width: `${props.from}%` }]} />
            <View style={[styles.fillToday, { width: `${diff}%` }]} />
          </View>
        </View>

        {/* 첨부 내용 */}
        <View style={styles.row}>
          <Camera size={18} color={colors.textMuted} />
          <Text style={styles.rowLabel}>사진</Text>
          <Text style={styles.rowValue}>{props.photoCount}장</Text>
        </View>
        {props.fileCount > 0 ? (
          <View style={styles.row}>
            <Paperclip size={18} color={colors.textMuted} />
            <Text style={styles.rowLabel}>파일</Text>
            <Text style={styles.rowValue}>{props.fileCount}개</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <NotebookPen size={18} color={colors.textMuted} />
          <Text style={styles.rowLabel}>메모</Text>
          <Text
            style={[styles.rowValue, !memo && styles.rowEmpty]}
            numberOfLines={2}
          >
            {memo || '없음'}
          </Text>
        </View>

        {/* 빠뜨리기 쉬운 항목 안내(제출은 가능) */}
        {warnings.length > 0 ? (
          <View style={styles.warn}>
            <CircleAlert size={16} color="#B7800A" />
            <Text style={styles.warnText}>
              {warnings.join(' · ')} — 그래도 제출할 수 있어요
            </Text>
          </View>
        ) : null}

        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [
              styles.btn,
              styles.btnCancel,
              pressed && styles.pressed,
            ]}
            onPress={close}
            disabled={props.submitting}
          >
            <Text style={styles.btnCancelText}>다시 확인</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.btn,
              styles.btnPrimary,
              pressed && styles.pressed,
            ]}
            onPress={props.onSubmit}
            disabled={props.submitting}
          >
            {props.submitting ? (
              <ActivityIndicator color={colors.navy} />
            ) : (
              <Text style={styles.btnPrimaryText}>제출하기</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  workText: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 23 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 18,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSub, marginTop: 4 },

  hero: {
    backgroundColor: colors.fill,
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 18,
    marginBottom: 8,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  diffChip: {
    backgroundColor: colors.yellowSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  diffZero: { backgroundColor: colors.white },
  diffText: { fontSize: 13, fontWeight: '700', color: '#B7800A' },
  diffZeroText: { color: colors.textMuted },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 12,
  },
  from: { fontSize: 18, color: colors.textSub },
  arrow: { fontSize: 16, color: colors.textMuted },
  to: { fontSize: 28, fontWeight: '800', color: colors.text },
  track: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
    overflow: 'hidden',
    marginTop: 12,
  },
  fillBase: { height: '100%', backgroundColor: colors.navy },
  fillToday: { height: '100%', backgroundColor: colors.yellow },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  rowLabel: { width: 36, fontSize: 15, color: colors.textSub },
  rowValue: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  rowEmpty: { color: colors.textMuted, fontWeight: '400' },

  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.yellowSoft,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  warnText: { flex: 1, fontSize: 13, color: '#8A5E00', fontWeight: '600' },

  buttons: { flexDirection: 'row', gap: 8, marginTop: 18 },
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  btnCancel: { flex: 1, backgroundColor: colors.fill },
  btnCancelText: { fontSize: 16, fontWeight: '600', color: colors.textSub },
  btnPrimary: { flex: 2, backgroundColor: colors.yellow },
  btnPrimaryText: { fontSize: 16, fontWeight: '700', color: colors.navy },
});
