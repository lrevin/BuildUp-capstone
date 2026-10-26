// 관리자: 진행률 계산 방식(직접 입력 / 자동 계산)과 공정·가중치 바꾸기
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { fetchSite, setProgressMode } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import ProgressModeEditor, {
  ProcessRow,
  checkRows,
  rowsFrom,
  toInput,
} from '../components/ProgressModeEditor';
import { Text } from '../components/Text';
import { AppHeader, BottomBar, Button } from '../components/ui';
import { defaultProcessesFor } from '../data/workTypes';
import { ScreenProps } from '../navigation';
import { colors } from '../theme';
import { ProgressMode, Site } from '../types';
import { pct } from '../utils/format';

export default function ProgressModeScreen({
  navigation,
  route,
}: ScreenProps<'ProgressMode'>) {
  const { siteId } = route.params;
  const dialog = useDialog();
  const [site, setSite] = useState<Site | null>(null);
  const [mode, setMode] = useState<ProgressMode>('manual');
  const [rows, setRows] = useState<ProcessRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSite(siteId)
      .then(s => {
        setSite(s);
        setMode(s.progressMode ?? 'manual');
        setRows(rowsFrom(s.processes ?? []));
      })
      .catch(e => {
        dialog.toast(errorMessage(e), 'error');
        navigation.goBack();
      });
  }, [siteId, navigation, dialog]);

  if (!site) {
    return (
      <>
        <AppHeader
          title="진행률 계산 방식"
          onBack={() => navigation.goBack()}
        />
        <ActivityIndicator style={styles.loading} color={colors.navy} />
      </>
    );
  }

  const wasAuto = site.progressMode === 'auto';

  const onSave = async () => {
    const problem = mode === 'auto' ? checkRows(rows) : null;
    if (problem) {
      dialog.toast(problem, 'error');
      return;
    }
    let message: string;
    if (mode === 'manual') {
      message = wasAuto
        ? `지금 진행률 ${pct(
            site.overallProgress,
          )}에서 이어서, 보고하는 사람이 직접 적어요. 공정 설정은 남겨 둬요.`
        : '그대로 직접 입력 방식을 써요.';
    } else if (wasAuto) {
      message =
        '바꾼 가중치로 전체 진행률을 다시 계산해요. 새 공정은 0%에서 시작해요.';
    } else {
      message = `모든 공정이 지금 진행률 ${pct(
        site.overallProgress,
      )}에서 시작해요. 이후 공정별로 보고하면 전체 진행률이 자동으로 계산돼요.`;
    }
    const ok = await dialog.confirm({
      title:
        mode === 'auto'
          ? '자동 계산으로 저장할까요?'
          : '직접 입력으로 저장할까요?',
      message,
      confirmText: '저장',
    });
    if (!ok) {
      return;
    }
    setSaving(true);
    try {
      await setProgressMode(siteId, mode, mode === 'auto' ? toInput(rows) : []);
      dialog.toast('진행률 계산 방식을 저장했어요', 'success');
      navigation.goBack();
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '저장하지 못했어요',
        message: errorMessage(e),
      });
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <AppHeader
        title="진행률 계산 방식"
        subtitle={site.name}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.now}>
          지금 현장 전체 진행률 {pct(site.overallProgress)}
        </Text>
        <ProgressModeEditor
          mode={mode}
          onModeChange={m => {
            setMode(m);
            if (m === 'auto' && rows.length === 0) {
              setRows(rowsFrom(defaultProcessesFor(site.workType)));
            }
          }}
          rows={rows}
          onRowsChange={setRows}
          onTemplate={() =>
            setRows(rowsFrom(defaultProcessesFor(site.workType)))
          }
        />
      </ScrollView>
      <BottomBar>
        <Button title="저장" onPress={onSave} loading={saving} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { padding: 20 },
  loading: { marginTop: 40 },
  now: { fontSize: 14, color: colors.textSub, marginBottom: 16 },
});
