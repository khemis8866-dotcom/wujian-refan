import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Relative assets let the same dist run at / or a GitHub Pages repository path.
export default defineConfig({ base: './', plugins: [react()], build: { target: 'safari17', rollupOptions: { output: {
  manualChunks: { temporal: ['@js-temporal/polyfill'], validation: ['zod'], react: ['react', 'react-dom'] },
} } } });
