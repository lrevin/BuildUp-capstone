// 여러 화면에서 같이 쓰는 기본 UI
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StatusBar,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../theme';

// ---- 버튼 ----

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'dark' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: ButtonProps) {
  const off = disabled || loading;
  const light = variant === 'dark';
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.btn,
        styles[variant],
        off && styles.btnOff,
        pressed && styles.btnPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={light ? colors.white : colors.navy} />
      ) : (
        <Text style={[styles.btnText, light && styles.btnTextLight]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

// ---- 입력칸 ----

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
}

export function Field({ label, hint, style, ...rest }: FieldProps) {
  const [focused, setFocused] = React.useState(false);
  // 비밀번호 칸이면 오른쪽에 보기/숨기기 버튼
  const isPassword = !!rest.secureTextEntry;
  const [visible, setVisible] = React.useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...rest}
        secureTextEntry={isPassword && !visible}
        style={[
          styles.input,
          focused && styles.inputFocused,
          isPassword && styles.inputWithIcon,
          style,
        ]}
        onFocus={e => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
      />
      {isPassword ? (
        <Pressable
          style={styles.eye}
          onPress={() => setVisible(v => !v)}
          hitSlop={8}
          accessibilityLabel={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
        >
          {visible ? (
            <EyeOff size={20} color={colors.textMuted} />
          ) : (
            <Eye size={20} color={colors.textMuted} />
          )}
        </Pressable>
      ) : null}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ---- 상단바(흰색) ----

interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  dark?: boolean; // 로그인·회원가입 화면(남색 바탕)
}

export function AppHeader({
  title,
  subtitle,
  onBack,
  right,
  dark,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        dark && styles.headerDark,
        { paddingTop: insets.top },
      ]}
    >
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={styles.headerRow}>
        {onBack ? (
          <IconButton onPress={onBack} label="뒤로">
            <ChevronLeft
              size={26}
              color={dark ? colors.white : colors.text}
              strokeWidth={2}
            />
          </IconButton>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <View style={styles.flex}>
          <Text
            style={[styles.headerTitle, dark && styles.headerTitleDark]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.headerSub, dark && styles.headerSubDark]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function IconButton({
  children,
  onPress,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconPressed]}
    >
      {children}
    </Pressable>
  );
}

// ---- 카드·섹션 ----

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

// ---- 하단 고정 버튼 영역 ----

export function BottomBar({
  children,
  dark,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bottom,
        dark && styles.bottomDark,
        { paddingBottom: 12 + insets.bottom },
      ]}
    >
      {children}
    </View>
  );
}

// ---- 이름 첫 글자 동그라미 ----

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>
        {name.slice(0, 1)}
      </Text>
    </View>
  );
}

// ---- 작은 표시 칩 ----

export function Chip({
  label,
  tone = 'gray',
}: {
  label: string;
  tone?: 'gray' | 'yellow';
}) {
  return (
    <View style={[styles.chip, tone === 'yellow' && styles.chipYellow]}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

// ---- 로고 ----

// 앱 아이콘과 같은 로고 그림(scripts/make-icons.ps1이 src/assets/logo.png로 만든다)
const LOGO = require('../assets/logo.png');

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={LOGO}
      style={{ width: size, height: size }}
      accessibilityLabel="Build Up 로고"
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  btn: {
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: colors.yellow },
  dark: { backgroundColor: colors.navy },
  outline: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnOff: { opacity: 0.4 },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
    letterSpacing: -0.2,
  },
  btnTextLight: { color: colors.white },

  field: { marginBottom: 18 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSub,
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.fill,
    backgroundColor: colors.fill,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  inputFocused: { borderColor: colors.navy, backgroundColor: colors.white },
  inputWithIcon: { paddingRight: 48 },
  eye: {
    position: 'absolute',
    right: 14,
    top: 21 + 16, // 라벨 높이 + (입력칸 52 - 아이콘 20) / 2
  },
  fieldHint: { fontSize: 12, color: colors.textMuted, marginTop: 6 },

  header: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  headerSpacer: { width: 8 }, // 8(바깥) + 8 + 4(gap) = 20 → 본문 여백과 제목 시작점 일치
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerSub: { fontSize: 12, color: colors.textSub, marginTop: 1 },
  headerDark: {
    backgroundColor: colors.ink950,
    borderBottomColor: colors.ink800,
  },
  headerTitleDark: { color: colors.white },
  headerSubDark: { color: colors.ink400 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: { backgroundColor: colors.fill },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    ...shadow,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },

  bottom: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  bottomDark: { backgroundColor: colors.ink950, borderTopColor: colors.ink800 },

  avatar: {
    backgroundColor: colors.yellowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '800', color: '#8A5E00' },
  chip: {
    backgroundColor: colors.fill,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chipYellow: { backgroundColor: colors.yellowSoft },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.textSub },
});
