// 로그인 상태 관리
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as API from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  ready: boolean; // 저장된 토큰으로 세션 복구를 마쳤는지
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const WORKER_MESSAGE = '본사 관계자 또는 현장 관리자 계정으로 로그인해 주세요';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    API.setUnauthorizedHandler(() => setUser(null));
    const token = API.getToken();
    if (!token) {
      setReady(true);
      return;
    }
    API.me()
      .then((u) => {
        if (u.role === 'worker') {
          API.setToken(null);
          setUser(null);
        } else {
          setUser(u);
        }
      })
      .catch(() => {
        API.setToken(null);
        setUser(null);
      })
      .finally(() => setReady(true));
    return () => API.setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await API.login(email, password);
    if (res.user.role === 'worker') {
      // 작업자 토큰은 쓰지 않는다: 서버 세션도 바로 정리
      API.setToken(res.token);
      await API.logout().catch(() => undefined);
      API.setToken(null);
      throw new Error(WORKER_MESSAGE);
    }
    API.setToken(res.token);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await API.logout().catch(() => undefined);
    API.setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider 안에서만 쓸 수 있어요');
  return ctx;
}
