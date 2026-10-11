// 진행한 작업 태그: 해시태그처럼 하나 입력하고 완료(↵)를 누르면 강조된 칩으로 들어가고
// 이어서 다음 작업을 입력한다. 서버에는 ', '로 이어 붙인 글자 하나로 보낸다(전체 100자까지)
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { Text } from './Text';

import { TAG_MAX, addWork, splitWorks } from '../utils/works';

/** 입력용: 칩 + 입력칸 */
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
        <View style={styles.chips}>
          {tags.map(t => (
            <Pressable
              key={t}
              style={styles.chip}
              onPress={() => onChange(tags.filter(x => x !== t))}
              accessibilityLabel={`${t} 지우기`}
              hitSlop={4}
            >
              <Text style={styles.chipText}>{t}</Text>
              <X size={14} color={colors.white} strokeWidth={2.6} />
            </Pressable>
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
            tags.length === 0
              ? '예) 2층 욕실 방수 → 완료 누르고 다음 작업'
              : '다른 작업 더 입력'
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

/** 보기용: 제출 확인·보고 상세에서 칩으로 보여 준다 */
export function WorkTagList({ work }: { work: string }) {
  const tags = splitWorks(work);
  return (
    <View style={styles.chips}>
      {tags.map(t => (
        <View key={t} style={[styles.chip, styles.chipStatic]}>
          <Text style={styles.chipText}>{t}</Text>
        </View>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.navy,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 7,
  },
  chipStatic: { paddingRight: 12 },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.white },
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
