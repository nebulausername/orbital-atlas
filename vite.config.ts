import { defineConfig } from 'vite';

// Served under https://kaufmeinewebsite.de/orbital-atlas/ — override with ATLAS_BASE=/ for local roots.
export default defineConfig({
  base: process.env.ATLAS_BASE ?? '/orbital-atlas/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  server: { host: '127.0.0.1', port: 5190 },
  preview: { host: '127.0.0.1', port: 5191 },
});
