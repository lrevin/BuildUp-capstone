import React, { useEffect } from 'react';
import { Linking, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { Text } from './src/components/Text';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth';
import { DialogProvider, useDialog } from './src/components/Dialog';
import { PushData, listenPush, registerPush } from './src/push';
import { Logo } from './src/components/ui';
import { RootStackParamList } from './src/navigation';
import { KakaoSignup } from './src/types';
import AddSiteScreen from './src/screens/AddSiteScreen';
import CreateSiteScreen from './src/screens/CreateSiteScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import HqHomeScreen from './src/screens/HqHomeScreen';
import HqReportsScreen from './src/screens/HqReportsScreen';
import JoinSiteScreen from './src/screens/JoinSiteScreen';
import LoginScreen from './src/screens/LoginScreen';
import ManagerSetupScreen from './src/screens/ManagerSetupScreen';
import MaterialRequestScreen from './src/screens/MaterialRequestScreen';
import MaterialsScreen from './src/screens/MaterialsScreen';
import MembersScreen from './src/screens/MembersScreen';
import PasswordResetScreen from './src/screens/PasswordResetScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import ReportDetailScreen from './src/screens/ReportDetailScreen';
import ReportScreen from './src/screens/ReportScreen';
import RoleSelectScreen from './src/screens/RoleSelectScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import ServerScreen from './src/screens/ServerScreen';
import SiteCodeScreen from './src/screens/SiteCodeScreen';
import SiteSettingsScreen from './src/screens/SiteSettingsScreen';
import ProgressModeScreen from './src/screens/ProgressModeScreen';
import SitesScreen from './src/screens/SitesScreen';
import { colors } from './src/theme';
import { errorMessage } from './src/api/client';

const Stack = createNativeStackNavigator<RootStackParamList>();

function SystemOnlyWeb() {
  const { logout } = useAuth();
  return (
    <View style={styles.splash}>
      <StatusBar barStyle="dark-content" />
      <Logo size={56} />
      <Text style={styles.splashText}>시스템 관리자 계정</Text>
      <Text style={styles.systemText}>
        시스템 관리자 기능은 웹 대시보드에서 이용해 주세요.
      </Text>
      <Pressable style={styles.systemBtn} onPress={logout}>
        <Text style={styles.systemBtnText}>로그아웃</Text>
      </Pressable>
    </View>
  );
}

// 로그인 여부에 따라 보여줄 화면 묶음이 바뀐다
function RootNavigator() {
  const { user, restoring } = useAuth();

  // 저장된 로그인을 확인하는 동안 보여주는 시작 화면
  if (restoring) {
    return (
      <View style={styles.splash}>
        <StatusBar barStyle="dark-content" />
        <Logo size={64} />
        <Text style={styles.splashText}>Build Up</Text>
      </View>
    );
  }

  // 시스템 관리자는 웹 대시보드 전용
  if (user?.role === 'system') {
    return <SystemOnlyWeb />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user?.role === 'hq' ? (
        // 본사 관계자: 현장 보고·자재 요청을 받는 화면
        <>
          <Stack.Screen name="HqHome" component={HqHomeScreen} />
          <Stack.Screen name="HqReports" component={HqReportsScreen} />
          <Stack.Screen name="Progress" component={ProgressScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="ReportDetail" component={ReportDetailScreen} />
          <Stack.Screen name="Materials" component={MaterialsScreen} />
          <Stack.Screen name="Members" component={MembersScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="PasswordReset" component={PasswordResetScreen} />
        </>
      ) : user ? (
        <>
          <Stack.Screen name="Sites" component={SitesScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="PasswordReset" component={PasswordResetScreen} />
          <Stack.Screen name="AddSite" component={AddSiteScreen} />
          <Stack.Screen name="CreateSite" component={CreateSiteScreen} />
          <Stack.Screen name="SiteCode" component={SiteCodeScreen} />
          <Stack.Screen name="SiteSettings" component={SiteSettingsScreen} />
          <Stack.Screen name="ProgressMode" component={ProgressModeScreen} />
          <Stack.Screen name="JoinSite" component={JoinSiteScreen} />
          <Stack.Screen name="Report" component={ReportScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="Progress" component={ProgressScreen} />
          <Stack.Screen name="ReportDetail" component={ReportDetailScreen} />
          <Stack.Screen name="Members" component={MembersScreen} />
          <Stack.Screen name="Materials" component={MaterialsScreen} />
          <Stack.Screen name="ManagerSetup" component={ManagerSetupScreen} />
          <Stack.Screen
            name="MaterialRequest"
            component={MaterialRequestScreen}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          {/* 개발용 서버 설정: 로그인 화면 로고를 길게 누르면 열린다(사용자에게는 보이지 않음) */}
          <Stack.Screen
            name="Server"
            component={ServerScreen}
            navigationKey="guest"
          />
        </>
      )}
    </Stack.Navigator>
  );
}

const navigationRef = createNavigationContainerRef<RootStackParamList>();

// 로그인하면 이 휴대폰을 알림 받을 곳으로 등록하고, 알림을 누르면 해당 화면을 연다
function PushBridge() {
  const { user } = useAuth();
  const dialog = useDialog();
  const userId = user?.id;
  const isHq = user?.role === 'hq';

  useEffect(() => {
    if (userId) {
      registerPush();
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const open = (data: PushData, tries = 0) => {
      if (!data.siteId) {
        return;
      }
      // 앱을 막 켰으면 화면이 준비될 때까지 잠깐 기다린다
      if (!navigationRef.isReady()) {
        if (tries < 20) {
          setTimeout(() => open(data, tries + 1), 250);
        }
        return;
      }
      const params = { siteId: data.siteId, siteName: data.siteName ?? '' };
      if (data.type === 'material') {
        navigationRef.navigate('Materials', params);
      } else if (isHq) {
        navigationRef.navigate('HqReports', params);
      } else {
        navigationRef.navigate('History', params);
      }
    };
    return listenPush(
      (title, body) => dialog.toast(body ? `${title}\n${body}` : title),
      data => open(data),
    );
  }, [userId, isHq, dialog]);

  return null;
}

// 카카오 로그인: 휴대폰 브라우저에서 로그인을 마치면 buildupapp://oauth/kakao?ticket=... 로 앱이 열린다
// 티켓은 한 번만 쓸 수 있어서, 처리한 티켓은 기억해 둔다(로그아웃 뒤 같은 주소를 다시 처리하지 않게)
const handledTickets = new Set<string>();

function KakaoBridge() {
  const { user, restoring, kakao } = useAuth();
  const dialog = useDialog();
  const loggedIn = !!user;

  useEffect(() => {
    // 저장된 로그인·서버 주소를 다 불러온 뒤에 처리한다(앱이 꺼졌다 켜지며 돌아온 경우)
    if (restoring || loggedIn) {
      return;
    }
    const onUrl = async (url: string | null | undefined) => {
      const m = url?.match(
        /^buildupapp:\/\/oauth\/kakao\?(?:.*&)?ticket=([0-9a-f]+)/,
      );
      if (!m || handledTickets.has(m[1])) {
        return;
      }
      handledTickets.add(m[1]);
      try {
        const r = await kakao(m[1]);
        // 처음 온 사람: 역할을 고르고 휴대폰 인증 등 나머지 정보를 받아 가입
        if (r && r !== 'login') {
          openSignup(r, 0);
        }
      } catch (e) {
        dialog.notice({
          icon: 'danger',
          title: '카카오로 로그인하지 못했어요',
          message: errorMessage(e),
        });
      }
    };
    // 화면이 준비될 때까지 잠깐 기다렸다가 가입 화면으로
    const openSignup = (signup: KakaoSignup, tries: number) => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('RoleSelect', { kakao: signup });
      } else if (tries < 20) {
        setTimeout(() => openSignup(signup, tries + 1), 250);
      }
    };
    Linking.getInitialURL()
      .then(onUrl)
      .catch(() => {});
    const sub = Linking.addEventListener('url', e => onUrl(e.url));
    return () => sub.remove();
  }, [restoring, loggedIn, kakao, dialog]);

  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DialogProvider>
        <AuthProvider>
          <NavigationContainer ref={navigationRef}>
            <RootNavigator />
            <PushBridge />
            <KakaoBridge />
          </NavigationContainer>
        </AuthProvider>
      </DialogProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  systemText: {
    marginTop: 10,
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  systemBtn: {
    marginTop: 24,
    paddingHorizontal: 28,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
  },
  systemBtnText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  splashText: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
});
