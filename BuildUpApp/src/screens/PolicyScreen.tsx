// 이용약관 · 개인정보 처리방침 전문(가입 화면의 '보기', 내 정보, 로그인 화면에서 연다)
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { AppHeader } from '../components/ui';
import { POLICIES, POLICY_OPERATOR, policyText } from '../data/policies';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';

export default function PolicyScreen({
  navigation,
  route,
}: ScreenProps<'Policy'>) {
  const policy = POLICIES[route.params.kind];
  return (
    <View style={styles.root}>
      <AppHeader title={policy.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.meta}>
            시행일 {policy.effective} · {POLICY_OPERATOR}
          </Text>
          {policy.sections.map((s, i) => (
            <View key={i} style={styles.section}>
              {s.h ? <Text style={styles.heading}>{s.h}</Text> : null}
              {s.p.map((line, j) => (
                <Text key={j} style={styles.para}>
                  {policyText(line)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
  },
  meta: { fontSize: 12, color: colors.textSub, marginBottom: 8 },
  section: { marginTop: 14 },
  heading: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  para: { fontSize: 14, lineHeight: 22, color: colors.text, marginBottom: 4 },
});
