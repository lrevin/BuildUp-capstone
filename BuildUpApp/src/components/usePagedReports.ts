// 보고 목록 나눠 불러오기: 처음 30건 → 아래로 내리면 다음 30건씩 이어 붙인다
import { useCallback, useRef, useState } from 'react';
import { Report, ReportPage } from '../types';

type Loader = (cursor: string | null) => Promise<ReportPage>;

export function usePagedReports(loader: Loader) {
  const [items, setItems] = useState<Report[] | null>(null);
  const [head, setHead] = useState<ReportPage | null>(null); // 첫 묶음(전체 보고 수)
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0); // 새로 불러오면 늦게 도착한 이전 응답은 버린다
  const lastLoader = useRef<Loader | null>(null);
  const busy = useRef(false);

  /** 처음부터 다시(화면 들어올 때, 당겨서 새로고침, 필터 바꿀 때) */
  const reload = useCallback(async () => {
    const id = ++requestId.current;
    if (lastLoader.current !== loader) {
      // 필터가 바뀌었으면 이전 목록을 비우고 로딩 표시
      lastLoader.current = loader;
      setItems(null);
    }
    busy.current = false;
    setLoadingMore(false);
    try {
      const page = await loader(null);
      if (id !== requestId.current) {
        return;
      }
      setItems(page.items);
      setHead(page);
      setNext(page.nextCursor);
      setError(false);
    } catch {
      if (id === requestId.current) {
        setError(true);
        setItems(prev => prev ?? []);
      }
    }
  }, [loader]);

  /** 목록 끝에 닿으면 다음 묶음 */
  const loadMore = useCallback(async () => {
    if (!next || busy.current) {
      return;
    }
    const id = requestId.current;
    busy.current = true;
    setLoadingMore(true);
    try {
      const page = await loader(next);
      if (id !== requestId.current) {
        return;
      }
      setItems(prev => {
        const have = new Set((prev ?? []).map(r => r.id));
        return [...(prev ?? []), ...page.items.filter(r => !have.has(r.id))];
      });
      setNext(page.nextCursor);
    } catch {
      // 실패하면 다음에 다시 내렸을 때 재시도
    } finally {
      if (id === requestId.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [loader, next]);

  return {
    items,
    total: head?.total ?? null,
    hasMore: next !== null,
    loadingMore,
    error,
    reload,
    loadMore,
  };
}
