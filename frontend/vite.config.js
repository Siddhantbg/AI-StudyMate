// vite.config.js - Simplified, no worker conflicts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  // Use esbuild-wasm for cross-platform compatibility
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/
  },
  
  // Basic optimizations
  optimizeDeps: {
    include: ['react-pdf', 'pdfjs-dist'],
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
        '.ts': 'tsx',
        '.jsx': 'jsx',
        '.tsx': 'tsx'
      }
    }
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