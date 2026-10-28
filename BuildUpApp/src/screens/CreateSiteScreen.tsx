import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import { Text } from '../components/Text';
import { createSite } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import { AppHeader, BottomBar, Button, Field } from '../components/ui';
import WorkTypePicker from '../components/WorkTypePicker';
import ProgressModeEditor, {
  ProcessRow,
  checkRows,
  rowsFrom,
  toInput,
} from '../components/ProgressModeEditor';
import MaterialRowsEditor, {
  COMMON_MATERIALS,
  MaterialRow,
  emptyMaterialRow,
  itemsFromRows,
} from '../components/MaterialRowsEditor';
import { defaultProcessesFor } from '../data/workTypes';
import { ScreenProps } from '../navigation';
import { colors } from '../theme';
import { ProgressMode } from '../types';

export default function CreateSiteScreen({
  navigation,
}: ScreenProps<'CreateSite'>) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [workType, setWorkType] = useState('');
  const [mode, setMode] = useState<ProgressMode>('manual');
  const [rows, setRows] = useState<ProcessRow[]>([]);
  // 지금 현장에 있는 자재 양(최고 책임자가 입력, 선택)
  const [stockRows, setStockRows] = useState<MaterialRow[]>([
    emptyMaterialRow(),
  ]);
  const [loading, setLoading] = useState(false);
  const dialog = useDialog();

  const onCreate = async () => {
    if (!workType) {
      dialog.toast('공사 종류를 골라 주세요', 'error');
      return;
    }
    if (!name.trim() || !address.trim()) {
      dialog.toast('현장명과 주소를 입력해 주세요', 'error');
      return;
    }
    const problem = mode === 'auto' ? checkRows(rows) : null;
    if (problem) {
      dialog.toast(problem, 'error');
      return;
    }
    const stock = itemsFromRows(stockRows, true);
    if (stock.bad) {
      dialog.toast(`${stock.bad}의 수량을 입력해 주세요`, 'error');
      return;
    }
    setLoading(true);
    try {
      const site = await createSite({
        name,
        address,
        workType,
        progressMode: mode,
        processes: mode === 'auto' ? toInput(rows) : undefined,
        materials: stock.items,
      });
      // 만들자마자 코드 발급 화면으로(뒤로 가면 현장 목록)
      navigation.replace('SiteCode', {
        siteId: site.id,
        siteName: site.name,
        code: site.code!,
        isNew: true,
      });
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '현장을 만들지 못했어요',
        message: errorMessage(e),
      });
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <AppHeader title="새 현장 만들기" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>현장 정보를 입력해 주세요</Text>
        <Text style={styles.subtitle}>
          만들면 작업자 초대용 6자리 코드가 발급돼요
        </Text>

        <WorkTypePicker value={workType} onChange={setWorkType} />
        <Field
          label="현장명"
          value={name}
          onChangeText={setName}
          placeholder="예) 한빛 오피스텔 신축공사, 101동 1203호 욕실"
        />
        <Field
          label="현장 주소"
          value={address}
          onChangeText={setAddress}
          placeholder="예) 강원 원주시 무실동 123-4"
        />

        <ProgressModeEditor
          mode={mode}
          onModeChange={m => {
            setMode(m);
            // 자동 계산을 처음 고르면 공사 종류에 맞는 기본 공정을 채워 둔다
            if (m === 'auto' && rows.length === 0) {
              setRows(rowsFrom(defaultProcessesFor(workType)));
            }
          }}
          rows={rows}
          onRowsChange={setRows}
          onTemplate={() => setRows(rowsFrom(defaultProcessesFor(workType)))}
        />
        <Text style={styles.guide}>
          계산 방식은 나중에 현장 설정에서 바꿀 수 있어요.
        </Text>

        <Text style={styles.label}>현장 자재 (선택)</Text>
        <Text style={styles.stockGuide}>
          지금 현장에 있는 자재와 양을 넣어 두면, 보고가 승인될 때마다 사용한
          만큼 빠지고 남은 양을 볼 수 있어요.
        </Text>
        <MaterialRowsEditor
          rows={stockRows}
          onChange={setStockRows}
          presets={COMMON_MATERIALS}
          max={100}
          onFull={() =>
            dialog.toast('자재는 100가지까지 넣을 수 있어요', 'error')
          }
        />
      </ScrollView>
      <BottomBar>
        <Button
          title="현장 만들고 코드 발급"
          onPress={onCreate}
          loading={loading}
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 8 },
  subtitle: {
    fontSize: 14,
    color: colors.textSub,
    marginTop: 6,
    marginBottom: 28,
  },
  guide: { fontSize: 13, color: colors.textSub, lineHeight: 19, marginTop: 4 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: 28,
    marginBottom: 6,
  },
  stockGuide: {
    fontSize: 13,
    color: colors.textSub,
    lineHeight: 19,
    marginBottom: 12,
  },
});
