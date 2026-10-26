import React, { useState } from 'react';
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
import { errorMessage } from '../api/client';
import { useAuth } from '../auth';
import { useDialog } from '../components/Dialog';
import { KakaoButton, OrDivider } from '../components/KakaoButton';
import { Button, Field } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';

export default function LoginScreen({ navigation }: ScreenProps<'Login'>) {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
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
        {/* 웹 대시보드와 같은 글자 로고. 개발할 때만: 길게 누르면 서버 설정 */}
        <Pressable
          onLongPress={() => navigation.navigate('Server')}
          delayLongPress={1500}
          accessible={false}
        >
          <Text style={styles.brand} accessibilityLabel="Build Up">
            Build<Text style={styles.brandUp}>Up</Text>
          </Text>
        </Pressable>
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
            style={styles.forgot}
            hitSlop={8}
            onPress={() => navigation.navigate('PasswordReset')}
          >
            <Text style={styles.forgotText}>비밀번호를 잊으셨나요?</Text>
          </Pressable>
          <OrDivider />
          <KakaoButton label="카카오 로그인" />
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  forgot: { alignSelf: 'center', marginTop: 14 },
  forgotText: {
    fontSize: 13,
    color: colors.textSub,
    textDecorationLine: 'underline',
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
});
