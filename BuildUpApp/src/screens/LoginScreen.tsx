import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { config, errorMessage } from '../api/client';
import { kakaoBegin } from '../api/buildup';
import { useAuth } from '../auth';
import { useDialog } from '../components/Dialog';
import { Button, Field } from '../components/ui';
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

  // 카카오: 휴대폰 브라우저로 카카오 로그인 → 끝나면 앱으로 돌아온다(App.tsx KakaoBridge)
  const onKakao = async () => {
    if (config.useDummy) {
      dialog.toast('카카오 로그인은 서버에 연결했을 때 쓸 수 있어요', 'error');
      return;
    }
    let url: string;
    try {
      url = await kakaoBegin();
    } catch (e) {
      dialog.toast(errorMessage(e).replace(/\.$/, ''), 'error');
      return;
    }
    Linking.openURL(url).catch(() =>
      dialog.toast('브라우저를 열지 못했어요', 'error'),
    );
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 웹 대시보드와 같은 글자 로고 */}
        <Text style={styles.brand} accessibilityLabel="Build Up">
          Build<Text style={styles.brandUp}>Up</Text>
        </Text>
        <Text style={styles.subtitle}>공사 현장 보고 · 관리</Text>

        <View style={styles.card}>
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
          <Pressable
            onPress={onKakao}
            style={({ pressed }) => [
              styles.kakao,
              pressed && styles.kakaoPressed,
            ]}
            accessibilityLabel="카카오로 시작하기"
          >
            <Text style={styles.kakaoText}>카카오로 시작하기</Text>
          </Pressable>
        </View>

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>계정이 없으신가요?</Text>
          <Pressable
            hitSlop={8}
            onPress={() => navigation.navigate('RoleSelect')}
          >
            <Text style={styles.signupLink}>회원가입</Text>
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
  // 카카오 로그인 버튼(카카오 디자인 가이드: 노란 바탕 #FEE500, 글자 85% 검정)
  kakao: {
    marginTop: 10,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: '#FEE500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kakaoPressed: { opacity: 0.85 },
  kakaoText: { fontSize: 16, fontWeight: '700', color: 'rgba(0,0,0,0.85)' },
  root: { flex: 1, backgroundColor: colors.ink950 },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  brand: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  brandUp: { color: colors.yellow },
  subtitle: {
    fontSize: 14,
    color: colors.ink400,
    textAlign: 'center',
    marginTop: 6,
  },
  card: {
    marginTop: 32,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  signupText: { fontSize: 14, color: colors.ink400 },
  signupLink: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    textDecorationLine: 'underline',
  },
  server: {
    alignSelf: 'center',
    marginTop: 'auto',
    paddingTop: 32,
    padding: 4,
  },
  serverText: { fontSize: 12, color: colors.ink400 },
  serverLink: { fontWeight: '700', color: colors.white },
});
