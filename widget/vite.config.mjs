import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const src = fileURLToPath(new URL('./src', import.meta.url));
const dist = fileURLToPath(new URL('./dist', import.meta.url));

/**
 * The 3DDashboard loads index.html from the widget's URL, and index.html loads bundle.js from the
 * same folder. So the build is one classic script with relative URLs, plus static/version.json,
 * which index.html reads to tag bundle.js and defeat the dashboard's cache.
 */
const widgetPage = () => ({
  name: 'widget-page',
  // Dev server: load the entry as a module instead of the deployed bundle.
  transformIndexHtml: {
    order: 'pre',
    handler: (html) =>
      html.replace(
        /<script type="text\/javascript">[\s\S]*?<\/script>/,
        '<script type="module" src="./main.js"></script>',
      ),
  },
  closeBundle() {
    copyFileSync(resolve(src, 'index.html'), resolve(dist, 'index.html'));
    mkdirSync(resolve(dist, 'static'), { recursive: true });
    writeFileSync(
      resolve(dist, 'static/version.json'),
      JSON.stringify({ build: new Date().toISOString() }),
    );
  },
});

export default defineConfig({
  root: src,
  base: './',
  publicDir: false,
  plugins: [vue(), widgetPage()],
  define: { __VUE_OPTIONS_API__: false, __VUE_PROD_DEVTOOLS__: false },
  server: { port: 8081, strictPort: true },
  build: {
    outDir: dist,
    emptyOutDir: true,
    target: ['chrome118', 'edge118', 'firefox119', 'safari17'],
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(src, 'main.js'),
      output: {
        format: 'iife',
        entryFileNames: 'bundle.js',
        inlineDynamicImports: true,
        assetFileNames: '[name][extname]',
      },
    },
  },
});
