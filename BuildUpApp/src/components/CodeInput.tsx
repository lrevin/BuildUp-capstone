// 6칸 숫자 코드 입력(칸을 누르면 숫자 키패드가 뜬다)
import React, { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Text';
import { colors } from '../theme';

export const CODE_LENGTH = 6;

interface Props {
  value: string;
  onChange: (code: string) => void;
  error?: boolean;
}

export default function CodeInput({ value, onChange, error }: Props) {
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  return (
    <Pressable onPress={() => inputRef.current?.focus()}>
      <View style={styles.row}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const active = i === Math.min(value.length, CODE_LENGTH - 1);
          return (
            <View
              key={i}
              style={[
                styles.box,
                active && styles.boxActive,
                error && styles.boxError,
              ]}
            >
              <Text style={styles.digit}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      {/* 실제 입력은 보이지 않는 칸이 받는다 */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={t => onChange(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        autoFocus
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.fill,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.navy, backgroundColor: colors.white },
  boxError: { borderColor: colors.danger },
  digit: { fontSize: 26, fontWeight: '700', color: colors.text },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
