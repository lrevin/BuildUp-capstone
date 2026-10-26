// 진행한 작업: 하나 입력하고 완료(↵)를 누르면 위 목록에 한 줄로 들어가고
// 이어서 다음 작업을 입력한다(태그 모양 없이 글자만). 서버에는 ', '로 이어 붙인 글자 하나로 보낸다(전체 100자까지)
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { Text } from './Text';

import { TAG_MAX, addWork, splitWorks } from '../utils/works';

/** 입력용: 작업 목록 + 입력칸 */
export function WorkTagInput({
  tags,
  onChange,
  text,
  onChangeText,
  onFull,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  text: string; // 아직 칩이 안 된 입력 중인 글자
  onChangeText: (t: string) => void;
  onFull: () => void; // 전체 글자 수를 넘었을 때
}) {
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);

  const commit = (raw: string) => {
    const next = addWork(tags, raw);
    if (next === null) {
      onFull();
      return;
    }
    onChange(next);
    onChangeText('');
    // 키보드가 들고 있던 조합 중인 글자까지 비워야 다음 작업이 이어 붙지 않는다
    input.current?.clear();
  };

  // 쉼표를 치면 바로 칩으로
  const onType = (t: string) => {
    if (t.includes(',')) {
      const parts = t.split(',');
      let next: string[] | null = tags;
      for (const p of parts.slice(0, -1)) {
        next = next && addWork(next, p);
      }
      if (next === null) {
        onFull();
        return;
      }
      onChange(next);
      onChangeText(parts[parts.length - 1].slice(0, TAG_MAX));
      return;
    }
    onChangeText(t.slice(0, TAG_MAX));
  };

  return (
    <Pressable
      style={[styles.box, focused && styles.boxFocused]}
      onPress={() => input.current?.focus()}
    >
      {tags.length > 0 ? (
        <View style={styles.list}>
          {tags.map(t => (
            <View key={t} style={styles.item}>
              <Text style={styles.itemText}>{t}</Text>
              <Pressable
                onPress={() => onChange(tags.filter(x => x !== t))}
                accessibilityLabel={`${t} 지우기`}
                hitSlop={10}
              >
                <X size={16} color={colors.textMuted} strokeWidth={2.4} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          ref={input}
          style={styles.input}
          value={text}
          onChangeText={onType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => commit(text)}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder={
            tags.length === 0 ? '예) 2층 욕실 방수' : '다른 작업 더 입력'
          }
          placeholderTextColor={colors.textMuted}
          maxLength={TAG_MAX}
        />
        {text.trim() ? (
          <Pressable
            style={styles.add}
            onPress={() => commit(text)}
            accessibilityLabel="작업 추가"
            hitSlop={6}
          >
            <Plus size={18} color={colors.navy} strokeWidth={2.6} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

/** 보기용: 보고 상세에서 작업을 한 줄씩 보여 준다 */
export function WorkTagList({ work }: { work: string }) {
  const tags = splitWorks(work);
  return (
    <View style={styles.viewList}>
      {tags.map(t => (
        <Text key={t} style={styles.viewText}>
          {t}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  boxFocused: { backgroundColor: colors.white, borderColor: colors.navy },
  list: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 2,
  },
  itemText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  viewList: { gap: 4 },
  viewText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 26,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  add: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
