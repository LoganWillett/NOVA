import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages safe: relative asset paths work for any repo name / subpath.
export default defineConfig({
  plugins: [react()],
  base: './',
})
