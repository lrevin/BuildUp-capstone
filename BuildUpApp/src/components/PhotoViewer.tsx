// 사진 크게 보기(좌우로 넘기기)
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from './Text';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './ui';

interface Props {
  uris: string[];
  index: number | null; // null이면 닫힘
  onClose: () => void;
}

export default function PhotoViewer({ uris, index, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index ?? 0);
  const listRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (index !== null) {
      setCurrent(index);
    }
  }, [index]);

  return (
    <Modal
      visible={index !== null}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={uris}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index ?? 0}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          keyExtractor={(u, i) => `${u}-${i}`}
          onMomentumScrollEnd={e =>
            setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          renderItem={({ item }) => (
            <Image
              source={{ uri: item }}
              style={{ width, height }}
              resizeMode="contain"
            />
          )}
        />
        <View style={[styles.top, { paddingTop: insets.top + 4 }]}>
          <Text style={styles.counter}>
            {current + 1} / {uris.length}
          </Text>
          <IconButton label="닫기" onPress={onClose}>
            <X size={26} color="#FFFFFF" strokeWidth={2} />
          </IconButton>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
  },
  counter: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
