import { defineConfig } from 'vite';

// GitHub Pages-এর Subdirectory: https://manik-rmch.github.io/bangla-ocr/
export default defineConfig({
  base: '/bangla-ocr/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  }
});
