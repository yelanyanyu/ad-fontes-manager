import vue from '@vitejs/plugin-vue';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import dotenv from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'vite';

const currentDir = process.cwd();
dotenv.config({ path: path.resolve(currentDir, '.env') });

export default defineConfig({
  root: 'src/renderer',
  plugins: [vue({})],
  resolve: {
    alias: {
      '@': path.resolve(currentDir, 'src/renderer/src'),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss(undefined), autoprefixer()],
    },
  },
  server: (() => {
    const apiPort = Number(process.env.PORT || process.env.SERVER_PORT || 8080);
    const clientPort = process.env.CLIENT_DEV_PORT;

    return {
      port: clientPort ? Number(clientPort) : undefined,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    };
  })(),
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
