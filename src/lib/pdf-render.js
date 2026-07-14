// Render a list of notes as a single printable HTML document. Used by
// the "to PDF" target option in the format dropdown — the user clicks
// the option, the app opens a new tab with the document, the browser's
// print dialog opens, and the user picks "Save as PDF" as the
// destination. No new dependency, perfect fidelity (the user gets the
// exact HTML rendering as a PDF, fonts and all).
//
// We intentionally use the print dialog rather than jsPDF so the output
// supports every HTML element (lists, tables, images, code blocks, math)
// without a second rendering pass.

const PRINT_STYLESHEET = `
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    margin: 0;
    padding: 32px;
    color: #111;
    background: #fff;
    font-size: 14px;
    line-height: 1.55;
  }
  .meta { color: #555; font-size: 12px; margin-bottom: 4px; }
  h1.title { font-size: 22px; margin: 0 0 4px; line-height: 1.2; page-break-after: avoid; }
  .note { border-top: 1px solid #ddd; padding: 24px 0 32px; page-break-inside: avoid; }
  .note:first-child { border-top: 0; padding-top: 0; }
  .tags { color: #888; font-size: 11px; margin-top: 8px; }
  .actions { margin-top: 32px; padding: 16px; background: #f3f4f6; border-radius: 6px; font-size: 13px; }
  a { color: #2563eb; text-decoration: none; }
  img { max-width: 100%; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
  code { font-family: 'Fira Code', Consolas, monospace; font-size: 12px; }
  @page { margin: 18mm 14mm; }
  @media print {
    body { padding: 0; }
    .actions { display: none; }
  }
`;

// Strip the markdown frontmatter from note content if it leaked into
// `note.content` (shouldn't, but defensive).
function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch {
    return String(iso);
  }
}

function noteBlock(note, i) {
  const title = escape(note.title || `Untitled ${i + 1}`);
  const created = formatDate(note.created);
  const updated = formatDate(note.updated);
  const tags = Array.isArray(note.tags) && note.tags.length
    ? `<div class="tags">tags: ${note.tags.map(escape).join(', ')}</div>`
    : '';
  return `
    <article class="note">
      <div class="meta">${created ? `created ${created}` : ''}${created && updated ? ' · ' : ''}${updated && updated !== created ? `updated ${updated}` : ''}</div>
      <h1 class="title">${title}</h1>
      <div class="content">${note.content || ''}</div>
      ${tags}
    </article>
  `;
}

// Build a printable HTML string for a list of notes. Returns a full
// document with the embedded stylesheet so the new-tab print preview
// renders cleanly even when the user has no internet (PWA).
export function notesToPrintableHTML(notes, options = {}) {
  const { title = 'NotesMigrator export', appUrl = 'https://migrator.mgks.dev' } = options;
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const body = notes.map((n, i) => noteBlock(n, i)).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escape(title)}</title>
  <style>${PRINT_STYLESHEET}</style>
</head>
<body>
  <h1 style="margin: 0 0 4px; font-size: 24px;">${escape(title)}</h1>
  <div class="meta">Exported ${stamp} · ${notes.length} note${notes.length === 1 ? '' : 's'} · <a href="${escape(appUrl)}">migrator.mgks.dev</a></div>
  <div class="actions">In the browser's print dialog, choose <strong>Save as PDF</strong> as the destination to keep the formatted version on your device. The conversion runs entirely on your machine — your notes are never uploaded.</div>
  ${body}
</body>
</html>`;
}

// Open a new browser tab/window with the printable HTML and trigger
// the print dialog. Returns the opened window reference (or null if the
// browser blocked the popup — the caller should fall back to a download
// link).
export function openPrintWindow(html) {
  const win = window.open('about:blank', '_blank');
  if (!win) return null;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Auto-trigger print after the document has parsed. The setTimeout
  // defers past the synchronous write, giving the new window a chance
  // to layout the page so the print preview reflects the real content.
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { /* ignore — user can use the in-page button */ }
  }, 250);
  return win;
}
