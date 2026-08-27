import { useCallback, useEffect, useState } from 'react';
import { authApi, loadSessionCookie } from './api';
import { AuthUser } from './types';

let currentUser: AuthUser | null = null;
const listeners = new Set<(user: AuthUser | null) => void>();

function emit(user: AuthUser | null) {
  currentUser = user;
  listeners.forEach((fn) => fn(user));
}

export async function hydrateSession(): Promise<AuthUser | null> {
  await loadSessionCookie();
  try {
    const user = await authApi.me();
    emit(user);
    return user;
  } catch {
    emit(null);
    return null;
  }
}

export async function signIn(emailOrUsername: string, password: string): Promise<AuthUser> {
  const user = await authApi.login(emailOrUsername, password);
  emit(user);
  try {
    const { syncLibraryAfterLogin } = await import('./library');
    await syncLibraryAfterLogin();
  } catch {
    /* sync is best-effort */
  }
  return user;
}

export async function signOut(): Promise<void> {
  await authApi.logout();
  emit(null);
}

export function getCachedUser(): AuthUser | null {
  return currentUser;
}

export function useSession() {
  const [user, setUser] = useState<AuthUser | null>(currentUser);
  const [ready, setReady] = useState(currentUser !== null);

  useEffect(() => {
    listeners.add(setUser);
    if (currentUser === null) {
      hydrateSession().finally(() => setReady(true));
    } else {
      setReady(true);
    }
    return () => {
      listeners.delete(setUser);
    };
  }, []);

  const login = useCallback(signIn, []);
  const logout = useCallback(signOut, []);

  return { user, ready, login, logout };
}
