// 최고 책임자: 현장 자재 재고 수정(새로 들어온 자재 반영, 잘못 넣은 양 고치기)
// 보고가 승인되면 그 보고에서 사용한 양만큼 서버가 자동으로 뺀다
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { fetchSite, setSiteMaterials } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import MaterialRowsEditor, {
  COMMON_MATERIALS,
  MaterialRow,
  emptyMaterialRow,
  itemsFromRows,
  rowsFromItems,
} from '../components/MaterialRowsEditor';
import { Text } from '../components/Text';
import { AppHeader, BottomBar, Button, Card } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors } from '../theme';

export default function SiteStockScreen({
  navigation,
  route,
}: ScreenProps<'SiteStock'>) {
  const { siteId, siteName } = route.params;
  const dialog = useDialog();
  const [rows, setRows] = useState<MaterialRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSite(siteId)
      .then(s => {
        const items = s.materials ?? [];
        setRows(items.length > 0 ? rowsFromItems(items) : [emptyMaterialRow()]);
      })
      .catch(e => {
        dialog.notice({
          icon: 'danger',
          title: '불러오지 못했어요',
          message: errorMessage(e),
        });
        navigation.goBack();
      });
  }, [siteId, dialog, navigation]);

  const onSave = async () => {
    if (!rows) {
      return;
    }
    const { items, bad } = itemsFromRows(rows, true);
    if (bad) {
      dialog.toast(`${bad}의 수량을 입력해 주세요`, 'error');
      return;
    }
    setSaving(true);
    try {
      await setSiteMaterials(siteId, items);
      dialog.toast('현장 자재를 저장했어요', 'success');
      navigation.goBack();
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '저장하지 못했어요',
        message: errorMessage(e),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title="현장 자재"
        subtitle={siteName}
        onBack={() => navigation.goBack()}
      />
      {rows === null ? (
        <ActivityIndicator
          style={styles.loading}
          color={colors.navy}
          size="large"
        />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Card>
              <Text style={styles.cardTitle}>지금 현장에 있는 자재</Text>
              <Text style={styles.guide}>
                새로 들어온 자재는 양을 늘려 주세요. 보고가 승인되면 사용한 만큼
                자동으로 빠져요.
              </Text>
              <MaterialRowsEditor
                rows={rows}
                onChange={setRows}
                presets={COMMON_MATERIALS}
                max={100}
                onFull={() =>
                  dialog.toast('자재는 100가지까지 넣을 수 있어요', 'error')
                }
              />
            </Card>
          </ScrollView>
          <BottomBar>
            <Button title="저장" onPress={onSave} loading={saving} />
          </BottomBar>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  loading: { marginTop: 48 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  guide: {
    fontSize: 13,
    color: colors.textSub,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 14,
  },
});
