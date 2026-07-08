'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, clearTokens, getRefreshToken, setTokens } from './api';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginWithPassword: (phone: string, password: string) => Promise<AuthUser>;
  loginWithOtp: (phone: string, code: string, purpose: 'register' | 'login') => Promise<AuthUser>;
  requestOtp: (phone: string, purpose: 'register' | 'login') => Promise<{ devOtp?: string; message: string }>;
  register: (phone: string, fullName: string, password?: string) => Promise<{ devOtp?: string; message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiFetch<AuthUser>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      await refreshUser();
      if (!cancelled) setLoading(false);
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginWithPassword = useCallback(async (phone: string, password: string) => {
    const result = await apiFetch<{ accessToken: string; refreshToken: string; user: AuthUser }>(
      '/auth/login',
      { method: 'POST', body: { phone, password }, auth: false },
    );
    setTokens(result.accessToken, result.refreshToken);
    setUser(result.user);
    return result.user;
  }, []);

  const requestOtp = useCallback(async (phone: string, purpose: 'register' | 'login') => {
    return apiFetch<{ devOtp?: string; message: string }>('/auth/otp/request', {
      method: 'POST',
      body: { phone, purpose },
      auth: false,
    });
  }, []);

  const register = useCallback(async (phone: string, fullName: string, password?: string) => {
    return apiFetch<{ devOtp?: string; message: string }>('/auth/register', {
      method: 'POST',
      body: { phone, fullName, password },
      auth: false,
    });
  }, []);

  const loginWithOtp = useCallback(
    async (phone: string, code: string, purpose: 'register' | 'login') => {
      const result = await apiFetch<{ accessToken: string; refreshToken: string; user: AuthUser }>(
        '/auth/otp/verify',
        { method: 'POST', body: { phone, code, purpose }, auth: false },
      );
      setTokens(result.accessToken, result.refreshToken);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      const refreshToken = getRefreshToken();
      await apiFetch('/auth/logout', { method: 'POST', body: { refreshToken } });
    } catch {
      // ignore
    }
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, loginWithPassword, loginWithOtp, requestOtp, register, logout, refreshUser }),
    [user, loading, loginWithPassword, loginWithOtp, requestOtp, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth باید داخل AuthProvider استفاده شود.');
  return ctx;
}
