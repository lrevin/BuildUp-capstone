import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Paperclip } from 'lucide-react-native';
import { ReviewBadge } from '../components/Review';
import { fetchReportPage } from '../api/buildup';
import { useUser } from '../auth';
import { seenStore } from '../data/storage';
import { AppHeader } from '../components/ui';
import ExcelExportButton from '../components/ExcelExportButton';
import { usePagedReports } from '../components/usePagedReports';
import { WEATHER_META, workLogSummary } from '../components/WorkLog';
import { ScreenProps } from '../navigation';
import { colors, radius, shadow } from '../theme';
import { ProcessKey, Report } from '../types';
import { formatDate, formatTime, pct } from '../utils/format';

interface Section {
  title: string;
  data: Report[];
}

// 날짜별로 묶기(최신 날짜가 위). 본사 보고 화면에서도 사용
export function groupByDate(reports: Report[]): Section[] {
  const map = new Map<string, Report[]>();
  reports.forEach(r => {
    const key = formatDate(new Date(r.createdAt));
    map.set(key, [...(map.get(key) ?? []), r]);
  });
  return [...map.entries()].map(([title, data]) => ({ title, data }));
}

// 목록 맨 아래: 더 불러오는 중이면 돌아가는 표시
export function ListFooter({ loading }: { loading: boolean }) {
  return loading ? (
    <ActivityIndicator style={styles.moreLoading} color={colors.navy} />
  ) : null;
}

export default function HistoryScreen({
  navigation,
  route,
}: ScreenProps<'History'>) {
  const insets = useSafeAreaInsets();
  const { siteId, siteName } = route.params;
  const user = useUser();
  const [filter, setFilter] = useState<ProcessKey | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);

  // 30건씩 나눠 불러오기(공정 필터는 서버에서 거른다)
  const loader = useCallback(
    (cursor: string | null) =>
      fetchReportPage(siteId, {
        cursor,
        processKey: filter === 'all' ? null : filter,
      }),
    [siteId, filter],
  );
  const { items, total, processes, loadingMore, error, reload, loadMore } =
    usePagedReports(loader);

  // 화면에 들어올 때마다(필터를 바꿔도) 처음부터 새로 불러오기
  useFocusEffect(
    useCallback(() => {
      reload();
      // 이력을 봤으면 현장 상자의 '보고 N' 알림을 지운다
      seenStore.markSeen(user.id, [siteId]);
    }, [reload, siteId, user.id]),
  );

  // 고른 공정의 보고가 모두 지워졌으면 '전체'로
  useEffect(() => {
    if (processes && filter !== 'all' && !processes.some(p => p.key === filter)) {
      setFilter('all');
    }
  }, [processes, filter]);

  const filters = [
    { key: 'all' as const, label: '전체', count: total },
    ...(processes ?? []).map(p => ({
      key: p.key,
      label: p.name,
      count: p.count as number | null,
    })),
  ];
  const sections = items ? groupByDate(items) : null;

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title="보고 이력"
        subtitle={siteName}
        onBack={() => navigation.goBack()}
        right={<ExcelExportButton siteId={siteId} />}
      />

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map(f => {
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
                  {f.label}
                  {f.count !== null ? ` ${f.count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {sections === null ? (
        <ActivityIndicator
          style={styles.loading}
          color={colors.navy}
          size="large"
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
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
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <ReportCard
              report={item}
              onPress={() =>
                navigation.navigate('ReportDetail', { report: item })
              }
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error
                ? '보고 이력을 불러오지 못했어요.'
                : filter === 'all'
                ? '아직 제출한 보고가 없어요.'
                : '이 공정의 보고가 없어요.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

// 보고 카드(본사 화면에서도 사용: showSite면 현장 이름 표시)
export function ReportCard({
  report,
  onPress,
  showSite,
}: {
  report: Report;
  onPress: () => void;
  showSite?: boolean;
}) {
  const diff = report.to - report.from;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      {showSite && report.siteName ? (
        <Text style={styles.siteName} numberOfLines={1}>
          {report.siteName}
        </Text>
      ) : null}
      <View style={styles.cardTop}>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{report.processName}</Text>
          </View>
          <ReviewBadge status={report.review?.status} />
          {report.checks?.length ? (
            <AlertTriangle size={15} color="#C26D00" />
          ) : null}
        </View>
        <Text style={styles.time}>
          {formatTime(report.createdAt)} · {report.author}
        </Text>
      </View>

      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          {pct(report.from)} →{' '}
          <Text style={styles.progressTo}>{pct(report.to)}</Text>
        </Text>
        <Text style={styles.diff}>+{diff.toFixed(1)}%p</Text>
      </View>

      {report.memo ? (
        <Text style={styles.memo} numberOfLines={2}>
          {report.memo}
        </Text>
      ) : null}

      {workLogSummary(report.workLog) ? (
        <View style={styles.logRow}>
          {report.workLog.weather
            ? React.createElement(WEATHER_META[report.workLog.weather].Icon, {
                size: 14,
                color: colors.textSub,
              })
            : null}
          <Text style={styles.logText}>{workLogSummary(report.workLog)}</Text>
        </View>
      ) : null}

      {report.files?.length ? (
        <View style={styles.logRow}>
          <Paperclip size={14} color={colors.textSub} />
          <Text style={styles.logText}>
            첨부 파일 {report.files.length}개
          </Text>
        </View>
      ) : null}

      {report.photoUris.length > 0 ? (
        <View style={styles.photos}>
          {report.photoUris.slice(0, 4).map(uri => (
            <Image key={uri} source={{ uri }} style={styles.photo} />
          ))}
          {report.photoUris.length > 4 ? (
            <View style={[styles.photo, styles.more]}>
              <Text style={styles.moreText}>
                +{report.photoUris.length - 4}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loading: { marginTop: 48 },
  moreLoading: { marginVertical: 16 },
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
  cardPressed: { backgroundColor: '#FAFAFB' },
  list: { paddingHorizontal: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSub,
    marginTop: 20,
    marginBottom: 8,
  },
  empty: { textAlign: 'center', color: colors.textSub, marginTop: 48 },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 8,
    ...shadow,
  },
  siteName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSub,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: {
    backgroundColor: colors.fill,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  time: { fontSize: 12, color: colors.textMuted },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  progressText: { fontSize: 14, color: colors.textSub },
  progressTo: { fontSize: 18, fontWeight: '700', color: colors.text },
  diff: { fontSize: 14, fontWeight: '700', color: '#B7800A' },
  memo: { fontSize: 14, color: colors.text, marginTop: 10, lineHeight: 21 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  logText: { fontSize: 13, color: colors.textSub },
  photos: { flexDirection: 'row', gap: 6, marginTop: 12 },
  photo: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.track,
  },
  more: { alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 13, fontWeight: '700', color: colors.textSub },
  noPhoto: { fontSize: 12, color: colors.textMuted, marginTop: 10 },
});
