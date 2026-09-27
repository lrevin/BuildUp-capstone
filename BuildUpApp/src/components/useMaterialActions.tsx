// 자재 요청 처리(승인·반려·취소): 현장 목록과 본사 화면에서 같이 쓴다
import { useState } from 'react';
import { cancelMaterial, setMaterialStatus } from '../api/buildup';
import { errorMessage } from '../api/client';
import { MaterialRequest } from '../types';
import { useDialog } from './Dialog';
import { MaterialAction, REJECT_REASONS, itemsSummary } from './Material';

/**
 * onChanged(id, updated): 처리 후 목록에서 그 요청만 바꿔 끼운다(updated가 null이면 목록에서 뺀다)
 * reload: 실패했을 때 목록을 새로 불러온다
 */
export function useMaterialActions(
  onChanged: (id: string, updated: MaterialRequest | null) => void,
  reload: () => void,
) {
  const dialog = useDialog();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (
    m: MaterialRequest,
    action: () => Promise<MaterialRequest | void>,
    done: string,
  ) => {
    setBusyId(m.id);
    try {
      const updated = await action();
      onChanged(m.id, updated ?? null);
      dialog.toast(done, 'success');
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '처리하지 못했어요',
        message: errorMessage(e),
      });
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (m: MaterialRequest) => {
    const ok = await dialog.confirm({
      title: '자재 요청을 승인할까요?',
      message: `${itemsSummary(m.items)}\n${m.siteName} · 요청자 ${m.author}`,
      confirmText: '승인',
    });
    if (ok) {
      run(m, () => setMaterialStatus(m.id, 'approved'), '승인했어요');
    }
  };

  const reject = async (m: MaterialRequest) => {
    const reason = await dialog.choose({
      title: '반려 사유를 골라 주세요',
      message: `${itemsSummary(m.items)} · ${m.author}`,
      options: [
        ...REJECT_REASONS.map(r => ({ label: r, value: r })),
        { label: '사유 없이 반려', value: '', danger: true },
      ],
    });
    if (reason !== null) {
      run(m, () => setMaterialStatus(m.id, 'rejected', reason), '반려했어요');
    }
  };

  const cancel = async (m: MaterialRequest) => {
    const ok = await dialog.confirm({
      title: '요청을 취소할까요?',
      message: `${itemsSummary(m.items)}\n취소한 요청은 목록에서 사라져요.`,
      confirmText: '요청 취소',
      cancelText: '닫기',
      danger: true,
    });
    if (ok) {
      run(m, () => cancelMaterial(m.id), '요청을 취소했어요');
    }
  };

  const handle = (m: MaterialRequest, action: MaterialAction) =>
    ({ approve, reject, cancel })[action](m);

  return { busyId, handle };
}
