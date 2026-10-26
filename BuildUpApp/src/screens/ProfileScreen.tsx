// 내 정보
import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { resetDemoData, withdraw } from '../api/buildup';
import { config, errorMessage } from '../api/client';
import { ChevronRight } from 'lucide-react-native';
import { useAuth, useUser } from '../auth';
import { useDialog } from '../components/Dialog';
import { AppHeader, Avatar, Button, Card } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, shadow } from '../theme';

export default function ProfileScreen({ navigation }: ScreenProps<'Profile'>) {
  const user = useUser();
  const { logout } = useAuth();
  const dialog = useDialog();
  const roleLabel =
    user.role === 'hq'
      ? '본사 관계자'
      : user.role === 'admin'
      ? user.hqName
        ? '현장 관리자 · 본사 보고'
        : '현장 관리자 · 최고 책임자'
      : '일반 작업자';

  const onLogout = async () => {
    const ok = await dialog.confirm({
      title: '로그아웃할까요?',
      message:
        user.role === 'hq'
          ? '다시 로그인하면 연결된 현장을 그대로 볼 수 있어요.'
          : '다시 로그인하면 참여한 현장을 그대로 볼 수 있어요.',
      confirmText: '로그아웃',
    });
    if (ok) {
      logout();
    }
  };

  // 회원 탈퇴: 한 번 더 확인 → 바로 로그아웃, 7일 뒤 계정 정보 영구 삭제
  const onWithdraw = async () => {
    const ok = await dialog.confirm({
      icon: 'warning',
      title: '정말 탈퇴할까요?',
      message:
        '탈퇴 7일 후 계정 정보 및\n모든 현장 정보가 삭제됩니다.\n7일 후에는 되돌릴 수 없습니다.',
      confirmText: '탈퇴하기',
      danger: true,
      emphasis: true,
    });
    if (!ok) {
      return;
    }
    let deleteAt: string;
    try {
      deleteAt = await withdraw();
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '탈퇴하지 못했어요',
        message: errorMessage(e),
      });
      return;
    }
    const d = new Date(deleteAt);
    await dialog.notice({
      icon: 'success',
      title: '탈퇴했어요',
      message: `${
        d.getMonth() + 1
      }월 ${d.getDate()}일에 계정 정보가 모두 삭제돼요.\n그동안 Build Up을 써 주셔서 고마워요.`,
    });
    logout();
  };

  // 발표·테스트용: 더미 데이터를 처음 상태로 되돌린다
  const onReset = async () => {
    const ok = await dialog.confirm({
      icon: 'warning',
      title: '데모 데이터를 초기화할까요?',
      message: '보고·현장·계정이 모두 처음 상태로 돌아가고 로그아웃돼요.',
      confirmText: '초기화',
      danger: true,
    });
    if (ok) {
      await resetDemoData();
      logout();
    }
  };

  const rows: [string, string][] = [
    ['이메일', user.email],
    ['휴대폰', user.phone],
    ...(user.company
      ? ([[user.role === 'hq' ? '본사' : '회사', user.company]] as [
          string,
          string,
        ][])
      : []),
    ...(user.companyCode
      ? ([['본사 코드', user.companyCode]] as [string, string][])
      : []),
    ...(user.role === 'admin'
      ? ([['보고 체계', user.hqName ?? '최고 책임자(본사 없음)']] as [
          string,
          string,
        ][])
      : []),
  ];

  return (
    <View style={styles.root}>
      <AppHeader title="내 정보" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profile}>
          <Avatar name={user.name} size={72} />
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>{roleLabel}</Text>
        </View>

        <Card>
          {rows.map(([k, v], i) => (
            <View key={k} style={[styles.row, i > 0 && styles.rowBorder]}>
              <Text style={styles.key}>{k}</Text>
              <Text style={styles.value}>{v}</Text>
            </View>
          ))}
        </Card>

        {user.companyCode ? (
          <Button
            title="본사 코드 공유"
            variant="dark"
            onPress={() =>
              Share.share({
                message:
                  `[Build Up] ${user.company} 본사 코드: ${user.companyCode}
` + '현장 관리자가 이 코드로 현장을 연결하면 보고와 자재 요청이 본사로 와요.',
              })
            }
            style={styles.logout}
          />
        ) : null}
        {/* 작업자 → 현장 관리자 전환 / 관리자의 보고 체계 변경 */}
        {user.role !== 'hq' ? (
          <Pressable
            style={[styles.connection, styles.managerRow]}
            onPress={() => navigation.navigate('ManagerSetup')}
          >
            <Text style={styles.managerText}>
              {user.role === 'worker' ? '현장 관리자로 전환' : '보고 체계 변경'}
            </Text>
            <Text style={styles.managerDesc} numberOfLines={1}>
              {user.role === 'worker'
                ? '내 현장 만들기'
                : user.hqName ?? '최고 책임자'}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
        <Pressable
          style={styles.connection}
          onPress={() => navigation.navigate('PasswordReset')}
        >
          <Text style={styles.managerText}>비밀번호 찾기</Text>
          <Text style={styles.managerDesc}>이메일 인증 후 새로 정하기</Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Button
          title="로그아웃"
          variant="outline"
          onPress={onLogout}
          style={styles.logout}
        />
        <Pressable
          style={styles.connection}
          onPress={() => navigation.navigate('Server')}
        >
          <Text style={styles.key}>연결</Text>
          <Text style={styles.connectionValue} numberOfLines={1}>
            {config.useDummy
              ? '데모 모드'
              : config.baseUrl
                  .replace(/^https?:\/\//, '')
                  .replace(/\/api$/, '')}
          </Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>

        {config.useDummy ? (
          <Pressable style={styles.reset} onPress={onReset} hitSlop={8}>
            <Text style={styles.resetText}>데모 데이터 초기화</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.reset} onPress={onWithdraw} hitSlop={8}>
          <Text style={styles.withdrawText}>회원 탈퇴</Text>
        </Pressable>
        <Text style={styles.version}>Build Up v1.0 · 경동대 캡스톤</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingVertical: 16 },
  profile: { alignItems: 'center', paddingVertical: 24 },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 12 },
  role: { fontSize: 14, color: colors.textSub, marginTop: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  key: { fontSize: 15, color: colors.textSub },
  value: { fontSize: 15, color: colors.text, fontWeight: '500' },
  logout: { marginTop: 20 },
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 12,
    ...shadow,
  },
  connectionValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  managerRow: { marginTop: 20 },
  managerText: { fontSize: 15, fontWeight: '700', color: colors.text },
  managerDesc: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    color: colors.textSub,
  },
  reset: { alignSelf: 'center', marginTop: 20, padding: 6 },
  resetText: {
    fontSize: 13,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  withdrawText: {
    fontSize: 13,
    color: colors.danger,
    textDecorationLine: 'underline',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 20,
  },
});
