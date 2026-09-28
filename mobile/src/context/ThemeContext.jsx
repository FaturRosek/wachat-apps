import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config/env';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEYS.theme);
      setTheme(saved || 'system');
    })();
  }, []);

  useEffect(() => {
    if (theme && theme !== 'system') {
      AsyncStorage.setItem(STORAGE_KEYS.theme, theme).catch(() => {});
    }
  }, [theme]);

  const isDark = theme === 'system' ? systemScheme === 'dark' : theme === 'dark';

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const currentlyDark = prev === 'system' ? systemScheme === 'dark' : prev === 'dark';
      return currentlyDark ? 'light' : 'dark';
    });
  }, [systemScheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
