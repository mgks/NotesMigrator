// PDF notes extractor. Wraps `unpdf` (a thin layer over pdf.js) with a
// lazy import so the heavy PDF parser only loads when a user actually
// picks a PDF file. NotesMigrator's main bundle stays small; ~600 KB
// of pdfjs-dist is pulled in on demand for the first PDF drop.
//
// Output is a single Note object per PDF, one page after another in
// <p>...</p> blocks, ready to be emitted by enex-io.generateEnex or
// md-fusion.toMarkdown.

let cachedExtract = null;
async function getExtract() {
  if (cachedExtract === null) {
    const mod = await import('unpdf');
    cachedExtract = mod.extractText;
  }
  return cachedExtract;
}

// Minimal HTML escape for the body text. Keeps < > & safe for ENEX/ENML
// without bringing in the heavier NotesMigrator escape helper.
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Format a Date as ISO without timezone interpretation (treat as local).
function isoFromDate(value) {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// Parse a PDF file (Blob, File, or ArrayBuffer) into a single Note.
// Pages are joined with paragraph breaks; each page receives a heading.
export async function parsePdfFile(file) {
  if (!file) throw new Error('parsePdfFile: file is required');
  const buffer = file instanceof ArrayBuffer
    ? file
    : await file.arrayBuffer();

  const extractText = await getExtract();
  const result = await extractText(buffer, { mergePages: false });
  const pages = Array.isArray(result?.text) ? result.text : [result?.text ?? ''];

  const titleBase = (file.name || 'PDF note')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9 _.-]+/g, ' ')
    .trim() || 'PDF note';

  // One Note per PDF: each page wrapped in its own <h2>+<p> section so
  // Apple Notes / Obsidian render the structure faithfully.
  const bodySections = pages
    .map((text, i) => {
      const safeText = escapeHtml(text);
      const heading = pages.length > 1
        ? `<h2>Page ${i + 1}</h2>\n`
        : '';
      return `${heading}<p>${safeText.replace(/\r?\n/g, '</p>\n<p>')}</p>`;
    })
    .join('\n<hr/>\n');
  const content = bodySections || '<p>(empty PDF)</p>';

  const created = isoFromDate(result?.info?.CreationDate);
  const updated = isoFromDate(result?.info?.ModDate);

  return [{
    title: titleBase,
    content,
    tags: [],
    created,
    updated,
    isArchived: false,
    isPinned: false,
    isTrashed: false,
    attachments: []
  }];
}

// Test the lazy import by warming the cache from a fixed seed (helps Vite
// pre-bundle pdf.js at build time when this module is imported).
export async function preloadPdfLib() {
  await getExtract();
}
