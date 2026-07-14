// Shared wiki-page renderer. Used by:
//  - tools/generate-seo.js (build-time) to write dist/wiki/<slug>/index.html
//  - vite.config.js (dev-time plugin) to serve /wiki/<slug>/ on the fly
//  - the production SPA's PWA precache list reflects what's generated
//
// The renderer reads an HTML template (the dist/index.html or
// src/index.html — both have the same structure), substitutes the wiki
// content into the <main id="appStage"> slot, and strips the SPA module
// + PWA registration + manifest link so the page is fully static.

import fs from 'node:fs';
import path from 'node:path';
import { APP_CONFIG } from '../config/formats.js';
import { WIKI_PAGES } from '../config/wiki.js';

// Local copies of the inline-script / manifest strips from
// tools/generate-seo.js. The dev-server plugin needs the same behaviour.
const SPA_MODULE_RE = /<script\s+type="module"[^>]*src="\/assets\/index-[^"]+\.js"[^>]*><\/script>/gi;
const PWA_REGISTER_RE = /<script\s+id="vite-plugin-pwa:register-sw"[^>]*><\/script>/gi;
const MANIFEST_RE = /<link[^>]*rel="manifest"[^>]*>/gi;
const ACTIONS_BLOCK_RE = /<div class="actions">[\s\S]*?<\/div>\s*<\/header>/i;

function stripSpaHooks(html) {
  return html
    .replace(SPA_MODULE_RE, '')
    .replace(PWA_REGISTER_RE, '')
    .replace(MANIFEST_RE, '')
    .replace(ACTIONS_BLOCK_RE, '</header>');
}

function renderWikiBody(page) {
  return `<div class="wiki-container">${page.content}<div class="wiki-actions"><a href="/" class="btn secondary">← Back to App</a></div></div>`;
}

// Render a single wiki page using the provided HTML template.
// Strips the SPA module and PWA hooks (so the page is purely static)
// and preserves the <main id="appStage"> attribute (needed by the
// existing CSS hooks).
export function renderWikiPageHTML(page, template) {
  const url = `https://${APP_CONFIG.domain}/wiki/${page.slug}/`;
  const wikiBody = renderWikiBody(page);
  return stripSpaHooks(template)
    .replace(/<title>.*?<\/title>/, `<title>${page.title} | Migrator</title>`)
    .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${page.desc}">`)
    .replace('</head>', `<link rel="canonical" href="${url}"></head>`)
    .replace('<body>', '<body class="wiki-page">')
    .replace(/<main\b([^>]*)>[\s\S]*?<\/main>/i, `<main$1>${wikiBody}</main>`);
}

// Build all pages from the template. Returns [{ slug, html }, ...].
export function renderAllWikiPages(template) {
  return WIKI_PAGES.map(p => ({ slug: p.slug, html: renderWikiPageHTML(p, template) }));
}

// Read the template from a path on disk. Used by tools/generate-seo.js
// (dist/index.html) and by the Vite dev plugin (src/index.html).
export function readTemplate(templatePath) {
  return fs.readFileSync(path.resolve(templatePath), 'utf-8');
}

export { WIKI_PAGES };
