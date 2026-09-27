// 작업자: 6자리 코드 입력 → 현장 미리보기 → 참여
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { Building2, CircleAlert } from 'lucide-react-native';
import { joinSiteByCode, previewSiteByCode } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import CodeInput, { CODE_LENGTH } from '../components/CodeInput';
import { AppHeader, BottomBar, Button } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import { SitePreview } from '../types';

export default function JoinSiteScreen({
  navigation,
}: ScreenProps<'JoinSite'>) {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<SitePreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const dialog = useDialog();

  // 6자리를 다 입력하면 자동으로 현장 확인
  useEffect(() => {
    setPreview(null);
    setError(null);
    setChecking(false);
    if (code.length !== CODE_LENGTH) {
      return;
    }
    let cancelled = false;
    setChecking(true);
    previewSiteByCode(code)
      .then(p => !cancelled && setPreview(p))
      .catch(e => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [code]);

  const onJoin = async () => {
    if (!preview) {
      return;
    }
    if (preview.alreadyJoined) {
      navigation.replace('Report', { siteId: preview.id });
      return;
    }
    setJoining(true);
    try {
      const site = await joinSiteByCode(code);
      dialog.toast(`'${site.name}'에 참여했어요`, 'success');
      navigation.replace('Report', { siteId: site.id });
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '참여하지 못했어요',
        message: errorMessage(e),
      });
      setJoining(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <AppHeader title="현장 참여" onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        <Text style={styles.title}>참여 코드를 입력해 주세요</Text>
        <Text style={styles.subtitle}>현장 관리자에게 받은 6자리 숫자예요</Text>

        <CodeInput value={code} onChange={setCode} error={!!error} />

        <View style={styles.result}>
          {checking ? <ActivityIndicator color={colors.textSub} /> : null}
          {error ? (
            <View style={styles.errorRow}>
              <CircleAlert size={16} color={colors.danger} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}
          {preview ? (
            <View style={styles.card}>
              <View style={styles.cardIcon}>
                <Building2 size={22} color={colors.textSub} strokeWidth={1.8} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.siteName}>{preview.name}</Text>
                <Text style={styles.address}>{preview.address}</Text>
                <Text style={styles.meta}>
                  관리자 {preview.ownerName} · {preview.memberCount}명 참여 중
                </Text>
                {preview.alreadyJoined ? (
                  <Text style={styles.joined}>이미 참여 중인 현장이에요</Text>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <BottomBar>
        <Button
          title={
            preview?.alreadyJoined ? '현장으로 이동' : '이 현장에 참여하기'
          }
          onPress={onJoin}
          disabled={!preview}
          loading={joining}
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  body: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 8 },
  subtitle: {
    fontSize: 14,
    color: colors.textSub,
    marginTop: 6,
    marginBottom: 28,
  },
  result: { marginTop: 20 },
  errorRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  error: { flex: 1, fontSize: 14, color: colors.danger, lineHeight: 20 },
  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.fill,
    borderRadius: radius.lg,
    padding: 16,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  siteName: { fontSize: 17, fontWeight: '700', color: colors.text },
  address: { fontSize: 13, color: colors.textSub, marginTop: 3 },
  meta: { fontSize: 13, color: colors.textSub, marginTop: 8 },
  joined: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 6 },
});
