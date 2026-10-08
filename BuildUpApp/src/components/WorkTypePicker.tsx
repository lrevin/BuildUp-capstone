// 공사 종류 고르기: 누르면 검색창이 있는 목록이 열린다. 목록에 없으면 직접 입력
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  PencilLine,
  Search,
  X,
} from 'lucide-react-native';
import { isListedWorkType, searchWorkTypes } from '../data/workTypes';
import { colors, radius } from '../theme';
import { Text } from './Text';

const MAX_LEN = 50;

/** 입력칸처럼 보이는 버튼 + 고르는 창 */
export default function WorkTypePicker({
  value,
  onChange,
  label = '공사 종류',
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [styles.select, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          value ? `공사 종류 ${value}, 바꾸기` : '공사 종류 고르기'
        }
      >
        <Text
          style={[styles.selectText, !value && styles.placeholder]}
          numberOfLines={1}
        >
          {value || '눌러서 고르기 (예: 수도 공사, 욕실 리모델링)'}
        </Text>
        <ChevronDown size={20} color={colors.textMuted} />
      </Pressable>
      <WorkTypeModal
        visible={open}
        current={value}
        onClose={() => setOpen(false)}
        onPick={v => {
          onChange(v);
          setOpen(false);
        }}
      />
    </View>
  );
}

function WorkTypeModal({
  visible,
  current,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: string;
  onClose: () => void;
  onPick: (v: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false); // 직접 입력 중
  const [custom, setCustom] = useState('');

  const sections = useMemo(
    () => searchWorkTypes(query).map(g => ({ title: g.group, data: g.items })),
    [query],
  );
  const q = query.trim();
  // 검색어가 목록에 똑같이 없으면 '그대로 쓰기'를 맨 위에 보여 준다
  const canUseQuery = q.length > 0 && !isListedWorkType(q);

  const close = () => {
    setQuery('');
    setTyping(false);
    setCustom('');
    onClose();
  };
  const pick = (v: string) => {
    const t = v.trim().slice(0, MAX_LEN);
    if (!t) {
      return;
    }
    setQuery('');
    setTyping(false);
    setCustom('');
    onPick(t);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={[styles.sheet, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={close} hitSlop={10} accessibilityLabel="닫기">
            <ChevronLeft size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>공사 종류</Text>
        </View>

        {typing ? (
          // ---- 직접 입력 ----
          <View style={styles.customBox}>
            <Text style={styles.customTitle}>공사 종류를 직접 적어 주세요</Text>
            <TextInput
              style={styles.customInput}
              value={custom}
              onChangeText={setCustom}
              placeholder="예) 옥상 우레탄 방수 공사"
              placeholderTextColor={colors.textMuted}
              autoFocus
              maxLength={MAX_LEN}
              returnKeyType="done"
              onSubmitEditing={() => pick(custom)}
            />
            <Text style={styles.counter}>
              {custom.length}/{MAX_LEN}
            </Text>
            <View style={styles.customButtons}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setTyping(false)}
              >
                <Text style={styles.btnGhostText}>목록으로</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  !custom.trim() && styles.btnDisabled,
                ]}
                onPress={() => pick(custom)}
                disabled={!custom.trim()}
              >
                <Text style={styles.btnPrimaryText}>이걸로 정하기</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            {/* ---- 검색 ---- */}
            <View style={styles.searchBox}>
              <Search size={20} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="공사 이름으로 찾기 (예: 수도, 전기, 타일)"
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
                autoCorrect={false}
              />
              {query ? (
                <Pressable
                  onPress={() => setQuery('')}
                  hitSlop={10}
                  accessibilityLabel="검색어 지우기"
                >
                  <X size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <SectionList
              sections={sections}
              keyExtractor={(it, i) => it.name + i}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled={false}
              contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
              ListHeaderComponent={
                canUseQuery ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.useQuery,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => pick(q)}
                  >
                    <PencilLine size={18} color={colors.navy} />
                    <Text style={styles.useQueryText} numberOfLines={2}>
                      ‘{q}’ 그대로 쓰기
                    </Text>
                  </Pressable>
                ) : undefined
              }
              renderSectionHeader={({ section }) => (
                <Text style={styles.groupTitle}>{section.title}</Text>
              )}
              renderItem={({ item }) => {
                const selected = item.name === current;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.row,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={() => pick(item.name)}
                  >
                    <Text
                      style={[styles.rowText, selected && styles.rowSelected]}
                    >
                      {item.name}
                    </Text>
                    {selected ? (
                      <Check size={18} color={colors.navy} strokeWidth={3} />
                    ) : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  찾는 공사가 목록에 없어요.{'\n'}위의 ‘그대로 쓰기’나 아래
                  ‘직접 입력’을 눌러 주세요.
                </Text>
              }
              ListFooterComponent={
                <Pressable
                  style={({ pressed }) => [
                    styles.customRow,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    setCustom(q);
                    setTyping(true);
                  }}
                >
                  <PencilLine size={18} color={colors.textSub} />
                  <View style={styles.flex}>
                    <Text style={styles.customRowTitle}>직접 입력</Text>
                    <Text style={styles.customRowDesc}>
                      찾는 공사가 없으면 이름을 직접 적어요
                    </Text>
                  </View>
                </Pressable>
              }
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  field: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSub,
    marginBottom: 8,
  },
  select: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectText: { flex: 1, fontSize: 16, color: colors.text },
  placeholder: { color: colors.textMuted, fontSize: 15 },

  sheet: { flex: 1, backgroundColor: colors.white },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  searchBox: {
    marginHorizontal: 20,
    marginBottom: 8,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, padding: 0 },
  useQuery: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  useQueryText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 20,
    marginBottom: 4,
    paddingHorizontal: 20,
  },
  row: {
    minHeight: 50,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowPressed: { backgroundColor: colors.fill },
  rowText: { fontSize: 16, color: colors.text },
  rowSelected: { fontWeight: '700', color: colors.navy },
  empty: {
    textAlign: 'center',
    color: colors.textSub,
    marginTop: 32,
    lineHeight: 21,
  },
  customRow: {
    marginHorizontal: 20,
    marginTop: 24,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customRowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  customRowDesc: { fontSize: 13, color: colors.textSub, marginTop: 2 },
  customBox: { padding: 20 },
  customTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  customInput: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.navy,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  counter: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
  customButtons: { flexDirection: 'row', gap: 8, marginTop: 16 },
  btn: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { fontSize: 15, fontWeight: '700', color: colors.textSub },
  btnPrimary: { flex: 1, backgroundColor: colors.yellow },
  btnPrimaryText: { fontSize: 15, fontWeight: '800', color: colors.navy },
  btnDisabled: { opacity: 0.4 },
});
