import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

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
          target: 'http://localhost:17387',
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
