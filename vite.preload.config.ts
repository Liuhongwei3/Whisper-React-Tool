import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: '.vite/build',
    emptyOutDir: false,
    lib: {
      entry: 'src/preload.ts',
      formats: ['cjs'],
      fileName: 'preload',
    },
    rollupOptions: {
      external: ['electron'],
    },
  },
})
