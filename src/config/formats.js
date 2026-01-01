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
    { id: 'json', name: 'Raw Data (.json)' }
];

export const CONVERSION_PATHS = [
    { from: 'keep', to: 'enex', title: 'Google Keep to Apple Notes' },
    { from: 'keep', to: 'markdown', title: 'Google Keep to Obsidian' },
    { from: 'keep', to: 'json', title: 'Google Keep to JSON' },
    { from: 'notion', to: 'enex', title: 'Notion to Apple Notes' },
    { from: 'notion', to: 'markdown', title: 'Clean Notion Markdown' },
    { from: 'enex', to: 'markdown', title: 'Evernote to Obsidian' },
    { from: 'enex', to: 'json', title: 'Evernote to JSON' },
    { from: 'markdown', to: 'enex', title: 'Markdown to Apple Notes' }
];

export function detectFormat(mainFilename, fileList = []) {
    const ext = mainFilename.split('.').pop().toLowerCase();

    // 1. Explicit GZIP Rejection
    if (ext === 'tgz' || ext === 'tar.gz') {
        // We throw here so the UI can catch and alert
        throw new Error("Gzip (.tgz) archives are not supported. Please use standard .zip files.");
    }

    // 2. Hard Matches
    if (ext === 'enex') return 'enex';
    if (ext === 'json' && fileList.length <= 1) return 'json';
    if (ext === 'md') return 'markdown';
    if (ext === 'html') return 'keep';

    // 3. Zip Content Scanning
    if (ext === 'zip') {
        const hasHtml = fileList.some(f => f.endsWith('.html'));
        const hasMd = fileList.some(f => f.endsWith('.md'));
        const hasCsv = fileList.some(f => f.endsWith('.csv'));
        
        if (hasMd && hasCsv) return 'notion';
        if (hasHtml) return 'keep'; // Google Takeout is mostly HTMLs
        return 'markdown'; // Default zip assumption
    }
    
    return 'unknown';
}