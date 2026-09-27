// 서버 연결 설정: 서버 주소 / 데모 모드(서버 없이) 전환
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { CircleCheck, CircleX, Server, Smartphone } from 'lucide-react-native';
import { saveServerConfig } from '../api/buildup';
import { DEFAULT_BASE_URL, checkServer, config } from '../api/client';
import { useAuth } from '../auth';
import { useDialog } from '../components/Dialog';
import { Text } from '../components/Text';
import { AppHeader, BottomBar, Button, Field } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';

type CheckState = 'idle' | 'checking' | 'ok' | 'fail';

// 끝의 / 제거, http:// 없으면 붙이기
const normalize = (url: string) => {
  const u = url.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(u) ? u : `http://${u}`;
};

export default function ServerScreen({ navigation }: ScreenProps<'Server'>) {
  const dialog = useDialog();
  const { user, logout } = useAuth();
  const [useDummy, setUseDummy] = useState(config.useDummy);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [check, setCheck] = useState<CheckState>('idle');
  const [saving, setSaving] = useState(false);

  const onCheck = async () => {
    setCheck('checking');
    try {
      setCheck((await checkServer(normalize(baseUrl))) ? 'ok' : 'fail');
    } catch {
      setCheck('fail');
    }
  };

  const onSave = async () => {
    const next = { useDummy, baseUrl: normalize(baseUrl) };
    const changed =
      next.useDummy !== config.useDummy || next.baseUrl !== config.baseUrl;
    if (!changed) {
      navigation.goBack();
      return;
    }
    if (user) {
      const ok = await dialog.confirm({
        title: '연결을 바꿀까요?',
        message:
          '연결 대상이 바뀌면 로그아웃되고, 바뀐 곳의 계정으로 다시 로그인해야 해요.',
        confirmText: '바꾸기',
      });
      if (!ok) {
        return;
      }
    }
    setSaving(true);
    await saveServerConfig(next);
    dialog.toast(
      next.useDummy ? '데모 모드로 바꿨어요' : '서버 주소를 저장했어요',
      'success',
    );
    if (user) {
      logout(); // 로그인 화면으로
    } else {
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <AppHeader title="서버 설정" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>연결 방식</Text>
        <View style={styles.modes}>
          <ModeCard
            active={!useDummy}
            icon={
              <Server
                size={22}
                color={!useDummy ? colors.white : colors.textSub}
              />
            }
            title="서버 연결"
            desc="팀 서버(Spring Boot)와 데이터를 주고받아요"
            onPress={() => setUseDummy(false)}
          />
          <ModeCard
            active={useDummy}
            icon={
              <Smartphone
                size={22}
                color={useDummy ? colors.white : colors.textSub}
              />
            }
            title="데모 모드"
            desc="서버 없이 이 폰 안의 예시 데이터로 동작해요"
            onPress={() => setUseDummy(true)}
          />
        </View>

        {!useDummy ? (
          <>
            <Field
              label="서버 주소"
              value={baseUrl}
              onChangeText={t => {
                setBaseUrl(t);
                setCheck('idle');
              }}
              placeholder={DEFAULT_BASE_URL}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              hint="배포 서버는 https://도메인/api · 에뮬레이터는 http://10.0.2.2:8080/api · 실제 폰으로 개발할 때는 같은 와이파이에서 PC의 IP(예: http://192.168.0.10:8080/api)"
            />
            <View style={styles.checkRow}>
              <Button
                title={check === 'checking' ? '확인 중…' : '연결 확인'}
                variant="outline"
                onPress={onCheck}
                loading={check === 'checking'}
                style={styles.checkBtn}
              />
              {check === 'ok' ? (
                <View style={styles.result}>
                  <CircleCheck size={18} color={colors.success} />
                  <Text style={[styles.resultText, { color: colors.success }]}>
                    연결됐어요
                  </Text>
                </View>
              ) : check === 'fail' ? (
                <View style={styles.result}>
                  <CircleX size={18} color={colors.danger} />
                  <Text style={[styles.resultText, { color: colors.danger }]}>
                    연결 안 됨
                  </Text>
                </View>
              ) : null}
            </View>
            {check === 'fail' ? (
              <Text style={styles.help}>
                PC에서 서버가 켜져 있는지, 폰과 PC가 같은 와이파이인지, 주소의
                IP가 맞는지 확인해 주세요.
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <BottomBar>
        <Button title="저장" onPress={onSave} loading={saving} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

function ModeCard({
  active,
  icon,
  title,
  desc,
  onPress,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.mode, active && styles.modeActive]}
    >
      <View style={[styles.modeIcon, active && styles.modeIconActive]}>
        {icon}
      </View>
      <Text style={styles.modeTitle}>{title}</Text>
      <Text style={styles.modeDesc}>{desc}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { padding: 20 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSub,
    marginBottom: 8,
  },
  modes: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  mode: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 16,
  },
  modeActive: { borderColor: colors.navy },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modeIconActive: { backgroundColor: colors.navy },
  modeTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  modeDesc: {
    fontSize: 12,
    color: colors.textSub,
    marginTop: 4,
    lineHeight: 17,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkBtn: { height: 44, paddingHorizontal: 20 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultText: { fontSize: 14, fontWeight: '600' },
  help: { fontSize: 13, color: colors.textSub, lineHeight: 19, marginTop: 12 },
});
