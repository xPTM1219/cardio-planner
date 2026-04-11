import { defineConfig } from 'vite';

export default defineConfig({
  base: '/cardio-planner/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
