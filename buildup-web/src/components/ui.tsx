// 작은 공통 화면 조각
import { useEffect, type ReactNode } from 'react';
import type { MaterialStatus, Report, ReviewStatus } from '../types';

export const REVIEW_META: Record<ReviewStatus, { label: string; cls: string }> = {
  pending: { label: '검토 대기', cls: 'badge-blue' },
  approved: { label: '승인', cls: 'badge-green' },
  revision: { label: '보완 요청', cls: 'badge-orange' },
};

export function ReviewBadge({ report }: { report: Report }) {
  const status = report.review?.status ?? 'pending';
  const meta = REVIEW_META[status] ?? REVIEW_META.pending;
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}

export const MATERIAL_META: Record<MaterialStatus, { label: string; cls: string }> = {
  requested: { label: '승인 대기', cls: 'badge-blue' },
  approved: { label: '승인', cls: 'badge-green' },
  rejected: { label: '반려', cls: 'badge-red' },
};

export function CheckIcon({ report }: { report: Report }) {
  const n = report.checks?.length ?? 0;
  if (!n) return null;
  return (
    <span className="warn-icon" title={report.checks!.map((c) => c.message).join('\n')} aria-label={`확인 필요 ${n}건`}>
      ⚠
    </span>
  );
}

// 진행률 막대(현장 전체 진행률)
export function ProgressBar({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`pbar pbar-${size}`} role="img" aria-label={`진행률 ${value.toFixed(1)}%`}>
      <div className="pbar-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Lightbox({ src, caption, onClose }: { src: string; caption?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={src} alt={caption ?? '현장 사진'} />
      {caption && <div className="lightbox-caption">{caption}</div>}
      <button className="icon-btn lightbox-close" aria-label="닫기">
        ✕
      </button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Spinner({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="loading">
      <span className="spinner" aria-hidden />
      {label}
    </div>
  );
}
