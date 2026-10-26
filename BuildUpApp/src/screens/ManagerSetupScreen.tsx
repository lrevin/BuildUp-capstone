// 현장 관리자로 전환(작업자 → 관리자) / 보고 체계 변경(본사 보고 ↔ 최고 책임자)
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { fetchMySites, previewCompany, setManager } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useAuth, useUser } from '../auth';
import { useDialog } from '../components/Dialog';
import { Text } from '../components/Text';
import { AppHeader, BottomBar, Button, Field } from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';

export default function ManagerSetupScreen({
  navigation,
  route,
}: ScreenProps<'ManagerSetup'>) {
  const next = route.params?.next;
  const user = useUser();
  const { setUser } = useAuth();
  const dialog = useDialog();
  const isWorker = user.role === 'worker';
  const [mode, setMode] = useState<'top' | 'hq'>(user.hqName ? 'hq' : 'top');
  const [code, setCode] = useState('');
  const [company, setCompany] = useState(
    user.role === 'admin' ? user.company ?? '' : '',
  );
  const [ownedCount, setOwnedCount] = useState(0);
  const [linkSites, setLinkSites] = useState(true);
  const [saving, setSaving] = useState(false);

  // 내가 만든 현장 수(보고 체계를 바꿀 때 기존 현장도 같이 바꿀지 묻기 위해)
  useEffect(() => {
    fetchMySites()
      .then(list => setOwnedCount(list.filter(s => s.isOwner).length))
      .catch(() => {});
  }, []);

  const onSave = async () => {
    if (mode === 'hq' && !/^\d{6}$/.test(code)) {
      dialog.toast('본사 코드 6자리를 입력해 주세요', 'error');
      return;
    }
    setSaving(true);
    try {
      let message: string;
      if (mode === 'hq') {
        const name = await previewCompany(code);
        message = `'${name}'에 보고하는 현장 관리자가 돼요.`;
      } else {
        message = '본사 없이 직접 운영해요. 자재 요청도 내가 승인해요.';
      }
      if (ownedCount > 0 && linkSites) {
        message +=
          mode === 'hq'
            ? `\n내가 만든 현장 ${ownedCount}곳도 이 본사에 연결돼요.`
            : `\n내가 만든 현장 ${ownedCount}곳의 본사 연결이 해제돼요.`;
      }
      const ok = await dialog.confirm({
        title: isWorker ? '현장 관리자로 전환할까요?' : '보고 체계를 바꿀까요?',
        message,
        confirmText: isWorker ? '전환' : '바꾸기',
      });
      if (!ok) {
        setSaving(false);
        return;
      }
      const updated = await setManager({
        companyCode: mode === 'hq' ? code : null,
        company: company.trim() || undefined,
        linkSites: ownedCount > 0 && linkSites,
      });
      setUser(updated);
      dialog.toast(
        isWorker ? '현장 관리자로 전환했어요' : '보고 체계를 바꿨어요',
        'success',
      );
      if (next) {
        navigation.replace(next);
      } else {
        navigation.goBack();
      }
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
        title={isWorker ? '현장 관리자로 전환' : '보고 체계'}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          {isWorker
            ? '관리자가 되면 내 현장을 만들 수 있어요. 참여 중인 현장에서는 그대로 작업자예요.'
            : '본사에 보고하면 내 현장이 본사에 연결돼요.'}
        </Text>

        <Option
          active={mode === 'top'}
          title="제가 최고 책임자예요"
          desc="본사 없이 운영해요. 소규모 현장·인력사무소에 알맞아요."
          onPress={() => setMode('top')}
        />
        <Option
          active={mode === 'hq'}
          title="본사에 보고해요"
          desc="본사 코드를 입력하면 보고와 자재 요청이 본사로 올라가요."
          onPress={() => setMode('hq')}
        />

        {mode === 'hq' ? (
          <Field
            label="본사 코드"
            value={code}
            onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder={
              user.hqName
                ? `지금: ${user.hqName}`
                : '본사 관계자에게 받은 6자리 숫자'
            }
            keyboardType="number-pad"
            maxLength={6}
          />
        ) : null}
        <Field
          label="회사·사무소명 (선택)"
          value={company}
          onChangeText={setCompany}
          placeholder="예) 박철근 인력사무소"
        />

        {ownedCount > 0 ? (
          <Pressable
            style={styles.checkRow}
            onPress={() => setLinkSites(v => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: linkSites }}
          >
            <View style={[styles.checkbox, linkSites && styles.checkboxOn]}>
              {linkSites ? (
                <Check size={14} color={colors.white} strokeWidth={3} />
              ) : null}
            </View>
            <Text style={styles.checkText}>
              내가 만든 현장 {ownedCount}곳의 본사 연결도 같이 바꾸기
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <BottomBar>
        <Button
          title={isWorker ? '현장 관리자로 전환' : '저장'}
          onPress={onSave}
          loading={saving}
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

function Option({
  active,
  title,
  desc,
  onPress,
}: {
  active: boolean;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, active && styles.optionActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.radio, active && styles.radioOn]}>
        {active ? (
          <Check size={13} color={colors.white} strokeWidth={3} />
        ) : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDesc}>{desc}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  body: { padding: 20 },
  intro: {
    fontSize: 14,
    color: colors.textSub,
    lineHeight: 21,
    marginBottom: 18,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  optionActive: { borderColor: colors.navy },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  optionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  optionDesc: {
    fontSize: 13,
    color: colors.textSub,
    marginTop: 3,
    lineHeight: 19,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  checkText: { flex: 1, fontSize: 14, color: colors.text },
});
