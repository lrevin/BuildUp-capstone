// 상단바 오른쪽 '엑셀' 버튼: 기간을 고르면 작업일보 엑셀을 브라우저로 내려받는다
import React, { useState } from 'react';
import { ActivityIndicator, Linking } from 'react-native';
import { FileSpreadsheet } from 'lucide-react-native';
import { worklogLink } from '../api/buildup';
import { errorMessage } from '../api/client';
import { colors } from '../theme';
import { useDialog } from './Dialog';
import MenuSheet, { MenuItem } from './MenuSheet';
import { IconButton } from './ui';

function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export default function ExcelExportButton({ siteId }: { siteId: string }) {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const download = async (from: Date, to: Date) => {
    setBusy(true);
    try {
      const url = await worklogLink(siteId, ymd(from), ymd(to));
      await Linking.openURL(url);
      dialog.toast('작업일보 엑셀을 내려받고 있어요', 'success');
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '엑셀을 받지 못했어요',
        message: errorMessage(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const items: MenuItem[] = [
    { label: '오늘', onPress: () => download(today, today) },
    { label: '최근 7일', onPress: () => download(daysAgo(6), today) },
    { label: '이번 달', onPress: () => download(monthStart, today) },
    { label: '최근 30일', onPress: () => download(daysAgo(29), today) },
    { label: '최근 1년', onPress: () => download(daysAgo(364), today) },
  ];

  return (
    <>
      <IconButton
        label="작업일보 엑셀 내려받기"
        onPress={() => !busy && setOpen(true)}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.navy} />
        ) : (
          <FileSpreadsheet size={22} color={colors.text} strokeWidth={2} />
        )}
      </IconButton>
      <MenuSheet visible={open} items={items} onClose={() => setOpen(false)} />
    </>
  );
}
