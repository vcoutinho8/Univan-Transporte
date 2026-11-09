import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// O .env fica na raiz do monorepo, compartilhado com o backend.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '')
  return {
    plugins: [react(), tailwindcss()],
    envDir: '..',
    server: {
      port: 5173,
      // O front chama /api na própria origem e o Vite repassa para a API.
      // Assim não depende de CORS, seja aberto por localhost, 127.0.0.1 ou IP da rede.
      proxy: { '/api': env.API_PROXY_TARGET || 'http://127.0.0.1:8000' },
    },
  }
})
