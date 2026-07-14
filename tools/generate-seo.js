import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '../src/config/formats.js';
import { renderAllWikiPages, readTemplate } from '../src/lib/wiki-render.js';

const DIST_DIR = './dist';
const SITEMAP_PATH = './dist/sitemap.xml';

const TEMPLATE_PATH = './dist/index.html';
if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error("❌ Build not found. Run 'npm run build' first.");
    process.exit(1);
}

const template = readTemplate(TEMPLATE_PATH);
const sitemapUrls = [`https://${APP_CONFIG.domain}/`];

console.log(`🚀 Generating Wiki Pages for ${APP_CONFIG.domain}...`);

renderAllWikiPages(template).forEach(({ slug, html }) => {
    const outputDir = path.join(DIST_DIR, 'wiki', slug);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'index.html'), html);
    sitemapUrls.push(`https://${APP_CONFIG.domain}/wiki/${slug}/`);
    console.log(`📘 Generated: /wiki/${slug}`);
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${sitemapUrls.map(url => `<url><loc>${url}</loc><priority>0.8</priority></url>`).join('')}
</urlset>`;
fs.writeFileSync(SITEMAP_PATH, sitemap);
console.log('🗺️ Sitemap generated.');
