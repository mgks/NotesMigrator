import JSZip from 'jszip';

self.onmessage = async (e) => {
    const { type, file, filesToZip, binaryFiles, sourceIndex } = e.data;

    try {
        // --- SCAN ---
        if (type === 'scan') {
            postMessage({ type: 'status', msg: 'Reading archive...' });
            
            if (file.name.endsWith('.zip')) {
                const zip = await JSZip.loadAsync(file);
                const entries = [];
                zip.forEach((path, entry) => {
                    if (!entry.dir) {
                        entries.push({
                            path: path,
                            name: path.split('/').pop(),
                            size: entry._data.uncompressedSize
                        });
                    }
                });
                postMessage({ type: 'scan_complete', entries, sourceIndex });
            }
        }

        // --- EXTRACT ---
        if (type === 'extract') {
            const zip = await JSZip.loadAsync(file);
            const contentMap = {};      // For text (notes)
            const binaryMap = {};       // For images (blobs)
            
            for (const path of e.data.paths) {
                const entry = zip.file(path);
                if (entry) {
                    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
                    if (isImage) {
                        binaryMap[path] = await entry.async('blob');
                    } else {
                        contentMap[path] = await entry.async('string');
                    }
                }
            }
            
            postMessage({ type: 'extract_complete', contentMap, binaryMap });
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