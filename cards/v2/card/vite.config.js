import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server :{
    proxy: {
      '/api/v1/': {
        target: 'http://127.0.0.1:48620'
      },
      '/api': {
        target: 'http://127.0.0.1:48621'
      },
      '/static': {
        target: 'http://127.0.0.1:48621'
      },
      '/login.html': {
        target: 'http://127.0.0.1:4862'
      },
      '/styles/login.css': {
        target: 'http://127.0.0.1:4862/'
      },
      '/scripts/login.js': {
        target: 'http://127.0.0.1:4862/'
      },
      '/scripts/nacl': {
        target: 'http://127.0.0.1:4862/'
      }
    }
  }
})
