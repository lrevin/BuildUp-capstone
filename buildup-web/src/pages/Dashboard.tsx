import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as API from '../api';
import { useAuth } from '../auth';
import ReportModal from '../components/ReportModal';
import { CheckIcon, Empty, ProgressBar, ReviewBadge, ScheduleBadge, Spinner } from '../components/ui';
import type { HqInfo, Report, SiteSummary } from '../types';
import { timeAgo } from '../utils/format';
import { round1, scheduleStatus } from '../utils/plan';

const FEED_SIZE = 20;

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHq = user?.role === 'hq';

  const [hq, setHq] = useState<HqInfo | null>(null);
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Report | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (isHq) {
        const [info, list, page] = await Promise.all([
          API.getHq().catch(() => null),
          API.getHqSites(),
          API.getHqReportPage(null, FEED_SIZE),
        ]);
        setHq(info);
        setSites(list);
        setReports(page.items);
        setCursor(page.nextCursor);
      } else {
        const list = (await API.getSites()).filter((s) => s.isOwner);
        setSites(list);
        const pages = await Promise.all(list.map((s) => API.getSiteReportPage(s.id, { size: FEED_SIZE })));
        const merged = pages
          .flatMap((p, i) => p.items.map((r) => ({ ...r, siteName: r.siteName ?? list[i].name })))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, FEED_SIZE);
        setReports(merged);
        setCursor(null);
      }
    } catch (err) {
      setError(API.errorMessage(err));
    }
  }, [isHq]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setMoreBusy(true);
    try {
      const page = await API.getHqReportPage(cursor, FEED_SIZE);
      setReports((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(API.errorMessage(err));
    } finally {
      setMoreBusy(false);
    }
  };

  const kpi = useMemo(() => {
    if (!sites) return null;
    const n = sites.length;
    const avg = n ? round1(sites.reduce((s, x) => s + x.overallProgress, 0) / n) : 0;
    const behind = sites.filter(
      (s) => s.plannedProgress != null && scheduleStatus(s.overallProgress, s.plannedProgress).status === 'behind',
    ).length;
    const reviews = sites.reduce((s, x) => s + (x.pendingReviews ?? 0), 0);
    const materials = sites.reduce((s, x) => s + (x.pendingMaterials ?? 0), 0);
    return { n, avg, behind, reviews, materials };
  }, [sites]);

  const sortedSites = useMemo(() => {
    if (!sites) return [];
    // 지연이 큰 현장부터
    const gap = (s: SiteSummary) => (s.plannedProgress == null ? 0 : s.overallProgress - s.plannedProgress);
    return [...sites].sort((a, b) => gap(a) - gap(b));
  }, [sites]);

  const title = isHq ? hq?.name ?? user?.company ?? '본사' : `${user?.name}님의 현장`;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{isHq ? '본사 대시보드' : '현장 관리자 대시보드'}</div>
          <h1>{title}</h1>
          {isHq && hq && (
            <p className="muted small">
              본사 코드 {hq.code} · 관계자 {hq.staff.join(', ')}
            </p>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void load()}>
          새로고침
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {!sites ? (
        <Spinner />
      ) : (
        <>
          <section className="kpis">
            <Kpi label="관리 현장 수" value={`${kpi!.n}`} unit="곳" />
            <Kpi label="평균 진행률" value={kpi!.avg.toFixed(1)} unit="%" />
            <Kpi label="지연 현장 수" value={`${kpi!.behind}`} unit="곳" tone={kpi!.behind ? 'danger' : undefined} />
            <Kpi label="검토 대기 보고" value={`${kpi!.reviews}`} unit="건" tone={kpi!.reviews ? 'info' : undefined} />
            <Kpi label="승인 대기 자재" value={`${kpi!.materials}`} unit="건" tone={kpi!.materials ? 'warn' : undefined} />
          </section>

          <div className="dash-grid">
            <section>
              <div className="section-head">
                <h2>현장 현황</h2>
                <span className="muted small">
                  <span className="legend-plan" /> 오늘 기준 계획 진행률
                </span>
              </div>
              {sortedSites.length === 0 ? (
                <Empty>
                  {isHq ? '연결된 현장이 없어요. 현장 관리자가 본사 코드로 현장을 연결하면 여기에 보여요.' : '직접 관리하는 현장이 없어요.'}
                </Empty>
              ) : (
                <div className="site-grid">
                  {sortedSites.map((s) => (
                    <SiteCard key={s.id} site={s} onClick={() => navigate(`/sites/${s.id}`)} />
                  ))}
                </div>
              )}
            </section>

            <aside className="card feed">
              <div className="section-head">
                <h2>새로 올라온 보고</h2>
              </div>
              {!reports ? (
                <Spinner />
              ) : reports.length === 0 ? (
                <Empty>아직 올라온 보고가 없어요.</Empty>
              ) : (
                <ul className="feed-list">
                  {reports.map((r) => (
                    <li key={r.id}>
                      <button className="feed-item" onClick={() => setOpen(r)}>
                        <div className="feed-top">
                          <span className="feed-process">
                            {r.processName} <span className="muted">{r.from.toFixed(1)}→{r.to.toFixed(1)}%</span>
                          </span>
                          <CheckIcon report={r} />
                          <ReviewBadge report={r} />
                        </div>
                        <div className="feed-sub">
                          <span className="ellipsis">{r.siteName}</span>
                          <span>
                            {r.author} · {timeAgo(r.createdAt)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {cursor && (
                <button className="btn btn-ghost btn-block" disabled={moreBusy} onClick={() => void loadMore()}>
                  {moreBusy ? '불러오는 중…' : '더 보기'}
                </button>
              )}
            </aside>
          </div>
        </>
      )}

      {open && (
        <ReportModal
          report={open}
          onClose={() => setOpen(null)}
          onChanged={(u) => {
            setReports((prev) => prev?.map((x) => (x.id === u.id ? { ...u, siteName: u.siteName ?? x.siteName } : x)) ?? null);
            // 검토 대기 수 갱신
            (isHq ? API.getHqSites() : API.getSites().then((l) => l.filter((s) => s.isOwner)))
              .then(setSites)
              .catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: 'danger' | 'info' | 'warn' }) {
  return (
    <div className={`card kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        <span className="kpi-unit">{unit}</span>
      </div>
    </div>
  );
}

function SiteCard({ site: s, onClick }: { site: SiteSummary; onClick: () => void }) {
  const behind = s.plannedProgress != null && scheduleStatus(s.overallProgress, s.plannedProgress).status === 'behind';
  return (
    <Link
      to={`/sites/${s.id}`}
      className={`card site-card ${behind ? 'is-behind' : ''}`}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      <div className="site-card-head">
        <div className="site-card-title">
          <h3>{s.name}</h3>
          <p className="muted small ellipsis">{s.address}</p>
        </div>
        <ScheduleBadge actual={s.overallProgress} planned={s.plannedProgress} />
      </div>
      <div className="site-card-progress">
        <span className="big">{s.overallProgress.toFixed(1)}%</span>
        <span className="muted small">{s.plannedProgress != null ? `계획 ${s.plannedProgress.toFixed(1)}%` : '계획 없음'}</span>
      </div>
      <ProgressBar value={s.overallProgress} planned={s.plannedProgress} />
      <div className="site-card-foot">
        <span className="muted small">
          관리자 {s.ownerName} · 인원 {s.memberCount}명 · 공정 {s.processCount}개
        </span>
        <span className="row-gap-sm">
          {!!s.pendingReviews && <span className="badge badge-blue">검토 대기 {s.pendingReviews}</span>}
          {!!s.pendingMaterials && <span className="badge badge-yellow">자재 대기 {s.pendingMaterials}</span>}
          {!!s.todayReported && <span className="badge badge-gray">오늘 보고 {s.todayReported}</span>}
        </span>
      </div>
    </Link>
  );
}
