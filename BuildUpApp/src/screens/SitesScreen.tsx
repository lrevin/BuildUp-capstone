// 로그인 후 첫 화면(현장 관리자·작업자)
//   현장 안의 역할은 현장마다 다르다: 내가 만든 현장 = 관리자, 코드로 참여한 현장 = 작업자
//   - 현장은 정사각형 상자로 한 줄에 두 개씩(진행률·확인 안 한 보고·자재·검토 대기 배지)
//   - 어느 쪽이든 다른 현장에 작업자로 참여할 수 있어 '작업자로 참여한 현장'을 따로 보여 준다
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../components/Text';
import { useFocusEffect } from '@react-navigation/native';
import { Building2, KeyRound, UserRound } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMySites, fetchUnreadCounts } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useUser } from '../auth';
import { useDialog } from '../components/Dialog';
import { BottomBar, Button, IconButton, Logo } from '../components/ui';
import { seenStore } from '../data/storage';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import { SiteSummary } from '../types';
import { SiteTile } from './HqHomeScreen';

export default function SitesScreen({ navigation }: ScreenProps<'Sites'>) {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const isTop = isAdmin && !user.hqName; // 본사 없는 최고 책임자
  const { width } = useWindowDimensions();
  const tileSize = Math.floor((width - 20 * 2 - 12) / 2);
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const dialog = useDialog();

  const load = useCallback(async () => {
    try {
      const list = await fetchMySites();
      setSites(list);
      // 최고 책임자: 관리하는 현장의 확인 안 한 보고 수(서버가 세어서 숫자만 준다)
      if (isTop) {
        const seenMap = await seenStore.load(user.id);
        const owned = list.filter(s => s.isOwner);
        setUnread(
          await fetchUnreadCounts(
            Object.fromEntries(owned.map(s => [s.id, seenMap[s.id] ?? null])),
          ).catch(() => ({})),
        );
      }
    } catch (e) {
      dialog.toast(errorMessage(e), 'error');
      setSites(prev => prev ?? []);
    }
  }, [dialog, isTop, user.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const owned = (sites ?? []).filter(s => s.isOwner);
  const joined = (sites ?? []).filter(s => !s.isOwner);
  const openSite = (s: SiteSummary) =>
    navigation.navigate('Report', { siteId: s.id });

  // 현장은 정사각형 상자로, 한 줄에 두 개씩
  const grid = (list: SiteSummary[]) => {
    const pairs: SiteSummary[][] = [];
    list.forEach((s, i) => {
      if (i % 2 === 0) {
        pairs.push([s]);
      } else {
        pairs[pairs.length - 1].push(s);
      }
    });
    return pairs.map(pair => (
      <View key={pair[0].id} style={styles.gridRow}>
        {pair.map(s => (
          <SiteTile
            key={s.id}
            site={s}
            size={tileSize}
            unread={unread[s.id] ?? 0}
            waiting={s.isOwner ? s.pendingMaterials ?? 0 : 0}
            onPress={() => openSite(s)}
          />
        ))}
      </View>
    ));
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <View style={styles.topRow}>
          <Logo />
          <Text style={styles.brand}>Build Up</Text>
          <IconButton
            label="내 정보"
            onPress={() => navigation.navigate('Profile')}
          >
            <UserRound size={22} color={colors.text} strokeWidth={2} />
          </IconButton>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.greeting}>
          <Text style={styles.hello}>{user.name}님, 안녕하세요</Text>
        </View>

        {sites === null ? (
          <ActivityIndicator style={styles.loading} color={colors.navy} />
        ) : (
          <>
            {/* 내가 관리하는 현장 */}
            {isAdmin ? (
              <>
                <Text style={styles.sectionTitle}>
                  내가 관리하는 현장{' '}
                  <Text style={styles.count}>{owned.length}</Text>
                </Text>
                {owned.length === 0 ? (
                  <EmptyBox
                    icon={<Building2 size={28} color={colors.textMuted} />}
                    title="아직 만든 현장이 없어요"
                    desc={
                      '아래 공사 현장 추가에서 관리자를 골라\n새 현장을 만들어 보세요.'
                    }
                  />
                ) : (
                  grid(owned)
                )}
              </>
            ) : null}

            {/* 작업자로 참여한 현장 */}
            {!isAdmin || joined.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>
                  {isAdmin ? '작업자로 참여한 현장' : '내 작업 현장'}{' '}
                  <Text style={styles.count}>{joined.length}</Text>
                </Text>
                {joined.length === 0 ? (
                  <EmptyBox
                    icon={<KeyRound size={28} color={colors.textMuted} />}
                    title="아직 참여한 현장이 없어요"
                    desc={
                      '아래 공사 현장 추가 → 작업자에서\n받은 6자리 코드를 입력해 보세요.'
                    }
                  />
                ) : (
                  grid(joined)
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <BottomBar>
        <Button
          title="공사 현장 추가"
          onPress={() => navigation.navigate('AddSite')}
        />
      </BottomBar>
    </View>
  );
}

function EmptyBox({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{icon}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{desc}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  topBar: { backgroundColor: colors.background },
  topRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 8,
  },
  brand: {
    flex: 1,
    marginLeft: 10,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },

  list: { paddingHorizontal: 20, paddingBottom: 16, flexGrow: 1 },
  greeting: { paddingTop: 8 },
  hello: { fontSize: 22, fontWeight: '700', color: colors.text },
  role: { fontSize: 14, color: colors.textSub, marginTop: 4 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 28,
    marginBottom: 10,
  },
  count: { color: colors.textMuted, fontWeight: '600' },
  loading: { marginTop: 40 },

  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },

  empty: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: 28,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.textSub,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 21,
  },
});
