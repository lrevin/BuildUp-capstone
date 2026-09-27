// 진척 현황: 계획 대비 실적 그래프 + 공정별 비교표 + 완료 예상
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CalendarRange } from 'lucide-react-native';
import { fetchReports, fetchSite } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useUser } from '../auth';
import { useDialog } from '../components/Dialog';
import ProgressChart, {
  ChartLine,
  ChartPoint,
} from '../components/ProgressChart';
import { Text } from '../components/Text';
import { AppHeader, Button, Card } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import { Process, ProcessKey, Report, Site } from '../types';
import {
  STATUS_META,
  addDays,
  overallPlannedAt,
  parseYMD,
  plannedAt,
  scheduleStatus,
  statusText,
} from '../utils/plan';

type SeriesKey = 'all' | ProcessKey;
type RangeKey = '1m' | '3m' | 'all';

const DAY = 24 * 60 * 60 * 1000;
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '1m', label: '1개월' },
  { key: '3m', label: '3개월' },
  { key: 'all', label: '전체 기간' },
];

const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

// 특정 시각의 공정 실적(그 시각까지 마지막 보고 값)
function actualAt(p: Process, asc: Report[], t: number) {
  let v: number | null = null;
  for (const r of asc) {
    if (new Date(r.createdAt).getTime() <= t) {
      v = r.to;
    } else {
      break;
    }
  }
  return v ?? (asc[0] ? asc[0].from : p.progress);
}

export default function ProgressScreen({
  navigation,
  route,
}: ScreenProps<'Progress'>) {
  const { siteId, siteName } = route.params;
  const user = useUser();
  const dialog = useDialog();
  const [site, setSite] = useState<Site | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [series, setSeries] = useState<SeriesKey>('all');
  const [range, setRange] = useState<RangeKey>('1m');

  useFocusEffect(
    useCallback(() => {
      Promise.all([fetchSite(siteId), fetchReports(siteId)])
        .then(([s, rs]) => {
          setSite(s);
          setReports([...rs].reverse()); // 오래된 순
        })
        .catch(e => dialog.toast(errorMessage(e), 'error'));
    }, [siteId, dialog]),
  );

  const data = useMemo(() => {
    if (!site) {
      return null;
    }
    const now = Date.now();
    const byKey = (k: ProcessKey) => reports.filter(r => r.processKey === k);

    // 그래프 전체 기간
    const starts = [
      ...site.processes
        .filter(p => p.planStart)
        .map(p => parseYMD(p.planStart!).getTime()),
      ...(reports[0] ? [new Date(reports[0].createdAt).getTime()] : []),
    ];
    const ends = site.processes
      .filter(p => p.planEnd)
      .map(p => addDays(parseYMD(p.planEnd!), 1).getTime());
    const domainStart = Math.min(now - 30 * DAY, ...starts);
    const domainEnd = Math.max(now + 7 * DAY, ...ends);

    // 매일 표본(전체 진행률은 공정별 값을 비중으로 합산)
    const days: number[] = [];
    for (let t = domainStart; t <= domainEnd; t += DAY) {
      days.push(t);
    }

    const totalWeight = site.processes.reduce((a, p) => a + p.weight, 0);
    const actualLine = (key: SeriesKey): ChartPoint[] => {
      if (key === 'all') {
        return [...days.filter(t => t < now), now].map(t => ({
          x: t,
          y:
            totalWeight > 0
              ? site.processes.reduce(
                  (sum, p) => sum + actualAt(p, byKey(p.key), t) * p.weight,
                  0,
                ) / totalWeight
              : 0,
        }));
      }
      const p = site.processes.find(x => x.key === key)!;
      const rs = byKey(key);
      if (rs.length === 0) {
        return [
          { x: domainStart, y: p.progress },
          { x: now, y: p.progress },
        ];
      }
      const first = new Date(rs[0].createdAt).getTime();
      return [
        { x: Math.max(domainStart, first - DAY), y: rs[0].from },
        ...rs.map(r => ({ x: new Date(r.createdAt).getTime(), y: r.to })),
        { x: now, y: p.progress },
      ];
    };

    const plannedLine = (key: SeriesKey): ChartPoint[] => {
      if (key === 'all') {
        return overallPlannedAt(site.processes) === null
          ? []
          : days.map(t => ({
              x: t,
              y: overallPlannedAt(site.processes, new Date(t))!,
            }));
      }
      const p = site.processes.find(x => x.key === key)!;
      if (!p.planStart || !p.planEnd) {
        return [];
      }
      const s = parseYMD(p.planStart).getTime();
      const e = addDays(parseYMD(p.planEnd), 1).getTime();
      return [
        { x: Math.min(domainStart, s), y: 0 },
        { x: s, y: 0 },
        { x: e, y: 100 },
        { x: Math.max(domainEnd, e), y: 100 },
      ];
    };

    return { now, domainStart, domainEnd, actualLine, plannedLine, byKey };
  }, [site, reports]);

  if (!site || !data) {
    return (
      <View style={styles.root}>
        <AppHeader
          title="진척 현황"
          subtitle={siteName}
          onBack={() => navigation.goBack()}
        />
        <ActivityIndicator style={styles.loading} color={colors.navy} />
      </View>
    );
  }

  const isOwner = site.ownerId === user.id;
  const { now } = data;
  const xMin =
    range === 'all' ? data.domainStart : now - (range === '1m' ? 30 : 90) * DAY;
  const xMax =
    range === 'all' ? data.domainEnd : now + (range === '1m' ? 10 : 30) * DAY;

  const actual = data.actualLine(series);
  const planned = data.plannedLine(series);
  const lines: ChartLine[] = [
    ...(planned.length
      ? [{ points: planned, color: colors.textMuted, dashed: true, width: 2 }]
      : []),
    { points: actual, color: colors.navy, dot: true },
  ];

  // 선택한 항목의 오늘 계획·실적
  const proc =
    series === 'all' ? null : site.processes.find(p => p.key === series)!;
  const actualNow = proc ? proc.progress : site.overallProgress;
  const plannedNow = proc ? plannedAt(proc) : overallPlannedAt(site.processes);
  const status =
    plannedNow !== null ? scheduleStatus(actualNow, plannedNow) : null;

  // 최근 14일 속도로 100% 도달일 예상
  const pastValue = actual.length
    ? (() => {
        const t = now - 14 * DAY;
        let v = actual[0].y;
        for (const pt of actual) {
          if (pt.x <= t) {
            v = pt.y;
          }
        }
        return v;
      })()
    : actualNow;
  const perDay = (actualNow - pastValue) / 14;
  const planEndDate = proc
    ? proc.planEnd
      ? parseYMD(proc.planEnd)
      : null
    : site.processes.every(p => p.planEnd)
    ? new Date(
        Math.max(...site.processes.map(p => parseYMD(p.planEnd!).getTime())),
      )
    : null;
  let forecast: string;
  let forecastLate = false;
  if (actualNow >= 100) {
    forecast = '완료했어요';
  } else if (perDay <= 0.01) {
    forecast = '최근 2주간 진행이 없어 예상할 수 없어요';
    forecastLate = true;
  } else {
    const eta = new Date(now + ((100 - actualNow) / perDay) * DAY);
    forecast = `지금 속도(하루 ${perDay.toFixed(
      1,
    )}%p)면 ${eta.getFullYear()}.${md(eta).replace('/', '.')} 완료 예상`;
    if (planEndDate) {
      const late = Math.round((eta.getTime() - planEndDate.getTime()) / DAY);
      forecast +=
        late > 0 ? ` · 계획보다 ${late}일 늦어요` : ' · 계획 안에 끝나요';
      forecastLate = late > 0;
    }
  }

  const noPlan = site.processes.every(p => !p.planStart);

  return (
    <View style={styles.root}>
      <AppHeader
        title="진척 현황"
        subtitle={site.name}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* 항목 선택 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {(['all', ...site.processes.map(p => p.key)] as SeriesKey[]).map(
            k => {
              const active = k === series;
              const label =
                k === 'all'
                  ? '전체'
                  : site.processes.find(p => p.key === k)!.name;
              return (
                <Pressable
                  key={k}
                  onPress={() => setSeries(k)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            },
          )}
        </ScrollView>

        {/* 요약 */}
        <Card>
          <View style={styles.summary}>
            <View style={styles.flex}>
              <Text style={styles.sumLabel}>실적</Text>
              <Text style={styles.sumValue}>{actualNow.toFixed(1)}%</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.sumLabel}>오늘 계획</Text>
              <Text style={[styles.sumValue, styles.sumPlan]}>
                {plannedNow !== null ? `${plannedNow.toFixed(1)}%` : '-'}
              </Text>
            </View>
            {status ? (
              <View
                style={[
                  styles.statusChip,
                  { backgroundColor: STATUS_META[status.status].bg },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    { color: STATUS_META[status.status].color },
                  ]}
                >
                  {statusText(status.diff, status.status)}
                </Text>
              </View>
            ) : null}
          </View>

          <ProgressChart lines={lines} xMin={xMin} xMax={xMax} today={now} />

          <View style={styles.legendRow}>
            <View style={styles.legend}>
              <View
                style={[styles.legendLine, { backgroundColor: colors.navy }]}
              />
              <Text style={styles.legendText}>실적</Text>
            </View>
            <View style={styles.legend}>
              <View style={styles.legendDash} />
              <Text style={styles.legendText}>계획</Text>
            </View>
            <View style={styles.ranges}>
              {RANGES.map(r => (
                <Pressable
                  key={r.key}
                  onPress={() => setRange(r.key)}
                  hitSlop={6}
                >
                  <Text
                    style={[
                      styles.range,
                      range === r.key && styles.rangeActive,
                    ]}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.forecast, forecastLate && styles.forecastLate]}>
            <Text
              style={[
                styles.forecastText,
                forecastLate && styles.forecastLateText,
              ]}
            >
              {forecast}
            </Text>
          </View>
        </Card>

        {noPlan ? (
          <Card style={styles.gap}>
            <View style={styles.emptyRow}>
              <CalendarRange size={22} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                공정 계획을 정하면 계획선과 지연 여부가 함께 보여요.
              </Text>
            </View>
            {isOwner ? (
              <Button
                title="공정 계획 정하기"
                variant="outline"
                onPress={() => navigation.navigate('Plan', { siteId })}
                style={styles.emptyBtn}
              />
            ) : null}
          </Card>
        ) : null}

        {/* 공정별 비교 */}
        <Card style={styles.gap}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colName]}>공정</Text>
            <Text style={[styles.th, styles.colNum]}>계획</Text>
            <Text style={[styles.th, styles.colNum]}>실적</Text>
            <Text style={[styles.th, styles.colStatusText]}>상태</Text>
          </View>
          {site.processes.map(p => {
            const pl = plannedAt(p);
            const st = pl !== null ? scheduleStatus(p.progress, pl) : null;
            const active = series === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setSeries(p.key)}
                style={[styles.tr, active && styles.trActive]}
              >
                <Text style={[styles.td, styles.colName, styles.tdName]}>
                  {p.name}
                  <Text style={styles.weight}>
                    {' '}
                    {Math.round(
                      (p.weight /
                        (site.processes.reduce((a, x) => a + x.weight, 0) ||
                          1)) *
                        100,
                    )}
                    %
                  </Text>
                </Text>
                <Text style={[styles.td, styles.colNum]}>
                  {pl !== null ? pl.toFixed(1) : '-'}
                </Text>
                <Text style={[styles.td, styles.colNum, styles.tdStrong]}>
                  {p.progress.toFixed(1)}
                </Text>
                <View style={styles.colStatus}>
                  {st ? (
                    <View
                      style={[
                        styles.statusChip,
                        styles.chipRight,
                        { backgroundColor: STATUS_META[st.status].bg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: STATUS_META[st.status].color },
                        ]}
                      >
                        {st.status === 'ontrack'
                          ? '정상'
                          : `${st.diff > 0 ? '+' : ''}${st.diff.toFixed(1)}`}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.noPlan}>미설정</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
          <Text style={styles.footnote}>
            계획은 시작일 0%에서 완료일 100%까지 매일 같은 만큼 진행한다고 보고
            계산해요. 차이가 ±3%p 안이면 정상이에요.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  loading: { marginTop: 40 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  gap: { marginTop: 12 },

  chips: { gap: 6, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 14, color: colors.textSub, fontWeight: '500' },
  chipTextActive: { color: colors.white, fontWeight: '700' },

  summary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 8,
  },
  sumLabel: { fontSize: 13, color: colors.textSub },
  sumValue: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  sumPlan: { color: colors.textMuted, fontWeight: '700' },
  statusChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  statusText: { fontSize: 12, fontWeight: '700' },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 4,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 16, height: 3, borderRadius: 2 },
  legendDash: {
    width: 16,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.textMuted,
  },
  legendText: { fontSize: 12, color: colors.textSub },
  ranges: { marginLeft: 'auto', flexDirection: 'row', gap: 10 },
  range: { fontSize: 12, color: colors.textMuted },
  rangeActive: { color: colors.text, fontWeight: '700' },

  forecast: {
    marginTop: 14,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  forecastLate: { backgroundColor: '#FDECEC' },
  forecastText: { fontSize: 13, color: colors.textSub, lineHeight: 19 },
  forecastLateText: { color: '#B42328' },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyText: { flex: 1, fontSize: 14, color: colors.textSub, lineHeight: 20 },
  emptyBtn: { marginTop: 14, height: 46 },

  tableHead: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  th: { fontSize: 12, color: colors.textMuted },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  trActive: { backgroundColor: colors.fill },
  td: { fontSize: 15, color: colors.textSub, fontVariant: ['tabular-nums'] },
  tdName: { color: colors.text, fontWeight: '600' },
  tdStrong: { color: colors.text, fontWeight: '700' },
  weight: { fontSize: 12, color: colors.textMuted, fontWeight: '400' },
  colName: { flex: 1.4 },
  colNum: { flex: 1, textAlign: 'right' },
  colStatus: { flex: 1.2, alignItems: 'flex-end' },
  colStatusText: { flex: 1.2, textAlign: 'right' },
  chipRight: { alignSelf: 'flex-end' }, // 표 안에서는 오른쪽 끝에 붙인다
  noPlan: { fontSize: 12, color: colors.textMuted },
  footnote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 12,
  },
});
