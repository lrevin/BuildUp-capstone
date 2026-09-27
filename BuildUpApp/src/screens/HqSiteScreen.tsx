// 본사 관계자: 연결된 현장 한 곳의 현황(보기 전용)
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Package,
  TrendingUp,
  Users,
} from 'lucide-react-native';
import { fetchMaterials, fetchReports, fetchSite } from '../api/buildup';
import { Text } from '../components/Text';
import { AppHeader, Button, Card } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors } from '../theme';
import { MaterialRequest, Report, Site } from '../types';
import { isToday } from '../utils/format';
import {
  STATUS_META,
  overallPlannedAt,
  plannedAt,
  scheduleStatus,
  statusText,
} from '../utils/plan';
import { ReportCard } from './HistoryScreen';

const ICON = { size: 20, color: colors.text, strokeWidth: 2 };

export default function HqSiteScreen({
  navigation,
  route,
}: ScreenProps<'HqSite'>) {
  const { siteId, siteName } = route.params;
  const [site, setSite] = useState<Site | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [materials, setMaterials] = useState<MaterialRequest[]>([]);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const [s, r, m] = await Promise.all([
        fetchSite(siteId),
        fetchReports(siteId),
        fetchMaterials(siteId),
      ]);
      setSite(s);
      setReports(r);
      setMaterials(m);
    } catch {
      setError(true);
    }
  }, [siteId]);

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

  if (!site) {
    return (
      <View style={styles.root}>
        <AppHeader title={siteName} onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={styles.errorText}>현장 정보를 불러오지 못했어요.</Text>
              <Button title="다시 시도" onPress={load} style={styles.retry} />
            </>
          ) : (
            <ActivityIndicator color={colors.navy} size="large" />
          )}
        </View>
      </View>
    );
  }

  const planned = overallPlannedAt(site.processes);
  const status =
    planned !== null ? scheduleStatus(site.overallProgress, planned) : null;
  const reportedToday = site.processes.filter(p =>
    isToday(p.lastReportedAt),
  ).length;
  const toDecide = materials.filter(m => m.canApprove).length;

  const rows: {
    icon: React.ReactNode;
    label: string;
    desc?: string;
    highlight?: boolean;
    onPress: () => void;
  }[] = [
    {
      icon: <Package {...ICON} />,
      label: '자재 요청',
      desc: toDecide > 0 ? `승인 대기 ${toDecide}건` : `${materials.length}건`,
      highlight: toDecide > 0,
      onPress: () => navigation.navigate('Materials', { siteId, siteName: site.name }),
    },
    {
      icon: <TrendingUp {...ICON} />,
      label: '진척 현황',
      desc: '계획 대비 실적 그래프',
      onPress: () => navigation.navigate('Progress', { siteId, siteName: site.name }),
    },
    {
      icon: <ClipboardList {...ICON} />,
      label: '보고 이력',
      desc: `${reports.length}건`,
      onPress: () => navigation.navigate('History', { siteId, siteName: site.name }),
    },
    {
      icon: <Users {...ICON} />,
      label: '참여자',
      desc: `${site.memberCount}명`,
      onPress: () =>
        navigation.navigate('Members', {
          siteId,
          siteName: site.name,
          isOwner: false,
        }),
    },
  ];

  return (
    <View style={styles.root}>
      <AppHeader
        title={site.name}
        subtitle={site.address}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 전체 진행률 + 공정별 */}
        <Card>
          <View style={styles.overallRow}>
            <Text style={styles.label}>
              전체 진행률 ·{' '}
              <Text style={styles.strong}>
                오늘 보고 {reportedToday}/{site.processes.length}
              </Text>
            </Text>
            <Text style={styles.overallValue}>
              {site.overallProgress.toFixed(1)}
              <Text style={styles.overallUnit}>%</Text>
            </Text>
          </View>
          <View style={styles.trackWrap}>
            <View style={styles.track}>
              <View
                style={[styles.fill, { width: `${site.overallProgress}%` }]}
              />
            </View>
            {planned !== null ? (
              <View style={[styles.tick, { left: `${planned}%` }]} />
            ) : null}
          </View>
          <View style={styles.planRow}>
            {status ? (
              <>
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
                <Text style={styles.sub}>계획 {planned?.toFixed(1)}%</Text>
              </>
            ) : (
              <Text style={styles.sub}>공정 계획이 아직 없어요</Text>
            )}
          </View>

          <View style={styles.processes}>
            {site.processes.map(p => {
              const pp = plannedAt(p);
              const late =
                pp !== null && scheduleStatus(p.progress, pp).status === 'behind';
              return (
                <View key={p.key} style={styles.pRow}>
                  <View style={styles.pName}>
                    <Text style={styles.pNameText}>{p.name}</Text>
                    {isToday(p.lastReportedAt) ? (
                      <CircleCheck size={13} color={colors.success} />
                    ) : null}
                  </View>
                  <View style={styles.pTrackWrap}>
                    <View style={styles.pTrack}>
                      <View
                        style={[styles.pFill, { width: `${p.progress}%` }]}
                      />
                    </View>
                    {pp !== null ? (
                      <View style={[styles.pTick, { left: `${pp}%` }]} />
                    ) : null}
                  </View>
                  <Text style={[styles.pValue, late && styles.late]}>
                    {p.progress.toFixed(1)}%
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.owner}>현장 총관리자 {site.ownerName}</Text>
        </Card>

        {/* 바로가기 */}
        <Card style={styles.menu}>
          {rows.map((r, i) => (
            <Pressable
              key={r.label}
              onPress={r.onPress}
              style={({ pressed }) => [
                styles.menuRow,
                i > 0 && styles.menuBorder,
                pressed && styles.pressed,
              ]}
            >
              {r.icon}
              <Text style={styles.menuLabel}>{r.label}</Text>
              {r.desc ? (
                <Text style={[styles.menuDesc, r.highlight && styles.menuDescOn]}>
                  {r.desc}
                </Text>
              ) : null}
              <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>

        {/* 최근 보고 */}
        <Text style={styles.sectionTitle}>최근 보고</Text>
        {reports.length === 0 ? (
          <Text style={styles.empty}>아직 보고가 없어요.</Text>
        ) : (
          reports
            .slice(0, 3)
            .map(r => (
              <ReportCard
                key={r.id}
                report={r}
                onPress={() => navigation.navigate('ReportDetail', { report: r })}
              />
            ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, color: colors.text, marginBottom: 12 },
  retry: { paddingHorizontal: 28 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  pressed: { opacity: 0.7 },

  overallRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  label: { fontSize: 14, color: colors.textSub },
  strong: { color: colors.text, fontWeight: '600' },
  overallValue: { fontSize: 26, fontWeight: '800', color: colors.text },
  overallUnit: { fontSize: 18, fontWeight: '700' },
  trackWrap: { marginTop: 12 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.navy },
  tick: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 12,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.textSub,
  },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  statusChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  sub: { fontSize: 13, color: colors.textSub },

  processes: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 10,
  },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pName: { width: 50, flexDirection: 'row', alignItems: 'center', gap: 3 },
  pNameText: { fontSize: 13, color: colors.text },
  pTrackWrap: { flex: 1, justifyContent: 'center' },
  pTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  pFill: { height: '100%', backgroundColor: colors.navy },
  pTick: {
    position: 'absolute',
    width: 2,
    height: 10,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.textSub,
  },
  pValue: {
    width: 48,
    textAlign: 'right',
    fontSize: 13,
    color: colors.textSub,
    fontVariant: ['tabular-nums'],
  },
  late: { color: colors.danger },
  owner: { fontSize: 12, color: colors.textMuted, marginTop: 14 },

  menu: { marginTop: 12, paddingVertical: 4 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  menuBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  menuDesc: { fontSize: 13, color: colors.textSub },
  menuDescOn: { color: '#B7800A', fontWeight: '700' },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 24,
    marginBottom: 10,
  },
  empty: { fontSize: 14, color: colors.textSub },
});
