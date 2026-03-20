import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: '#0a0a0f',
          card: '#12121a',
          border: '#1e1e2e',
          accent: '#00d4aa',
          red: '#ff4757',
          gold: '#ffd700',
          text: '#e4e4e7',
          muted: '#71717a',
        },
      },
    },
  },
  plugins: [],
};
export default config;
