// 1. POLYFILL (MUST BE FIRST)
import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer; 

// 2. IMPORTS
import { OUTPUT_OPTIONS, detectFormat, FORMATS } from './config/formats.js';
import { parseKeepHtml } from 'gkeep-parser';
import { escapeHtml, escapeXml, parseKeepJson, normalizeEnexContent, buildTagsXml, keepEntryVisible, looksLikeKeepNote, looksLikeKeepHtml } from './lib/keep.js';
import { generateEnex, parseEnex } from 'enex-io';
import { toMarkdown, fromMarkdown } from 'md-fusion';
import confetti from 'canvas-confetti';
import JSZip from 'jszip'; 
import SparkMD5 from 'spark-md5';

// --- Download helper ---
// The previous file-saver style "synthetic anchor .click()" pattern
// is unreliable in Chromium once async work has run between the
// user's click and the actual saveAs call: the user gesture is
// consumed and Chrome falls back to the blob URL's UUID as the
// filename. Two paths cover this:
//
//   1. showSaveFilePicker (Chrome / Edge / Opera) opens a real "Save
//      As" dialog. The user picks the filename, we write the blob
//      bytes via the file handle. Filename is honoured, the gesture
//      only needs to be active for the dialog opener, and the user
//      sees exactly where the file goes.
//
//   2. Safari / Firefox fall back to a hidden <a download> click.
//      These browsers honour the download attribute even after a
//      roundtrip through awaits.
//
// `blob.name` is set as a third-tier fallback so any other consumer
// (e.g. older file-saver fallbacks elsewhere) still picks up the
// right name.
async function saveAs(blob, filename) {
    if (!blob) return;
    const safeName = filename || blob.name || 'download';
    try { blob.name = safeName; } catch (_) { /* some blobs are readonly */ }

    // Path 1: File System Access API. Chrome honours the filename
    // 100% of the time and the user can confirm the destination.
    if (window.showSaveFilePicker) {
        try {
            const dot = safeName.lastIndexOf('.');
            const ext = dot >= 0 ? safeName.slice(dot) : '';
            const mime = blob.type || 'application/octet-stream';
            const handle = await window.showSaveFilePicker({
                suggestedName: safeName,
                types: [{
                    description: safeName,
                    accept: { [mime]: [ext || '.bin'] }
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (err) {
            if (err && err.name === 'AbortError') return; // user cancelled
            console.warn('showSaveFilePicker failed, falling back to anchor:', err);
        }
    }

    // Path 2: hidden anchor click for Safari / Firefox / older Chrome.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
    }, 200);
}

// --- ICONS ---
const ICONS = {
    keep: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbc04" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"></path></svg>`,
    enex: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dbe60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    markdown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7b68ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15l2-2 4 4"></path></svg>`,
    html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e34f26" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
    json: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
    image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
    pdf: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M8 13h8M8 17h5"></path></svg>`,
    default: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`
};

// --- STATE ---
const state = {
    sources: [],      // Array of { type: 'zip'|'raw'|'pdf', file: File, entries: [], files?: [], format?: string }
    allEntries: [],   // Flattened list for UI
    selectedIds: new Set(), // Format: "sourceIndex:path"
    worker: new Worker(new URL('./modules/worker.js', import.meta.url), { type: 'module' }),
    isProcessing: false,
    detectedFormat: null,
    keepJsonPaths: new Set(), // .json note paths, used to dedupe Keep HTML/JSON pairs
    parsedPdfNotes: [],  // legacy flat array; new code uses pdfPerSource
    pdfPerSource: new Map()  // sourceIndex -> notes[] for PDF sources
};

// --- DOM ELEMENTS ---
let els = {};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inject Toast
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);

    // 2. Global Init
    els.themeBtn = document.getElementById('themeBtn');
    initTheme();

    // 3. App Init (Only if on App page)
    const appContainer = document.getElementById('uploadView');
    if (appContainer) {
        cacheAppElements();
        setupUI();
        setupWorker();
        checkSeoPreselect();
    }
});

function cacheAppElements() {
    const ids = [
        'dropTrigger', 'fileInput', 'folderInput', 'fileList', 'dock', 'formatSelect',
        'countDisplay', 'selectAll', 'convertBtn', 'scanStatus',
        'browseBtn', 'browseFolderBtn', 'addMoreBtn', 'addFolderBtn', 'dragOverlay', 'toast',
        'resetBtn',
        'progressOverlay', 'progressLabel', 'progressBarFill', 'progressDetail',
        'dockLabel'
    ];
    ids.forEach(id => els[id] = document.getElementById(id));

    els.views = {
        upload: document.getElementById('uploadView'),
        scan: document.getElementById('scanView'),
        list: document.getElementById('listView')
    };
}

function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    if(els.themeBtn) els.themeBtn.addEventListener('click', toggleTheme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
}

// --- SETUP UI ---
function setupUI() {
    // Populate Dropdown
    OUTPUT_OPTIONS.forEach(opt => {
        els.formatSelect.add(new Option(opt.name, opt.id));
    });

    // Global Drag & Drop
    let dragCounter = 0;
    document.body.addEventListener('dragenter', e => { 
        e.preventDefault(); 
        dragCounter++; 
        els.dragOverlay.classList.remove('hidden'); 
    });
    
    document.body.addEventListener('dragleave', e => { 
        dragCounter--; 
        if (dragCounter === 0) els.dragOverlay.classList.add('hidden'); 
    });
    
    document.body.addEventListener('dragover', preventDefaults);
    
    document.body.addEventListener('drop', e => {
        preventDefaults(e);
        dragCounter = 0;
        els.dragOverlay.classList.add('hidden');
        handleDrop(e);
    });

    // Button Listeners
    if(els.browseBtn) els.browseBtn.addEventListener('click', () => els.fileInput.click());
    if(els.browseFolderBtn) els.browseFolderBtn.addEventListener('click', () => els.folderInput.click());
    if(els.addMoreBtn) els.addMoreBtn.addEventListener('click', () => els.fileInput.click());
    if(els.addFolderBtn) els.addFolderBtn.addEventListener('click', () => els.folderInput.click());
    if(els.resetBtn) els.resetBtn.addEventListener('click', resetState);

    els.fileInput.addEventListener('change', e => {
        if(e.target.files.length > 0) handleNewFiles(e.target.files);
        els.fileInput.value = ''; // Reset for re-selection
    });

    if(els.folderInput) els.folderInput.addEventListener('change', e => {
        if(e.target.files.length > 0) handleNewFiles(e.target.files);
        els.folderInput.value = ''; // Reset for re-selection
    });

    if(els.selectAll) els.selectAll.addEventListener('change', toggleSelectAll);
    if(els.convertBtn) els.convertBtn.addEventListener('click', startConversion);
}

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

function checkSeoPreselect() {
    if (window.PRESELECT && els.formatSelect) {
        els.formatSelect.value = window.PRESELECT.to;
    }
}

// --- FILE HANDLING ---

async function handleDrop(e) {
    const items = e.dataTransfer.items;
    let droppedFiles = [];

    if (items && items.length > 0) {
        switchView('scan');
        els.scanStatus.innerText = 'Scanning folder contents...';
        // Folder drops can enumerate hundreds of files. Surface that
        // work in the overlay so the user knows the app hasn't frozen.
        showProgress('Reading folder', 'Walking the dropped folder...');
        
        const entries = [];
        for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry?.();
            if (entry) entries.push(entry);
        }

        async function readEntry(entry) {
            if (entry.isFile) {
                return new Promise(resolve => entry.file(resolve));
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                let allSubEntries = [];
                let readBatch = async () => {
                    return new Promise(resolve => {
                        reader.readEntries(async (entries) => {
                            if (entries.length > 0) {
                                allSubEntries.push(...entries);
                                await readBatch();
                            }
                            resolve();
                        });
                    });
                };
                await readBatch();
                
                const promises = allSubEntries.map(e => readEntry(e));
                const results = await Promise.all(promises);
                return results.flat();
            }
            return [];
        }

        for (const entry of entries) {
            const result = await readEntry(entry);
            if (Array.isArray(result)) droppedFiles.push(...result);
            else if (result) droppedFiles.push(result);
        }
    } else {
        droppedFiles = Array.from(e.dataTransfer.files);
    }

    if (droppedFiles.length > 0) handleNewFiles(droppedFiles);
    else {
        hideProgress();
        showToast("No readable files found in drop.");
        switchView('upload');
    }
}

// Parse a batch of PDF files in the main thread and register the
// resulting notes with the existing pipeline. The heavy pdf.js bundle
// is loaded on-demand by src/lib/pdf.js, so the main bundle stays slim.
async function importPdfFiles(pdfs) {
    if (!Array.isArray(pdfs) || pdfs.length === 0) return;
    // Lazy-load the pdf.js bundle while we're showing the overlay so
    // the user sees "Importing PDF library..." for the few seconds
    // unpdf needs to fetch its worker chunk.
    showProgress('Importing PDF library', pdfs.length === 1 ? pdfs[0].name : `${pdfs.length} files`);
    let parsePdfFile;
    try {
        ({ parsePdfFile } = await import('./lib/pdf.js'));
    } catch (err) {
        hideProgress();
        showToast('PDF import failed: ' + err.message, 5000, 'error');
        return;
    }

    state.parsedPdfNotes = [];
    if (!state.pdfPerSource) state.pdfPerSource = new Map();
    const seen = new Set();
    let totalSkipped = 0;
    let totalImported = 0;

    try {
        for (let i = 0; i < pdfs.length; i++) {
            const file = pdfs[i];
            updateProgress('Reading PDF', `${i + 1} / ${pdfs.length}  ·  ${file.name}`, {
                percent: Math.round(((i + 1) / pdfs.length) * 100)
            });
            let fileNotes;
            try {
                fileNotes = await parsePdfFile(file);
            } catch (err) {
                totalSkipped++;
                console.warn(`Skipped ${file.name}: ${err.message}`);
                continue;
            }
            // Build per-PDF source so the multi-source output flow can
            // produce one PDF per input file in the result zip.
            const safeBase = (file.name || 'PDF note').replace(/\.pdf$/i, '').trim() || 'PDF note';
            const bag = [];
            for (const note of fileNotes) {
                let title = (note.title || file.name || 'PDF note').trim() || 'PDF note';
                let suffix = 2;
                const base = title;
                while (seen.has(title)) title = `${base} (${suffix++})`;
                seen.add(title);
                bag.push({ ...note, title });
            }
            if (bag.length === 0) continue;
            const sourceIndex = state.sources.length;
            // Show the actual filename (with the .pdf extension) in the
            // selected-files list so users can tell which file each row came
            // from. The unique `${name}#${i}` path is still used internally
            // for selection and the per-source extraction step.
            const entries = bag.map((n, i) => ({
                path: `${file.name}#${i + 1}`,
                name: file.name,
                size: file.size || 0,
                title: n.title
            }));
            state.sources.push({
                type: 'pdf', file, files: [file], entries, format: 'pdf'
            });
            state.pdfPerSource.set(sourceIndex, bag);
            state.parsedPdfNotes.push(...bag);
            finalizeBatch(sourceIndex, entries);
            // Auto-select all the new entries.
            for (const e of entries) {
                state.selectedIds.add(`${sourceIndex}:${e.path}`);
            }
            totalImported += bag.length;
        }

        if (totalImported === 0) {
            showToast('No text could be extracted from the PDF(s).', 5000, 'error');
            return;
        }
        updateResetVisibility();
        if (totalSkipped > 0) showToast(`Imported ${totalImported} PDF note(s); ${totalSkipped} file(s) skipped.`, 5000, 'warning');
        else showToast(`Imported ${totalImported} PDF note(s).`);
    } finally {
        hideProgress();
    }
}

async function handleNewFiles(fileList) {
    const files = Array.from(fileList);

    // GZIP Check
    const badFile = files.find(f => f.name.endsWith('.tgz') || f.name.endsWith('.tar.gz'));
    if (badFile) {
        showToast("GZIP (.tgz) not supported. Use .zip.", 4000);
        return;
    }

    // Categorize
    const zips = files.filter(f => f.name.endsWith('.zip'));
    const raw = files.filter(f => !f.name.endsWith('.zip') && !f.name.startsWith('.'));

    // Pre-validate Raw Files
    const allowedExts = ['.html', '.json', '.enex', '.md', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const validRaw = raw.filter(f => {
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        return allowedExts.includes(ext);
    });

    const skippedCount = raw.length - validRaw.length;

    // STOP if nothing to do
    if (zips.length === 0 && validRaw.length === 0) {
        if (skippedCount > 0) showToast(`${skippedCount} file(s) ignored (unsupported format).`, 4000);
        else showToast("No supported files found.", 3000);
        return; // Stay on current view (Upload or List)
    }

    // Now we know we have work, switch view
    if (state.sources.length === 0) switchView('scan');

    // Show toast for skipped files if any, but continue processing valid ones
    if (skippedCount > 0) showToast(`${skippedCount} unsupported file(s) skipped.`);

    // PDF-only batch: parse on the main thread (PDF.js runs lazily
    // inside src/lib/pdf.js and pulls in a worker of its own). Bypasses
    // the JSZip worker used for Keep/Notion/Evernote.
    const pdfBatch = validRaw.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (zips.length === 0 && pdfBatch.length === validRaw.length && pdfBatch.length > 0) {
        importPdfFiles(pdfBatch).catch(e => {
            console.error('PDF import failed:', e);
            showToast('PDF import failed: ' + e.message, 5000, 'error');
        });
        return;
    }

    // Mixed batch that contains PDFs alongside other files: we still
    // need to extract PDF text at upload time so the conversion can
    // produce a populated entry per source. Run importPdfFiles for the
    // PDFs in isolation (it builds state.sources entries), then
    // process the remaining non-PDF files via the regular raw flow.
    const nonPdfRaw = validRaw.filter(f => !f.name.toLowerCase().endsWith('.pdf'));
    if (pdfBatch.length > 0 && (zips.length > 0 || nonPdfRaw.length > 0)) {
        try {
            await importPdfFiles(pdfBatch);
        } catch (err) {
            console.error('PDF import failed in mixed batch:', err);
            showToast('PDF import failed: ' + err.message, 5000, 'error');
        }
    }

    // 1. Process ZIPs
    if (zips.length > 0) {
        showProgress('Scanning archive', zips.length === 1 ? zips[0].name : `${zips.length} archives`);
    }
    zips.forEach(zip => {
        const sourceIndex = state.sources.length;
        // Default to whatever the global detector picks up. finalizeBatch
        // overwrites this with the actual detected format once entries
        // are scanned, so a Keep.zip becomes format='keep' instead of
        // staying null through the rest of the pipeline.
        state.sources.push({ type: 'zip', file: zip, entries: [], format: 'unknown' });
        els.scanStatus.innerText = `Scanning ${zip.name}...`;
        state.worker.postMessage({ type: 'scan', file: zip, sourceIndex });
    });

    // 2. Process Valid Raw Files — one source per file so a multi-format
    //    batch produces multiple output files in the result zip.
    //    Keep files share .html/.json with other exporters, so we sniff
    //    the content (first ~8 KB) to decide between format='keep' and
    //    the generic 'html'/'json' branches.
    //    PDFs are handled by importPdfFiles above; filter them out so
    //    we don't double-register the same file.
    if (nonPdfRaw.length > 0) {
        showProgress('Reading files', nonPdfRaw.length === 1 ? nonPdfRaw[0].name : `${nonPdfRaw.length} files`);
        try {
            for (let i = 0; i < nonPdfRaw.length; i++) {
                const file = nonPdfRaw[i];
                updateProgress('Reading files', `${i + 1} / ${nonPdfRaw.length}  ·  ${file.name}`, {
                    percent: Math.round(((i + 1) / nonPdfRaw.length) * 100)
                });
                const ext = '.' + file.name.split('.').pop().toLowerCase();
                const entry = {
                    path: file.name,
                    name: file.name,
                    size: file.size
                };
                const sourceIndex = state.sources.length;
                const format = await detectRawFormat(file, ext);
                state.sources.push({ type: 'raw', file, files: [file], entries: [entry], format });
                finalizeBatch(sourceIndex, [entry]);
            }
        } finally {
            hideProgress();
        }
    }
}

// Decide which format a raw (non-zip) file belongs to. Extension gives
// the first guess; for .html/.json we sniff the head of the file to
// tell Keep content apart from generic HTML or JSON, because Keep Takeout
// exports use those same extensions.
async function detectRawFormat(file, ext) {
    if (ext === '.enex') return 'enex';
    if (ext === '.md' || ext === '.markdown' || ext === '.mdx') return 'markdown';
    if (ext === '.pdf') return 'pdf';
    if (ext === '.html' || ext === '.htm') {
        try {
            // Read enough of the head to catch Keep Takeout's signature
            // (XHTML 1.0 Strict doctype lives in the first 400 bytes;
            // the body class names can sit past 10 KB because of the
            // inline CSS Takeout bundles into every note).
            const head = await readFileHead(file, 32768);
            if (looksLikeKeepHtml(head)) return 'keep';
        } catch { /* fall through */ }
        return 'html';
    }
    if (ext === '.json') {
        try {
            // Keep Takeout JSON files are typically 1-10 KB; reading
            // 32 KB covers any realistic note plus buffer for the
            // header comment if Google adds one later.
            const head = await readFileHead(file, 32768);
            const parsed = JSON.parse(head);
            if (looksLikeKeepNote(parsed)) return 'keep';
        } catch { /* not JSON or not Keep — fall through */ }
        return 'json';
    }
    return 'unknown';
}

// Read the first N bytes of a File as text. Used by detectRawFormat to
// peek at the head of a file without paying the cost of loading the
// whole thing into memory.
async function readFileHead(file, maxBytes) {
    const slice = file.slice(0, maxBytes);
    return await slice.text();
}

function finalizeBatch(sourceIndex, entries) {
    // Update Source
    if (state.sources[sourceIndex]) {
        state.sources[sourceIndex].entries = entries;
    }

    // Update Global List
    const taggedEntries = entries.map(e => ({ ...e, sourceIndex }));
    state.allEntries = [...state.allEntries, ...taggedEntries];

    // Update Format Detection
    const allNames = state.allEntries.map(e => e.name);
    const primaryName = state.allEntries.length > 0 ? state.allEntries[0].name : 'unknown';
    state.detectedFormat = detectFormat(primaryName, allNames);
    // Mirror the global detection onto ZIP sources only. Raw files
    // already had their format pinned by detectRawFormat (which sniffs
    // content and is more accurate than the filename-based
    // state.detectedFormat), and PDF sources carry their own format.
    // Overwriting either would clobber a correct per-source value with
    // a noisy global one — e.g. a Keep .json file shown alone would
    // see state.detectedFormat='json' and lose its 'keep' label.
    if (state.sources[sourceIndex] && state.sources[sourceIndex].type === 'zip') {
        state.sources[sourceIndex].format = state.detectedFormat;
    }
    recomputeKeepJsonPaths();

    // Auto-Select ONLY Visible Files
    taggedEntries.forEach(e => {
        if (isVisibleEntry(e)) {
            state.selectedIds.add(`${sourceIndex}:${e.path}`);
        }
    });

    renderList();
    switchView('list');
    updateResetVisibility();
}

// --- RENDER LIST ---

function renderList() {
    els.fileList.innerHTML = '';
    
    // Filter view based on detected format + Images (single source of truth)
    const displayEntries = state.allEntries.filter(isVisibleEntry);

    if (displayEntries.length === 0 && state.allEntries.length > 0) {
        els.fileList.innerHTML = `<div style="text-align:center; padding:30px; color:var(--sub)">No compatible notes found.</div>`;
    }

    displayEntries.forEach(entry => {
        const id = `${entry.sourceIndex}:${entry.path}`;
        const isChecked = state.selectedIds.has(id);
        const row = document.createElement('div');
        row.className = isChecked ? 'list-item checked' : 'list-item';

        // Show the per-source format so a row of mixed Keep / Notion /
        // raw JSON files reports the right thing. Fall back to the
        // global detectedFormat (or 'unknown') for legacy entries that
        // don't have a sourceIndex pinned on them.
        const entryFormat = state.sources[entry.sourceIndex]?.format || state.detectedFormat || 'unknown';
        let iconSvg = ICONS[entryFormat] || ICONS.default;
        if (isImage(entry.name)) iconSvg = ICONS.image;

        const sizeKB = (entry.size / 1024).toFixed(1);

        row.innerHTML = `
            <div class="col-check"><input type="checkbox" ${isChecked ? 'checked' : ''}></div>
            <div class="col-name">
                <span class="file-icon" style="display:flex; margin-right:10px;">${iconSvg}</span>
                <span title="${entry.name}" style="overflow:hidden; text-overflow:ellipsis;">${entry.name}</span>
            </div>
            <div class="col-meta">${isImage(entry.name) ? 'IMAGE' : entryFormat.toUpperCase()}</div>
            <div class="col-size">${sizeKB} KB</div>
        `;
        
        // Listeners
        row.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                const cb = row.querySelector('input');
                cb.checked = !cb.checked;
                updateSelection(cb.checked, id, row);
            }
        });
        row.querySelector('input').addEventListener('change', (e) => {
            updateSelection(e.target.checked, id, row);
        });

        els.fileList.appendChild(row);
    });
    
    updateDock();
}

function updateSelection(checked, id, row) {
    if (checked) {
        row.classList.add('checked');
        state.selectedIds.add(id);
    } else {
        row.classList.remove('checked');
        state.selectedIds.delete(id);
    }
    updateDock();
}

function updateDock() {
    const count = state.selectedIds.size;
    els.countDisplay.innerText = count;
    if (count > 0) els.dock.classList.add('visible');
    else els.dock.classList.remove('visible');
    if (els.selectAll) els.selectAll.checked = count > 0;

    // When every selected source is a PDF the output format is
    // irrelevant — PDFs always pass through unchanged regardless of
    // whether the user picks JSON, ENEX, Markdown or PDF. Disable the
    // format selector in that case and surface a short helper label so
    // the user knows what's happening.
    const onlyPdfs = count > 0 && areAllSelectedSourcesPdf();
    if (els.formatSelect) {
        els.formatSelect.disabled = onlyPdfs;
        els.formatSelect.title = onlyPdfs
            ? 'Format disabled: PDFs pass through to the output bundle as-is.'
            : '';
    }
    if (els.dockLabel) {
        els.dockLabel.textContent = onlyPdfs ? 'Download PDFs as' : 'Convert to';
    }
}

// Returns true if every selected source is a PDF. Used to gate the
// format dropdown (PDFs are pass-through, format is irrelevant) and
// to switch the dock label between "Convert to" and "Download PDFs as".
function areAllSelectedSourcesPdf() {
    if (state.selectedIds.size === 0) return false;
    for (const id of state.selectedIds) {
        const idx = parseInt(id.split(':')[0], 10);
        const src = state.sources[idx];
        if (!src) return false;
        if (src.format !== 'pdf' && src.type !== 'pdf') return false;
    }
    return true;
}

function toggleSelectAll() {
    const shouldSelect = els.selectAll.checked;
    const inputs = els.fileList.querySelectorAll('input[type="checkbox"]');
    state.selectedPaths = new Set(); // Reset visual tracking for this logic?
    // Actually we need to match visible entries
    
    // Simple approach: Iterate visual rows to find ID
    // Since we don't store ID in DOM, we rely on state sync.
    // Let's re-calculate visible IDs.
    
    const visibleEntries = state.allEntries.filter(isVisibleEntry);

    if (shouldSelect) {
        visibleEntries.forEach(e => {
            const id = `${e.sourceIndex}:${e.path}`;
            state.selectedIds.add(id);
        });
    } else {
        state.selectedIds.clear();
    }

    renderList(); // Refresh checkboxes
}

// --- CONVERSION PIPELINE ---

async function startConversion() {
    // Multi-source aware. If there is more than one source OR any
    // PDF source, the per-source flow produces one file per source
    // (and a zip if there are multiple). For a single text source,
    // fall back to the legacy single-file flow for back-compat.
    const _hasMultiSource = state.sources.length > 1 || state.sources.some(s => s.type === 'pdf');
    if (_hasMultiSource) {
        return finishConversionPerSourceBundle();
    }

    // Legacy single-source flow for one text source (back-compat).

    if (state.isProcessing) return;
    
    state.isProcessing = true;
    els.convertBtn.innerHTML = `<span>Processing...</span>`;
    els.convertBtn.disabled = true;

    try {
        // PDF batch: notes were already extracted at file-upload time
        // (see importPdfFiles). The output pipeline consumes them via
        // finishConversion, no per-file extraction needed.
        if (state.detectedFormat === 'pdf') {
            finishConversion({}, {}, {});
            return;
        }

        const combinedContentMap = {};
        const combinedBinaryMap = {};
        const combinedDateMap = {};
        const extractionErrors = [];

        // Iterate sources to extract selected files
        for (let i = 0; i < state.sources.length; i++) {
            const source = state.sources[i];
            const prefix = `${i}:`;
            const pathsForSource = [];
            
            for (const id of state.selectedIds) {
                if (id.startsWith(prefix)) pathsForSource.push(id.substring(prefix.length));
            }

            if (pathsForSource.length === 0) continue;

            if (source.type === 'zip') {
                const errors = await requestWorkerExtraction(source.file, pathsForSource, combinedContentMap, combinedBinaryMap, combinedDateMap);
                if (errors) extractionErrors.push(...errors);
            } else if (source.type === 'raw') {
                for (const path of pathsForSource) {
                    const fileObj = source.files.find(f => f.name === path);
                    if (fileObj) {
                        try {
                            if (isImage(path)) {
                                combinedBinaryMap[path] = await fileObj.arrayBuffer();
                            } else {
                                combinedContentMap[path] = await fileObj.text();
                            }
                            if (fileObj.lastModified) {
                                combinedDateMap[path] = new Date(fileObj.lastModified).toISOString();
                            }
                        } catch (err) {
                            extractionErrors.push({ path, msg: err.message });
                        }
                    }
                }
            }
        }

        if (extractionErrors.length > 0) {
            const hiddenCount = extractionErrors.length > 3 ? ` (+${extractionErrors.length - 3} more)` : '';
            const names = extractionErrors.slice(0, 3).map(e => e.path.split('/').pop()).join(', ');
            showToast(`⚠️ ${extractionErrors.length} file(s) skipped: ${names}${hiddenCount}`, 6000, 'warning');
            console.warn('Extraction errors:', extractionErrors);
        }

        finishConversion(combinedContentMap, combinedBinaryMap, combinedDateMap);

    } catch (err) { handleError(err); }
}

function requestWorkerExtraction(file, paths, resultMap, binaryMap, dateMap) {
    return new Promise((resolve, reject) => {
        const handler = (e) => {
            if (e.data.type === 'extract_complete') {
                Object.assign(resultMap, e.data.contentMap);
                if (e.data.binaryMap) Object.assign(binaryMap, e.data.binaryMap);
                if (e.data.dateMap) Object.assign(dateMap, e.data.dateMap);
                state.worker.removeEventListener('message', handler);
                resolve(e.data.errors || []);
            }
            if (e.data.type === 'error') {
                state.worker.removeEventListener('message', handler);
                reject(new Error(e.data.msg));
            }
        };
        state.worker.addEventListener('message', handler);
        state.worker.postMessage({ type: 'extract', file, paths });
    });
}

function setupWorker() {
    state.worker.addEventListener('message', async (e) => {
        const { type, entries, blob, filename, msg, sourceIndex, hiddenCount } = e.data;
        if (type === 'scan_complete') {
            finalizeBatch(sourceIndex, entries);
            if (hiddenCount > 0) {
                showToast(`${hiddenCount} unsupported file(s) inside the zip were skipped.`, 4000);
            }
            // Drop the "Scanning archive..." overlay once the worker is
            // done. Safe to call unconditionally — hideProgress is a
            // depth counter, not a flag.
            hideProgress();
        }
        if (type === 'zip_complete') {
            await saveAs(blob, filename);
            finishSuccess();
        }
        if (type === 'error') {
            // General error handler
            if (!msg.includes('extract')) handleError(new Error(msg));
        }
    });
}

async function finishConversion(contentMap, binaryMap, dateMap = {}) {
    try {
        const source = state.detectedFormat;
        const target = els.formatSelect.value;
        const notes = [];

        const noteCount = Object.keys(contentMap).length;
        // Collect parse errors so they can be surfaced in the toast (not just console).
        const parseErrors = [];

        // PDF path: notes were extracted at upload time. We need to
        // populate notes[] with state.parsedPdfNotes (filtered by the
        // user's current selection) so the downstream output path is
        // identical to other formats.
        if (source === 'pdf') {
            const pdfNotes = state.parsedPdfNotes || [];
            const selectedPaths = new Set();
            for (const id of state.selectedIds) {
                const idx = id.indexOf(':');
                if (idx < 0) continue;
                selectedPaths.add(id.substring(idx + 1));
            }
            for (let i = 0; i < pdfNotes.length; i++) {
                const tag = `${state.sources.length - 1}:${i + 1}`;  // not used; matched by path
                if (selectedPaths.size > 0 && !selectedPaths.has(`${i + 1}`)) continue;
                notes.push({ ...pdfNotes[i] });
            }
            if (notes.length === 0) {
                throw new Error('No PDF notes selected. Pick at least one to convert.');
            }
        } else {
            Object.entries(contentMap).forEach(([path, content]) => {
            try {
                let note = null;
                if (source === 'keep') {
                    // Keep Takeout ships .json notes alongside .html; JSON carries
                    // richer data (tags, checkboxes, microsec timestamps).
                    note = path.endsWith('.json') ? parseKeepJson(content) : parseKeepHtml(content);
                }
                else if (source === 'enex') note = parseEnex(content);
                else if (source === 'markdown') note = fromMarkdown(content);
                else if (source === 'json') {
                    // Detect Keep Takeout JSON shape and route through
                    // parseKeepJson so listContent / labels / usec
                    // timestamps become a normalised note. Generic JSON
                    // passes through as the parsed object.
                    try {
                        const parsed = JSON.parse(content);
                        note = looksLikeKeepNote(parsed) ? parseKeepJson(content) : parsed;
                    } catch (e) {
                        console.warn(`Skip ${path}: ${e.message}`);
                    }
                }
                else if (source === 'html') {
                    // Raw Keep HTML dropped individually: route through
                    // parseKeepHtml so tags, checkboxes and dates
                    // survive. Without this the file would be silently
                    // dropped (no 'html' case existed before).
                    note = looksLikeKeepHtml(content) ? parseKeepHtml(content) : null;
                }

                // Prefer the parsed date if successfully extracted, falling back
                // to the source file's last-modified time (ZIP entry date or
                // File.lastModified) and finally the current timestamp.
                const fileDate = dateMap[path] || new Date().toISOString();
                const applyDate = (n) => {
                    n.created = n.created || fileDate;
                    n.updated = n.updated || fileDate;
                };

                if (Array.isArray(note)) {
                    note.forEach(applyDate);
                    notes.push(...note);
                } else if (note) {
                    applyDate(note);
                    notes.push(note);
                }
            } catch (e) {
                console.warn(`Skipped note at "${path}": ${e.message}`);
                if (parseErrors.length < 3) parseErrors.push(`${path}: ${e.message}`);
            }
        });
        }

        if (notes.length === 0) {
            const reason = parseErrors.length
                ? ` First error: ${parseErrors[0]}`
                : ` Found ${noteCount} file(s) but none parsed successfully.`;
            throw new Error(`No valid notes could be parsed.${reason}`);
        }

        let blob = null;
        let fname = `migrator-export-${getTimestamp()}`;

        if (target === 'json') {
            blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
            fname += '.json';
            await saveAs(blob, fname);
            finishSuccess();
        }
        else if (target === 'enex') {
            const enexContent = await generateEnexWithResources(notes, binaryMap);
            blob = new Blob([enexContent], { type: 'application/xml' });
            fname += '.enex';
            await saveAs(blob, fname);
            finishSuccess();
        }
        else if (target === 'pdf') {
            // Render a real PDF in the browser using jsPDF. Replaces
            // the previous "open a print window" flow, which depended on
            // a popup surviving long enough for the user to click
            // "Save as PDF" and produced empty/gibbrish files in some
            // browsers. Now the user gets a real .pdf download they can
            // save and open anywhere.
            const { buildSourceOutputs } = await import('./lib/output.js');
            // Pass pdfNotes on the source (rather than format:'pdf')
            // so the buildSourceOutputs branch routes through jsPDF
            // instead of the PDF pass-through branch — the latter
            // would try to use source.file as a real Blob, which we
            // don't have for text sources.
            const [{ blob: pdfBlob }] = await buildSourceOutputs(
                [{ source: { file: { name: fname + '.pdf' }, pdfNotes: notes }, notes }],
                'pdf'
            );
            blob = pdfBlob;
            fname += '.pdf';
            await saveAs(blob, fname);
            finishSuccess();
        }
        else if (target === 'markdown') {
            const filesToZip = [];
            const binaryFiles = [];

            // 1. Prepare Notes & Rewrite Image Links
            notes.forEach(note => {
                let md = toMarkdown(note);
                
                // Rewrite images (e.g. Keep <img> tags converted to markdown image links)
                // Default md-fusion output: ![alt](image.jpg)
                // We want: ![alt](assets/image.jpg) IF that image exists in our binary map
                
                md = md.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
                    const filename = src.split('/').pop();
                    const hasFile = Object.keys(binaryMap).some(k => k.endsWith(filename));
                    
                    if (hasFile) return `![${alt}](assets/${filename})`;
                    return match;
                });

                const safeTitle = (note.title || 'note').replace(/[^a-z0-9\s-_]/gi, '').trim() || 'note';
                filesToZip.push({ name: `${safeTitle}.md`, content: md });
            });

            // 2. Prepare Assets
            Object.entries(binaryMap).forEach(([path, buffer]) => {
                const name = path.split('/').pop();
                binaryFiles.push({ name, blob: buffer });
            });

            // 3. Send to Worker
            state.worker.postMessage({ type: 'zip', filesToZip, binaryFiles });
        }

    } catch (err) { handleError(err); }
}

// Per-source output assembly. Each source becomes one file in the
// result bundle. For a single source the output is downloaded
// directly; for multiple sources, the outputs are bundled into a
// single zip. For PDF output each source gets one PDF in the zip.
async function finishConversionPerSourceBundle() {
    if (state.isProcessing) return;
    state.isProcessing = true;
    els.convertBtn.innerHTML = '<span>Processing...</span>';
    els.convertBtn.disabled = true;
    showProgress('Preparing conversion', `${state.sources.length} source(s)`);
    try {
        const target = els.formatSelect.value;
        const perSourceData = [];
        const extractionErrors = [];

        // Phase 1: per-source extraction. For zip sources this is the
        // slow part (JSZip reads + decodes every selected entry). Show
        // progress as we walk sources so the user sees movement.
        const totalSources = state.sources.length;
        for (let i = 0; i < totalSources; i++) {
            const source = state.sources[i];
            const data = { source, sourceIndex: i, contentMap: {}, binaryMap: {}, dateMap: {}, pdfNotes: null };
            perSourceData.push(data);

            // PDFs are pre-parsed at upload time. Use the per-source
            // map populated by importPdfFiles; the legacy state.parsedPdfNotes
            // flat array is kept around for back-compat.
            if (source.type === 'pdf' && state.pdfPerSource && state.pdfPerSource.has(i)) {
                data.pdfNotes = state.pdfPerSource.get(i);
                updateProgress('Preparing sources', `${i + 1} / ${totalSources}  ·  ${source.file?.name || 'PDF'}`, {
                    percent: Math.round(((i + 1) / totalSources) * 50)
                });
                continue;
            }

            const prefix = `${i}:`;
            const pathsForSource = [];
            for (const id of state.selectedIds) {
                if (id.startsWith(prefix)) pathsForSource.push(id.substring(prefix.length));
            }
            if (pathsForSource.length === 0) {
                updateProgress('Preparing sources', `${i + 1} / ${totalSources}  ·  (no selection)`, {
                    percent: Math.round(((i + 1) / totalSources) * 50)
                });
                continue;
            }

            updateProgress('Extracting', `${i + 1} / ${totalSources}  ·  ${source.file?.name || pathsForSource[0]}`, {
                percent: Math.round(((i + 1) / totalSources) * 50)
            });
            if (source.type === 'zip') {
                const errors = await requestWorkerExtraction(source.file, pathsForSource, data.contentMap, data.binaryMap, data.dateMap);
                if (errors) extractionErrors.push(...errors);
            } else if (source.type === 'raw') {
                for (const path of pathsForSource) {
                    const fileObj = source.files.find(f => f.name === path);
                    if (fileObj) {
                        try {
                            if (isImage(path)) data.binaryMap[path] = await fileObj.arrayBuffer();
                            else data.contentMap[path] = await fileObj.text();
                            if (fileObj.lastModified) data.dateMap[path] = new Date(fileObj.lastModified).toISOString();
                        } catch (err) { extractionErrors.push({ path, msg: err.message }); }
                    }
                }
            }
        }

        if (extractionErrors.length > 0) {
            const hidden = extractionErrors.length > 3 ? ' (+' + (extractionErrors.length - 3) + ' more)' : '';
            const names = extractionErrors.slice(0, 3).map(e => e.path.split('/').pop()).join(', ');
            showToast('⚠️ ' + extractionErrors.length + ' file(s) skipped: ' + names + hidden, 6000, 'warning');
            console.warn('Extraction errors:', extractionErrors);
        }

        const { buildSourceOutputs, buildOutputBundle } = await import('./lib/output.js');
        // Phase 2: parse each source. Walk sources with progress so the
        // user sees the bar move even on big Keep Takeouts with
        // hundreds of notes.
        updateProgress('Parsing notes', 'preparing', { percent: 55 });
        const sources = perSourceData.map((data, idx) => {
            const source = data.source;
            let notes;
            if (data.pdfNotes) {
                notes = data.pdfNotes;
            } else {
                notes = parseSourceNotesForOutput(source, data.contentMap, data.dateMap);
            }
            updateProgress('Parsing notes', `${idx + 1} / ${perSourceData.length}  ·  ${source.file?.name || 'source'}`, {
                percent: 55 + Math.round(((idx + 1) / perSourceData.length) * 30)
            });
            return Object.assign({}, data, { source, notes });
        }).filter(s => s.notes.length > 0);

        if (sources.length === 0) {
            throw new Error('No notes were extractable from the dropped files.');
        }

        // Phase 3: build per-source outputs. buildSourceOutputs walks
        // the list internally; we wrap with our own progress loop so
        // the bar advances even when jsPDF is slow on big PDFs.
        const opts = { generateEnex: generateEnexWithResources };
        updateProgress('Building output', `0 / ${sources.length}`, { percent: 85 });
        const outputs = await buildSourceOutputs(sources, target, opts);
        updateProgress('Building output', `${sources.length} / ${sources.length}`, { percent: 95 });

        if (sources.length === 1) {
            // Single source: download the file directly.
            await saveAs(outputs[0].blob, outputs[0].name);
        } else {
            // Multi-source: bundle into a single zip.
            updateProgress('Bundling zip', `${sources.length} files`, { percent: 98 });
            const zip = await buildOutputBundle(sources, target, opts);
            await saveAs(zip, 'migrator-export-' + getTimestamp() + '.zip');
        }
        if (target === 'pdf') {
            // The per-source bundle path uses jsPDF to render every
            // source as a real PDF, so the user just gets a download.
            // The legacy "print to PDF" toast only applies to the
            // single-source HTML-print path; nothing in this flow
            // opens a print dialog.
            showToast('PDFs ready. Each source is one PDF in the bundle.', 4500);
        } else if (sources.some(s => s.format === 'pdf')) {
            // Mixed batch with PDFs: PDFs pass through unchanged, text
            // sources get converted to the chosen target.
            showToast('PDFs included in the bundle as-is. Other sources converted.', 4500);
        } else if (areAllSelectedSourcesPdf()) {
            // All-PDFs selection: the format dropdown is disabled in
            // this case, but the user may still hit Download. Tell
            // them what they got.
            showToast('PDFs bundled as-is.', 4000);
        }
        updateProgress('Done', '', { percent: 100 });
        finishSuccess();
    } catch (err) { handleError(err); } finally {
        hideProgress();
        state.isProcessing = false;
        els.convertBtn.innerHTML = '<span>Download</span>' + (els.convertBtn.dataset.icon || '');
        els.convertBtn.disabled = false;
    }
}

function parseSourceNotesForOutput(source, contentMap, dateMap) {
    const notes = [];
    const fileDate = Object.values(dateMap)[0] || new Date().toISOString();
    const applyDate = (n) => {
        n.created = n.created || fileDate;
        n.updated = n.updated || fileDate;
    };
    for (const [path, content] of Object.entries(contentMap)) {
        try {
            let note = null;
            const fmt = source.format || 'unknown';
            if (fmt === 'keep') {
                note = path.endsWith('.json') ? parseKeepJson(content) : parseKeepHtml(content);
            } else if (fmt === 'enex') {
                note = parseEnex(content);
            } else if (fmt === 'markdown') {
                note = fromMarkdown(content);
            } else if (fmt === 'html') {
                // Raw Keep HTML dropped individually: parse as Keep so
                // tags, checkboxes, attachments and the date survive.
                note = looksLikeKeepHtml(content) ? parseKeepHtml(content) : null;
            } else if (fmt === 'json') {
                // If the JSON shape is recognisably Keep, route through
                // parseKeepJson so listContent/labels/usec timestamps
                // become a normalised note. Otherwise treat as raw JSON.
                try {
                    const parsed = JSON.parse(content);
                    note = looksLikeKeepNote(parsed) ? parseKeepJson(content) : parsed;
                } catch (e) {
                    console.warn('Skip ' + path + ' in ' + (source.file && source.file.name || 'source') + ': ' + e.message);
                    continue;
                }
            } else {
                // Unknown format: peek at content. Detect Keep HTML or
                // Keep-shaped JSON; otherwise leave the file alone.
                if (looksLikeKeepHtml(content)) note = parseKeepHtml(content);
                else {
                    try {
                        const parsed = JSON.parse(content);
                        if (looksLikeKeepNote(parsed)) note = parseKeepJson(content);
                    } catch { /* not JSON, not Keep HTML — skip */ }
                }
            }
            if (Array.isArray(note)) {
                note.forEach(applyDate);
                notes.push(...note);
            } else if (note) {
                applyDate(note);
                notes.push(note);
            }
        } catch (e) {
            console.warn('Skip ' + path + ' in ' + (source.file && source.file.name || 'source') + ': ' + e.message);
        }
    }
    return notes;
}

function generateEnexWithResources(notes, binaryMap) {
    // Synchronous on purpose: the per-source bundle path passes this
    // function into buildSourceOutputs, which calls it without await.
    // Making this async would return a Promise that gets stringified
    // to "[object Promise]" inside the resulting Blob (caught by the
    // UI smoke test). All work here is in-memory string + base64
    // building, no I/O — no need for async.
    const ts = new Date().toISOString().replace(/[-:.]/g, '').split('T')[0] + 'T' +
               new Date().toISOString().split('T')[1].replace(/[-:.]/g,'').slice(0,6) + 'Z';
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export3.dtd">\n<en-export export-date="${ts}" application="NotesMigrator" version="1.0">`;
    for (const note of notes) {
        let content = note.content || '';
        let resourcesXml = '';
        
        if (note.attachments && note.attachments.length > 0) {
            for (const att of note.attachments) {
                const filename = att.filePath.split('/').pop();
                const binKey = Object.keys(binaryMap).find(k => k.endsWith(filename));
                if (binKey) {
                    const arrayBuffer = binaryMap[binKey];
                    const spark = new SparkMD5.ArrayBuffer();
                    spark.append(arrayBuffer);
                    const hashHex = spark.end();
                    const base64 = Buffer.from(arrayBuffer).toString('base64');
                    
                    content += `<br/><br/><en-media type="${att.mimeType || 'image/jpeg'}" hash="${hashHex}" />`;
                    
                    resourcesXml += `
<resource>
  <data encoding="base64">${base64}</data>
  <mime>${att.mimeType || 'image/jpeg'}</mime>
  <resource-attributes><file-name>${filename}</file-name></resource-attributes>
</resource>`;
                }
            }
        }
        
        // Map checkbox inputs to Evernote <en-todo> items, escaping XML entities.
        content = normalizeEnexContent(content);
        
        const title = escapeXml(note.title || 'Untitled');

        // Preserve Keep labels as ENEX <tag> nodes, escaping XML entities.
        const tagsXml = buildTagsXml(note);
        
        const createdTs = toEnexDate(note.created) || ts;
        const updatedTs = toEnexDate(note.updated) || createdTs;

        xml += `
<note>
  <title>${title}</title>
  <content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>${content}</en-note>]]></content>
  <created>${createdTs}</created>
  <updated>${updatedTs}</updated>${tagsXml}
  ${resourcesXml}
</note>`;
    }
    xml += `\n</en-export>`;
    return xml;
}

// --- UTILS ---

function isImage(name) {
    // Same regex used by lib/keep.js keepEntryVisible; kept inline so the
    // worker / file-tree code that runs before import resolution can
    // see it without an explicit dependency.
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
}

// Cache of .json note paths, used to hide duplicate Keep HTML/JSON pairs.
function recomputeKeepJsonPaths() {
    state.keepJsonPaths = new Set(
        state.allEntries.filter(e => e.name.endsWith('.json')).map(e => e.path)
    );
}

// Single source of truth for which entries show and auto-select in the file list.
function isVisibleEntry(e) {
    return keepEntryVisible(e, state.detectedFormat, state.keepJsonPaths);
}

// Convert any parseable date string to Evernote's compact UTC format
// (YYYYMMDDTHHMMSSZ). Returns null if the input can't be parsed.
function toEnexDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function getTimestamp() {
    return new Date().toISOString().slice(0, 10);
}

let _toastTimer = null;
function showToast(msg, duration = 3500, type = 'info') {
    const t = document.getElementById('toast');
    if (!t) return;
    // Clear any pending hide
    if (_toastTimer) { clearTimeout(_toastTimer); t.classList.remove('show'); }
    t.innerText = msg;
    t.className = ''; // reset type classes
    t.classList.add(`toast-${type}`, 'show');
    _toastTimer = setTimeout(() => {
        t.classList.remove('show');
        _toastTimer = null;
    }, duration);
}

// --- Progress overlay ---
// Lightweight, non-blocking status surface for long-running work
// (zip scanning, per-source extraction, conversion, PDF import). The
// overlay blurs the page underneath and shows a spinner, label,
// optional percentage bar and a one-line detail (e.g. "Extracting
// file 12 of 87"). The hot-path pipeline calls these helpers
// synchronously; nothing here queues microtasks or holds the main
// thread.
let _progressDepth = 0;
function showProgress(label, detail = '', opts = {}) {
    if (!els.progressOverlay) return;
    _progressDepth++;
    els.progressLabel.textContent = label;
    if (els.progressDetail) els.progressDetail.textContent = detail;
    if (els.progressBarFill) {
        if (opts.indeterminate !== false && (opts.percent == null)) {
            els.progressBarFill.classList.add('indeterminate');
        } else {
            els.progressBarFill.classList.remove('indeterminate');
            els.progressBarFill.style.width = Math.max(0, Math.min(100, opts.percent || 0)) + '%';
        }
    }
    els.progressOverlay.classList.remove('hidden');
    document.body.classList.add('progress-active');
}

function updateProgress(label, detail = '', opts = {}) {
    if (!els.progressOverlay || _progressDepth === 0) return;
    if (label) els.progressLabel.textContent = label;
    if (els.progressDetail) els.progressDetail.textContent = detail;
    if (els.progressBarFill) {
        if (opts.indeterminate !== false && (opts.percent == null)) {
            els.progressBarFill.classList.add('indeterminate');
        } else {
            els.progressBarFill.classList.remove('indeterminate');
            els.progressBarFill.style.width = Math.max(0, Math.min(100, opts.percent || 0)) + '%';
        }
    }
}

function hideProgress() {
    if (!els.progressOverlay) return;
    _progressDepth = Math.max(0, _progressDepth - 1);
    if (_progressDepth > 0) return;
    els.progressOverlay.classList.add('hidden');
    document.body.classList.remove('progress-active');
}

function finishSuccess() {
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    resetBtn();
}

function handleError(err) {
    console.error('Conversion error:', err);
    showToast(`❌ ${err.message}`, 7000, 'error');
    resetBtn();
}

function resetBtn() {
    state.isProcessing = false;
    els.convertBtn.disabled = false;
    els.convertBtn.innerHTML = `<span>Download</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
}

function switchView(id) {
    Object.values(els.views).forEach(el => el.classList.remove('active'));
    els.views[id].classList.add('active');
}

// Show the reset icon only when the user has uploaded at least one file.
// The button is hidden by default via the `hidden` attribute on the
// <button id="resetBtn"> in index.html, and toggled here as state
// changes. Keeps the first-landing dropzone clean of "Clear" chrome
// the user has nothing to clear yet.
function updateResetVisibility() {
    if (!els.resetBtn) return;
    const hasContent = state.sources.length > 0 || state.parsedPdfNotes.length > 0;
    if (hasContent) els.resetBtn.removeAttribute('hidden');
    else els.resetBtn.setAttribute('hidden', '');
}

// Clear all loaded state and return to the upload dropzone. Used by the
// reset icon in the top bar.
function resetState() {
    state.sources = [];
    state.allEntries = [];
    state.selectedIds = new Set();
    state.parsedPdfNotes = [];
    state.detectedFormat = null;
    state.keepJsonPaths = new Set();
    if (state.pdfPerSource) state.pdfPerSource.clear();
    // Also clear the file input value so re-selecting the same files
    // fires the change handler again. (Webkit quirk: same FileList is
    // dropped if the user picks the same files twice in a row.)
    if (els.fileInput) els.fileInput.value = '';
    if (els.folderInput) els.folderInput.value = '';
    updateResetVisibility();
    if (els.fileList) els.fileList.innerHTML = '';
    if (els.countDisplay) els.countDisplay.textContent = '0';
    // Re-evaluate the dock so the bottom bar hides when the source
    // list empties, and re-enable the format selector if it was
    // disabled by an all-PDFs selection.
    updateDock();
    switchView('upload');
}