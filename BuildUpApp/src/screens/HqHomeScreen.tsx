// 본사 관계자 홈: '전체 현장' 버튼 + 현장 상자(한 줄에 두 개)
// 상자 오른쪽 위: 빨간 '보고 N' = 확인 안 한 보고, 주황 '자재 N' = 승인 대기 자재 요청
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, UserRound } from 'lucide-react-native';
import {
  fetchHqMaterials,
  fetchHqSites,
  fetchUnreadCounts,
} from '../api/buildup';
import { errorMessage } from '../api/client';
import { useUser } from '../auth';
import { useDialog } from '../components/Dialog';
import { Text } from '../components/Text';
import { IconButton, Logo } from '../components/ui';
import { seenStore } from '../data/storage';
import { ScreenProps } from '../navigation';
import { colors, shadow } from '../theme';
import { MaterialRequest, SiteSummary } from '../types';
import { pct } from '../utils/format';

export const ORANGE = '#F08C00';

export default function HqHomeScreen({ navigation }: ScreenProps<'HqHome'>) {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const dialog = useDialog();
  const { width } = useWindowDimensions();
  // 현장 상자: 좌우 여백 20 + 사이 간격 12, 한 줄에 두 개
  const tileSize = Math.floor((width - 20 * 2 - 12) / 2);
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [materials, setMaterials] = useState<MaterialRequest[]>([]);

  // 화면에 들어올 때마다 새로(보고를 보고 돌아오면 빨간 숫자가 줄어든다)
  const load = useCallback(async () => {
    try {
      const [s, m, seenMap] = await Promise.all([
        fetchHqSites(),
        fetchHqMaterials(),
        seenStore.load(user.id),
      ]);
      // 현장마다 확인 안 한 보고 수(서버가 세어서 숫자만 준다)
      const counts = await fetchUnreadCounts(
        Object.fromEntries(s.map(x => [x.id, seenMap[x.id] ?? null])),
      ).catch(() => ({} as Record<string, number>));
      setSites(s);
      setUnread(counts);
      setMaterials(m);
    } catch (e) {
      dialog.toast(errorMessage(e), 'error');
      setSites(prev => prev ?? []);
    }
  }, [dialog, user.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const unreadOf = (siteId: string) => unread[siteId] ?? 0;
  const waitingOf = (siteId: string) =>
    materials.filter(m => m.siteId === siteId && m.canApprove).length;

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

      <FlatList
        data={sites ?? []}
        keyExtractor={s => s.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: 24 + insets.bottom },
        ]}
        // 현장이 화면에 다 들어가면 끌어도 움직이지 않게
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.hello}>{user.name}님, 안녕하세요</Text>
            <Text style={styles.role}>
              본사 관계자{user.company ? ` · ${user.company}` : ''}
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.allBtn,
                pressed && styles.pressed,
              ]}
              onPress={() => navigation.navigate('HqReports', {})}
            >
              <Text style={styles.allBtnText}>전체 현장</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <SiteTile
            site={item}
            size={tileSize}
            unread={unreadOf(item.id)}
            waiting={waitingOf(item.id)}
            onPress={() =>
              navigation.navigate('HqReports', {
                siteId: item.id,
                siteName: item.name,
              })
            }
          />
        )}
        ListEmptyComponent={
          sites === null ? (
            <ActivityIndicator style={styles.loading} color={colors.navy} />
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Building2 size={28} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>아직 연결된 현장이 없어요</Text>
              <Text style={styles.emptyDesc}>
                현장 총관리자에게 본사 코드
                {user.companyCode ? ` ${user.companyCode}` : ''}를 알려
                주세요.{'\n'}현장 설정 → 본사 연결에서 입력하면 여기에
                나타나요.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

// 알림 표시: '보고 3', '자재 1'
export function CountBadge({
  label,
  n,
  color,
}: {
  label: string;
  n: number;
  color: string;
}) {
  return (
    <View style={[styles.countBadge, { backgroundColor: color }]}>
      <Text style={styles.countBadgeText}>
        {label} {n > 99 ? '99+' : n}
      </Text>
    </View>
  );
}

// 현장 상자(정사각형): 누르면 그 현장 보고 목록
export const BLUE = '#3457D5';

export function SiteTile({
  site,
  size,
  unread,
  waiting,
  onPress,
}: {
  site: SiteSummary;
  size: number;
  unread: number;
  waiting: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
      accessibilityLabel={`${site.name} 보고 보기, 확인 안 한 보고 ${unread}건, 승인 대기 자재 ${waiting}건, 검토 대기 보고 ${site.pendingReviews ?? 0}건`}
    >
      <View style={styles.tileIcon}>
        <Building2 size={22} color={colors.text} strokeWidth={1.8} />
      </View>
      <View style={styles.badges}>
        {unread > 0 ? (
          <CountBadge label="보고" n={unread} color={colors.danger} />
        ) : null}
        {waiting > 0 ? (
          <CountBadge label="자재" n={waiting} color={ORANGE} />
        ) : null}
        {site.pendingReviews ? (
          <CountBadge label="검토" n={site.pendingReviews} color={BLUE} />
        ) : null}
      </View>
      <View style={styles.tileBottom}>
        <Text style={styles.tileName} numberOfLines={2}>
          {site.name}
        </Text>
        {site.workType ? (
          <Text style={styles.tileType} numberOfLines={1}>
            {site.workType}
          </Text>
        ) : null}
        <Text style={styles.tileProgress}>
          진행률 {pct(site.overallProgress)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.8 },
  topBar: { backgroundColor: colors.background },
  topRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 8,
    gap: 10,
  },
  brand: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
  list: { paddingHorizontal: 20 },
  loading: { marginTop: 40 },

  header: { paddingTop: 12, paddingBottom: 16 },
  hello: { fontSize: 24, fontWeight: '700', color: colors.text },
  role: { fontSize: 14, color: colors.textSub, marginTop: 4 },
  allBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: colors.navy,
    marginTop: 24,
  },
  allBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },

  gridRow: { gap: 12, marginBottom: 12 },
  tile: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    justifyContent: 'space-between',
    ...shadow,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: {
    position: 'absolute',
    top: 14,
    right: 14,
    alignItems: 'flex-end',
    gap: 5,
  },
  countBadge: {
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { fontSize: 12, fontWeight: '800', color: colors.white },
  tileBottom: { gap: 6 },
  tileName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  tileType: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  tileProgress: { fontSize: 13, fontWeight: '600', color: colors.textSub },

  empty: { alignItems: 'center', marginTop: 32, gap: 12 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptyDesc: {
    fontSize: 14,
    color: colors.textSub,
    textAlign: 'center',
    lineHeight: 21,
  },
});
