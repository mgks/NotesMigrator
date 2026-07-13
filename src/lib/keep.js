// Pure, DOM-free helpers for Google Keep parsing and ENEX normalization.
// Extracted from main.js so the conversion logic is unit-testable in Node.

// True for supported image extensions.
function isImageName(name) {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
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
    if (isImageName(e.name)) return true;
    if (detectedFormat === 'keep') {
        // Skip the Takeout navigation page.
        if (e.name.toLowerCase() === 'archive_browser.html') return false;
        if (e.name.endsWith('.json')) return true;
        if (e.name.endsWith('.html')) {
            // Prefer the JSON copy when both exist for the same note.
            const jsonSibling = e.path.slice(0, -5) + '.json';
            return !keepJsonPaths.has(jsonSibling);
        }
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

// Parse Google Keep's native JSON export into an internal note object.
export function parseKeepJson(content) {
    const data = JSON.parse(content);
    let htmlContent = '';

    if (Array.isArray(data.listContent)) {
        // Checklist: render items as HTML checkboxes (escaped).
        htmlContent = '<ul>';
        data.listContent.forEach(item => {
            const checkedAttr = item.isChecked ? ' checked="true"' : '';
            htmlContent += `<li><input type="checkbox"${checkedAttr}/> ${escapeHtml(item.text)}</li>`;
        });
        htmlContent += '</ul>';
    } else if (data.textContent) {
        // Plain text note: escape HTML, convert newlines to <br/>.
        htmlContent = escapeHtml(data.textContent).replace(/\n/g, '<br/>');
    }

    // Map Keep labels -> tags.
    const tags = [];
    if (Array.isArray(data.labels)) {
        data.labels.forEach(l => { if (l.name) tags.push(l.name); });
    }

    // Map attachments (Keep uses lowercase "filepath" in some export versions).
    const attachments = [];
    if (Array.isArray(data.attachments)) {
        data.attachments.forEach(att => {
            const filePath = att.filePath || att.filepath || '';
            if (filePath) {
                attachments.push({ filePath, mimeType: att.mimetype || 'image/jpeg' });
            }
        });
    }

    // Microsecond timestamps -> ISO strings.
    const created = data.createdTimestampUsec ? new Date(data.createdTimestampUsec / 1000).toISOString() : null;
    const updated = data.userEditedTimestampUsec ? new Date(data.userEditedTimestampUsec / 1000).toISOString() : null;

    return {
        title: data.title || '',
        content: htmlContent,
        textContent: data.textContent || '',
        tags,
        created,
        updated,
        isArchived: !!data.isArchived,
        isPinned: !!data.isPinned,
        isTrashed: !!data.isTrashed,
        attachments
    };
}
