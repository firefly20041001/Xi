import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'))

export default defineConfig({
  plugins: [react()],
  // Single version source: package.json (About page + update check)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  resolve: {
    alias: {
      '@renderer': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url))
    }
  },
  clearScreen: false,
  server: {
    port: 5180,
    strictPort: true,
    watch: {
      // cargo locks files under target/ while compiling; watching them
      // crashes vite with EBUSY on Windows
      ignored: ['**/src-tauri/target/**', '**/dist/**']
    }
  },
  build: {
    target: 'chrome105',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        lyrics: fileURLToPath(new URL('./lyrics.html', import.meta.url))
      }
    }
  }
})
