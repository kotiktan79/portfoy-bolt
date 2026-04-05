import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'blue' | 'purple' | 'green';

interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
}

const themes: Record<Theme, ThemeColors> = {
  light: {
    primary: '#3b82f6',
    secondary: '#64748b',
    accent: '#8b5cf6',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
  },
  dark: {
    primary: '#3b82f6',
    secondary: '#64748b',
    accent: '#8b5cf6',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f8fafc',
  },
  blue: {
    primary: '#0ea5e9',
    secondary: '#06b6d4',
    accent: '#3b82f6',
    background: '#f0f9ff',
    surface: '#e0f2fe',
    text: '#0c4a6e',
  },
  purple: {
    primary: '#8b5cf6',
    secondary: '#a78bfa',
    accent: '#c084fc',
    background: '#faf5ff',
    surface: '#f3e8ff',
    text: '#581c87',
  },
  green: {
    primary: '#10b981',
    secondary: '#059669',
    accent: '#34d399',
    background: '#f0fdf4',
    surface: '#dcfce7',
    text: '#064e3b',
  },
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('app_theme');
    return (stored as Theme) || 'light';
  });

  useEffect(() => {
    localStorage.setItem('app_theme', theme);
    applyTheme(theme);
  }, [theme]);

  function applyTheme(selectedTheme: Theme) {
    const colors = themes[selectedTheme];
    const root = document.documentElement;

    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    if (selectedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  return { theme, setTheme, themes: Object.keys(themes) as Theme[] };
}
