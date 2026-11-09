import { defineConfig } from 'vite';

// GitHub Pages-এর Subdirectory: https://manik-rmch.github.io/bangla-ocr/
// target 'esnext': PDF.js-এর আধুনিক কোড Build করার জন্য প্রয়োজন।
export default defineConfig({
  base: '/bangla-ocr/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext'
  },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' }
  }
});
