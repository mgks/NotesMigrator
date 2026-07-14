export const APP_CONFIG = {
    domain: 'migrator.mgks.dev',
    title: 'Migrator',
    description: 'The Universal Conversion Tool. Migrate notes, data, and files securely in your browser.'
};

export const FORMATS = {
    // SOURCES
    keep: {
        id: 'keep',
        name: 'Google Keep',
        ext: ['zip', 'html', 'json'],
        type: 'source',
        desc: 'Google Takeout Export (Zip)',
        icon: 'keep'
    },
    notion: {
        id: 'notion',
        name: 'Notion',
        ext: ['zip'],
        type: 'source',
        desc: 'Notion Export (Markdown & CSV)',
        icon: 'notion'
    },
    
    // BIDIRECTIONAL (Source & Target)
    enex: {
        id: 'enex',
        name: 'Evernote / Apple Notes',
        ext: ['enex'],
        type: 'bidirectional',
        desc: 'Standard XML Export (.enex)',
        icon: 'enex'
    },
    markdown: {
        id: 'markdown',
        name: 'Markdown (Obsidian)',
        ext: ['md', 'zip'],
        type: 'bidirectional',
        desc: 'Standard Markdown Files',
        icon: 'markdown'
    },
    json: {
        id: 'json',
        name: 'Raw JSON',
        ext: ['json'],
        type: 'bidirectional',
        desc: 'Structured Data',
        icon: 'json'
    },
    // PDF text extraction (source only — output goes via ENEX/Markdown/JSON)
    pdf: {
        id: 'pdf',
        name: 'PDF Document',
        ext: ['pdf'],
        type: 'source',
        desc: 'Extract text from PDF notes',
        icon: 'pdf'
    },
    // TARGET ONLY
    html: {
        id: 'html',
        name: 'HTML',
        ext: ['html'],
        type: 'target',
        desc: 'Web Page',
        icon: 'html'
    }
};

// --- THIS WAS MISSING ---
export const OUTPUT_OPTIONS = [
    { id: 'enex', name: 'Apple Notes / Evernote (.enex)' },
    { id: 'markdown', name: 'Obsidian / Markdown (.zip)' },
    { id: 'json', name: 'Raw Data (.json)' },
    { id: 'pdf', name: 'PDF Document (Print to PDF)' }
];

export const CONVERSION_PATHS = [
    { from: 'keep', to: 'enex', title: 'Google Keep to Apple Notes' },
    { from: 'keep', to: 'markdown', title: 'Google Keep to Obsidian' },
    { from: 'keep', to: 'json', title: 'Google Keep to JSON' },
    { from: 'notion', to: 'enex', title: 'Notion to Apple Notes' },
    { from: 'notion', to: 'markdown', title: 'Clean Notion Markdown' },
    { from: 'enex', to: 'markdown', title: 'Evernote to Obsidian' },
    { from: 'enex', to: 'json', title: 'Evernote to JSON' },
    { from: 'markdown', to: 'enex', title: 'Markdown to Apple Notes' },
    { from: 'pdf', to: 'enex', title: 'PDF to Apple Notes' },
    { from: 'pdf', to: 'markdown', title: 'PDF to Obsidian' },
    { from: 'pdf', to: 'json', title: 'PDF to JSON' }
];

export function detectFormat(mainFilename, fileList = []) {
    const ext = mainFilename.split('.').pop().toLowerCase();

    // 1. Explicit GZIP Rejection (check full suffix: .tar.gz otherwise pops to "gz")
    const lower = mainFilename.toLowerCase();
    if (lower.endsWith('.tgz') || lower.endsWith('.tar.gz')) {
        // We throw here so the UI can catch and alert
        throw new Error("Gzip (.tgz) archives are not supported. Please use standard .zip files.");
    }

    // 2. Single-file hard matches
    if (fileList.length <= 1) {
        if (ext === 'enex') return 'enex';
        if (ext === 'json') return 'json';
        if (ext === 'md') return 'markdown';
        if (ext === 'pdf') return 'pdf';
        if (ext === 'html' || ext === '_keep') return 'keep';
    }

    // 3. Batch / zip scanning
    const hasHtml = fileList.some(f => f.endsWith('.html'));
    const hasJson = fileList.some(f => f.endsWith('.json'));
    const hasMd = fileList.some(f => f.endsWith('.md'));
    const hasCsv = fileList.some(f => f.endsWith('.csv'));
    const hasEnex = fileList.some(f => f.endsWith('.enex'));
    const hasPdf = fileList.some(f => f.toLowerCase().endsWith('.pdf'));

    // A batch of just PDFs is a PDF batch.
    if (hasPdf && !hasMd && !hasCsv && !hasEnex && !hasHtml && !hasJson) return 'pdf';

    if (hasMd && hasCsv) return 'notion';
    if (hasEnex) return 'enex';

    // Google Keep Takeout: notes plus a Keep/ folder or the archive_browser.html index.
    const keepIndicator = fileList.some(f => {
        const lower = f.toLowerCase();
        return lower.includes('keep/') || lower.includes('keep\\') || lower.includes('archive_browser.html');
    });
    if (keepIndicator) return 'keep';

    // HTML batches default to Keep (most common); JSON-only batches are ambiguous
    // and must NOT be assumed Keep without a marker.
    if (hasHtml) return 'keep';
    if (hasMd) return 'markdown';

    return 'unknown';
}