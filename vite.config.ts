import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/cardio-planner/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api/osrm': {
        target: 'https://router.project-osrm.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/osrm/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Agent worktrees and scratch files are not part of the project.
    exclude: [...configDefaults.exclude, '.kilo/**', '.claude/**'],
  },
});
