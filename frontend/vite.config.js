import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server proxies /api -> FastAPI backend on :8100 (override via BACKEND_PORT=xxxx)
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.FRONTEND_PORT) || 5273,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || 8100}`,
        changeOrigin: true,
      },
    },
  },
})
