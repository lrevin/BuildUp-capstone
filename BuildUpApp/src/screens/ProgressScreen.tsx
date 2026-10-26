// 진척 현황: 현장 전체 진행률이 보고마다 어떻게 올라왔는지(그래프 + 최근 변화)
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchReports, fetchSite } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import ProgressChart, { ChartPoint } from '../components/ProgressChart';
import ProgressRing from '../components/ProgressRing';
import { Text } from '../components/Text';
import { AppHeader, Card } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import { Report, Site } from '../types';
import { formatDate, pct } from '../utils/format';

type RangeKey = '1m' | '3m' | 'all';

const DAY = 24 * 60 * 60 * 1000;
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '1m', label: '1개월' },
  { key: '3m', label: '3개월' },
  { key: 'all', label: '전체' },
];

const md = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function ProgressScreen({
  navigation,
  route,
}: ScreenProps<'Progress'>) {
  const { siteId, siteName } = route.params;
  const dialog = useDialog();
  const [site, setSite] = useState<Site | null>(null);
  const [reports, setReports] = useState<Report[]>([]); // 오래된 순
  const [range, setRange] = useState<RangeKey>('1m');

  useFocusEffect(
    useCallback(() => {
      Promise.all([fetchSite(siteId), fetchReports(siteId)])
        .then(([s, rs]) => {
          setSite(s);
          setReports([...rs].reverse());
        })
        .catch(e => dialog.toast(errorMessage(e), 'error'));
    }, [siteId, dialog]),
  );

  const chart = useMemo(() => {
    const now = Date.now();
    // 보고마다 '보고 후 진행률' 한 점(첫 보고 전 값으로 시작)
    const points: ChartPoint[] = [];
    if (reports.length > 0) {
      const first = reports[0];
      points.push({
        x: new Date(first.createdAt).getTime() - DAY / 2,
        y: first.from,
      });
    }
    reports.forEach(r =>
      points.push({ x: new Date(r.createdAt).getTime(), y: r.to }),
    );
    if (site && points.length > 0) {
      points.push({ x: now, y: site.overallProgress });
    }
    const start =
      range === 'all'
        ? Math.min(now - 7 * DAY, points[0]?.x ?? now)
        : now - (range === '1m' ? 30 : 90) * DAY;
    return { points, xMin: start, xMax: now + DAY, now };
  }, [reports, site, range]);

  // 최근 7일 동안 오른 진행률
  const weekGain = useMemo(() => {
    const since = Date.now() - 7 * DAY;
    return reports
      .filter(r => new Date(r.createdAt).getTime() >= since)
      .reduce((sum, r) => sum + (r.to - r.from), 0);
  }, [reports]);

  return (
    <View style={styles.root}>
      <AppHeader
        title="진척 현황"
        subtitle={siteName}
        onBack={() => navigation.goBack()}
      />
      {!site ? (
        <ActivityIndicator style={styles.loading} color={colors.navy} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* 지금 진행률 */}
          <Card style={styles.hero}>
            <View style={styles.heroRow}>
              <ProgressRing value={site.overallProgress} />
              <View style={styles.heroSide}>
                <Text style={styles.heroLabel}>현장 전체 진행률</Text>
                {site.workType ? (
                  <Text style={styles.heroType}>{site.workType}</Text>
                ) : null}
                <Text style={styles.heroMeta}>
                  보고 {reports.length}건
                  {site.lastReportedAt
                    ? ` · 마지막 ${formatDate(new Date(site.lastReportedAt))}`
                    : ''}
                </Text>
                <Text style={styles.heroMeta}>
                  최근 7일 +{weekGain.toFixed(1)}%p
                </Text>
              </View>
            </View>
          </Card>

          {/* 자동 계산 현장: 공정별 진행률과 가중치 */}
          {site.progressMode === 'auto' && site.processes?.length ? (
            <Card style={styles.gap}>
              <Text style={styles.cardTitle}>공정별 진행률</Text>
              <Text style={styles.procHint}>
                가중치에 따라 전체 진행률에 반영돼요
              </Text>
              {site.processes.map(p => (
                <View key={p.key} style={styles.procRow}>
                  <View style={styles.procTop}>
                    <Text style={styles.procName}>
                      {p.name}{' '}
                      <Text style={styles.procWeight}>가중치 {p.weight}%</Text>
                    </Text>
                    <Text style={styles.procPct}>{pct(p.progress)}</Text>
                  </View>
                  <View style={styles.procTrack}>
                    <View
                      style={[styles.procFill, { width: `${p.progress}%` }]}
                    />
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          {/* 진행률 추이 */}
          <Card style={styles.gap}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle}>진행률 추이</Text>
              <View style={styles.ranges}>
                {RANGES.map(r => (
                  <Pressable
                    key={r.key}
                    style={[styles.range, range === r.key && styles.rangeOn]}
                    onPress={() => setRange(r.key)}
                  >
                    <Text
                      style={[
                        styles.rangeText,
                        range === r.key && styles.rangeTextOn,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {chart.points.length > 1 ? (
              <ProgressChart
                lines={[
                  {
                    points: chart.points,
                    color: colors.navy,
                    width: 2.5,
                    dot: true,
                  },
                ]}
                xMin={chart.xMin}
                xMax={chart.xMax}
                today={chart.now}
              />
            ) : (
              <Text style={styles.empty}>
                보고가 쌓이면 진행률이 어떻게 올라왔는지 그래프로 보여 드려요.
              </Text>
            )}
          </Card>

          {/* 최근 변화 */}
          <Card style={styles.gap}>
            <Text style={[styles.cardTitle, styles.listTitle]}>
              최근 진행률 변화
            </Text>
            {reports.length === 0 ? (
              <Text style={styles.empty}>아직 보고가 없어요.</Text>
            ) : (
              [...reports]
                .reverse()
                .slice(0, 10)
                .map((r, i) => (
                  <Pressable
                    key={r.id}
                    style={[styles.row, i > 0 && styles.rowBorder]}
                    onPress={() =>
                      navigation.navigate('ReportDetail', { report: r })
                    }
                  >
                    <Text style={styles.rowDate}>{md(r.createdAt)}</Text>
                    <View style={styles.flex}>
                      <Text style={styles.rowWork} numberOfLines={1}>
                        {r.work || r.processName}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {pct(r.from)} → {pct(r.to)} · {r.author}
                      </Text>
                    </View>
                    <Text style={styles.rowDiff}>
                      +{(r.to - r.from).toFixed(1)}
                    </Text>
                  </Pressable>
                ))
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  loading: { marginTop: 48 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  gap: { marginTop: 12 },
  procHint: {
    fontSize: 12,
    color: colors.textSub,
    marginTop: 4,
    marginBottom: 6,
  },
  procRow: { marginTop: 12 },
  procTop: { flexDirection: 'row', justifyContent: 'space-between' },
  procName: { fontSize: 15, fontWeight: '600', color: colors.text },
  procWeight: { fontSize: 12, color: colors.textMuted, fontWeight: '400' },
  procPct: { fontSize: 15, fontWeight: '700', color: colors.text },
  procTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    marginTop: 6,
    overflow: 'hidden',
  },
  procFill: { height: 6, backgroundColor: colors.navy },
  hero: { backgroundColor: colors.navy },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  heroSide: { flex: 1, gap: 4 },
  heroLabel: { fontSize: 14, color: '#A9B0C0' },
  heroType: { fontSize: 15, fontWeight: '700', color: colors.white },
  heroMeta: { fontSize: 13, color: '#C9CEDA' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  listTitle: { marginBottom: 6 },
  ranges: { flexDirection: 'row', gap: 4 },
  range: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: radius.sm,
    justifyContent: 'center',
  },
  rangeOn: { backgroundColor: colors.navy },
  rangeText: { fontSize: 13, fontWeight: '600', color: colors.textSub },
  rangeTextOn: { color: colors.white },
  empty: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
    lineHeight: 21,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowDate: {
    width: 42,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSub,
  },
  rowWork: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowDiff: { fontSize: 14, fontWeight: '700', color: '#B7800A' },
});
