import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import authService from "../services/AuthService";

export const AuthContext = createContext({
  user: null,
  loading: true,
  refreshUser: async () => null,
  login: async () => null,
  logout: async () => null,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!authService.getToken()) {
      setUser(null);
      return null;
    }

    try {
      const currentUser = await authService.me();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      authService.clearToken();
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (active) await refreshUser();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshUser]);

  const login = useCallback(async (email, password) => {
    await authService.login(email, password);
    return refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, refreshUser, login, logout }),
    [user, loading, refreshUser, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
