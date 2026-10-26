// 카카오 로그인 버튼과 "또는" 구분줄(웹 로그인·가입 화면과 같은 배치)
import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { config, errorMessage } from '../api/client';
import { kakaoBegin } from '../api/buildup';
import { useDialog } from './Dialog';
import { colors, radius } from '../theme';

/** ─── 또는 ─── (dark: 남색 바탕 위) */
export function OrDivider({ dark }: { dark?: boolean }) {
  return (
    <View style={styles.or}>
      <View style={[styles.line, dark && styles.lineDark]} />
      <Text style={[styles.orText, dark && styles.orTextDark]}>또는</Text>
      <View style={[styles.line, dark && styles.lineDark]} />
    </View>
  );
}

/** 휴대폰 브라우저로 카카오 로그인 → 끝나면 앱으로 돌아온다(App.tsx KakaoBridge) */
export function KakaoButton({ label }: { label: string }) {
  const dialog = useDialog();

  const onPress = async () => {
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.kakao, pressed && styles.kakaoPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.kakaoText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  or: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 16,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  lineDark: { backgroundColor: colors.ink800 },
  orText: { fontSize: 13, color: colors.textMuted },
  orTextDark: { color: colors.ink400 },
  // 카카오 디자인 가이드: 노란 바탕 #FEE500, 글자 85% 검정
  kakao: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: '#FEE500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kakaoPressed: { opacity: 0.85 },
  kakaoText: { fontSize: 16, fontWeight: '700', color: 'rgba(0,0,0,0.85)' },
});
