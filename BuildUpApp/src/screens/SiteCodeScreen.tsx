// 총관리자: 참여 코드 확인·공유·재발급
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { CircleCheck, RefreshCw } from 'lucide-react-native';
import { regenerateCode } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import { AppHeader, BottomBar, Button } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';

export default function SiteCodeScreen({
  navigation,
  route,
}: ScreenProps<'SiteCode'>) {
  const { siteId, siteName, isNew } = route.params;
  const [code, setCode] = useState(route.params.code);
  const [regenerating, setRegenerating] = useState(false);
  const dialog = useDialog();

  const onShare = () =>
    Share.share({
      message:
        `[Build Up] '${siteName}' 현장에 초대합니다.\n\n` +
        `참여 코드: ${code}\n\n` +
        'Build Up 앱 로그인 → "코드로 현장 참여"에서 위 코드를 입력하세요.',
    });

  const onRegenerate = () =>
    dialog
      .confirm({
        title: '코드를 새로 발급할까요?',
        message:
          '기존 코드로는 더 이상 참여할 수 없어요.\n이미 참여한 작업자는 그대로 유지돼요.',
        confirmText: '재발급',
      })
      .then(async ok => {
        if (!ok) {
          return;
        }
        setRegenerating(true);
        try {
          setCode(await regenerateCode(siteId));
          dialog.toast('새 코드를 발급했어요', 'success');
        } catch (e) {
          dialog.notice({
            icon: 'danger',
            title: '코드를 발급하지 못했어요',
            message: errorMessage(e),
          });
        } finally {
          setRegenerating(false);
        }
      });

  return (
    <View style={styles.root}>
      <AppHeader title="참여 코드" onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        {isNew ? (
          <View style={styles.done}>
            <CircleCheck size={18} color={colors.success} />
            <Text style={styles.doneText}>현장이 만들어졌어요</Text>
          </View>
        ) : null}
        <Text style={styles.siteName}>{siteName}</Text>
        <Text style={styles.desc}>
          아래 코드를 작업자에게 공유하세요.{'\n'}
          코드를 입력한 작업자만 이 현장을 볼 수 있어요.
        </Text>

        <View style={styles.codeRow}>
          {code.split('').map((d, i) => (
            <View key={i} style={styles.codeBox}>
              <Text style={styles.codeDigit}>{d}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={styles.regen}
          onPress={onRegenerate}
          disabled={regenerating}
          hitSlop={8}
        >
          {regenerating ? (
            <ActivityIndicator size="small" color={colors.textSub} />
          ) : (
            <RefreshCw size={14} color={colors.textSub} />
          )}
          <Text style={styles.regenText}>코드 재발급</Text>
        </Pressable>

        <View style={styles.steps}>
          <Text style={styles.stepsTitle}>작업자 참여 방법</Text>
          <Step n={1} text="'코드 공유하기'로 카톡·문자 전송" />
          <Step n={2} text="작업자가 Build Up 가입 후 로그인" />
          <Step n={3} text="'코드로 현장 참여'에 6자리 입력" />
        </View>
      </View>

      <BottomBar>
        <Button title="코드 공유하기" onPress={onShare} />
        {isNew ? (
          <Button
            title="현장으로 이동"
            variant="outline"
            onPress={() => navigation.replace('Report', { siteId })}
          />
        ) : null}
      </BottomBar>
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepNum}>{n}</Text>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { flex: 1, padding: 20 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  doneText: { fontSize: 14, fontWeight: '600', color: colors.success },
  siteName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
  },
  desc: { fontSize: 14, color: colors.textSub, marginTop: 8, lineHeight: 21 },
  codeRow: { flexDirection: 'row', gap: 8, marginTop: 28 },
  codeBox: {
    flex: 1,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDigit: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  regen: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: 16,
    padding: 6,
  },
  regenText: { fontSize: 13, color: colors.textSub },
  steps: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
    marginTop: 28,
  },
  stepsTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: {
    width: 20,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  stepText: { fontSize: 14, color: colors.textSub },
});
