// 1. POLYFILL (MUST BE FIRST)
import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer; 

// 2. IMPORTS
import { OUTPUT_OPTIONS, detectFormat, FORMATS } from './config/formats.js';
import { parseKeepHtml } from 'gkeep-parser';
import { generateEnex, parseEnex } from 'enex-io';
import { toMarkdown, fromMarkdown } from 'md-fusion';
import { saveAs } from 'file-saver';
import confetti from 'canvas-confetti';
import JSZip from 'jszip'; 

// --- ICONS ---
const ICONS = {
    keep: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbc04" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"></path></svg>`,
    enex: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dbe60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    markdown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7b68ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15l2-2 4 4"></path></svg>`,
    html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e34f26" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
    json: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
    image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
    default: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`
};

// --- STATE ---
const state = {
    sources: [],      // Array of { type: 'zip'|'raw', file: File, entries: [], files?: [] }
    allEntries: [],   // Flattened list for UI
    selectedIds: new Set(), // Format: "sourceIndex:path"
    worker: new Worker(new URL('./modules/worker.js', import.meta.url), { type: 'module' }),
    isProcessing: false,
    detectedFormat: null
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
        'dropTrigger', 'fileInput', 'fileList', 'dock', 'formatSelect', 
        'countDisplay', 'selectAll', 'convertBtn', 'scanStatus', 
        'browseBtn', 'addMoreBtn', 'dragOverlay', 'toast'
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
    if(els.addMoreBtn) els.addMoreBtn.addEventListener('click', () => els.fileInput.click());
    
    els.fileInput.addEventListener('change', e => {
        if(e.target.files.length > 0) handleNewFiles(e.target.files);
        els.fileInput.value = ''; // Reset for re-selection
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

function handleDrop(e) {
    const dt = e.dataTransfer;
    if (dt.files.length > 0) handleNewFiles(dt.files);
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
    const allowedExts = ['.html', '.json', '.enex', '.md', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
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
    
    // Auto-Select New Files
    taggedEntries.forEach(e => state.selectedIds.add(`${sourceIndex}:${e.path}`));

    // Update Format Detection
    const allNames = state.allEntries.map(e => e.name);
    const primaryName = state.allEntries.length > 0 ? state.allEntries[0].name : 'unknown';
    state.detectedFormat = detectFormat(primaryName, allNames);
    
    renderList();
    switchView('list');
}

// --- RENDER LIST ---

function renderList() {
    els.fileList.innerHTML = '';
    
    // Filter view based on detected format + Images
    const displayEntries = state.allEntries.filter(e => {
        if (e.name.startsWith('.')) return false;
        
        const isImg = isImage(e.name);
        if (isImg) return true; // Always show images if they were accepted

        if (state.detectedFormat === 'keep') return e.name.endsWith('.html');
        if (state.detectedFormat === 'markdown' || state.detectedFormat === 'notion') return e.name.endsWith('.md');
        if (state.detectedFormat === 'enex') return e.name.endsWith('.enex');
        if (state.detectedFormat === 'json') return e.name.endsWith('.json');
        
        return true; 
    });

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
    
    const visibleEntries = state.allEntries.filter(e => {
        if (e.name.startsWith('.')) return false;
        if (isImage(e.name)) return true;
        if (state.detectedFormat === 'keep') return e.name.endsWith('.html');
        if (state.detectedFormat === 'markdown') return e.name.endsWith('.md');
        if (state.detectedFormat === 'enex') return e.name.endsWith('.enex');
        if (state.detectedFormat === 'json') return e.name.endsWith('.json');
        return true;
    });

    visibleEntries.forEach(e => {
        const id = `${e.sourceIndex}:${e.path}`;
        if (shouldSelect) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
    });

    renderList(); // Refresh checkboxes
}

// --- CONVERSION PIPELINE ---

async function startConversion() {
    if (state.isProcessing) return;
    
    state.isProcessing = true;
    els.convertBtn.innerHTML = `<span>Processing...</span>`;
    els.convertBtn.disabled = true;

    try {
        const combinedContentMap = {};
        const combinedBinaryMap = {};

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
                // Modified worker logic handles binary extraction map
                await requestWorkerExtraction(source.file, pathsForSource, combinedContentMap, combinedBinaryMap);
            } else if (source.type === 'raw') {
                for (const path of pathsForSource) {
                    const fileObj = source.files.find(f => f.name === path);
                    if (fileObj) {
                        if (isImage(path)) {
                            combinedBinaryMap[path] = await fileObj.arrayBuffer();
                        } else {
                            combinedContentMap[path] = await fileObj.text();
                        }
                    }
                }
            }
        }

        finishConversion(combinedContentMap, combinedBinaryMap);

    } catch (err) { handleError(err); }
}

function requestWorkerExtraction(file, paths, resultMap, binaryMap) {
    return new Promise((resolve, reject) => {
        const handler = (e) => {
            if (e.data.type === 'extract_complete') {
                Object.assign(resultMap, e.data.contentMap);
                if (e.data.binaryMap) Object.assign(binaryMap, e.data.binaryMap);
                state.worker.removeEventListener('message', handler);
                resolve();
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

async function finishConversion(contentMap, binaryMap) {
    try {
        const source = state.detectedFormat;
        const target = els.formatSelect.value;
        const notes = [];

        console.log(`Parsing ${Object.keys(contentMap).length} notes...`);
        
        Object.entries(contentMap).forEach(([path, content]) => {
            try {
                let note = null;
                if (source === 'keep') note = parseKeepHtml(content);
                else if (source === 'enex') note = parseEnex(content);
                else if (source === 'markdown') note = fromMarkdown(content);
                else if (source === 'json') note = JSON.parse(content);
                
                if (Array.isArray(note)) notes.push(...note);
                else if (note) notes.push(note);
            } catch (e) {}
        });

        if (notes.length === 0) throw new Error("No valid notes parsed.");

        let blob = null;
        let fname = `migrator-export-${getTimestamp()}`;

        if (target === 'json') {
            blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
            fname += '.json';
            saveAs(blob, fname);
            finishSuccess();
        } 
        else if (target === 'enex') {
            blob = new Blob([generateEnex(notes)], { type: 'application/xml' });
            fname += '.enex';
            saveAs(blob, fname);
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

// --- UTILS ---

function isImage(name) {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
}

function getTimestamp() {
    return new Date().toISOString().slice(0, 10);
}

function showToast(msg, duration = 3000) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}

function finishSuccess() {
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    resetBtn();
}

function handleError(err) {
    alert(err.message);
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