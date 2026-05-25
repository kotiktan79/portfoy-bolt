/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        serif: ['Fraunces', 'Georgia', 'serif'],
      },

      colors: {
        gold: {
          50:  '#fbf8f1',
          100: '#f3ead0',
          200: '#e8d6a3',
          300: '#dbbb70',
          400: '#cda04d',
          500: '#c9a961',
          600: '#a98744',
          700: '#866937',
          800: '#695234',
          900: '#574431',
          950: '#332617',
        },
        ink: {
          50:  '#f6f5f0',
          100: '#e7e5da',
          200: '#cfcab6',
          300: '#aba38a',
          400: '#857d63',
          500: '#6a634d',
          600: '#544f3e',
          700: '#454132',
          800: '#3a362b',
          900: '#1a1814',
          950: '#0e0d0a',
        },
        terra: {
          400: '#d97757',
          500: '#c45d3f',
          600: '#a64a31',
        },
        accent: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        surface: {
          light:      '#ffffff',
          'light-alt': '#f8fafc',
          dark:       '#0f172a',
          'dark-alt':  '#1e293b',
        },
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'page-enter': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in':  'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.16,1,0.3,1)',
        'page-enter': 'page-enter 0.35s cubic-bezier(0.16,1,0.3,1)',
      },

      backdropBlur: {
        xs:   '2px',
        '2xl': '40px',
        '3xl': '64px',
      },

      boxShadow: {
        glow:      '0 0 20px -4px rgba(99,102,241,0.35)',
        'glow-lg': '0 0 32px -4px rgba(99,102,241,0.45)',
      },
    },
  },
  plugins: [],
};
