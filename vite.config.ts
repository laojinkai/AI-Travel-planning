import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_DOUBAO_API_KEY || env.VITE_API_KEY || process.env.API_KEY),
      // Polyfill process.env for other uses if necessary, preventing "process is not defined"
      'process.env': {} 
    }
  }
})