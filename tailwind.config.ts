import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#15803D',
        secondary: '#059669',
        bg: '#faf8f5',
        surface: '#ffffff',
        leaf: {
          50: '#F0F7F3',
          100: '#E2EFE7',
          200: '#C5DFCF',
          300: '#A8CFB7',
          400: '#8BBF9F',
          500: '#6EAF87',
          600: '#519F6F',
          700: '#348F57',
          800: '#15803D',
          900: '#116932',
          950: '#0D4F26',
        },
        earth: {
          50: '#FAF8F5',
          100: '#F5F0EB',
          200: '#EBE1D7',
          300: '#E1D2C3',
          400: '#D7C3AF',
          500: '#CDB49B',
          600: '#C3A587',
          700: '#B99673',
          800: '#AF875F',
          900: '#A5784B',
          950: '#9B6937',
        },
      },
      fontFamily: {
        heading: ['Lora', 'Georgia', 'serif'],
        sans: ['Raleway', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Noto Serif SC', 'serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};

export default config;
