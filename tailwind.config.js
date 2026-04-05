/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /* ── Colours ─────────────────────────────── */
      colors: {
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
        },
        surface: {
          light:      '#ffffff',
          'light-alt': '#f8fafc',
          dark:       '#0f172a',
          'dark-alt':  '#1e293b',
        },
      },

      /* ── Typography ──────────────────────────── */
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
      },

      /* ── Animations ──────────────────────────── */
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
      },
      animation: {
        'fade-in':  'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.16,1,0.3,1)',
      },

      /* ── Backdrop blur ───────────────────────── */
      backdropBlur: {
        xs:   '2px',
        '2xl': '40px',
        '3xl': '64px',
      },

      /* ── Box shadow ──────────────────────────── */
      boxShadow: {
        glow:      '0 0 20px -4px rgba(99,102,241,0.35)',
        'glow-lg': '0 0 32px -4px rgba(99,102,241,0.45)',
      },
    },
  },
  plugins: [],
};
