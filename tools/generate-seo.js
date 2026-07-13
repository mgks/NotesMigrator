import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '../src/config/formats.js';
import { WIKI_PAGES } from '../src/config/wiki.js';

const TEMPLATE_PATH = './dist/index.html';
const DIST_DIR = './dist';
const SITEMAP_PATH = './dist/sitemap.xml';

if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error("❌ Build not found. Run 'npm run build' first.");
    process.exit(1);
}

const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
const sitemapUrls = [`https://${APP_CONFIG.domain}/`];

console.log(`🚀 Generating Wiki Pages for ${APP_CONFIG.domain}...`);

// --- Generate Wiki Pages Only ---
WIKI_PAGES.forEach(page => {
    const slug = `wiki/${page.slug}`;
    const outputDir = path.join(DIST_DIR, slug);
    fs.mkdirSync(outputDir, { recursive: true });

    const url = `https://${APP_CONFIG.domain}/${slug}/`;

    const wikiBody = `
        <div class="wiki-container">
            ${page.content}
            <div class="wiki-actions">
                <a href="/" class="btn secondary">← Back to App</a>
            </div>
        </div>
    `;

    let html = template
        .replace(/<title>.*?<\/title>/, `<title>${page.title} | Migrator</title>`)
        .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${page.desc}">`)
        .replace('</head>', `<link rel="canonical" href="${url}"></head>`)
        .replace('<body>', '<body class="wiki-page">')
        // Strip the SPA module script. The wiki page is static SEO
        // content; booting the app on it would overwrite the wiki body
        // by mounting the SPA into <main id="appStage">. The CSS link
        // below stays so styling still applies.
        .replace(/<script\s+type="module"[^>]*src="\/assets\/index-[^"]+\.js"[^>]*><\/script>/gi, '')
        // Strip the Vite-PWA SW registration: not relevant to a static
        // page and would otherwise install a service worker that could
        // cache stale HTML against the wiki URLs on later visits.
        .replace(/<script\s+id="vite-plugin-pwa:register-sw"[^>]*><\/script>/gi, '')
        .replace(/<link[^>]*rel="manifest"[^>]*>/gi, '')
        // Drop the theme toggle button from the wiki chrome — it needs
        // the SPA module to actually do anything, and stripping the SPA
        // module above would leave it inert. Replacing the whole header
        // actions row with a minimal "Back to App" + canonical link keeps
        // wiki pages navigable.
        .replace(/<div class="actions">[\s\S]*?<\/div>\s*<\/header>/i, '</header>')
        .replace(/<main\b([^>]*)>[\s\S]*?<\/main>/i, `<main$1>${wikiBody}</main>`);

    fs.writeFileSync(path.join(outputDir, 'index.html'), html);
    sitemapUrls.push(url);
    console.log(`📘 Generated: /${slug}`);
});

// --- Generate Sitemap ---
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${sitemapUrls.map(url => `<url><loc>${url}</loc><priority>0.8</priority></url>`).join('')}
</urlset>`;

fs.writeFileSync(SITEMAP_PATH, sitemap);
console.log(`🗺️ Sitemap generated.`);