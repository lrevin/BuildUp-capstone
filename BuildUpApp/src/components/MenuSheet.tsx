import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';

export interface MenuItem {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

interface Props {
  visible: boolean;
  items: MenuItem[];
  onClose: () => void;
}

// 상단바 오른쪽 메뉴 버튼을 누르면 뜨는 드롭다운
export default function MenuSheet({ visible, items, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.menu, { top: insets.top + 52 }]}>
          {items.map(item => (
            <Pressable
              key={item.label}
              disabled={item.disabled}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.itemPressed,
              ]}
              onPress={() => {
                onClose();
                item.onPress?.();
              }}
            >
              {item.icon}
              <Text
                style={[
                  styles.label,
                  item.danger && styles.danger,
                  item.disabled && styles.disabled,
                ]}
              >
                {item.label}
              </Text>
              {item.description ? (
                <Text style={styles.description}>{item.description}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  menu: {
    position: 'absolute',
    right: 12,
    minWidth: 200,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 48,
  },
  itemPressed: { backgroundColor: colors.fill },
  label: { fontSize: 15, color: colors.text },
  danger: { color: colors.danger },
  disabled: { color: colors.textMuted },
  description: {
    marginLeft: 'auto',
    fontSize: 13,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
