// 앱 전용 대화상자(안드로이드 기본 Alert 대신 사용)
//
//   const dialog = useDialog();
//   if (await dialog.confirm({ title: '로그아웃', message: '로그아웃할까요?', danger: true })) { ... }
//   await dialog.notice({ title: '제출 실패', message: '...' });
//   const pick = await dialog.choose({ title: '사진 추가', options: [...] });   // 아래에서 올라오는 선택창
//   dialog.toast('저장했어요', 'success');                                       // 잠깐 떴다 사라지는 알림
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from './Text';
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  TriangleAlert,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';

// ---- 타입 ----

type IconKind = 'success' | 'warning' | 'danger' | 'info';

export interface DialogAction<T> {
  label: string;
  value: T;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface DialogOptions<T> {
  icon?: IconKind;
  title: string;
  message?: string;
  actions: DialogAction<T>[];
}

export interface SheetOption<T> {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  value: T;
  danger?: boolean;
}

export interface SheetOptions<T> {
  title: string;
  message?: string;
  options: SheetOption<T>[];
}

type ToastTone = 'default' | 'success' | 'error';

interface DialogApi {
  show<T>(opts: DialogOptions<T>): Promise<T | null>;
  confirm(opts: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    icon?: IconKind;
  }): Promise<boolean>;
  notice(opts: {
    title: string;
    message?: string;
    buttonText?: string;
    icon?: IconKind;
  }): Promise<void>;
  choose<T>(opts: SheetOptions<T>): Promise<T | null>;
  toast(message: string, tone?: ToastTone): void;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('DialogProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}

// ---- Provider ----

interface Pending<O> {
  opts: O;
  resolve: (v: any) => void;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<Pending<DialogOptions<any>> | null>(
    null,
  );
  const [sheet, setSheet] = useState<Pending<SheetOptions<any>> | null>(null);
  const [toastState, setToastState] = useState<{
    message: string;
    tone: ToastTone;
    key: number;
  } | null>(null);

  const closeDialog = useCallback(
    (value: unknown) => {
      dialog?.resolve(value);
      setDialog(null);
    },
    [dialog],
  );

  const closeSheet = useCallback(
    (value: unknown) => {
      sheet?.resolve(value);
      setSheet(null);
    },
    [sheet],
  );

  const api = useMemo<DialogApi>(() => {
    const show = <T,>(opts: DialogOptions<T>) =>
      new Promise<T | null>(resolve => {
        setDialog(prev => {
          prev?.resolve(null); // 떠 있던 창은 닫힘 처리
          return { opts, resolve };
        });
      });
    return {
      show,
      confirm: async ({
        title,
        message,
        confirmText = '확인',
        cancelText = '취소',
        danger,
        icon,
      }) =>
        (await show({
          icon,
          title,
          message,
          actions: [
            { label: cancelText, value: false, variant: 'secondary' },
            {
              label: confirmText,
              value: true,
              variant: danger ? 'danger' : 'primary',
            },
          ],
        })) === true,
      notice: async ({ title, message, buttonText = '확인', icon }) => {
        await show({
          icon,
          title,
          message,
          actions: [{ label: buttonText, value: true, variant: 'primary' }],
        });
      },
      choose: <T,>(opts: SheetOptions<T>) =>
        new Promise<T | null>(resolve => {
          setSheet(prev => {
            prev?.resolve(null);
            return { opts, resolve };
          });
        }),
      toast: (message, tone = 'default') =>
        setToastState({ message, tone, key: Date.now() }),
    };
  }, []);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <DialogView pending={dialog} onClose={closeDialog} />
      <SheetView pending={sheet} onClose={closeSheet} />
      {toastState ? (
        <Toast
          key={toastState.key}
          message={toastState.message}
          tone={toastState.tone}
          onDone={() => setToastState(null)}
        />
      ) : null}
    </DialogContext.Provider>
  );
}

// ---- 가운데 대화상자 ----

const ICONS: Record<
  IconKind,
  { Icon: typeof Info; color: string; bg: string }
> = {
  success: { Icon: CircleCheck, color: colors.success, bg: '#E3F4EA' },
  warning: { Icon: TriangleAlert, color: '#B7800A', bg: colors.yellowSoft },
  danger: { Icon: CircleAlert, color: colors.danger, bg: '#FDECEC' },
  info: { Icon: Info, color: colors.textSub, bg: colors.fill },
};

function DialogView({
  pending,
  onClose,
}: {
  pending: Pending<DialogOptions<any>> | null;
  onClose: (v: unknown) => void;
}) {
  const { width } = useWindowDimensions();
  // 닫히는 애니메이션 동안 내용이 사라지지 않도록 마지막 내용을 기억
  const last = useRef<DialogOptions<any> | null>(null);
  if (pending) {
    last.current = pending.opts;
  }
  const opts = last.current;

  return (
    <Modal
      visible={!!pending}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => onClose(null)}
    >
      <Pressable style={styles.center} onPress={() => onClose(null)}>
        {opts ? (
          <Pressable
            style={[styles.dialog, { width: Math.min(width - 48, 340) }]}
            onPress={() => {}}
          >
            {opts.icon ? (
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: ICONS[opts.icon].bg },
                ]}
              >
                {React.createElement(ICONS[opts.icon].Icon, {
                  size: 26,
                  color: ICONS[opts.icon].color,
                  strokeWidth: 2.2,
                })}
              </View>
            ) : null}
            <Text style={styles.title}>{opts.title}</Text>
            {opts.message ? (
              <Text style={styles.message}>{opts.message}</Text>
            ) : null}
            <View style={styles.actions}>
              {opts.actions.map(a => (
                <Pressable
                  key={a.label}
                  onPress={() => onClose(a.value)}
                  style={({ pressed }) => [
                    styles.action,
                    styles[a.variant ?? 'primary'],
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionText,
                      a.variant === 'secondary' && styles.secondaryText,
                      a.variant === 'danger' && styles.dangerText,
                    ]}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );
}

// ---- 아래에서 올라오는 선택창 ----

function SheetView({
  pending,
  onClose,
}: {
  pending: Pending<SheetOptions<any>> | null;
  onClose: (v: unknown) => void;
}) {
  const insets = useSafeAreaInsets();
  const last = useRef<SheetOptions<any> | null>(null);
  if (pending) {
    last.current = pending.opts;
  }
  const opts = last.current;

  return (
    <Modal
      visible={!!pending}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => onClose(null)}
    >
      <Pressable style={styles.sheetBackdrop} onPress={() => onClose(null)} />
      {opts ? (
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{opts.title}</Text>
          {opts.message ? (
            <Text style={styles.sheetMessage}>{opts.message}</Text>
          ) : null}
          <View style={styles.options}>
            {opts.options.map(o => (
              <Pressable
                key={o.label}
                onPress={() => onClose(o.value)}
                style={({ pressed }) => [
                  styles.option,
                  pressed && styles.optionPressed,
                ]}
              >
                {o.icon ? (
                  <View style={styles.optionIcon}>{o.icon}</View>
                ) : null}
                <View style={styles.flex}>
                  <Text
                    style={[styles.optionLabel, o.danger && styles.dangerLabel]}
                  >
                    {o.label}
                  </Text>
                  {o.description ? (
                    <Text style={styles.optionDesc}>{o.description}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            onPress={() => onClose(null)}
          >
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        </View>
      ) : null}
    </Modal>
  );
}

// ---- 토스트 ----

function Toast({
  message,
  tone,
  onDone,
}: {
  message: string;
  tone: ToastTone;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(anim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => finished && onDone());
  }, [anim, onDone]);

  const Icon =
    tone === 'success' ? CircleCheck : tone === 'error' ? CircleX : null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          bottom: insets.bottom + 96,
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      {Icon ? (
        <Icon
          size={18}
          color={tone === 'success' ? '#6EE7A0' : '#FF8A8D'}
          strokeWidth={2.4}
        />
      ) : null}
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },

  // 대화상자
  center: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingTop: 26,
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 19, fontWeight: '700', color: colors.text },
  message: {
    fontSize: 15,
    color: colors.textSub,
    lineHeight: 23,
    marginTop: 8,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 24 },
  action: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.yellow },
  secondary: { backgroundColor: colors.fill },
  danger: { backgroundColor: colors.danger },
  actionText: { fontSize: 16, fontWeight: '700', color: colors.navy },
  secondaryText: { color: colors.textSub, fontWeight: '600' },
  dangerText: { color: colors.white },

  // 선택창
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 18,
  },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
  sheetMessage: { fontSize: 14, color: colors.textSub, marginTop: 4 },
  options: { marginTop: 14 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 4,
    borderRadius: radius.md,
  },
  optionPressed: { backgroundColor: colors.fill },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  dangerLabel: { color: colors.danger },
  optionDesc: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  cancel: {
    height: 52,
    marginTop: 12,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '600', color: colors.textSub },

  // 토스트
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '88%',
    backgroundColor: 'rgba(18,23,34,0.92)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  toastText: { fontSize: 14, fontWeight: '600', color: colors.white },
});
