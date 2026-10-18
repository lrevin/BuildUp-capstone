// 총관리자: 현장 정보 수정·현장 위치·본사 연결·현장 삭제
import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { Building2, Calculator, MapPin, Trash2 } from 'lucide-react-native';
import { currentPlace } from '../location';
import {
  deleteSite,
  fetchSite,
  setSiteLocation,
  linkCompany,
  previewCompany,
  unlinkCompany,
  updateSite,
} from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import { AppHeader, BottomBar, Button, Field } from '../components/ui';
import WorkTypePicker from '../components/WorkTypePicker';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';

export default function SiteSettingsScreen({
  navigation,
  route,
}: ScreenProps<'SiteSettings'>) {
  const { siteId } = route.params;
  const [loaded, setLoaded] = useState<{
    name: string;
    address: string;
    workType: string;
  }>();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [workType, setWorkType] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hqName, setHqName] = useState<string | null>(null);
  const [hqCode, setHqCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [place, setPlace] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [modeText, setModeText] = useState<string | null>(null);
  const dialog = useDialog();

  // 진행률 계산 방식(바꾸고 돌아오면 다시 불러온다)
  useFocusEffect(
    useCallback(() => {
      fetchSite(siteId)
        .then(s =>
          setModeText(
            s.progressMode === 'auto'
              ? `자동 계산 (공정 가중치) · 공정 ${s.processes?.length ?? 0}개`
              : '직접 입력 (보고하는 사람이 판단)',
          ),
        )
        .catch(() => {});
    }, [siteId]),
  );

  useEffect(() => {
    fetchSite(siteId)
      .then(s => {
        setLoaded({
          name: s.name,
          address: s.address,
          workType: s.workType ?? '',
        });
        setWorkType(s.workType ?? '');
        setHqName(s.hqName);
        setPlace(
          s.latitude != null && s.longitude != null
            ? { latitude: s.latitude, longitude: s.longitude }
            : null,
        );
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
    (name.trim() !== loaded.name ||
      address.trim() !== loaded.address ||
      workType !== loaded.workType);

  const onSave = async () => {
    if (!name.trim() || !address.trim()) {
      dialog.toast('현장명과 주소를 입력해 주세요', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateSite(siteId, {
        name,
        address,
        workType: workType || undefined,
      });
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

  // 현장 위치: 현장에 서서 누르면 지금 GPS 위치를 저장 → 보고 위치가 현장과 먼지 확인하는 기준
  const onSavePlace = async () => {
    setLocating(true);
    try {
      const p = await currentPlace();
      if (!p) {
        dialog.notice({
          icon: 'danger',
          title: '위치를 찾지 못했어요',
          message: '위치 권한을 허용하고, GPS가 켜져 있는지 확인해 주세요.',
        });
        return;
      }
      const ok = await dialog.confirm({
        title: '지금 위치를 현장 위치로 저장할까요?',
        message: `현장에 있을 때 저장해 주세요.${
          p.accuracy ? ` (오차 약 ${p.accuracy}m)` : ''
        }\n이 위치에서 1km 넘게 떨어져 제출한 보고에는 확인 표시가 붙어요.`,
        confirmText: '저장',
      });
      if (!ok) {
        return;
      }
      const s = await setSiteLocation(siteId, p);
      setPlace(
        s.latitude != null && s.longitude != null
          ? { latitude: s.latitude, longitude: s.longitude }
          : null,
      );
      dialog.toast('현장 위치를 저장했어요', 'success');
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '저장하지 못했어요',
        message: errorMessage(e),
      });
    } finally {
      setLocating(false);
    }
  };

  const onClearPlace = async () => {
    setLocating(true);
    try {
      await setSiteLocation(siteId, null);
      setPlace(null);
      dialog.toast('현장 위치를 지웠어요');
    } catch (e) {
      dialog.toast(errorMessage(e), 'error');
    } finally {
      setLocating(false);
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
            <WorkTypePicker value={workType} onChange={setWorkType} />
            <Field label="현장명" value={name} onChangeText={setName} />
            <Field
              label="현장 주소"
              value={address}
              onChangeText={setAddress}
            />

            {/* 진행률 계산 방식 */}
            <View style={[styles.hq, styles.placeBox]}>
              <View style={styles.hqTitleRow}>
                <Calculator size={18} color={colors.text} />
                <Text style={styles.hqTitle}>진행률 계산 방식</Text>
              </View>
              <Text style={styles.hqDesc}>{modeText ?? '불러오는 중…'}</Text>
              <Button
                title="계산 방식·공정 가중치 바꾸기"
                variant="outline"
                onPress={() => navigation.navigate('ProgressMode', { siteId })}
                style={styles.hqBtn}
              />
            </View>

            {/* 현장 위치 */}
            <View style={[styles.hq, styles.placeBox]}>
              <View style={styles.hqTitleRow}>
                <MapPin size={18} color={colors.text} />
                <Text style={styles.hqTitle}>현장 위치</Text>
              </View>
              <Text style={styles.hqDesc}>
                {place
                  ? `저장됨 (${place.latitude.toFixed(
                      5,
                    )}, ${place.longitude.toFixed(
                      5,
                    )}). 여기서 1km 넘게 떨어져 제출한 보고에는 확인 표시가 붙어요.`
                  : '현장에 서서 저장하면, 현장이 아닌 곳에서 제출하거나 찍은 사진을 알려 줘요.'}
              </Text>
              <View style={styles.hqRow}>
                <Button
                  title={
                    place
                      ? '지금 위치로 다시 저장'
                      : '지금 위치를 현장 위치로 저장'
                  }
                  variant="outline"
                  onPress={onSavePlace}
                  loading={locating}
                  style={[styles.hqBtn, styles.flex]}
                />
                {place ? (
                  <Button
                    title="지우기"
                    variant="outline"
                    onPress={onClearPlace}
                    disabled={locating}
                    style={styles.hqBtn}
                  />
                ) : null}
              </View>
            </View>

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
  placeBox: { marginBottom: 12 },
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
