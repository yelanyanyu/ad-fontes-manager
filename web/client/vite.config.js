import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: (() => {
    const configPath = path.resolve(__dirname, '../config.json')
    let config = {}
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } catch (e) {
      config = {}
    }
    const apiPort = config.API_PORT || process.env.API_PORT
    const clientPort = config.CLIENT_DEV_PORT || process.env.CLIENT_DEV_PORT
    return {
      port: clientPort ? Number(clientPort) : undefined,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true
        }
      }
    }
  })(),
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
