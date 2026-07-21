import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy';

// `--mode overlay` builds only the injected content script as a self-contained IIFE.
// It runs as a classic script (chrome.scripting.executeScript files), so it must have no ESM imports;
// a single-entry IIFE inlines its watermark dependency instead of emitting a shared-chunk `import`.
export default defineConfig(({ mode }): UserConfig => {
  if (mode === 'overlay') {
    return {
      build: {
        outDir: 'build',
        emptyOutDir: false, // preserve the main build; this pass only adds overlay.js
        rollupOptions: {
          input: { overlay: './src/overlay.ts' },
          output: {
            format: 'iife',
            entryFileNames: 'overlay.js',
          },
        },
      },
    }
  }

  // Default pass: the React popup and the module service worker, both ESM-safe.
  return {
    base: './',
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: 'public/manifest.json',
            dest: '.',
          }
        ],
      }),
    ],
    build: {
      outDir: 'build',
      rollupOptions: {
        input: {
          main: './index.html',
          background: './src/background.ts',
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'background') return 'background.js';
            return 'assets/[name]-[hash].js';
          },
        },
      },
    },
  }
});
