// 공사 현장 추가: 이 현장에서 내 포지션(일반 작업자 / 관리자)을 먼저 고른다
// 작업자 → 6자리 코드로 참여, 관리자 → 공사 종류를 골라 새 현장 만들기
// (작업자 계정이 관리자를 고르면 현장 관리자로 전환한 뒤 바로 현장 만들기로 간다)
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, HardHat, UserRound } from 'lucide-react-native';
import { useUser } from '../auth';
import { Text } from '../components/Text';
import { AppHeader, BottomBar, Button } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';

type Position = 'worker' | 'manager';

const OPTIONS: {
  value: Position;
  title: string;
  Icon: typeof HardHat;
  desc: string;
  points: string[];
}[] = [
  {
    value: 'worker',
    title: '일반 작업자',
    Icon: UserRound,
    desc: '관리자에게 받은 코드로 현장에 들어가요',
    points: ['6자리 참여 코드 입력', '진행한 작업·진행률·사진 보고'],
  },
  {
    value: 'manager',
    title: '관리자',
    Icon: HardHat,
    desc: '새 현장을 만들고 작업자를 모아요',
    points: [
      '공사 종류 고르기(인테리어·설비·전기·건축 등)',
      '참여 코드를 작업자에게 공유',
      '보고 검토·자재 요청 승인',
    ],
  },
];

export default function AddSiteScreen({ navigation }: ScreenProps<'AddSite'>) {
  const user = useUser();
  const [position, setPosition] = useState<Position | null>(null);

  const onNext = () => {
    if (position === 'worker') {
      navigation.replace('JoinSite');
    } else if (user.role === 'admin') {
      navigation.replace('CreateSite');
    } else {
      navigation.replace('ManagerSetup', { next: 'CreateSite' });
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="공사 현장 추가" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>이 현장에서 어떤 역할인가요?</Text>
        <Text style={styles.subtitle}>
          현장마다 역할을 다르게 고를 수 있어요.
        </Text>

        {OPTIONS.map(({ value, title, Icon, desc, points }) => {
          const active = position === value;
          return (
            <Pressable
              key={value}
              style={[styles.card, active && styles.cardActive]}
              onPress={() => setPosition(value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <View style={styles.cardTop}>
                <View style={[styles.iconWrap, active && styles.iconActive]}>
                  <Icon
                    size={22}
                    color={active ? colors.white : colors.textSub}
                    strokeWidth={1.8}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{title}</Text>
                  <Text style={styles.desc}>{desc}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? (
                    <Check size={14} color={colors.white} strokeWidth={3} />
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

        {position === 'manager' && user.role !== 'admin' ? (
          <Text style={styles.note}>
            다음 화면에서 현장 관리자로 전환한 뒤 현장을 만들어요. 지금 참여
            중인 현장에서는 그대로 작업자예요.
          </Text>
        ) : null}
      </ScrollView>

      <BottomBar>
        <Button
          title={
            position === 'worker'
              ? '코드 입력하러 가기'
              : position === 'manager'
              ? '새 현장 만들러 가기'
              : '다음'
          }
          disabled={!position}
          onPress={onNext}
        />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  body: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 8 },
  subtitle: {
    fontSize: 14,
    color: colors.textSub,
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 21,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 12,
  },
  cardActive: { borderColor: colors.navy },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: { backgroundColor: colors.navy },
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
  radioActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  points: { marginTop: 14, marginLeft: 58, gap: 4 },
  point: { fontSize: 13, color: colors.textSub },
  note: {
    fontSize: 13,
    color: colors.textSub,
    lineHeight: 19,
    marginTop: 4,
  },
});
