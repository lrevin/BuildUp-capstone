import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { config, errorMessage } from '../api/client';
import { useAuth } from '../auth';
import { useDialog } from '../components/Dialog';
import { Button, Field, Logo } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';

export default function LoginScreen({ navigation }: ScreenProps<'Login'>) {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // 서버 설정에서 연결을 바꾸고 돌아오면 아래 '데모 모드 / 서버 주소' 표시를 다시 그린다
  const [, setConfigShown] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setConfigShown(n => n + 1);
    }, []),
  );
  const dialog = useDialog();

  const onLogin = async () => {
    if (!email.trim() || !password) {
      dialog.toast('이메일과 비밀번호를 입력해 주세요', 'error');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '로그인하지 못했어요',
        message: errorMessage(e),
      });
      setLoading(false);
    }
  };

  const fill = (e: string) => {
    setEmail(e);
    setPassword('1234');
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Logo size={48} />
        <Text style={styles.title}>
          현장 진척도 보고,{'\n'}Build Up으로 간단하게
        </Text>
        <Text style={styles.subtitle}>이메일로 로그인해 주세요</Text>

        <View style={styles.form}>
          <Field
            label="이메일"
            value={email}
            onChangeText={setEmail}
            placeholder="example@buildup.kr"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Field
            label="비밀번호"
            value={password}
            onChangeText={setPassword}
            placeholder="비밀번호"
            secureTextEntry
            onSubmitEditing={onLogin}
          />
          <Button title="로그인" onPress={onLogin} loading={loading} />

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>계정이 없으신가요?</Text>
            <Pressable
              hitSlop={8}
              onPress={() => navigation.navigate('RoleSelect')}
            >
              <Text style={styles.signupLink}>회원가입</Text>
            </Pressable>
          </View>
        </View>

        {/* 테스트 계정(데모 모드와 서버의 데모 데이터 모두 같은 계정) */}
        <View style={styles.demo}>
          <Text style={styles.demoTitle}>테스트 계정 · 비밀번호 1234</Text>
          <Pressable
            style={styles.demoItem}
            onPress={() => fill('hq@buildup.kr')}
          >
            <Text style={styles.demoRole}>본사</Text>
            <Text style={styles.demoEmail}>hq@buildup.kr</Text>
          </Pressable>
          <Pressable
            style={styles.demoItem}
            onPress={() => fill('admin@buildup.kr')}
          >
            <Text style={styles.demoRole}>관리자</Text>
            <Text style={styles.demoEmail}>admin@buildup.kr</Text>
            <Text style={styles.demoNote}>본사 보고</Text>
          </Pressable>
          <Pressable
            style={styles.demoItem}
            onPress={() => fill('park@buildup.kr')}
          >
            <Text style={styles.demoRole}>관리자</Text>
            <Text style={styles.demoEmail}>park@buildup.kr</Text>
            <Text style={styles.demoNote}>최고 책임자</Text>
          </Pressable>
          <Pressable
            style={styles.demoItem}
            onPress={() => fill('worker@buildup.kr')}
          >
            <Text style={styles.demoRole}>작업자</Text>
            <Text style={styles.demoEmail}>worker@buildup.kr</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.server}
          hitSlop={8}
          onPress={() => navigation.navigate('Server')}
        >
          <Text style={styles.serverText}>
            {config.useDummy
              ? '데모 모드 (서버 없이)'
              : `서버 ${config.baseUrl
                  .replace(/^https?:\/\//, '')
                  .replace(/\/api$/, '')}`}
            {'  ·  '}
            <Text style={styles.serverLink}>변경</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 34,
    marginTop: 20,
  },
  subtitle: { fontSize: 15, color: colors.textSub, marginTop: 8 },
  form: { marginTop: 36 },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  signupText: { fontSize: 14, color: colors.textSub },
  signupLink: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textDecorationLine: 'underline',
  },
  demo: { marginTop: 'auto', paddingTop: 32 },
  server: { alignSelf: 'center', marginTop: 16, padding: 4 },
  serverText: { fontSize: 12, color: colors.textMuted },
  serverLink: { fontWeight: '700', color: colors.textSub },
  demoTitle: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  demoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.fill,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  demoRole: { fontSize: 13, fontWeight: '700', color: colors.text, width: 52 },
  demoEmail: { flex: 1, fontSize: 13, color: colors.textSub },
  demoNote: { fontSize: 12, color: colors.textMuted },
});
