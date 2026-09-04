import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import authService from "../services/AuthService";
import { subscribeToAuthTokenChanges } from "../utils/authSessionSync";

export const AuthContext = createContext({
  user: null,
  loading: true,
  refreshUser: async () => null,
  login: async () => null,
  loginGoogle: async () => null,
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
      if (error?.status === 401) {
        authService.clearToken();
        setUser(null);
        return null;
      }

      // Temporary network/server failures must not destroy a still-valid session token.
      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (active) await refreshUser();
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Unable to refresh Cutinapp session", error);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshUser]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleAuthInvalidated = () => {
      authService.clearToken();
      setUser(null);
      setLoading(false);
    };

    window.addEventListener("petertecnet:auth-invalidated", handleAuthInvalidated);
    return () => window.removeEventListener("petertecnet:auth-invalidated", handleAuthInvalidated);
  }, []);

  useEffect(() => {
    let active = true;

    const unsubscribe = subscribeToAuthTokenChanges(async (newToken) => {
      if (!active) return;

      if (!newToken) {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await refreshUser();
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Unable to synchronize Cutinapp session between tabs", error);
        }
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [refreshUser]);

  const login = useCallback(async (email, password) => {
    await authService.login(email, password);
    return refreshUser();
  }, [refreshUser]);

  const loginGoogle = useCallback(async (credential) => {
    await authService.loginGoogle(credential);
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
    () => ({ user, loading, refreshUser, login, loginGoogle, logout }),
    [user, loading, refreshUser, login, loginGoogle, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
