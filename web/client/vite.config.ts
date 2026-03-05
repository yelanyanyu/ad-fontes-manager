import vue from '@vitejs/plugin-vue';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(currentDir, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  server: (() => {
    const configPath = path.resolve(currentDir, '../config.json');
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    } catch (_error) {
      config = {};
    }

    const apiPort = Number(config.API_PORT || process.env.API_PORT || 8080);
    const clientPort = config.CLIENT_DEV_PORT || process.env.CLIENT_DEV_PORT;

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
    outDir: '../dist',
    emptyOutDir: true,
  },
});
