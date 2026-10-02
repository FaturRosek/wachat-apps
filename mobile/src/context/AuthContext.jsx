import React, { createContext, useContext, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, { setAuthToken } from '../api/apiClient';
import { STORAGE_KEYS, getApiHost, setApiHost, DEFAULT_API_HOST } from '../config/env';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(async (nextUser, nextToken) => {
    setUser(nextUser);
    setToken(nextToken);
    setAuthToken(nextToken);
    if (nextUser) {
      await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(nextUser));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.user);
    }
    if (nextToken) {
      await AsyncStorage.setItem(STORAGE_KEYS.token, nextToken);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.token);
    }
  }, []);

  const [apiHostState, setApiHostState] = useState(getApiHost());

  const updateHost = useCallback(async (newHost) => {
    const normalized = setApiHost(newHost);
    setApiHostState(normalized);
    await AsyncStorage.setItem(STORAGE_KEYS.apiHost, normalized);
    return normalized;
  }, []);

  const init = useCallback(async () => {
    try {
      const savedHost = await AsyncStorage.getItem(STORAGE_KEYS.apiHost);
      const isOutdatedEmulatorHost =
        savedHost && savedHost.includes('10.0.2.2') && !DEFAULT_API_HOST.includes('10.0.2.2');

      if (savedHost && !isOutdatedEmulatorHost) {
        const normalized = setApiHost(savedHost);
        setApiHostState(normalized);
      } else {
        const normalized = setApiHost(DEFAULT_API_HOST);
        setApiHostState(normalized);
      }

      const savedToken = await AsyncStorage.getItem(STORAGE_KEYS.token);
      if (savedToken) {
        setAuthToken(savedToken);
        try {
          const res = await apiClient.get('/auth/me');
          if (res.data?.success && res.data.data?.user) {
            setUser(res.data.data.user);
            setToken(savedToken);
            await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(res.data.data.user));
          } else {
            setAuthToken(null);
            await AsyncStorage.removeItem(STORAGE_KEYS.token);
            await AsyncStorage.removeItem(STORAGE_KEYS.user);
          }
        } catch (e) {
          setAuthToken(null);
          await AsyncStorage.removeItem(STORAGE_KEYS.token);
          await AsyncStorage.removeItem(STORAGE_KEYS.user);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    init();
  }, [init]);

  const login = useCallback(async (email, password) => {
    const res = await apiClient.post('/auth/login', { email, password });
    const { user: authUser, token: authToken } = res.data.data;
    await applySession(authUser, authToken);
    return authUser;
  }, [applySession]);

  const register = useCallback(async (name, email, password) => {
    const res = await apiClient.post('/auth/register', { name, email, password });
    const { user: authUser, token: authToken } = res.data.data;
    await applySession(authUser, authToken);
    return authUser;
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      if (token) await apiClient.post('/auth/logout');
    } catch (e) {}
    await applySession(null, null);
  }, [applySession, token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        init,
        login,
        register,
        logout,
        apiHost: apiHostState,
        updateHost,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}