// 총관리자: 현장 정보 수정·본사 연결·현장 삭제
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { Building2, Trash2 } from 'lucide-react-native';
import {
  deleteSite,
  fetchSite,
  linkCompany,
  previewCompany,
  unlinkCompany,
  updateSite,
} from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import { AppHeader, BottomBar, Button, Field } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';

export default function SiteSettingsScreen({
  navigation,
  route,
}: ScreenProps<'SiteSettings'>) {
  const { siteId } = route.params;
  const [loaded, setLoaded] = useState<{ name: string; address: string }>();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hqName, setHqName] = useState<string | null>(null);
  const [hqCode, setHqCode] = useState('');
  const [linking, setLinking] = useState(false);
  const dialog = useDialog();

  useEffect(() => {
    fetchSite(siteId)
      .then(s => {
        setLoaded({ name: s.name, address: s.address });
        setHqName(s.hqName);
        setName(s.name);
        setAddress(s.address);
      })
      .catch(e => {
        dialog.toast(errorMessage(e), 'error');
        navigation.goBack();
      });
  }, [siteId, navigation, dialog]);

  const changed =
    !!loaded &&
    (name.trim() !== loaded.name || address.trim() !== loaded.address);

  const onSave = async () => {
    if (!name.trim() || !address.trim()) {
      dialog.toast('현장명과 주소를 입력해 주세요', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateSite(siteId, { name, address });
      dialog.toast('현장 정보를 저장했어요', 'success');
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

  // 본사 코드 → 본사명 확인 → 연결
  const onLink = async () => {
    if (!/^\d{6}$/.test(hqCode)) {
      dialog.toast('본사 코드 6자리를 입력해 주세요', 'error');
      return;
    }
    setLinking(true);
    try {
      const companyName = await previewCompany(hqCode);
      const ok = await dialog.confirm({
        title: `'${companyName}'에 연결할까요?`,
        message:
          '연결하면 이 현장의 진척 보고와 자재 요청을 본사에서 보고, 자재 요청을 본사에서도 승인·반려할 수 있어요.',
        confirmText: '연결',
      });
      if (ok) {
        const s = await linkCompany(siteId, hqCode);
        setHqName(s.hqName);
        setHqCode('');
        dialog.toast('본사에 연결했어요', 'success');
      }
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '연결하지 못했어요',
        message: errorMessage(e),
      });
    } finally {
      setLinking(false);
    }
  };

  const onUnlink = async () => {
    const ok = await dialog.confirm({
      title: '본사 연결을 해제할까요?',
      message: `'${hqName}'에서 이 현장의 보고와 자재 요청을 더 이상 볼 수 없어요. 자재 요청은 현장 총관리자가 승인·반려해요.`,
      confirmText: '해제',
      danger: true,
    });
    if (!ok) {
      return;
    }
    setLinking(true);
    try {
      const s = await unlinkCompany(siteId);
      setHqName(s.hqName);
      dialog.toast('본사 연결을 해제했어요');
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '해제하지 못했어요',
        message: errorMessage(e),
      });
    } finally {
      setLinking(false);
    }
  };

  const onDelete = async () => {
    const ok = await dialog.confirm({
      icon: 'danger',
      title: '현장을 삭제할까요?',
      message: `'${loaded?.name}'의 보고 이력과 참여자 정보가 모두 삭제되며 되돌릴 수 없어요.`,
      confirmText: '삭제',
      danger: true,
    });
    if (!ok) {
      return;
    }
    setDeleting(true);
    try {
      await deleteSite(siteId);
      dialog.toast('현장을 삭제했어요');
      navigation.popTo('Sites');
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '삭제하지 못했어요',
        message: errorMessage(e),
      });
      setDeleting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <AppHeader title="현장 설정" onBack={() => navigation.goBack()} />
      {!loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.navy} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            <Field label="현장명" value={name} onChangeText={setName} />
            <Field
              label="현장 주소"
              value={address}
              onChangeText={setAddress}
            />

            {/* 본사 연결 */}
            <View style={styles.hq}>
              <View style={styles.hqTitleRow}>
                <Building2 size={18} color={colors.text} />
                <Text style={styles.hqTitle}>본사 연결</Text>
              </View>
              {hqName ? (
                <>
                  <Text style={styles.hqDesc}>
                    <Text style={styles.hqName}>{hqName}</Text>에 연결되어
                    있어요. 이 현장의 보고와 자재 요청이 본사로 올라가요.
                  </Text>
                  <Button
                    title="연결 해제"
                    variant="outline"
                    onPress={onUnlink}
                    loading={linking}
                    style={styles.hqBtn}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.hqDesc}>
                    본사 관계자에게 받은 6자리 본사 코드를 입력하면 현장 보고와
                    자재 요청을 본사에서 받아 볼 수 있어요.
                  </Text>
                  <View style={styles.hqRow}>
                    <View style={styles.flex}>
                      <Field
                        label="본사 코드"
                        value={hqCode}
                        onChangeText={t =>
                          setHqCode(t.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="6자리 숫자"
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                    </View>
                    <Button
                      title="연결"
                      variant="dark"
                      onPress={onLink}
                      loading={linking}
                      disabled={hqCode.length !== 6}
                      style={styles.hqLinkBtn}
                    />
                  </View>
                </>
              )}
            </View>

            <View style={styles.danger}>
              <Text style={styles.dangerTitle}>현장 삭제</Text>
              <Text style={styles.dangerDesc}>
                보고 이력과 참여자 정보가 모두 삭제되며 되돌릴 수 없어요.
              </Text>
              <Pressable
                style={styles.dangerBtn}
                onPress={onDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <>
                    <Trash2 size={16} color={colors.danger} />
                    <Text style={styles.dangerBtnText}>이 현장 삭제</Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>
          <BottomBar>
            <Button
              title="저장"
              onPress={onSave}
              loading={saving}
              disabled={!changed}
            />
          </BottomBar>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  loading: { marginTop: 40 },
  body: { padding: 20 },
  flex: { flex: 1 },
  hq: {
    marginTop: 8,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.fill,
  },
  hqTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hqTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  hqDesc: {
    fontSize: 13,
    color: colors.textSub,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 12,
  },
  hqName: { fontWeight: '700', color: colors.text },
  hqBtn: { height: 44 },
  hqRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  hqLinkBtn: { height: 50, marginTop: 21, paddingHorizontal: 22 },
  danger: {
    marginTop: 24,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#F6D5D6',
    backgroundColor: '#FFF8F8',
  },
  dangerTitle: { fontSize: 15, fontWeight: '700', color: colors.danger },
  dangerDesc: {
    fontSize: 13,
    color: colors.textSub,
    marginTop: 4,
    lineHeight: 19,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#F0B8BA',
    backgroundColor: colors.white,
  },
  dangerBtnText: { fontSize: 14, fontWeight: '700', color: colors.danger },
});
