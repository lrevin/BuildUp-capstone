import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Text } from '../components/Text';
import { createSite } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useDialog } from '../components/Dialog';
import { AppHeader, BottomBar, Button, Field } from '../components/ui';
import WorkTypePicker from '../components/WorkTypePicker';
import { ScreenProps } from '../navigation';
import { colors } from '../theme';

export default function CreateSiteScreen({
  navigation,
}: ScreenProps<'CreateSite'>) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [workType, setWorkType] = useState('');
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
    setLoading(true);
    try {
      const site = await createSite({ name, address, workType });
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

        <Text style={styles.guide}>
          보고할 때 진행한 작업과 현장 전체 진행률을 직접 입력해요.
        </Text>
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
});
