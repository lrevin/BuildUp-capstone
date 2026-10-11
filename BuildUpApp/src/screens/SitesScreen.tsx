// 로그인 후 첫 화면(현장 관리자·작업자)
//   현장 안의 역할은 현장마다 다르다: 내가 만든 현장 = 관리자, 코드로 참여한 현장 = 작업자
//   - 최고 책임자(본사 없음): 관리하는 현장을 상자로 한눈에 + 새 보고·승인 대기 자재 알림
//   - 본사에 보고하는 관리자: 관리하는 현장 목록 + '본사 보고' 표시
//   - 어느 쪽이든 다른 현장에 작업자로 참여할 수 있어 '작업자로 참여한 현장'을 따로 보여 준다
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../components/Text';
import { useFocusEffect } from '@react-navigation/native';
import {
  Building2,
  ChevronRight,
  ClipboardCheck,
  KeyRound,
  Package,
  UserRound,
  Users,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMySites, fetchUnreadCounts } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useUser } from '../auth';
import { useDialog } from '../components/Dialog';
import { BottomBar, Button, IconButton, Logo } from '../components/ui';
import { seenStore } from '../data/storage';
import { ScreenProps } from '../navigation';
import { colors, radius, shadow } from '../theme';
import { SiteSummary } from '../types';
import { pct } from '../utils/format';
import { BLUE, SiteTile } from './HqHomeScreen';

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

  // 둘씩 묶어 상자 두 개가 한 줄에 오게
  const pairs: SiteSummary[][] = [];
  owned.forEach((s, i) => {
    if (i % 2 === 0) {
      pairs.push([s]);
    } else {
      pairs[pairs.length - 1].push(s);
    }
  });

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
                    desc={'아래 공사 현장 추가에서 관리자를 골라\n새 현장을 만들어 보세요.'}
                  />
                ) : isTop ? (
                  pairs.map(pair => (
                    <View key={pair[0].id} style={styles.gridRow}>
                      {pair.map(s => (
                        <SiteTile
                          key={s.id}
                          site={s}
                          size={tileSize}
                          unread={unread[s.id] ?? 0}
                          waiting={s.pendingMaterials ?? 0}
                          onPress={() => openSite(s)}
                        />
                      ))}
                    </View>
                  ))
                ) : (
                  owned.map(s => (
                    <SiteCard key={s.id} site={s} onPress={() => openSite(s)} />
                  ))
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
                      '아래 공사 현장 추가에서 작업자를 골라\n관리자에게 받은 6자리 코드를 입력해 보세요.'
                    }
                  />
                ) : (
                  joined.map(s => (
                    <SiteCard key={s.id} site={s} onPress={() => openSite(s)} />
                  ))
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

// 현장 카드(본사 화면에서도 사용: hq면 '승인 대기' 건수 표시)
export function SiteCard({
  site,
  onPress,
  hq,
}: {
  site: SiteSummary;
  onPress: () => void;
  hq?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Text style={styles.siteName} numberOfLines={1}>
              {site.name}
            </Text>
            <View style={styles.ownerChip}>
              <Text style={styles.ownerChipText}>
                {site.isOwner ? '관리' : '작업자'}
              </Text>
            </View>
          </View>
          <Text style={styles.address} numberOfLines={1}>
            {site.address}
          </Text>
          {site.workType ? (
            <Text style={styles.workType} numberOfLines={1}>
              {site.workType}
            </Text>
          ) : null}
          {site.isOwner && site.hqName && !hq ? (
            <Text style={styles.hqLine} numberOfLines={1}>
              본사 보고 · {site.hqName}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={20} color={colors.textMuted} />
      </View>

      <View style={styles.progressRow}>
        <View style={styles.trackWrap}>
          <View style={styles.track}>
            <View
              style={[styles.fill, { width: `${site.overallProgress}%` }]}
            />
          </View>
        </View>
        <Text style={styles.progress}>{pct(site.overallProgress)}</Text>
      </View>

      <View style={styles.metaRow}>
        <Users size={14} color={colors.textMuted} />
        <Text style={styles.meta}>
          {site.memberCount}명 · 관리자 {site.ownerName}
        </Text>
        {/* 관리자: 처리할 자재 요청 */}
        {(site.isOwner || hq) && (site.pendingMaterials ?? 0) > 0 ? (
          <View style={styles.material}>
            <Package size={12} color="#8A5E00" strokeWidth={2.4} />
            <Text style={styles.materialText}>
              {hq ? '승인 대기' : '자재'} {site.pendingMaterials}
            </Text>
          </View>
        ) : null}
        {/* 관리자: 검토(승인·보완 요청)할 보고 */}
        {site.pendingReviews ? (
          <View style={[styles.material, styles.reviewChip]}>
            <ClipboardCheck size={12} color={BLUE} strokeWidth={2.4} />
            <Text style={[styles.materialText, styles.reviewText]}>
              검토 {site.pendingReviews}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  reviewChip: { backgroundColor: '#EAF0FF', marginLeft: 6 },
  reviewText: { color: BLUE },
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

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 10,
    ...shadow,
  },
  cardPressed: { backgroundColor: '#FAFAFB' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  siteName: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  ownerChip: {
    backgroundColor: colors.fill,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ownerChipText: { fontSize: 11, fontWeight: '700', color: colors.textSub },
  workType: { fontSize: 13, fontWeight: '600', color: colors.textSub, marginTop: 4 },
  address: { fontSize: 13, color: colors.textSub, marginTop: 4 },
  hqLine: { fontSize: 12, fontWeight: '600', color: '#2563EB', marginTop: 4 },
  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  trackWrap: { flex: 1, justifyContent: 'center' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.navy },
  progress: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    minWidth: 48,
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  meta: { flex: 1, fontSize: 12, color: colors.textMuted },
  today: {
    backgroundColor: colors.fill,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  todayDone: { backgroundColor: '#E3F4EA' },
  todayText: { fontSize: 12, fontWeight: '600', color: colors.textSub },
  todayDoneText: { color: colors.success },
  material: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.yellowSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
  },
  materialText: { fontSize: 12, fontWeight: '700', color: '#8A5E00' },

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
