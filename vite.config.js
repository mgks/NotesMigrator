import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderWikiPageHTML, WIKI_PAGES } from './src/lib/wiki-render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Vite dev-server middleware: serve /wiki/<slug>/ dynamically from the
// src/config/wiki.js source. The build-time `node tools/generate-seo.js`
// does the same job into dist/wiki/, but in dev we don't have dist/ yet
// (or we'd have to run a predev hook). The middleware reads the source
// index.html once, strips the SPA module + PWA hooks (so the page is
// purely static), and serves the rendered HTML on every request to
// /wiki/<slug>/.
function wikiDevPlugin() {
  return {
    name: 'wiki-dev',
    apply: 'serve',  // dev only; production deploys are static
    configureServer(server) {
      // Load the source index.html once at startup. The template doesn't
      // change between dev reloads unless the user edits index.html, in
      // which case restarting the dev server picks it up.
      let template = '';
      try {
        template = fs.readFileSync(resolve(__dirname, 'index.html'), 'utf-8');
      } catch {
        template = '';
      }
      server.middlewares.use('/wiki', (req, res, next) => {
        // /wiki/<slug>/ or /wiki/<slug>
        const parts = (req.url || '/').split('?')[0].split('/').filter(Boolean);
        const slug = parts[0] || 'guide';
        const page = WIKI_PAGES.find(p => p.slug === slug);
        if (!page || !template) return next();
        try {
          const html = renderWikiPageHTML(page, template);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(html);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // gray-matter ships an eval() path for CoffeeScript/TOML engines which
        // we never invoke — suppress this known false-positive until md-fusion
        // v0.2.1 (which swaps gray-matter for js-yaml) lands on the registry.
        if (
          warning.code === 'EVAL' &&
          warning.id?.includes('gray-matter')
        ) return;
        defaultHandler(warning);
      }
    }
  },
  plugins: [
    wikiDevPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Migrator',
        short_name: 'Migrator',
        description: 'Universal Note Converter. Private, Offline, Fast.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // This regex tells the PWA: "If the URL starts with /wiki, do NOT hijack it."
        navigateFallbackDenylist: [/^\/wiki/, /^\/google-/, /^\/notion-/, /^\/enex-/, /^\/markdown-/, /^\/json-/]
      }
    })
  ]
});
