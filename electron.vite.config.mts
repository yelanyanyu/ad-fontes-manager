import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Desktop server port — shared with src/main/index.ts via env var.
// Keep in sync: both default to 19876.
const DESKTOP_SERVER_PORT = Number(process.env.DESKTOP_SERVER_PORT || 19876);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: id =>
          id === 'better-sqlite3' || id === '../server/app' || id.includes('src/server/app'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: 'src/renderer',
    plugins: [vue({})],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
    },
    css: {
      postcss: {
        plugins: [tailwindcss(undefined), autoprefixer()],
      },
    },
    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${DESKTOP_SERVER_PORT}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
});
