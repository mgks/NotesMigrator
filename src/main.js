// 1. POLYFILL (MUST BE FIRST)
import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer; 

// 2. IMPORTS
import { OUTPUT_OPTIONS, detectFormat, FORMATS } from './config/formats.js';
import { parseKeepHtml } from 'gkeep-parser';
import { escapeHtml, escapeXml, parseKeepJson, normalizeEnexContent, buildTagsXml, keepEntryVisible } from './lib/keep.js';
import { generateEnex, parseEnex } from 'enex-io';
import { toMarkdown, fromMarkdown } from 'md-fusion';
import { saveAs } from 'file-saver';
import confetti from 'canvas-confetti';
import JSZip from 'jszip'; 
import SparkMD5 from 'spark-md5';

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
    sources: [],      // Array of { type: 'zip'|'raw', file: File, entries: [], files?: [] }
    allEntries: [],   // Flattened list for UI
    selectedIds: new Set(), // Format: "sourceIndex:path"
    worker: new Worker(new URL('./modules/worker.js', import.meta.url), { type: 'module' }),
    isProcessing: false,
    detectedFormat: null,
    keepJsonPaths: new Set(), // .json note paths, used to dedupe Keep HTML/JSON pairs
    parsedPdfNotes: []   // notes already extracted when source === 'pdf'
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
        'browseBtn', 'browseFolderBtn', 'addMoreBtn', 'addFolderBtn', 'dragOverlay', 'toast'
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
        showToast("No readable files found in drop.");
        switchView('upload');
    }
}

// Parse a batch of PDF files in the main thread and register the
// resulting notes with the existing pipeline. The heavy pdf.js bundle
// is loaded on-demand by src/lib/pdf.js, so the main bundle stays slim.
async function importPdfFiles(pdfs) {
    if (!Array.isArray(pdfs) || pdfs.length === 0) return;
    const { parsePdfFile } = await import('./lib/pdf.js');
    state.parsedPdfNotes = [];
    const seen = new Set();
    let totalSkipped = 0;
    for (const file of pdfs) {
        try {
            const notes = await parsePdfFile(file);
            for (const note of notes) {
                let title = (note.title || file.name || 'PDF note').trim() || 'PDF note';
                let suffix = 2;
                const base = title;
                while (seen.has(title)) title = `${base} (${suffix++})`;
                seen.add(title);
                state.parsedPdfNotes.push({ ...note, title });
            }
        } catch (err) {
            totalSkipped++;
            console.warn(`Skipped ${file.name}: ${err.message}`);
        }
    }

    if (state.parsedPdfNotes.length === 0) {
        showToast('No text could be extracted from the PDF(s).', 5000, 'error');
        return;
    }

    state.sources.push({ type: 'pdf', files: pdfs, entries: [] });
    const sourceIndex = state.sources.length - 1;
    const entries = state.parsedPdfNotes.map((n, i) => ({
        path: `${pdfs[0].name}#${i + 1}`,
        name: n.title,
        size: pdfs[0].size || 0
    }));
    finalizeBatch(sourceIndex, entries);
    // Auto-select all notes for the user — they can deselect before converting.
    state.selectedIds = new Set(entries.map(e => `${sourceIndex}:${e.path}`));
    if (totalSkipped > 0) showToast(`Imported ${state.parsedPdfNotes.length} PDF note(s); ${totalSkipped} file(s) skipped.`, 5000, 'warning');
    else showToast(`Imported ${state.parsedPdfNotes.length} PDF note(s).`);
}

function handleNewFiles(fileList) {
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

    // 1. Process ZIPs
    zips.forEach(zip => {
        const sourceIndex = state.sources.length;
        state.sources.push({ type: 'zip', file: zip, entries: [] });
        els.scanStatus.innerText = `Scanning ${zip.name}...`;
        state.worker.postMessage({ type: 'scan', file: zip, sourceIndex });
    });

    // 2. Process Valid Raw Files
    if (validRaw.length > 0) {
        const sourceIndex = state.sources.length;
        const entries = validRaw.map(f => ({
            path: f.name,
            name: f.name,
            size: f.size
        }));
        
        state.sources.push({ type: 'raw', files: validRaw, entries });
        finalizeBatch(sourceIndex, entries);
    }
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
    recomputeKeepJsonPaths();

    // Auto-Select ONLY Visible Files
    taggedEntries.forEach(e => {
        if (isVisibleEntry(e)) {
            state.selectedIds.add(`${sourceIndex}:${e.path}`);
        }
    });
    
    renderList();
    switchView('list');
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
        
        let iconSvg = ICONS[state.detectedFormat] || ICONS.default;
        if (isImage(entry.name)) iconSvg = ICONS.image;

        const sizeKB = (entry.size / 1024).toFixed(1);

        row.innerHTML = `
            <div class="col-check"><input type="checkbox" ${isChecked ? 'checked' : ''}></div>
            <div class="col-name">
                <span class="file-icon" style="display:flex; margin-right:10px;">${iconSvg}</span>
                <span title="${entry.name}" style="overflow:hidden; text-overflow:ellipsis;">${entry.name}</span>
            </div>
            <div class="col-meta">${isImage(entry.name) ? 'IMAGE' : state.detectedFormat.toUpperCase()}</div>
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
    state.worker.addEventListener('message', (e) => {
        const { type, entries, blob, filename, msg, sourceIndex } = e.data;
        if (type === 'scan_complete') finalizeBatch(sourceIndex, entries);
        if (type === 'zip_complete') {
            saveAs(blob, filename);
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
                else if (source === 'json') note = JSON.parse(content);
                
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
            saveAs(blob, fname);
            finishSuccess();
        }
        else if (target === 'enex') {
            const enexContent = await generateEnexWithResources(notes, binaryMap);
            blob = new Blob([enexContent], { type: 'application/xml' });
            fname += '.enex';
            saveAs(blob, fname);
            finishSuccess();
        }
        else if (target === 'pdf') {
            // Render notes to a printable HTML document and open a new
            // tab with the browser's print dialog open. The user picks
            // "Save as PDF" in the destination dropdown. Perfect
            // fidelity (every HTML element the app supports renders) and
            // zero new dependencies.
            const { notesToPrintableHTML, openPrintWindow } = await import('./lib/pdf-render.js');
            const html = notesToPrintableHTML(notes, { title: 'NotesMigrator export' });
            const win = openPrintWindow(html);
            if (!win) {
                // Popup blocked — fall back to offering a Blob download
                // so the user still has the HTML.
                blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                fname += '.html';
                saveAs(blob, fname);
                showToast('Popup blocked — downloaded HTML instead. Open it and use Print → Save as PDF.', 6000);
            } else {
                showToast('Choose "Save as PDF" in the print dialog to export.', 4500);
            }
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

async function generateEnexWithResources(notes, binaryMap) {
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