// 로그인 상태를 앱 전체에서 공유한다(앱을 다시 켜도 로그인 유지)
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as apiAuth from './api/buildup';
import { setUnauthorizedHandler } from './api/client';
import { SignUpInput, User } from './types';

interface AuthValue {
  user: User | null;
  restoring: boolean; // 저장된 로그인 확인 중
  login: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void; // 계정 정보가 바뀌었을 때(관리자 전환 등)
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);

  // 로그인이 만료되면 로그인 화면으로
  useEffect(() => {
    setUnauthorizedHandler(() => {
      apiAuth.logout();
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    apiAuth
      .restoreSession()
      .then(setUser)
      .finally(() => setRestoring(false));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      restoring,
      login: async (email, password) =>
        setUser(await apiAuth.login(email, password)),
      signUp: async input => setUser(await apiAuth.signUp(input)),
      logout: () => {
        apiAuth.logout();
        setUser(null);
      },
      setUser,
    }),
    [user, restoring],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('AuthProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}

// 로그인 후 화면에서 사용(로그인 안 된 상태면 이 화면들이 아예 안 보인다)
export function useUser() {
  const { user } = useAuth();
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }
  return user;
}
