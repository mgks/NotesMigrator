import JSZip from 'jszip';

// Whitelist of file extensions the app knows how to handle. Anything
// outside this set (.tar, .exe, .zip, .docx, …) is silently skipped at
// scan time so the user never sees them in the file list, and never
// gets a confused "unsupported format" toast for a .tar that snuck in
// inside a Keep zip. Mirrors the allowedExts list in main.js so the
// two layers agree on what counts as a note.
const SUPPORTED_EXT = /\.(html?|json|enex|md|markdown|mdx|pdf|png|jpe?g|gif|webp)$/i;

self.onmessage = async (e) => {
    const { type, file, filesToZip, binaryFiles, sourceIndex } = e.data;

    try {
        // --- SCAN ---
        if (type === 'scan') {
            postMessage({ type: 'status', msg: 'Reading archive...' });

            if (file.name.endsWith('.zip')) {
                const zip = await JSZip.loadAsync(file);
                let hiddenCount = 0;
                const entries = [];
                zip.forEach((path, entry) => {
                    if (entry.dir) return;
                    // Skip anything outside the supported extension list.
                    // The user already told us "supporting files can be
                    // forwarded as it is in zipped file" — that means
                    // anything we don't recognise goes away silently.
                    if (!SUPPORTED_EXT.test(path)) {
                        hiddenCount++;
                        return;
                    }
                    entries.push({
                        path: path,
                        name: path.split('/').pop(),
                        size: entry._data.uncompressedSize,
                        lastModified: entry.date ? entry.date.toISOString() : null
                    });
                });
                postMessage({ type: 'scan_complete', entries, sourceIndex, hiddenCount });
            }
        }

        // --- EXTRACT ---
        if (type === 'extract') {
            const zip = await JSZip.loadAsync(file);
            const contentMap = {};      // For text (notes)
            const binaryMap = {};       // For images (blobs)
            const dateMap = {};         // path -> ISO last-modified from ZIP central directory
            const errors = [];
            
            for (const path of e.data.paths) {
                const entry = zip.file(path);
                if (entry) {
                    try {
                        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
                        if (isImage) {
                            binaryMap[path] = await entry.async('arraybuffer');
                        } else {
                            // Decode raw bytes as UTF-8 so emoji, CJK and tag chars survive.
                            const bytes = await entry.async('uint8array');
                            contentMap[path] = new TextDecoder('utf-8').decode(bytes);
                        }
                        if (entry.date) dateMap[path] = entry.date.toISOString();
                    } catch (err) {
                        errors.push({ path, msg: err.message });
                    }
                }
            }
            
            postMessage({ type: 'extract_complete', contentMap, binaryMap, dateMap, errors });
        }

        // --- ZIP (Generate Final Export) ---
        if (type === 'zip') {
            const zip = new JSZip();
            
            // 1. Add Notes (Text)
            filesToZip.forEach(f => zip.file(f.name, f.content));
            
            // 2. Add Attachments (Binary)
            if (binaryFiles && binaryFiles.length > 0) {
                const assetFolder = zip.folder("assets");
                binaryFiles.forEach(f => {
                    assetFolder.file(f.name, f.blob);
                });
            }

            const blob = await zip.generateAsync({ type: 'blob' });
            
            // Generate Timestamped Filename
            const date = new Date().toISOString().slice(0, 10);
            const filename = `migrator-export-${date}.zip`;
            
            postMessage({ type: 'zip_complete', blob, filename });
        }

    } catch (err) {
        postMessage({ type: 'error', msg: err.message });
    }
};

function postMessage(data) {
    self.postMessage(data);
}