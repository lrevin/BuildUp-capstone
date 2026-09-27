import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth';
import { useDialog } from '../components/Dialog';
import { AppHeader, BottomBar, Button, Field } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 010-1234-5678 형태로 자동 하이픈
function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) {
    return d;
  }
  if (d.length < 8) {
    return `${d.slice(0, 3)}-${d.slice(3)}`;
  }
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export default function SignUpScreen({
  navigation,
  route,
}: ScreenProps<'SignUp'>) {
  const { role } = route.params;
  const isAdmin = role === 'admin';
  const isHq = role === 'hq';
  const { signUp } = useAuth();
  // 본사 관계자: 새 본사 등록 / 본사 코드로 합류
  const [hqMode, setHqMode] = useState<'create' | 'join'>('create');
  // 현장 관리자: 본사에 보고 / 최고 책임자
  const [reportMode, setReportMode] = useState<'hq' | 'top'>('top');
  const [companyCode, setCompanyCode] = useState('');

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const dialog = useDialog();

  const validate = () => {
    if (!name.trim()) {
      return '이름을 입력해 주세요.';
    }
    if (isAdmin && reportMode === 'hq' && !/^\d{6}$/.test(companyCode)) {
      return '보고할 본사의 코드 6자리를 입력해 주세요.';
    }
    if (isHq && hqMode === 'create' && !company.trim()) {
      return '본사명을 입력해 주세요.';
    }
    if (isHq && hqMode === 'join' && !/^\d{6}$/.test(companyCode)) {
      return '본사 코드 6자리를 입력해 주세요.';
    }
    if (!EMAIL_RE.test(email.trim())) {
      return '이메일 형식이 올바르지 않아요.';
    }
    if (phone.replace(/\D/g, '').length < 10) {
      return '휴대폰 번호를 확인해 주세요.';
    }
    if (password.length < 8) {
      return '비밀번호는 8자 이상이어야 해요.';
    }
    if (password !== password2) {
      return '비밀번호가 서로 달라요.';
    }
    return null;
  };

  const onSubmit = async () => {
    const problem = validate();
    if (problem) {
      dialog.toast(problem.replace(/\.$/, ''), 'error');
      return;
    }
    setLoading(true);
    try {
      // 가입에 성공하면 로그인 상태가 되어 자동으로 현장 목록 화면으로 넘어간다
      await signUp({
        role,
        name: name.trim(),
        email,
        phone,
        password,
        company:
          isAdmin || (isHq && hqMode === 'create') ? company.trim() : undefined,
        companyCode:
          (isHq && hqMode === 'join') || (isAdmin && reportMode === 'hq')
            ? companyCode
            : undefined,
      });
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '가입하지 못했어요',
        message: errorMessage(e),
      });
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <AppHeader
        title={
          isHq ? '본사 관계자 가입' : isAdmin ? '현장 관리자 가입' : '일반 작업자 가입'
        }
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {isHq
              ? hqMode === 'create'
                ? '가입하면 6자리 본사 코드가 발급돼요. 현장 총관리자에게 알려 주면 현장이 본사에 연결돼요.'
                : '같은 본사의 다른 관계자에게 받은 본사 코드로 합류해요.'
              : isAdmin
              ? reportMode === 'hq'
                ? '만드는 현장이 본사에 연결되어 보고와 자재 요청이 본사로 올라가요. 현장 참여 코드는 바로 발급돼요.'
                : '본사 없이 내가 최고 책임자로 운영해요. 현장을 만들면 참여 코드가 바로 발급되고, 자재 요청도 내가 최종 승인해요.'
              : '가입 후 관리자에게 받은 6자리 코드로 현장에 참여해요'}
          </Text>
        </View>

        <Field
          label="이름"
          value={name}
          onChangeText={setName}
          placeholder="홍길동"
        />
        {isAdmin ? (
          <>
            <Text style={styles.segLabel}>보고 체계</Text>
            <View style={styles.segment}>
              {(
                [
                  ['top', '제가 최고 책임자예요'],
                  ['hq', '본사에 보고해요'],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setReportMode(key)}
                  style={[
                    styles.segItem,
                    reportMode === key && styles.segActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segText,
                      reportMode === key && styles.segTextOn,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {reportMode === 'hq' ? (
              <Field
                label="본사 코드"
                value={companyCode}
                onChangeText={t =>
                  setCompanyCode(t.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="본사 관계자에게 받은 6자리 숫자"
                keyboardType="number-pad"
                maxLength={6}
              />
            ) : null}
            <Field
              label="회사·사무소명 (선택)"
              value={company}
              onChangeText={setCompany}
              placeholder={
                reportMode === 'hq' ? '비우면 본사 이름을 써요' : '예) 박철근 인력사무소'
              }
            />
          </>
        ) : null}
        {isHq ? (
          <>
            <Text style={styles.segLabel}>본사</Text>
            <View style={styles.segment}>
              {(
                [
                  ['create', '새 본사 등록'],
                  ['join', '본사 코드로 합류'],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setHqMode(key)}
                  style={[styles.segItem, hqMode === key && styles.segActive]}
                >
                  <Text
                    style={[styles.segText, hqMode === key && styles.segTextOn]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {hqMode === 'create' ? (
              <Field
                label="본사명"
                value={company}
                onChangeText={setCompany}
                placeholder="예) 한빛건설 본사"
              />
            ) : (
              <Field
                label="본사 코드"
                value={companyCode}
                onChangeText={t => setCompanyCode(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="6자리 숫자"
                keyboardType="number-pad"
                maxLength={6}
              />
            )}
          </>
        ) : null}
        <Field
          label="이메일"
          value={email}
          onChangeText={setEmail}
          placeholder="로그인할 때 사용해요"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="휴대폰 번호"
          value={phone}
          onChangeText={v => setPhone(formatPhone(v))}
          placeholder="010-0000-0000"
          keyboardType="phone-pad"
        />
        <Field
          label="비밀번호"
          value={password}
          onChangeText={setPassword}
          placeholder="8자 이상"
          secureTextEntry
        />
        <Field
          label="비밀번호 확인"
          value={password2}
          onChangeText={setPassword2}
          placeholder="한 번 더 입력"
          secureTextEntry
        />
      </ScrollView>
      <BottomBar>
        <Button title="가입하기" onPress={onSubmit} loading={loading} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { padding: 20 },
  roleBadge: {
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    padding: 14,
    marginBottom: 24,
  },
  roleBadgeText: { fontSize: 13, color: colors.textSub, lineHeight: 19 },
  segLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSub,
    marginBottom: 8,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: 12,
  },
  segItem: {
    flex: 1,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segActive: { backgroundColor: colors.white, elevation: 1 },
  segText: { fontSize: 14, fontWeight: '500', color: colors.textSub },
  segTextOn: { fontWeight: '700', color: colors.text },
});
