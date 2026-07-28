// Pure, DOM-free helpers for Google Keep and ENEX normalization.
// Extracted from main.js so the conversion logic is unit-testable in Node.
//
// Re-export: parseKeepJson now lives in gkeep-parser (since that package
// gained the API in 0.3.0). We re-export it here to keep `lib/keep.js` as
// the canonical import surface for tests and any other internal callers,
// and to preserve the test surface that already passed.

export { parseKeepJson, parseKeepHtml } from 'gkeep-parser';

// Heuristic: a parsed JSON object looks like a Google Keep note when
// it carries at least one Keep-only field. Generic JSON exporters don't
// emit listContent, labels, textContentHtml, microsec timestamps, or the
// Keep boolean flags, so a single match is enough to identify a Keep
// note with high confidence.
export function looksLikeKeepNote(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    return 'listContent' in obj
        || 'labels' in obj
        || 'textContentHtml' in obj
        || 'createdTimestampUsec' in obj
        || 'userEditedTimestampUsec' in obj
        || 'isPinned' in obj
        || 'isArchived' in obj
        || 'isTrashed' in obj
        || 'color' in obj;
}

// Heuristic: a string of HTML looks like a Google Keep note when it
// carries one of Keep's signature markers. Keep Takeout HTML always
// starts with `<?xml version="1.0" ?>` + XHTML 1.0 Strict doctype (a
// quirk no other common exporter shares) and later uses
// `class="title"`, `class="content"`, `class="heading"` for its
// note body. The XHTML doctype prefix is what we check first because
// it sits in the first 200 bytes of every Keep Takeout file even
// when the inline CSS pushes the body class names past the first
// few kilobytes.
export function looksLikeKeepHtml(text) {
    if (typeof text !== 'string' || text.length === 0) return false;
    // Strongest signal: the XHTML 1.0 Strict doctype prefix only
    // Google Keep Takeout uses, sitting in the first few hundred bytes.
    if (/XHTML 1\.0 Strict/i.test(text.slice(0, 400))) return true;
    // Fallback for stripped/rewrapped exports: any of the Keep body
    // class names anywhere in the head of the file.
    return /class="title"/.test(text)
        || /class="content"/.test(text)
        || /class="heading"/.test(text);
}

// Escape &, <, > for safe HTML interpolation.
export function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Escape the five XML entities in a single left-to-right pass (no double-escape).
export function escapeXml(str) {
    return String(str == null ? '' : str).replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case "'": return '&apos;';
            case '"': return '&quot;';
        }
    });
}

// Decide whether a file entry should be visible/selectable in the file list.
// Pure: takes the per-request context instead of reading global state.
export function keepEntryVisible(e, detectedFormat, keepJsonPaths) {
    if (e.name.startsWith('.')) return false;
    // Image heuristic matches gkeep-parser' isKeepImage extensions
    // (jpg/jpeg/png/gif/webp). Inlined here so this module stays
    // DOM-free.
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(e.name)) return true;
    if (detectedFormat === 'keep') {
        // Skip the Takeout navigation page.
        if (e.name.toLowerCase() === 'archive_browser.html') return false;
        if (e.name.endsWith('.json')) return true;
        if (e.name.endsWith('.html')) {
            // Prefer the JSON copy when both exist for the same note.
            const jsonSibling = e.path.slice(0, -5) + '.json';
            return !keepJsonPaths.has(jsonSibling);
        }
        // Recognised non-Keep extensions always show through so a user
        // who drops a Keep batch together with, say, a PDF, still sees
        // the PDF in the list. Hidden-when-unknown would silently
        // swallow mixed-format batches.
        if (/\.(pdf|md|markdown|mdx|enex)$/i.test(e.name)) return true;
        return false;
    }
    if (detectedFormat === 'markdown' || detectedFormat === 'notion') return e.name.endsWith('.md');
    if (detectedFormat === 'enex') return e.name.endsWith('.enex');
    if (detectedFormat === 'json') return e.name.endsWith('.json');
    return true; // unknown format: show everything
}

// Build the ENEX <tag> nodes for a note, escaping XML entities.
export function buildTagsXml(note) {
    let tagsXml = '';
    if (Array.isArray(note.tags)) {
        note.tags.forEach(t => {
            tagsXml += `\n  <tag>${escapeXml(t)}</tag>`;
        });
    }
    return tagsXml;
}

// Normalize note HTML for ENEX: checkboxes -> <en-todo>, <br> -> <br/>, drop <img>.
// Robust: handles any attribute order / quote style (checked may precede type).
// HTML boolean semantics: the presence of `checked` means yes, regardless of value.
export function normalizeEnexContent(content) {
    return content
        .replace(/<input\b[^>]*>/gi, (tag) => {
            if (!/\btype\s*=\s*["']?checkbox["']?/i.test(tag)) return tag;
            return /\bchecked\b/i.test(tag) ? '<en-todo checked="true"/>' : '<en-todo/>';
        })
        .replace(/<br>/g, '<br/>')
        .replace(/<img[^>]*>/gi, '');
}
