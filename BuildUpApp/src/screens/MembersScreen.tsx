// 현장 참여자 목록(총관리자: 내보내기 / 작업자: 현장 나가기)
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { useFocusEffect } from '@react-navigation/native';
import { Phone } from 'lucide-react-native';
import { fetchMembers, leaveSite, removeMember } from '../api/buildup';
import { errorMessage } from '../api/client';
import { useUser } from '../auth';
import { useDialog } from '../components/Dialog';
import {
  AppHeader,
  Avatar,
  BottomBar,
  Button,
  Chip,
  IconButton,
} from '../components/ui';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import { Member } from '../types';

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}.${String(d.getDate()).padStart(2, '0')}`;
};

export default function MembersScreen({
  navigation,
  route,
}: ScreenProps<'Members'>) {
  const { siteId, siteName, isOwner } = route.params;
  const me = useUser();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [leaving, setLeaving] = useState(false);
  const dialog = useDialog();

  const load = useCallback(async () => {
    try {
      setMembers(await fetchMembers(siteId));
    } catch (e) {
      dialog.toast(errorMessage(e), 'error');
      setMembers([]);
    }
  }, [siteId, dialog]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRemove = async (m: Member) => {
    const ok = await dialog.confirm({
      title: `${m.name}님을 내보낼까요?`,
      message: '내보낸 뒤에는 참여 코드로 다시 들어와야 해요.',
      confirmText: '내보내기',
      danger: true,
    });
    if (!ok) {
      return;
    }
    try {
      await removeMember(siteId, m.id);
      dialog.toast(`${m.name}님을 내보냈어요`);
      load();
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '내보내지 못했어요',
        message: errorMessage(e),
      });
    }
  };

  const onLeave = async () => {
    const ok = await dialog.confirm({
      title: '현장에서 나갈까요?',
      message: `'${siteName}'에 다시 들어오려면 참여 코드가 필요해요.`,
      confirmText: '나가기',
      danger: true,
    });
    if (!ok) {
      return;
    }
    setLeaving(true);
    try {
      await leaveSite(siteId);
      dialog.toast('현장에서 나갔어요');
      navigation.popTo('Sites');
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '나가지 못했어요',
        message: errorMessage(e),
      });
      setLeaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title={`참여자${members ? ` ${members.length}` : ''}`}
        subtitle={siteName}
        onBack={() => navigation.goBack()}
      />

      {members === null ? (
        <ActivityIndicator style={styles.loading} color={colors.navy} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: m }) => (
            <View style={styles.row}>
              <Avatar name={m.name} size={44} />
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{m.name}</Text>
                  {m.isOwner ? <Chip label="관리자" tone="yellow" /> : null}
                  {m.id === me.id ? <Chip label="나" /> : null}
                </View>
                <Text style={styles.meta}>
                  {shortDate(m.joinedAt)} 참여 · 보고 {m.reportCount}건
                </Text>
              </View>
              {m.id !== me.id ? (
                <IconButton
                  label={`${m.name}에게 전화`}
                  onPress={() => Linking.openURL(`tel:${m.phone}`)}
                >
                  <Phone size={18} color={colors.textSub} strokeWidth={2} />
                </IconButton>
              ) : null}
              {isOwner && !m.isOwner ? (
                <Pressable hitSlop={8} onPress={() => onRemove(m)}>
                  <Text style={styles.remove}>내보내기</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}

      {/* 본사 관계자는 참여자가 아니라 나갈 수 없다(보기만) */}
      {!isOwner && me.role !== 'hq' ? (
        <BottomBar>
          <Button
            title="현장 나가기"
            variant="outline"
            onPress={onLeave}
            loading={leaving}
          />
        </BottomBar>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: 20, paddingVertical: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingLeft: 20,
    paddingRight: 12,
    marginBottom: 8,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
  remove: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.danger,
    paddingHorizontal: 4,
  },
});
