// vite.config.js - Simplified, no worker conflicts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  // Basic optimizations
  optimizeDeps: {
    include: ['react-pdf', 'pdfjs-dist']
  },
  
  // Simple server config
  server: {
    host: true,
    port: 5173
  },
  
  // Define global for compatibility
  define: {
    global: 'globalThis'
  }
})