// 현장 자재 요청 목록: 상태별 보기, 관리자·본사 승인·반려, 작성자 취소
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Package } from 'lucide-react-native';
import { fetchMaterials, fetchSite } from '../api/buildup';
import { useUser } from '../auth';
import {
  MATERIAL_STATUS_META,
  MaterialCard,
  formatQty,
} from '../components/Material';
import { Text } from '../components/Text';
import { AppHeader, BottomBar, Button } from '../components/ui';
import { useMaterialActions } from '../components/useMaterialActions';
import { ScreenProps } from '../navigation';
import { colors, radius, shadow } from '../theme';
import { MaterialRequest, MaterialStatus, Site } from '../types';

type Filter = MaterialStatus | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'requested', label: '승인 대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
  { key: 'all', label: '전체' },
];

const isOpen = (m: MaterialRequest) => m.status === 'requested';

const matches = (m: MaterialRequest, f: Filter) =>
  f === 'all' || m.status === f;

// 내가 처리할 수 있는 요청 → 긴급 → 최신순(서버 순서 유지)
const canAct = (m: MaterialRequest) => m.canApprove;
const sortForAction = (list: MaterialRequest[]) =>
  [...list].sort(
    (a, b) =>
      Number(canAct(b)) - Number(canAct(a)) ||
      Number(b.urgent && isOpen(b)) - Number(a.urgent && isOpen(a)),
  );

export default function MaterialsScreen({
  navigation,
  route,
}: ScreenProps<'Materials'>) {
  const { siteId, siteName } = route.params;
  const user = useUser();
  const [list, setList] = useState<MaterialRequest[] | null>(null);
  const [filter, setFilter] = useState<Filter>('requested');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // 현장 자재 재고(남은 양): 보고가 승인되면 사용한 만큼 줄어든다
  const [site, setSite] = useState<Site | null>(null);

  const load = useCallback(async () => {
    fetchSite(siteId)
      .then(setSite)
      .catch(() => {});
    try {
      setError(null);
      setList(await fetchMaterials(siteId));
    } catch {
      setError('자재 요청을 불러오지 못했어요.');
    }
  }, [siteId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const { busyId, handle } = useMaterialActions((id, updated) => {
    setList(prev =>
      prev
        ? updated
          ? prev.map(x => (x.id === id ? updated : x))
          : prev.filter(x => x.id !== id)
        : prev,
    );
  }, load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shown = list ? sortForAction(list.filter(m => matches(m, filter))) : [];
  const count = (f: Filter) =>
    list ? list.filter(m => matches(m, f)).length : 0;
  const todo = list ? list.filter(canAct).length : 0;
  const isHq = user.role === 'hq';
  const isOwner = site?.ownerId === user.id;
  const stock = site?.materials ?? [];

  // 현장 자재 재고 카드(최고 책임자는 수정 가능)
  const stockCard =
    site && (stock.length > 0 || isOwner) ? (
      <View style={styles.stock}>
        <View style={styles.stockHead}>
          <Text style={styles.stockTitle}>현장 자재 (남은 양)</Text>
          {isOwner ? (
            <Pressable
              hitSlop={8}
              onPress={() =>
                navigation.navigate('SiteStock', { siteId, siteName })
              }
            >
              <Text style={styles.stockEdit}>
                {stock.length > 0 ? '수정' : '자재 넣기'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {stock.length === 0 ? (
          <Text style={styles.stockEmpty}>
            지금 현장에 있는 자재를 넣어 두면 남은 양을 볼 수 있어요.
          </Text>
        ) : (
          stock.map(m => (
            <View key={`${m.name}|${m.unit}`} style={styles.stockRow}>
              <Text style={styles.stockName} numberOfLines={1}>
                {m.name}
              </Text>
              <Text
                style={[styles.stockQty, m.quantity <= 0 && styles.stockOut]}
              >
                {formatQty(m.quantity)}
                {m.unit}
              </Text>
            </View>
          ))
        )}
        {stock.length > 0 ? (
          <Text style={styles.stockHint}>
            보고가 승인되면 사용한 양만큼 자동으로 빠져요.
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <AppHeader
        title="자재 요청"
        subtitle={siteName}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map(f => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filter, active && styles.filterActive]}
              >
                <Text
                  style={[styles.filterText, active && styles.filterTextActive]}
                >
                  {f.label} {count(f.key)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {list === null && !error ? (
        <View style={styles.flex}>
          <ActivityIndicator
            style={styles.loading}
            color={colors.navy}
            size="large"
          />
        </View>
      ) : (
        <FlatList
          style={styles.flex}
          data={shown}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <>
              {stockCard}
              {todo > 0 ? (
                <View style={styles.banner}>
                  <Text style={styles.bannerText}>
                    내가 처리할 요청이 {todo}건 있어요
                  </Text>
                </View>
              ) : null}
            </>
          }
          renderItem={({ item }) => (
            <MaterialCard
              request={item}
              busy={busyId === item.id}
              onAction={a => handle(item, a)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Package size={36} color={colors.textMuted} strokeWidth={1.6} />
              <Text style={styles.emptyText}>
                {error ??
                  (filter === 'requested'
                    ? '승인을 기다리는 자재 요청이 없어요.'
                    : `${
                        filter === 'all'
                          ? ''
                          : `${MATERIAL_STATUS_META[filter].label} 상태인 `
                      }자재 요청이 없어요.`)}
              </Text>
            </View>
          }
        />
      )}

      {/* 본사 관계자는 요청을 받는 쪽이라 새 요청 버튼이 없다 */}
      {!isHq ? (
        <BottomBar>
          <Button
            title="새 자재 요청"
            onPress={() =>
              navigation.navigate('MaterialRequest', { siteId, siteName })
            }
          />
        </BottomBar>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  loading: { marginTop: 48 },
  filterBar: {
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filters: { paddingHorizontal: 20, paddingVertical: 10, gap: 6 },
  filter: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  filterActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  filterText: { fontSize: 14, color: colors.textSub, fontWeight: '500' },
  filterTextActive: { color: colors.white, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  banner: {
    backgroundColor: colors.yellowSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  bannerText: { fontSize: 13, fontWeight: '600', color: '#8A5E00' },
  empty: { alignItems: 'center', marginTop: 64, gap: 12 },
  stock: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 12,
    ...shadow,
  },
  stockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stockTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  stockEdit: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 12,
  },
  stockName: { flex: 1, fontSize: 15, color: colors.text },
  stockQty: { fontSize: 15, fontWeight: '700', color: colors.text },
  stockOut: { color: colors.danger },
  stockEmpty: { fontSize: 13, color: colors.textSub, lineHeight: 19 },
  stockHint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  emptyText: { fontSize: 14, color: colors.textSub },
});
