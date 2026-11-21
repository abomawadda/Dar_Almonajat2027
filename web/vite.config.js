import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { fileURLToPath, URL } from 'node:url'

// Icons are compiled into the bundle at build time (only the ones used),
// so the app works offline and never fetches icons from a CDN.
export default defineConfig({
  plugins: [react(), Icons({ compiler: 'jsx', jsx: 'react', scale: 1 })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'], react: ['react', 'react-dom', 'react-router-dom'] } }
    }
  },
  test: { environment: 'node', include: ['src/**/*.test.js'] }
})
