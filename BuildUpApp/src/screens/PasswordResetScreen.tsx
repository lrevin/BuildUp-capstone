// 비밀번호 찾기: 가입한 이메일로 받은 코드를 확인하고 새 비밀번호를 정한다
// 로그인 화면("비밀번호를 잊으셨나요?")과 내 정보 두 곳에서 연다
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import {
  resetPassword,
  sendPasswordCode,
  verifyPasswordCode,
} from '../api/buildup';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth';
import { useDialog } from '../components/Dialog';
import { VerifyField } from '../components/VerifyField';
import { AppHeader, BottomBar, Button, Card, Field } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors } from '../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PasswordResetScreen({
  navigation,
}: ScreenProps<'PasswordReset'>) {
  const { user, logout } = useAuth(); // 로그인 화면에서 열면 user 없음
  const dialog = useDialog();
  const [email, setEmail] = useState(user?.email ?? '');
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [saving, setSaving] = useState(false);

  const problem = () => {
    if (!token) {
      return '이메일 인증을 먼저 해 주세요';
    }
    if (password.length < 8) {
      return '비밀번호는 8자 이상이어야 해요';
    }
    if (password !== password2) {
      return '비밀번호가 서로 달라요';
    }
    return null;
  };

  const onSave = async () => {
    const p = problem();
    if (p) {
      dialog.toast(p, 'error');
      return;
    }
    setSaving(true);
    try {
      await resetPassword(email, token!, password);
    } catch (e) {
      setSaving(false);
      dialog.notice({
        icon: 'danger',
        title: '비밀번호를 바꾸지 못했어요',
        message: errorMessage(e),
      });
      return;
    }
    await dialog.notice({
      icon: 'success',
      title: '비밀번호를 바꿨어요',
      message: '새 비밀번호로 다시 로그인해 주세요.',
    });
    if (user) {
      logout();
    } else {
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <AppHeader title="비밀번호 찾기" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.guide}>
          가입한 이메일로 인증 코드를 보내 드려요.{'\n'}인증하고 새 비밀번호를
          정해 주세요.
        </Text>
        <Card>
          <VerifyField
            label="이메일"
            value={email}
            onChangeText={setEmail}
            placeholder="가입한 이메일 주소"
            keyboardType="email-address"
            autoCapitalize="none"
            check={v =>
              EMAIL_RE.test(v.trim()) ? null : '이메일 형식이 올바르지 않아요.'
            }
            send={sendPasswordCode}
            verify={verifyPasswordCode}
            token={token}
            onToken={setToken}
          />
          <View style={!token && styles.dim}>
            <Field
              label="새 비밀번호"
              value={password}
              onChangeText={setPassword}
              placeholder="8자 이상"
              secureTextEntry
              editable={!!token}
            />
            <Field
              label="새 비밀번호 확인"
              value={password2}
              onChangeText={setPassword2}
              placeholder="한 번 더 입력"
              secureTextEntry
              editable={!!token}
              onSubmitEditing={onSave}
            />
          </View>
        </Card>
        <Text style={styles.note}>
          바꾸면 다른 휴대폰·웹에서도 로그아웃돼요.
        </Text>
      </ScrollView>
      <BottomBar>
        <Button
          title="비밀번호 바꾸기"
          onPress={onSave}
          loading={saving}
          disabled={!token}
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingVertical: 16 },
  guide: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSub,
    marginBottom: 16,
  },
  dim: { opacity: 0.5 },
  note: { fontSize: 13, color: colors.textMuted, marginTop: 12 },
});
