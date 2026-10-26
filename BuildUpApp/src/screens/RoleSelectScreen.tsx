import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Building2, Check, HardHat, UserRound } from 'lucide-react-native';
import { AppHeader, BottomBar, Button } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import { Role } from '../types';

const OPTIONS: {
  role: Role;
  title: string;
  Icon: typeof HardHat;
  desc: string;
  points: string[];
}[] = [
  {
    role: 'admin',
    title: '현장 관리자',
    Icon: HardHat,
    desc: '현장을 만들고 작업자를 모아요',
    points: [
      '참여 코드 발급, 보고 검토·자재 승인',
      '본사에 보고하거나 직접 운영',
    ],
  },
  {
    role: 'worker',
    title: '일반 작업자',
    Icon: UserRound,
    desc: '참여 코드로 현장에 들어가요',
    points: ['진행한 작업·사진 보고', '참여한 현장만 보여요'],
  },
  {
    role: 'hq',
    title: '본사 관계자',
    Icon: Building2,
    desc: '여러 현장의 보고를 한눈에 봐요',
    points: ['연결된 현장의 보고 검토·승인', '자재 요청 처리'],
  },
];

export default function RoleSelectScreen({
  navigation,
  route,
}: ScreenProps<'RoleSelect'>) {
  const [role, setRole] = useState<Role | null>(null);
  const kakao = route.params?.kakao;

  return (
    <View style={styles.root}>
      <AppHeader
        title={kakao ? '카카오로 가입' : '회원가입'}
        onBack={() => navigation.goBack()}
        dark
      />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>어떤 역할로 가입하시나요?</Text>
        <Text style={styles.subtitle}>
          작업자로 가입해도 나중에 관리자로 바꿀 수 있어요
        </Text>

        {OPTIONS.map(({ role: r, title, Icon, desc, points }) => {
          const active = role === r;
          return (
            <Pressable
              key={r}
              style={[styles.card, active && styles.cardActive]}
              onPress={() => setRole(r)}
            >
              <View style={styles.cardTop}>
                <View style={[styles.iconWrap, active && styles.iconActive]}>
                  <Icon
                    size={22}
                    color={active ? colors.navy : colors.textSub}
                    strokeWidth={1.8}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{title}</Text>
                  <Text style={styles.desc}>{desc}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? (
                    <Check size={14} color={colors.navy} strokeWidth={3} />
                  ) : null}
                </View>
              </View>
              <View style={styles.points}>
                {points.map(p => (
                  <Text key={p} style={styles.point}>
                    · {p}
                  </Text>
                ))}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <BottomBar dark>
        <Button
          title="다음"
          disabled={!role}
          onPress={() => role && navigation.navigate('SignUp', { role, kakao })}
        />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink950 },
  flex: { flex: 1 },
  body: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: colors.white, marginTop: 8 },
  subtitle: {
    fontSize: 14,
    color: colors.ink400,
    marginTop: 6,
    marginBottom: 24,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.white,
    padding: 18,
    marginBottom: 12,
  },
  cardActive: { borderColor: colors.yellow },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: { backgroundColor: colors.yellow },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  desc: { fontSize: 13, color: colors.textSub, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  points: { marginTop: 12, marginLeft: 58, gap: 4 },
  point: { fontSize: 13, color: colors.textSub },
});
