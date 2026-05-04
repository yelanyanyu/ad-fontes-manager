import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--green)',
        secondary: 'var(--green-hover)',
        surface: 'var(--surface)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        green: {
          DEFAULT: 'var(--green)',
          hover: 'var(--green-hover)',
          soft: 'var(--green-soft)',
          border: 'var(--green-border)',
        },
        blue: {
          DEFAULT: 'var(--blue)',
          soft: 'var(--blue-soft)',
          border: 'var(--blue-border)',
        },
        red: {
          DEFAULT: 'var(--red)',
          soft: 'var(--red-soft)',
          border: 'var(--red-border)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          soft: 'var(--amber-soft)',
          border: 'var(--amber-border)',
        },
        nav: {
          DEFAULT: 'var(--nav)',
          soft: 'var(--nav-soft)',
        },
      },
      fontFamily: {
        sans: 'var(--sans)',
        serif: 'var(--serif)',
        mono: 'var(--mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },
    },
  },
  plugins: [],
};

export default config;
