// 인증이 필요한 입력칸(이메일·휴대폰): [입력] [인증 받기] → [6자리 코드] [확인] → 인증 완료
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from './Text';
import { errorMessage } from '../api/client';
import { useDialog } from './Dialog';
import { CodeSent } from '../types';
import { colors, radius } from '../theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences';
  /** 형식이 틀리면 안내 문구, 맞으면 null */
  check: (v: string) => string | null;
  send: (v: string) => Promise<CodeSent>;
  verify: (v: string, code: string) => Promise<string>;
  /** 인증 결과 토큰(인증 전이거나 값을 바꾸면 null) */
  token: string | null;
  onToken: (token: string | null) => void;
  /** 처음부터 인증된 값(카카오가 인증한 이메일 등): 바꿀 수 없음 */
  locked?: boolean;
  lockedHint?: string;
}

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function VerifyField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  check,
  send,
  verify,
  token,
  onToken,
  locked,
  lockedHint,
}: Props) {
  const dialog = useDialog();
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null); // 코드를 보낸 값
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const codeRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  // 지금 입력칸의 값(서버 응답이 오는 사이에 값을 바꿨으면 그 응답은 버린다)
  const current = useRef(value);
  current.current = value;

  // 남은 시간 표시용 1초 시계(코드를 보낸 동안만)
  useEffect(() => {
    if (!sentTo || token) {
      return;
    }
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentTo, token]);

  const done = locked || !!token;
  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const waitResend = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const change = (v: string) => {
    onChangeText(v);
    // 인증한 값이나 코드를 보낸 값을 바꾸면 처음부터
    if (token) {
      onToken(null);
    }
    if (sentTo) {
      setSentTo(null);
      setCode('');
    }
    // 다른 값은 바로 코드를 받을 수 있다(다시 받기 대기는 같은 값에만)
    setResendAt(0);
    setExpiresAt(0);
  };

  const onSend = async () => {
    const problem = check(value);
    if (problem) {
      dialog.toast(problem.replace(/\.$/, ''), 'error');
      return;
    }
    setSending(true);
    try {
      const sentValue = value;
      const r = await send(sentValue);
      if (current.current !== sentValue) {
        return;
      }
      const t = Date.now();
      setNow(t);
      setSentTo(sentValue);
      setExpiresAt(t + r.expiresInSeconds * 1000);
      setResendAt(t + r.resendAfterSeconds * 1000);
      setCode('');
      dialog.toast('인증 코드를 보냈어요');
      setTimeout(() => codeRef.current?.focus(), 200);
    } catch (e) {
      dialog.toast(errorMessage(e).replace(/\.$/, ''), 'error');
    } finally {
      setSending(false);
    }
  };

  const onVerify = async () => {
    if (!/^\d{6}$/.test(code)) {
      dialog.toast('인증 코드 6자리를 입력해 주세요', 'error');
      return;
    }
    setChecking(true);
    try {
      const checkedValue = value;
      const newToken = await verify(checkedValue, code);
      if (current.current !== checkedValue) {
        return;
      }
      onToken(newToken);
      setSentTo(null);
      setCode('');
    } catch (e) {
      dialog.toast(errorMessage(e).replace(/\.$/, ''), 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex, done && styles.inputDone]}
          value={value}
          onChangeText={change}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={!locked}
        />
        {done ? (
          <View style={[styles.side, styles.doneBadge]}>
            <Text style={styles.doneText}>인증 완료</Text>
          </View>
        ) : (
          <Pressable
            onPress={onSend}
            disabled={sending || waitResend > 0}
            style={({ pressed }) => [
              styles.side,
              styles.sendBtn,
              (sending || waitResend > 0) && styles.off,
              pressed && styles.pressed,
            ]}
            accessibilityLabel={`${label} 인증 코드 받기`}
          >
            {sending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.sendText}>
                {sentTo
                  ? waitResend > 0
                    ? `${waitResend}초`
                    : '다시 받기'
                  : '인증 받기'}
              </Text>
            )}
          </Pressable>
        )}
      </View>
      {sentTo && !done ? (
        <View style={[styles.row, styles.codeRow]}>
          <View style={styles.flex}>
            <TextInput
              ref={codeRef}
              style={styles.input}
              value={code}
              onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="인증 코드 6자리"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
            />
            <Text style={[styles.timer, left === 0 && styles.timerOver]}>
              {left > 0 ? mmss(left) : '만료'}
            </Text>
          </View>
          <Pressable
            onPress={onVerify}
            disabled={checking || left === 0}
            style={({ pressed }) => [
              styles.side,
              styles.okBtn,
              (checking || left === 0) && styles.off,
              pressed && styles.pressed,
            ]}
            accessibilityLabel={`${label} 인증 코드 확인`}
          >
            {checking ? (
              <ActivityIndicator color={colors.navy} />
            ) : (
              <Text style={styles.okText}>확인</Text>
            )}
          </Pressable>
        </View>
      ) : null}
      {locked && lockedHint ? (
        <Text style={styles.hint}>{lockedHint}</Text>
      ) : sentTo && !done ? (
        <Text style={styles.hint}>
          {left > 0
            ? '받은 코드를 5분 안에 입력해 주세요'
            : '시간이 지났어요. 코드를 다시 받아 주세요'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 18 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSub,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeRow: { marginTop: 8 },
  flex: { flex: 1 },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.fill,
    backgroundColor: colors.fill,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  inputDone: { color: colors.textSub },
  side: {
    height: 52,
    minWidth: 92,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: { backgroundColor: colors.navy },
  sendText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  okBtn: { backgroundColor: colors.yellow },
  okText: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  doneBadge: { backgroundColor: '#E7F6EE' },
  doneText: { color: colors.success, fontSize: 14, fontWeight: '700' },
  off: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  timer: {
    position: 'absolute',
    right: 14,
    top: 16,
    fontSize: 14,
    fontWeight: '600',
    color: colors.danger,
  },
  timerOver: { color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
});
