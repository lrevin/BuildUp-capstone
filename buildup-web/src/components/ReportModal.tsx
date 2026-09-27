// 보고 상세 + 검토(승인 / 보완 요청)
import { useState } from 'react';
import { errorMessage, reviewReport } from '../api';
import type { PhotoInfo, Report } from '../types';
import { fileSize, formatDateTime, formatMDHM, WEATHER_LABEL } from '../utils/format';
import { Lightbox, Modal, REVIEW_META, ReviewBadge } from './ui';

const QUICK_REASONS = [
  '사진이 작업 내용을 잘 보여주지 않아요',
  '진행률 근거를 메모에 적어 주세요',
  '촬영 시각·위치를 확인할 수 없어요',
  '작업일보(인원·장비)를 채워 주세요',
];

export function reportPhotos(r: Report): PhotoInfo[] {
  if (r.photos && r.photos.length) return r.photos;
  return (r.photoUris ?? []).map((url) => ({ url, takenAt: null, latitude: null, longitude: null }));
}

export default function ReportModal({
  report,
  onClose,
  onChanged,
}: {
  report: Report;
  onClose: () => void;
  onChanged?: (r: Report) => void;
}) {
  const [current, setCurrent] = useState(report);
  const [zoom, setZoom] = useState<{ src: string; caption?: string } | null>(null);
  const [mode, setMode] = useState<'idle' | 'revision'>('idle');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const r = current;
  const photos = reportPhotos(r);
  const review = r.review ?? { status: 'pending' as const, comment: null, reviewer: null, reviewedAt: null };
  const wl = r.workLog;
  const hasWorkLog = !!wl && (wl.weather || wl.workers != null || (wl.equipment ?? '').trim());

  const submit = async (status: 'approved' | 'revision') => {
    if (status === 'revision' && !comment.trim()) {
      setError('보완할 내용을 적어 주세요');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await reviewReport(r.id, status, status === 'revision' ? comment.trim() : null);
      setCurrent(updated);
      setMode('idle');
      setComment('');
      onChanged?.(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <div className="rm-title">
          <span className="rm-process">{r.processName}</span>
          <ReviewBadge report={r} />
          {r.siteName && <span className="muted small">{r.siteName}</span>}
        </div>
      }
    >
      <div className="rm-grid">
        <div className="rm-main">
          <div className="rm-meta">
            <div>
              <span className="avatar avatar-sm">{r.author.slice(0, 1)}</span>
              <b>{r.author}</b>
            </div>
            <span className="muted">{formatDateTime(r.createdAt)} 제출</span>
            {r.updatedAt && <span className="muted small">(메모 수정 {formatDateTime(r.updatedAt)})</span>}
          </div>

          <div className="rm-progress">
            <div>
              <div className="label">진행률</div>
              <div className="rm-progress-val">
                {r.from.toFixed(1)}% <span className="arrow">→</span> <b>{r.to.toFixed(1)}%</b>
                <span className="delta">+{(r.to - r.from).toFixed(1)}%p</span>
              </div>
            </div>
          </div>

          {!!r.checks?.length && (
            <div className="alert alert-warn">
              <b>⚠ 확인이 필요해요</b>
              <ul>
                {r.checks.map((c, i) => (
                  <li key={i}>{c.message}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="rm-section">
            <h4>메모</h4>
            {r.memo?.trim() ? <p className="rm-memo">{r.memo}</p> : <p className="muted">메모 없음</p>}
          </section>

          <section className="rm-section">
            <h4>작업일보</h4>
            {hasWorkLog ? (
              <dl className="kv">
                <dt>날씨</dt>
                <dd>{wl!.weather ? WEATHER_LABEL[wl!.weather] ?? wl!.weather : '-'}</dd>
                <dt>투입 인원</dt>
                <dd>{wl!.workers != null ? `${wl!.workers}명` : '-'}</dd>
                <dt>투입 장비</dt>
                <dd>{wl!.equipment?.trim() || '-'}</dd>
              </dl>
            ) : (
              <p className="muted">작성하지 않음</p>
            )}
          </section>

          <section className="rm-section">
            <h4>사진 {photos.length ? `${photos.length}장` : ''}</h4>
            {photos.length ? (
              <div className="photo-grid">
                {photos.map((p, i) => {
                  const cap = p.takenAt ? `촬영 ${formatMDHM(p.takenAt)}` : '촬영 시각 없음';
                  return (
                    <button key={i} className="photo" onClick={() => setZoom({ src: p.url, caption: cap })}>
                      <img src={p.url} alt={`${r.processName} 사진 ${i + 1}`} loading="lazy" />
                      <span className="photo-cap">{cap}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="muted">사진 없음</p>
            )}
          </section>

          {!!r.files?.length && (
            <section className="rm-section">
              <h4>첨부 파일</h4>
              <ul className="files">
                {r.files.map((f, i) => (
                  <li key={i}>
                    <a href={f.url} target="_blank" rel="noreferrer">
                      📎 {f.name}
                    </a>
                    <span className="muted small">{fileSize(f.size)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rm-section">
            <h4>제출 위치</h4>
            {r.location ? (
              <p>
                <a
                  href={`https://www.google.com/maps?q=${r.location.latitude},${r.location.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  지도에서 보기 ({r.location.latitude.toFixed(5)}, {r.location.longitude.toFixed(5)})
                </a>
                {r.location.accuracy != null && (
                  <span className="muted small"> · 오차 약 {Math.round(r.location.accuracy)}m</span>
                )}
              </p>
            ) : (
              <p className="muted">위치 정보 없음</p>
            )}
          </section>
        </div>

        <aside className="rm-review">
          <h4>검토</h4>
          <div className="rm-review-status">
            <span className={`badge ${REVIEW_META[review.status]?.cls ?? 'badge-blue'}`}>
              {REVIEW_META[review.status]?.label ?? review.status}
            </span>
            {review.status !== 'pending' && review.reviewer && <span className="small">{review.reviewer}</span>}
            {review.status !== 'pending' && review.reviewedAt && (
              <span className="muted small">{formatDateTime(review.reviewedAt)}</span>
            )}
          </div>
          {review.comment && (
            <div className="rm-review-comment">
              {review.status === 'pending' && <div className="muted small">이전 보완 요청 · 작성자가 수정해 다시 올렸어요</div>}
              “{review.comment}”
            </div>
          )}

          {r.canReview ? (
            mode === 'idle' ? (
              <div className="rm-actions">
                <button className="btn btn-success btn-block" disabled={busy} onClick={() => void submit('approved')}>
                  {busy ? '처리 중…' : '승인'}
                </button>
                <button className="btn btn-outline-warn btn-block" disabled={busy} onClick={() => setMode('revision')}>
                  보완 요청
                </button>
              </div>
            ) : (
              <div className="rm-revision">
                <label className="field">
                  <span>보완할 내용</span>
                  <textarea
                    rows={4}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="작성자에게 전달할 내용을 적어 주세요"
                    autoFocus
                  />
                </label>
                <div className="chips">
                  {QUICK_REASONS.map((q) => (
                    <button key={q} type="button" className="chip" onClick={() => setComment(q)}>
                      {q}
                    </button>
                  ))}
                </div>
                <div className="row-gap">
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setMode('idle')}>
                    취소
                  </button>
                  <button className="btn btn-warn" disabled={busy} onClick={() => void submit('revision')}>
                    {busy ? '처리 중…' : '보완 요청 보내기'}
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="muted small">
              {review.status === 'pending' ? '이 보고를 검토할 권한이 없어요.' : '검토가 끝난 보고예요.'}
            </p>
          )}
          {error && <div className="alert alert-danger">{error}</div>}
        </aside>
      </div>
      {zoom && <Lightbox src={zoom.src} caption={zoom.caption} onClose={() => setZoom(null)} />}
    </Modal>
  );
}
