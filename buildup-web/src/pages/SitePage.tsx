import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as API from '../api';
import ProcessChart from '../charts/ProcessChart';
import ProgressLineChart, { buildProgressSeries } from '../charts/ProgressLineChart';
import ReportModal, { reportPhotos } from '../components/ReportModal';
import {
  CheckIcon,
  Empty,
  Lightbox,
  MATERIAL_META,
  ProgressBar,
  ReviewBadge,
  ScheduleBadge,
  Spinner,
} from '../components/ui';
import type { MaterialRequest, ProcessCount, Report, Site } from '../types';
import { dayKey, dayLabel, formatDateTime, formatMDHM, timeAgo } from '../utils/format';
import { addDays, overallPlannedAt, toYMD } from '../utils/plan';

const PAGE_SIZE = 15;
const TIMELINE_DAYS = 7;

type Period = '7d' | 'month' | '30d';
const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '최근 7일' },
  { key: 'month', label: '이번 달' },
  { key: '30d', label: '최근 30일' },
];

function periodRange(p: Period) {
  const today = new Date();
  if (p === 'month') return { from: toYMD(new Date(today.getFullYear(), today.getMonth(), 1)), to: toYMD(today) };
  return { from: toYMD(addDays(today, p === '7d' ? -6 : -29)), to: toYMD(today) };
}

export default function SitePage() {
  const { id = '' } = useParams();
  const [site, setSite] = useState<Site | null>(null);
  const [allReports, setAllReports] = useState<Report[] | null>(null);
  const [materials, setMaterials] = useState<MaterialRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Report | null>(null);

  const loadCore = useCallback(async () => {
    setError(null);
    try {
      const [s, reps, mats] = await Promise.all([
        API.getSite(id),
        API.getSiteReports(id),
        API.getSiteMaterials(id).catch(() => [] as MaterialRequest[]),
      ]);
      setSite(s);
      setAllReports(reps);
      setMaterials(mats);
    } catch (err) {
      setError(API.errorMessage(err, '현장 정보를 불러오지 못했어요'));
    }
  }, [id]);

  useEffect(() => {
    setSite(null);
    setAllReports(null);
    setMaterials(null);
    void loadCore();
  }, [loadCore]);

  // ---- 보고 목록(나눠 불러오기) ----
  const [filter, setFilter] = useState<string | null>(null);
  const [pageItems, setPageItems] = useState<Report[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ total: number | null; processes: ProcessCount[] | null }>({
    total: null,
    processes: null,
  });
  const [pageBusy, setPageBusy] = useState(false);

  const loadPage = useCallback(
    async (reset: boolean, after: string | null) => {
      setPageBusy(true);
      try {
        const page = await API.getSiteReportPage(id, { cursor: reset ? null : after, size: PAGE_SIZE, processKey: filter });
        setPageItems((prev) => (reset ? page.items : [...(prev ?? []), ...page.items]));
        setCursor(page.nextCursor);
        if (reset && page.total != null && !filter) setCounts({ total: page.total, processes: page.processes });
      } catch (err) {
        setError(API.errorMessage(err));
      } finally {
        setPageBusy(false);
      }
    },
    [id, filter],
  );

  useEffect(() => {
    setPageItems(null);
    void loadPage(true, null);
  }, [loadPage]);

  const onReviewed = (u: Report) => {
    const patch = (list: Report[] | null) => list?.map((x) => (x.id === u.id ? u : x)) ?? null;
    setPageItems(patch);
    setAllReports(patch);
  };

  const planned = site ? overallPlannedAt(site.processes) : null;
  const series = useMemo(
    () => (site && allReports ? buildProgressSeries(site.processes, allReports) : []),
    [site, allReports],
  );

  if (error && !site) {
    return (
      <div>
        <BackLink />
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }
  if (!site) return <Spinner />;

  const pendingReviews = allReports?.filter((r) => (r.review?.status ?? 'pending') === 'pending').length ?? 0;

  return (
    <div>
      <BackLink />
      <section className="card site-head">
        <div className="site-head-info">
          <div className="eyebrow">{site.hqName ? `${site.hqName} 연결 현장` : '본사 미연결 현장'}</div>
          <h1>{site.name}</h1>
          <p className="muted">
            {site.address} · 관리자 {site.ownerName} · 인원 {site.memberCount}명
          </p>
        </div>
        <div className="site-head-progress">
          <div className="site-head-numbers">
            <div>
              <div className="label">전체 진행률</div>
              <div className="hero">{site.overallProgress.toFixed(1)}%</div>
            </div>
            <div>
              <div className="label">오늘 기준 계획</div>
              <div className="hero-sub">{planned != null ? `${planned.toFixed(1)}%` : '-'}</div>
            </div>
            <ScheduleBadge actual={site.overallProgress} planned={planned} />
          </div>
          <ProgressBar value={site.overallProgress} planned={planned} size="lg" />
        </div>
        <WorklogDownload site={site} />
      </section>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="two-col">
        <section className="card">
          <div className="section-head">
            <h2>공정별 진행률</h2>
          </div>
          {site.processes.length ? <ProcessChart processes={site.processes} /> : <Empty>등록된 공정이 없어요.</Empty>}
        </section>
        <section className="card">
          <div className="section-head">
            <h2>전체 진행률 추이</h2>
            <span className="muted small">보고 이력으로 계산 · 공정 비중 반영</span>
          </div>
          {!allReports ? <Spinner /> : series.length > 1 ? <ProgressLineChart data={series} /> : <Empty>보고가 쌓이면 추이를 보여드려요.</Empty>}
        </section>
      </div>

      <PhotoTimeline reports={allReports} onOpen={setOpen} />

      <div className="two-col two-col-wide-left">
        <section className="card">
          <div className="section-head">
            <h2>진행 보고</h2>
            <span className="muted small">
              {counts.total != null ? `전체 ${counts.total}건` : ''}
              {pendingReviews ? ` · 검토 대기 ${pendingReviews}건` : ''}
            </span>
          </div>
          <div className="chips chips-filter">
            <button className={`chip ${filter === null ? 'is-on' : ''}`} onClick={() => setFilter(null)}>
              전체{counts.total != null ? ` ${counts.total}` : ''}
            </button>
            {(counts.processes ?? site.processes.map((p) => ({ key: p.key, name: p.name, count: -1 }))).map((p) => (
              <button key={p.key} className={`chip ${filter === p.key ? 'is-on' : ''}`} onClick={() => setFilter(p.key)}>
                {p.name}
                {p.count >= 0 ? ` ${p.count}` : ''}
              </button>
            ))}
          </div>
          {!pageItems ? (
            <Spinner />
          ) : pageItems.length === 0 ? (
            <Empty>보고가 없어요.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>제출</th>
                    <th>공정</th>
                    <th className="num">진행률</th>
                    <th>작성자</th>
                    <th>자료</th>
                    <th>검토</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r) => (
                    <tr key={r.id} onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r)}>
                      <td className="nowrap">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="nowrap">
                        <b>{r.processName}</b>
                      </td>
                      <td className="num nowrap">
                        {r.from.toFixed(1)} → <b>{r.to.toFixed(1)}%</b>
                      </td>
                      <td className="nowrap">{r.author}</td>
                      <td className="nowrap muted small">
                        {reportPhotos(r).length ? `사진 ${reportPhotos(r).length}` : ''}
                        {r.files?.length ? ` 파일 ${r.files.length}` : ''}
                        {r.memo?.trim() ? ' 메모' : ''}
                      </td>
                      <td className="nowrap">
                        <span className="row-gap-sm">
                          <CheckIcon report={r} />
                          <ReviewBadge report={r} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {cursor && (
            <button className="btn btn-ghost btn-block" disabled={pageBusy} onClick={() => void loadPage(false, cursor)}>
              {pageBusy ? '불러오는 중…' : '더 보기'}
            </button>
          )}
        </section>

        <MaterialsPanel materials={materials} onChanged={(m) => setMaterials((prev) => prev?.map((x) => (x.id === m.id ? m : x)) ?? null)} />
      </div>

      {open && <ReportModal report={{ ...open, siteName: open.siteName ?? site.name }} onClose={() => setOpen(null)} onChanged={onReviewed} />}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/" className="back-link">
      ← 대시보드
    </Link>
  );
}

function WorklogDownload({ site }: { site: Site }) {
  const [period, setPeriod] = useState<Period>('7d');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const range = periodRange(period);

  const download = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await API.downloadWorklog(site.id, site.name, range.from, range.to);
    } catch (err) {
      setMsg(API.errorMessage(err, '작업일보를 내려받지 못했어요'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="worklog">
      <div className="label">작업일보 엑셀</div>
      <div className="worklog-row">
        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="기간">
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={busy} onClick={() => void download()}>
          {busy ? '만드는 중…' : '엑셀 내려받기'}
        </button>
      </div>
      <div className="muted small">
        {range.from} ~ {range.to}
      </div>
      {msg && <div className="alert alert-danger">{msg}</div>}
    </div>
  );
}

function PhotoTimeline({ reports, onOpen }: { reports: Report[] | null; onOpen: (r: Report) => void }) {
  const [days, setDays] = useState(TIMELINE_DAYS);
  const [zoom, setZoom] = useState<{ src: string; caption: string } | null>(null);

  const groups = useMemo(() => {
    if (!reports) return [];
    const map = new Map<string, { report: Report; url: string; takenAt: string | null }[]>();
    const sorted = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const r of sorted) {
      const photos = reportPhotos(r);
      if (!photos.length) continue;
      const k = dayKey(r.createdAt);
      const list = map.get(k) ?? [];
      for (const p of photos) list.push({ report: r, url: p.url, takenAt: p.takenAt });
      map.set(k, list);
    }
    return [...map.entries()];
  }, [reports]);

  const total = groups.reduce((s, [, l]) => s + l.length, 0);

  return (
    <section className="card">
      <div className="section-head">
        <h2>사진 타임라인</h2>
        <span className="muted small">{reports ? `사진 ${total}장` : ''}</span>
      </div>
      {!reports ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <Empty>사진이 첨부된 보고가 아직 없어요.</Empty>
      ) : (
        <div className="timeline">
          {groups.slice(0, days).map(([k, list]) => (
            <div className="timeline-day" key={k}>
              <div className="timeline-date">
                <b>{dayLabel(k)}</b>
                <span className="muted small">{list.length}장</span>
              </div>
              <div className="timeline-photos">
                {list.map((p, i) => (
                  <figure className="thumb" key={`${p.report.id}-${i}`}>
                    <button
                      className="thumb-img"
                      onClick={() =>
                        setZoom({
                          src: p.url,
                          caption: `${p.report.processName} · ${p.takenAt ? `촬영 ${formatMDHM(p.takenAt)}` : `보고 ${formatMDHM(p.report.createdAt)}`}`,
                        })
                      }
                    >
                      <img src={p.url} alt={`${p.report.processName} 사진`} loading="lazy" />
                    </button>
                    <figcaption>
                      <button className="link" onClick={() => onOpen(p.report)}>
                        {p.report.processName}
                      </button>
                      <span className="muted">{p.takenAt ? formatMDHM(p.takenAt) : timeAgo(p.report.createdAt)}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
          {groups.length > days && (
            <button className="btn btn-ghost btn-block" onClick={() => setDays((d) => d + TIMELINE_DAYS)}>
              이전 날짜 더 보기
            </button>
          )}
        </div>
      )}
      {zoom && <Lightbox src={zoom.src} caption={zoom.caption} onClose={() => setZoom(null)} />}
    </section>
  );
}

const REJECT_REASONS = ['재고가 부족해요', '예산 확인이 필요해요', '수량을 다시 확인해 주세요'];

function MaterialsPanel({
  materials,
  onChanged,
}: {
  materials: MaterialRequest[] | null;
  onChanged: (m: MaterialRequest) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = async (m: MaterialRequest, status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !reason.trim()) {
      setError('반려 사유를 적어 주세요');
      return;
    }
    setBusyId(m.id);
    setError(null);
    try {
      const u = await API.setMaterialStatus(m.id, status, status === 'rejected' ? reason.trim() : undefined);
      onChanged(u);
      setRejecting(null);
      setReason('');
    } catch (err) {
      setError(API.errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const pending = materials?.filter((m) => m.status === 'requested').length ?? 0;

  return (
    <section className="card">
      <div className="section-head">
        <h2>자재 요청</h2>
        <span className="muted small">{pending ? `승인 대기 ${pending}건` : ''}</span>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!materials ? (
        <Spinner />
      ) : materials.length === 0 ? (
        <Empty>자재 요청이 없어요.</Empty>
      ) : (
        <ul className="materials">
          {[...materials]
            .sort((a, b) => Number(b.status === 'requested') - Number(a.status === 'requested') || b.createdAt.localeCompare(a.createdAt))
            .map((m) => {
            const meta = MATERIAL_META[m.status];
            return (
              <li key={m.id} className="material">
                <div className="material-top">
                  <span className="material-items">
                    {m.items.map((it) => `${it.name} ${it.quantity}${it.unit}`).join(', ')}
                  </span>
                  {m.urgent && <span className="badge badge-red">긴급</span>}
                  <span className={`badge ${meta.cls}`}>{meta.label}</span>
                </div>
                <div className="muted small">
                  {m.processName ?? '현장 공통'} · {m.author} · {timeAgo(m.createdAt)}
                  {m.neededBy ? ` · 필요일 ${m.neededBy}` : ''}
                </div>
                {m.note?.trim() && <div className="small material-note">{m.note}</div>}
                {m.status === 'rejected' && m.rejectReason && (
                  <div className="small material-reject">반려 사유: {m.rejectReason}</div>
                )}
                {(m.canApprove || m.canReject) && m.status === 'requested' && (
                  rejecting === m.id ? (
                    <div className="material-reject-form">
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="반려 사유" autoFocus />
                      <div className="chips">
                        {REJECT_REASONS.map((q) => (
                          <button key={q} className="chip" onClick={() => setReason(q)}>
                            {q}
                          </button>
                        ))}
                      </div>
                      <div className="row-gap">
                        <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(null)}>
                          취소
                        </button>
                        <button className="btn btn-danger btn-sm" disabled={busyId === m.id} onClick={() => void act(m, 'rejected')}>
                          반려하기
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="row-gap material-actions">
                      {m.canReject && (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busyId === m.id}
                          onClick={() => {
                            setRejecting(m.id);
                            setReason('');
                          }}
                        >
                          반려
                        </button>
                      )}
                      {m.canApprove && (
                        <button className="btn btn-success btn-sm" disabled={busyId === m.id} onClick={() => void act(m, 'approved')}>
                          승인
                        </button>
                      )}
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
