import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1a1a1e',
          50: '#2a2a30',
          100: '#26262b',
          200: '#232328',
          300: '#1f1f24',
          400: '#1a1a1e',
          500: '#151519',
          600: '#111114',
          border: '#33333a',
        },
        accent: {
          DEFAULT: '#7b68ee',
          50: '#efeaff',
          100: '#e0d8ff',
          400: '#9385f0',
          500: '#7b68ee',
          600: '#5f4fd1',
        },
        status: {
          open: '#87909e',
          progress: '#4592f8',
          review: '#a25ddc',
          done: '#6bc950',
          closed: '#008844',
          blocked: '#e2445c',
        },
        priority: {
          urgent: '#f50000',
          high: '#ffcc00',
          normal: '#6fddff',
          low: '#d8d8d8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '-4px 0 24px rgba(0,0,0,0.35)',
      },
      keyframes: {
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config
