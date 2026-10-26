// 본사 관계자: 현장 보고 목록(현장 하나 또는 전체 현장). 들어오면 '확인한 보고'로 기록한다.
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Package, TrendingUp } from 'lucide-react-native';
import {
  fetchHqReportPage,
  fetchHqSites,
  fetchMaterials,
  fetchReportPage,
} from '../api/buildup';
import { useUser } from '../auth';
import { Text } from '../components/Text';
import { AppHeader } from '../components/ui';
import ExcelExportButton from '../components/ExcelExportButton';
import { usePagedReports } from '../components/usePagedReports';
import { seenStore } from '../data/storage';
import { ScreenProps } from '../navigation';
import { colors, shadow } from '../theme';
import { ListFooter, ReportCard, groupByDate } from './HistoryScreen';

export default function HqReportsScreen({
  navigation,
  route,
}: ScreenProps<'HqReports'>) {
  const { siteId, siteName } = route.params;
  const insets = useSafeAreaInsets();
  const user = useUser();
  const [refreshing, setRefreshing] = useState(false);
  const [waiting, setWaiting] = useState(0); // 승인 대기 자재 요청

  // 현장 하나면 그 현장 보고, 아니면 연결된 모든 현장 보고(30건씩)
  const loader = useCallback(
    (cursor: string | null) =>
      siteId ? fetchReportPage(siteId, { cursor }) : fetchHqReportPage(cursor),
    [siteId],
  );
  const {
    items: reports,
    total,
    loadingMore,
    error,
    reload,
    loadMore,
  } = usePagedReports(loader);

  const load = useCallback(async () => {
    await reload();
    try {
      if (siteId) {
        const mats = await fetchMaterials(siteId);
        setWaiting(mats.filter(m => m.canApprove).length);
        await seenStore.markSeen(user.id, [siteId]);
      } else {
        const sites = await fetchHqSites();
        await seenStore.markSeen(
          user.id,
          sites.map(s => s.id),
        );
      }
    } catch {
      // 목록 오류는 아래 빈 화면 문구로 보여 준다
    }
  }, [reload, siteId, user.id]);

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

  return (
    <View style={styles.root}>
      <AppHeader
        title={siteId ? siteName ?? '현장 보고' : '전체 현장 보고'}
        subtitle={total !== null ? `보고 ${total}건` : undefined}
        onBack={() => navigation.goBack()}
        right={siteId ? <ExcelExportButton siteId={siteId} /> : undefined}
      />
      {reports === null ? (
        <ActivityIndicator
          style={styles.loading}
          color={colors.navy}
          size="large"
        />
      ) : (
        <SectionList
          sections={groupByDate(reports)}
          keyExtractor={r => r.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: 24 + insets.bottom },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListFooterComponent={<ListFooter loading={loadingMore} />}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            siteId ? (
              <View style={styles.menu}>
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.pressed,
                  ]}
                  onPress={() =>
                    navigation.navigate('Materials', {
                      siteId,
                      siteName: siteName ?? '',
                    })
                  }
                >
                  <Package size={20} color={colors.text} />
                  <Text style={styles.rowLabel}>자재 요청</Text>
                  {waiting > 0 ? (
                    <View style={styles.waitBadge}>
                      <Text style={styles.waitText}>승인 대기 {waiting}</Text>
                    </View>
                  ) : null}
                  <ChevronRight size={18} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    styles.rowBorder,
                    pressed && styles.pressed,
                  ]}
                  onPress={() =>
                    navigation.navigate('Progress', {
                      siteId,
                      siteName: siteName ?? '',
                    })
                  }
                >
                  <TrendingUp size={20} color={colors.text} />
                  <Text style={styles.rowLabel}>진척 현황</Text>
                  <ChevronRight size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : undefined
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.dateTitle}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <ReportCard
              report={item}
              showSite={!siteId}
              onPress={() =>
                navigation.navigate('ReportDetail', { report: item })
              }
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error
                ? '보고를 불러오지 못했어요.'
                : '아직 올라온 현장 보고가 없어요.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loading: { marginTop: 48 },
  list: { paddingHorizontal: 20 },
  dateTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSub,
    marginTop: 20,
    marginBottom: 8,
  },
  empty: { textAlign: 'center', color: colors.textSub, marginTop: 48 },
  pressed: { opacity: 0.7 },
  menu: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 20,
    marginTop: 16,
    ...shadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  waitBadge: {
    backgroundColor: '#FFF1DC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  waitText: { fontSize: 12, fontWeight: '700', color: '#C26D00' },
});
