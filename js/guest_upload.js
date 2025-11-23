import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, updateDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import * as pdfjsLib from 'https://mozilla.github.io/pdf.js/build/pdf.mjs';
import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js';

import { firebaseConfig } from "./firebase.js";
import { HARDCODED_PAPER_TYPES, BINDING_TYPES } from "./guest_constants.js";
import { drawGuides, STANDARD_PAPER_SIZES, INCH_TO_POINTS, MM_TO_POINTS } from "./guides.js";

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://mozilla.github.io/pdf.js/build/pdf.worker.mjs';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// DOM Elements
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const uploadContainer = document.getElementById('upload-container');
const successState = document.getElementById('success-state');
const projectNameEl = document.getElementById('project-name');
const bookletUploadSection = document.getElementById('booklet-upload-section');
const uploadForm = document.getElementById('upload-form');
const submitButton = document.getElementById('submit-button');
const uploadProgress = document.getElementById('upload-progress');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressPercent = document.getElementById('progress-percent');

// Locked UI Elements
const lockedState = document.getElementById('locked-state');
const lockedByUserSpan = document.getElementById('locked-by-user');
const adminUnlockContainer = document.getElementById('admin-unlock-container');
const forceUnlockBtn = document.getElementById('force-unlock-btn');

// Navigation Elements
const navBackBtn = document.getElementById('nav-back-btn');

// Specs Modal Elements
const specsModal = document.getElementById('specs-modal');
const specsForm = document.getElementById('specs-form');
const specSizePreset = document.getElementById('spec-size-preset');
const customSizeContainer = document.getElementById('custom-size-container');
const unitToggles = document.querySelectorAll('.unit-toggle');
const unitLabels = document.querySelectorAll('.unit-label');
const specUnit = document.getElementById('spec-unit');
const specWidth = document.getElementById('spec-width');
const specHeight = document.getElementById('spec-height');
const specBinding = document.getElementById('spec-binding'); // Hidden input now
const specPaper = document.getElementById('spec-paper');
const specCoverPaper = document.getElementById('spec-cover-paper');
const specPageCount = document.getElementById('spec-page-count');
const paperSection = document.getElementById('paper-section');
const pageCountSection = document.getElementById('page-count-section');
const saveSpecsBtn = document.getElementById('save-specs-btn');
const projectTypeRadios = document.getElementsByName('projectType');

// Cover Builder Elements
const tabInterior = document.getElementById('tab-interior');
const tabCover = document.getElementById('tab-cover');
const contentInterior = document.getElementById('content-interior');
const contentCover = document.getElementById('content-cover');
const coverCanvas = document.getElementById('cover-preview-canvas');
const spineWidthDisplay = document.getElementById('spine-width-display');
const fileSpineInput = document.getElementById('file-spine');

// Interior Builder Elements
const addInteriorFileBtn = document.getElementById('add-interior-file-btn');
const hiddenInteriorInput = document.getElementById('hidden-interior-input');
const fileInteriorDrop = document.getElementById('file-interior-drop');
const viewerZoom = document.getElementById('viewer-zoom');
const coverZoomInput = document.getElementById('cover-zoom');
const jumpToPageInput = document.getElementById('jump-to-page');
const setAllFitBtn = document.getElementById('set-all-fit');
const setAllFillBtn = document.getElementById('set-all-fill');
const setAllStretchBtn = document.getElementById('set-all-stretch');

const insertFileInput = document.createElement('input');
insertFileInput.type = 'file';
insertFileInput.accept = '.pdf,.jpg,.png,.psd';
insertFileInput.multiple = true;
insertFileInput.style.display = 'none';
document.body.appendChild(insertFileInput);

// Page Settings Modal Elements
const pageSettingsModal = document.getElementById('page-settings-modal');
const closeSettingsModal = document.getElementById('close-settings-modal');
const applySettingsBtn = document.getElementById('apply-settings-btn');
const settingsPreviewCanvas = document.getElementById('settings-preview-canvas');
const settingAlignment = document.getElementById('setting-alignment');
const scaleModeBtns = document.querySelectorAll('.scale-mode-btn');

// Toolbar Elements
const toolbarJump = document.getElementById('toolbar-jump');
const toolbarActionsBooklet = document.getElementById('toolbar-actions-booklet');
const toolbarSpreadUpload = document.getElementById('toolbar-spread-upload');
const builderTabs = document.getElementById('builder-tabs');

const pdfDocCache = new Map(); // Cache for loaded PDF documents
const remotePdfDocCache = new Map();

const undoStack = [];
const GRID_SIZE = 0.01;

const coverSettings = {
    'file-cover-front': { pageIndex: 1, scaleMode: 'fill' },
    'file-cover-back':  { pageIndex: 1, scaleMode: 'fill' },
    'file-spine':       { pageIndex: 1, scaleMode: 'fill' }
};

const pendingLoadCache = new Map();

// State
let projectId = null;
let guestToken = null;
let currentUser = null; // Set via auth listener
let isAdmin = false; // Derived from user role or URL param
let hasActiveLock = false; // Track if we own the lock
let projectType = 'single'; // Default
let selectedFiles = {}; // Keep for Legacy/Single logic
let projectSpecs = {}; // Store loaded/saved specs here
let builderInitialized = false;
let coverZoom = 1.0;
let coverRenderId = 0;
let _previewOffscreen = null;
let _previewCtx = null;
// New Data Model for Virtual Book
let sourceFiles = {}; // Map: id -> File object
let pages = []; // Array: { id, sourceFileId, pageIndex, settings: { scaleMode, alignment }, isSpread: boolean }
let viewerScale = 0.5; // Zoom level for viewer
// --- LRU Cache Implementation ---
class LRUCache {
    constructor(limit = 50) {
        this.limit = limit;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        const val = this.cache.get(key);
        // Refresh: delete and set to make it "newest"
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }

    set(key, val) {
        if (this.cache.has(key)) this.cache.delete(key);
        else if (this.cache.size >= this.limit) {
            // Delete oldest (first item in Map)
            // Don't delete thumbnails (keys ending in _s0.25) if possible? 
            // For simplicity, just delete oldest. Thumbnails are cheap to recreate.
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            // Optional: Explicitly close bitmap to free GPU memory
            // if (val.close) val.close(); 
        }
        this.cache.set(key, val);
    }

    has(key) { return this.cache.has(key); }
    delete(key) { return this.cache.delete(key); }
    clear() { this.cache.clear(); }
}

// Initialize with a limit (e.g., 60 items: 30 pages + 30 thumbs)
const imageCache = new LRUCache(60); // Cache for rendered ImageBitmaps: key=pageId -> { bitmap, scale }
let hasFitCover = false;
let coverSources = {};
let minimapRenderId = 0;
// --- NEW: Render Queue System ---
let renderQueue = [];
let activeRenders = 0;
const MAX_CONCURRENT_RENDERS = 3; // <--- CHANGED TO 1 (Strict Serial Order)

const processRenderQueue = () => {
    if (activeRenders >= MAX_CONCURRENT_RENDERS || renderQueue.length === 0) return;

    activeRenders++;
    const { task, resolve, reject } = renderQueue.shift();

    task().then(result => {
        resolve(result);
    }).catch(err => {
        reject(err);
    }).finally(() => {
        activeRenders--;
        processRenderQueue();
    });
};

const enqueueRender = (renderFn) => {
    return new Promise((resolve, reject) => {
        renderQueue.push({ task: renderFn, resolve, reject });
        processRenderQueue();
    });
};

// --- Helper: Parse URL Params ---
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        projectId: params.get('projectId'),
        guestToken: params.get('guestToken')
    };
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// --- Helper function to deduplicate asynchronous work (Loading/Rendering) ---
async function fetchBitmapWithCache(cacheKey, loadFn) {
    if (imageCache.has(cacheKey)) {
        // console.log(`[Bitmap Cache] Hit: ${cacheKey}`); // Optional: Uncomment for very verbose logs
        return imageCache.get(cacheKey);
    }
    if (pendingLoadCache.has(cacheKey)) {
        console.log(`[Bitmap Cache] Joining pending request: ${cacheKey}`);
        return pendingLoadCache.get(cacheKey);
    }

    console.log(`[Bitmap Cache] Starting new request: ${cacheKey}`);
    const promise = loadFn().then(bitmap => {
        if (bitmap) imageCache.set(cacheKey, bitmap);
        pendingLoadCache.delete(cacheKey); 
        console.log(`[Bitmap Cache] Finished: ${cacheKey}`);
        return bitmap;
    }).catch(err => {
        pendingLoadCache.delete(cacheKey);
        console.error(`[Bitmap Cache] Failed: ${cacheKey}`, err);
        throw err;
    });

    pendingLoadCache.set(cacheKey, promise);
    return promise;
}

// Create a debounced version that waits 2 seconds after the last action
const triggerAutosave = debounce(async () => {
    const saveBtn = document.getElementById('save-progress-btn');
    if (saveBtn) {
        saveBtn.innerHTML = `
            <div class="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></div>
            <span class="text-gray-400">Saving...</span>
        `;
    }

    try {
        // Reuse your existing sync logic
        await syncProjectState('draft'); 
        
        if (saveBtn) {
            saveBtn.innerHTML = `
                <svg class="w-4 h-4 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                <span class="text-gray-300">All changes saved</span>
            `;
        }
    } catch (e) {
        console.error("Autosave failed", e);
        if (saveBtn) saveBtn.innerHTML = `<span class="text-red-400">Save Failed</span>`;
    }
}, 2000); // 2000ms = 2 seconds

// --- Helper: Resolve Dimensions ---
function resolveDimensions(specDimensions) {
    // If it's already an object with width/height
    if (typeof specDimensions === 'object' && specDimensions !== null && specDimensions.width && specDimensions.height) {
        // Normalize MM to Inches for internal viewer consistency
        if (specDimensions.units === 'mm') {
            return {
                width: parseFloat(specDimensions.width) / 25.4,
                height: parseFloat(specDimensions.height) / 25.4,
                units: 'in' // Normalize to inches for viewer
            };
        }
        return specDimensions;
    }

    // If it's a string (Standard Preset), look it up
    if (typeof specDimensions === 'string' && STANDARD_PAPER_SIZES[specDimensions]) {
        const size = STANDARD_PAPER_SIZES[specDimensions];
        // Convert MM to Inches for internal viewer consistency (since viewer code usually expects inches)
        // 1 inch = 25.4 mm
        return {
            width: size.width_mm / 25.4,
            height: size.height_mm / 25.4,
            units: 'in'
        };
    }

    // Fallback or legacy string "WxH" parsing could go here if needed,
    // but for now return defaults or null
    return { width: 8.5, height: 11, units: 'in' }; // Default Letter
}

// --- Helper: Show Error ---
function showError(msg) {
    loadingState.classList.add('hidden');
    uploadContainer.classList.add('hidden');
    errorState.classList.remove('hidden');
    errorMessage.textContent = msg;
}

// --- Helper: Populate Selects ---
function populateSelects() {
    // Populate Sizes
    const groups = {};
    Object.entries(STANDARD_PAPER_SIZES).forEach(([key, val]) => {
        if (!groups[val.group]) groups[val.group] = [];
        groups[val.group].push({ key, ...val });
    });

    // Clear but keep default and custom
    // Actually easier to rebuild
    specSizePreset.innerHTML = '<option value="" disabled selected>Select a Size</option>';

    for (const [groupName, items] of Object.entries(groups)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.key;
            opt.textContent = `${item.name} (${item.width_mm} x ${item.height_mm} mm)`;
            optgroup.appendChild(opt);
        });
        specSizePreset.appendChild(optgroup);
    }
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Custom Size...';
    specSizePreset.appendChild(customOpt);


    // Populate Paper
    specPaper.innerHTML = '<option value="" disabled selected>Select Interior Paper</option>';
    specCoverPaper.innerHTML = '<option value="" disabled selected>Select Cover Paper</option>';

    HARDCODED_PAPER_TYPES.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        specPaper.appendChild(opt.cloneNode(true));
        specCoverPaper.appendChild(opt);
    });
}

// --- Handle Size Preset Change ---
if (specSizePreset) {
    specSizePreset.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'custom') {
            customSizeContainer.classList.remove('hidden');
            specWidth.required = true;
            specHeight.required = true;
            // Fix: Enable inputs so they can be validated/focused
            specWidth.disabled = false;
            specHeight.disabled = false;
        } else {
            customSizeContainer.classList.add('hidden');
            specWidth.required = false;
            specHeight.required = false;
            // Fix: Disable inputs so browser ignores them during validation
            specWidth.disabled = true;
            specHeight.disabled = true;

            // Auto-fill for preview/logic if needed...
        }
    });
}
// --- Handle Unit Toggle ---
unitToggles.forEach(btn => {
    btn.addEventListener('click', () => {
        const newUnit = btn.dataset.unit;
        const oldUnit = specUnit.value;
        
        // If clicking the same unit, do nothing
        if (newUnit === oldUnit) return;

        // 1. Convert Values
        const w = parseFloat(specWidth.value);
        const h = parseFloat(specHeight.value);

        // Helper to remove trailing zeros after fixing to decimal
        const format = (num) => parseFloat(num.toFixed(3));

        if (!isNaN(w)) {
            if (oldUnit === 'in' && newUnit === 'mm') {
                specWidth.value = format(w * 25.4);
            } else if (oldUnit === 'mm' && newUnit === 'in') {
                specWidth.value = format(w / 25.4);
            }
        }

        if (!isNaN(h)) {
            if (oldUnit === 'in' && newUnit === 'mm') {
                specHeight.value = format(h * 25.4);
            } else if (oldUnit === 'mm' && newUnit === 'in') {
                specHeight.value = format(h / 25.4);
            }
        }

        // 2. Update State
        specUnit.value = newUnit;

        // 3. Update UI State
        unitToggles.forEach(b => {
            if (b.dataset.unit === newUnit) {
                b.classList.remove('text-gray-400', 'hover:text-white');
                b.classList.add('bg-indigo-600', 'text-white', 'font-medium');
            } else {
                b.classList.add('text-gray-400', 'hover:text-white');
                b.classList.remove('bg-indigo-600', 'text-white', 'font-medium');
            }
        });

        // 4. Update Labels
        unitLabels.forEach(l => l.textContent = newUnit);
    });
});

// --- Handle Project Type Selection ---
Array.from(projectTypeRadios).forEach(radio => {
    radio.addEventListener('change', (e) => {
        const val = e.target.value;

        // Reset/Update Binding Field (Hidden)
        specBinding.value = val === 'loose' ? '' : val;

        // Visibility Logic
        if (val === 'loose') {
            pageCountSection.classList.add('hidden');
            paperSection.classList.add('hidden');
            specPageCount.required = false;
            specPaper.required = false;
            specCoverPaper.required = false;
        } else if (val === 'saddleStitch') {
            pageCountSection.classList.remove('hidden');
            paperSection.classList.add('hidden');
            specPageCount.required = true;
            specPaper.required = false;
        } else if (val === 'perfectBound') {
            pageCountSection.classList.remove('hidden');
            paperSection.classList.remove('hidden');
            specPageCount.required = true;
            specPaper.required = true;
            specCoverPaper.required = true;
        }
    });
});

// --- Helper: Populate Specs Form ---
function populateSpecsForm() {
    // 1. Project Type / Binding
    let radioValue = '';
    if (projectSpecs.binding === 'loose') {
        radioValue = 'loose';
    } else if (projectSpecs.binding === 'saddleStitch') {
        radioValue = 'saddleStitch';
    } else if (projectSpecs.binding === 'perfectBound') {
        radioValue = 'perfectBound';
    }

    if (radioValue) {
        const radio = document.querySelector(`input[name="projectType"][value="${radioValue}"]`);
        if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change')); // Trigger visibility logic
        }
    }

    // 2. Dimensions
    if (projectSpecs.dimensions) {
        if (typeof projectSpecs.dimensions === 'object') {
            // Check if it matches a preset? Hard to check exact float matches.
            // Default to Custom for safety unless we want to reverse-lookup.
            // Or just set values.
            specSizePreset.value = 'custom';
            specSizePreset.dispatchEvent(new Event('change'));

            specWidth.value = projectSpecs.dimensions.width || '';
            specHeight.value = projectSpecs.dimensions.height || '';

            if (projectSpecs.dimensions.units) {
                const btn = document.querySelector(`.unit-toggle[data-unit="${projectSpecs.dimensions.units}"]`);
                if (btn) btn.click();
            }
        } else if (typeof projectSpecs.dimensions === 'string') {
             specSizePreset.value = projectSpecs.dimensions;
             specSizePreset.dispatchEvent(new Event('change'));
        }
    }

    // 3. Other Fields
    if (specPageCount) specPageCount.value = projectSpecs.pageCount || '';
    if (specPaper) specPaper.value = projectSpecs.paperType || '';
    if (specCoverPaper) specCoverPaper.value = projectSpecs.coverPaperType || '';
}

// --- Back Button Logic ---
if (navBackBtn) {
    navBackBtn.addEventListener('click', async () => {
        // Release Lock before leaving logic context
        await releaseLock();

        // Navigate back to proof or admin based on context
        if (isAdmin) {
            window.location.href = `admin_project.html?id=${projectId}`;
        } else {
            let url = `proof.html?id=${projectId}`;
            if (guestToken) url += `&guestToken=${guestToken}`;
            window.location.href = url;
        }
    });
}

// --- NEW: Reusable Control Builder ---
async function createCoverControls(inputId, fileOrUrl) {
    const container = document.getElementById(inputId)?.parentElement;
    if (!container) return;

    // Remove existing controls to prevent duplicates
    const existing = container.querySelectorAll('.custom-controls');
    existing.forEach(el => el.remove());

    // Default settings if missing
    if (!coverSettings[inputId]) {
        coverSettings[inputId] = { pageIndex: 1, scaleMode: 'fill' };
    }
    const currentSettings = coverSettings[inputId];

    const controls = document.createElement('div');
    controls.className = 'custom-controls mt-2 flex flex-col gap-2 z-20 relative';

    // 1. Page Selector (Only for PDF)
    let pdfSourceUrl;
    let isPDF = false;
    let localObjectURL; // For cleanup

    if (typeof fileOrUrl === 'string') {
        // Source is a remote URL (restored file)
        pdfSourceUrl = fileOrUrl;
        isPDF = pdfSourceUrl.toLowerCase().endsWith('.pdf') || true;
    } else if (fileOrUrl && fileOrUrl.type === 'application/pdf') {
        // Source is a local File object (new upload)
        pdfSourceUrl = URL.createObjectURL(fileOrUrl);
        localObjectURL = pdfSourceUrl;
        isPDF = true;
    }
    
    if (isPDF && pdfSourceUrl) {
        let docPromise;
        
        try {
            if (typeof fileOrUrl === 'string' && fileOrUrl.startsWith('http')) {
                // Remote PDF (Restored) - Use the Remote cache based on URL/Path
                docPromise = remotePdfDocCache.get(fileOrUrl) || pdfjsLib.getDocument(fileOrUrl).promise;
            } else {
                // Local PDF (New Upload)
                docPromise = pdfjsLib.getDocument(localObjectURL).promise;
            }

            const pdf = await docPromise;

            if (pdf.numPages > 1) {
                const pageCtrl = document.createElement('div');
                pageCtrl.className = "flex items-center justify-center gap-1 text-xs";
                pageCtrl.innerHTML = `
                     <button type="button" class="bg-slate-700 px-2 py-1 rounded hover:bg-indigo-600 text-white" id="prev-${inputId}"><</button>
                     <div class="flex items-center gap-1 bg-slate-800 rounded px-1 border border-slate-600">
                        <span class="text-gray-400 text-[10px]">Pg</span>
                        <input type="number" id="pg-input-${inputId}" value="${currentSettings.pageIndex}" min="1" max="${pdf.numPages}" 
                            class="w-8 bg-transparent text-center text-white font-mono focus:outline-none appearance-none text-xs py-1">
                        <span class="text-gray-400 text-[10px]">/ ${pdf.numPages}</span>
                     </div>
                     <button type="button" class="bg-slate-700 px-2 py-1 rounded hover:bg-indigo-600 text-white" id="next-${inputId}">></button>
                `;
                controls.appendChild(pageCtrl);

                // Bind Events
                setTimeout(() => {
                    const setPage = (val) => {
                        let newPg = parseInt(val);
                        if (isNaN(newPg) || newPg < 1) newPg = 1;
                        if (newPg > pdf.numPages) newPg = pdf.numPages;
                        
                        coverSettings[inputId].pageIndex = newPg;
                        const el = document.getElementById(`pg-input-${inputId}`);
                        if(el) el.value = newPg;
                        renderCoverPreview();
                        triggerAutosave();
                    };
                    
                    const inputEl = document.getElementById(`pg-input-${inputId}`);
                    if(inputEl) {
                        inputEl.onclick = (ev) => ev.stopPropagation();
                        inputEl.onchange = (ev) => setPage(ev.target.value);
                    }
                    const prevBtn = document.getElementById(`prev-${inputId}`);
                    if(prevBtn) prevBtn.onclick = (ev) => { ev.stopPropagation(); setPage(coverSettings[inputId].pageIndex - 1); };
                    
                    const nextBtn = document.getElementById(`next-${inputId}`);
                    if(nextBtn) nextBtn.onclick = (ev) => { ev.stopPropagation(); setPage(coverSettings[inputId].pageIndex + 1); };
                }, 0);
            }
            
            // Cleanup the temporary local blob URL
            if (localObjectURL) URL.revokeObjectURL(localObjectURL);
            
        } catch (e) { 
            console.warn("Error loading PDF for controls", e);
            if (localObjectURL) URL.revokeObjectURL(localObjectURL);
        }
    }

    // 2. Scale Buttons (Remains the same)
    const scaleCtrl = document.createElement('div');
    scaleCtrl.className = "flex justify-center gap-1 mt-1";
    ['fit', 'fill', 'stretch'].forEach(mode => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = currentSettings.scaleMode === mode;
        btn.className = `text-[10px] px-2 py-1 rounded border ${isActive ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-600 text-gray-400 hover:text-white'}`;
        btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
        
        btn.onclick = (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            coverSettings[inputId].scaleMode = mode;
            Array.from(scaleCtrl.children).forEach(b => b.className = 'text-[10px] px-2 py-1 rounded border bg-slate-800 border-slate-600 text-gray-400 hover:text-white');
            btn.className = 'text-[10px] px-2 py-1 rounded border bg-indigo-600 border-indigo-500 text-white';
            renderCoverPreview();
            triggerAutosave();
        };
        scaleCtrl.appendChild(btn);
    });
    controls.appendChild(scaleCtrl);
    
    container.appendChild(controls);
}

// --- UPDATED: updateFileName ---
function updateFileName(inputId, displayId) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    if (!input) return;

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];

        // Clear existing controls
        const existingControls = input.parentElement.querySelectorAll('.custom-controls');
        existingControls.forEach(el => el.remove());

        if (file) {
            if (display) display.textContent = file.name;
            selectedFiles[inputId] = file; 

            const supportedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
            const isPDF = file.type === 'application/pdf';
            const isSupportedImage = supportedImages.includes(file.type);
            const isPsd = file.name.toLowerCase().endsWith('.psd');
            const isLocal = (isPDF || isSupportedImage) && !isPsd;

            // Reset settings for new file
            coverSettings[inputId] = { pageIndex: 1, scaleMode: 'fill' };

            if (!isLocal) {
                processCoverFile(file, inputId);
            } else {
                coverSources[inputId] = { 
                    file: file, 
                    status: 'ready', 
                    isServer: false 
                };
            }

            // Generate Controls (using the new reusable function)
            await createCoverControls(inputId, file);

            if (isLocal) renderCoverPreview();
            triggerAutosave(); // Trigger save on new file

        } else {
            if (display) display.textContent = '';
            delete selectedFiles[inputId];
            delete coverSources[inputId]; 
            renderCoverPreview();
            triggerAutosave();
        }
        validateForm();
    });
}

async function drawStretched(ctx, sourceEntry, targetZone, totalZone, anchor, pageIndex = 1) {
    if (!sourceEntry) return;

    const status = sourceEntry.status || 'ready';
    if (status === 'processing' || status === 'uploading') {
        drawProcessingState(ctx, targetZone.x, targetZone.y, targetZone.w, targetZone.h);
        return;
    }
    if (status === 'error') {
        ctx.fillStyle = '#fee2e2';
        ctx.fillRect(targetZone.x, targetZone.y, targetZone.w, targetZone.h);
        return;
    }

    const isServer = sourceEntry.isServer;
    // CRITICAL: File is null for server files to prevent accessing stale local properties
    const file = isServer ? null : sourceEntry.file; 
    
    // Use stable path for caching
    const fileKey = isServer ? (sourceEntry.storagePath || sourceEntry.previewUrl || 'server_url') : (file ? file.name : 'unknown_file');
    const timestamp = (file && file.lastModified) ? file.lastModified : 'server_timestamp';
    const cacheKey = `${fileKey}_${pageIndex}_${timestamp}_stretched`;

    let imgBitmap;

    try {
        imgBitmap = await fetchBitmapWithCache(cacheKey, async () => {
            if (isServer) {
                if (!sourceEntry.previewUrl) return null;

                // 1. Use Remote Document Caching
                let pdfDocPromise = remotePdfDocCache.get(fileKey);
                if (!pdfDocPromise) {
                    const loadingTask = pdfjsLib.getDocument(sourceEntry.previewUrl);
                    pdfDocPromise = loadingTask.promise;
                    remotePdfDocCache.set(fileKey, pdfDocPromise);
                }
                const pdf = await pdfDocPromise;

                // 2. Render
                const page = await pdf.getPage(pageIndex);
                const viewport = page.getViewport({ scale: 1.5 }); // Good quality for covers
                const cvs = document.createElement('canvas');
                cvs.width = viewport.width;
                cvs.height = viewport.height;
                await page.render({ canvasContext: cvs.getContext('2d'), viewport }).promise;
                return createImageBitmap(cvs);

            } else if (file && file.type === 'application/pdf') {
                // Local PDF: Use ArrayBuffer + pdfDocCache
                let pdfDoc = pdfDocCache.get(file);
                if (!pdfDoc) {
                    const arrayBuffer = await file.arrayBuffer();
                    pdfDoc = pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    pdfDocCache.set(file, pdfDoc);
                }
                const pdf = await pdfDoc;
                const page = await pdf.getPage(pageIndex);
                const viewport = page.getViewport({ scale: 1.5 });
                const cvs = document.createElement('canvas');
                cvs.width = viewport.width; cvs.height = viewport.height;
                await page.render({ canvasContext: cvs.getContext('2d'), viewport }).promise;
                return createImageBitmap(cvs);

            } else if (file && file.type.startsWith('image/')) {
                return createImageBitmap(file);
            }
            return null;
        });
    } catch (e) { 
        console.error("drawStretched load error:", e);
        return; 
    }

    if (!imgBitmap) return;

    // --- Draw Logic ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(targetZone.x, targetZone.y, targetZone.w, targetZone.h);
    ctx.clip();

    const imgW = imgBitmap.width;
    const imgH = imgBitmap.height;

    // Scale to fill TOTAL zone (Spine + Front/Back)
    let scale = totalZone.h / imgH; 
    if (imgW * scale < totalZone.w) {
        scale = totalZone.w / imgW;
    }

    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawY = totalZone.y + (totalZone.h - drawH) / 2;

    let drawX;
    if (anchor === 'right') {
        // Align to the RIGHT edge of the total zone
        const totalRight = totalZone.x + totalZone.w;
        drawX = totalRight - drawW;
    } else {
        // Align to the LEFT edge of the total zone
        drawX = totalZone.x;
    }

    ctx.drawImage(imgBitmap, 0, 0, imgW, imgH, drawX, drawY, drawW, drawH);
    ctx.restore();
}

// --- Helper: Setup Drag and Drop (Generic) ---
function setupDropZone(inputId) {
    const input = document.getElementById(inputId);
    if(!input) return;
    const dropZone = input.closest('.drop-zone');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.classList.add('dragover');
        dropZone.classList.add('border-indigo-500');
    }

    function unhighlight(e) {
        dropZone.classList.remove('dragover');
        dropZone.classList.remove('border-indigo-500');
    }

    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        input.files = files;
        input.dispatchEvent(new Event('change'));
    }
}

function validateForm() {
    let isValid = false;
    // Check if we have pages in the virtual book
    if (pages.length > 0) {
        isValid = true;
    }

    // Also consider cover files if booklet
    if (projectType === 'booklet') {
         // Check if either pages OR a full cover exists
         if (pages.length === 0) {
             // If no pages, require cover components
             if (selectedFiles['file-cover-front'] && selectedFiles['file-cover-back']) {
                 isValid = true;
             } else {
                 isValid = false;
             }
         }
    }

    if (isValid) {
        submitButton.disabled = false;
        submitButton.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        submitButton.disabled = true;
        submitButton.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

// --- Tabs Logic ---
if (tabInterior && tabCover) {
    tabInterior.addEventListener('click', () => {
        tabInterior.classList.add('text-indigo-400', 'border-indigo-500');
        tabInterior.classList.remove('text-gray-400', 'hover:text-gray-200');
        tabCover.classList.add('text-gray-400', 'hover:text-gray-200');
        tabCover.classList.remove('text-indigo-400', 'border-indigo-500');

        contentInterior.classList.remove('hidden');
        contentCover.classList.add('hidden');
    });

    tabCover.addEventListener('click', () => {
            // ... (Existing UI toggles for classes) ...
            tabCover.classList.add('text-indigo-400', 'border-indigo-500');
            tabCover.classList.remove('text-gray-400', 'hover:text-gray-200');
            tabInterior.classList.add('text-gray-400', 'hover:text-gray-200');
            tabInterior.classList.remove('text-indigo-400', 'border-indigo-500');

            contentCover.classList.remove('hidden');
            contentInterior.classList.add('hidden');

            // --- NEW AUTO-FIT LOGIC ---
            if (!hasFitCover) {
                // Slight delay to let the DOM layout update (remove 'hidden') before measuring
                setTimeout(() => {
                    fitCoverToView();
                    hasFitCover = true;
                }, 10);
            } else {
                renderCoverPreview();
            }
        });
}


// --- Data Model Logic ---

async function addInteriorFiles(files, isSpreadUpload = false, insertAtIndex = null) {
    const newPages = [];

    for (const file of Array.from(files)) {
        const sourceId = Date.now() + Math.random().toString(16).slice(2);

        // --- FIX: Strict Check for Browser-Supported Types ---
        const supportedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
        const isPDF = file.type === 'application/pdf';
        const isSupportedImage = supportedImages.includes(file.type);
        
        // Fallback: Check extension if mime type is generic or missing
        const isPsd = file.name.toLowerCase().endsWith('.psd');
        
        // Only treat as local if it's a PDF or a supported web image (and NOT a PSD)
        const isLocal = (isPDF || isSupportedImage) && !isPsd;

        if (isLocal) {
            sourceFiles[sourceId] = file;

            let numPages = 1;
            if (file.type === 'application/pdf') {
                 try {
                    const fileUrl = URL.createObjectURL(file);
                    const pdf = await pdfjsLib.getDocument(fileUrl).promise;
                    numPages = pdf.numPages;
                    // For caching/performance, we don't revoke immediately here in the loop
                 } catch (e) {
                     console.warn("Could not parse PDF", e);
                 }
            }

            addPagesToModel(newPages, sourceId, numPages, isSpreadUpload);

        } else {
            // SERVER SIDE PROCESSING (PSD, AI)
            sourceFiles[sourceId] = { 
                file: file, 
                status: 'uploading', 
                previewUrl: null,
                isServer: true // Explicitly flag as server source
            }; 

            addPagesToModel(newPages, sourceId, 1, isSpreadUpload);

            // Start Background Process
            processServerFile(file, sourceId);
        }
    }

    if (insertAtIndex !== null && insertAtIndex >= 0 && insertAtIndex <= pages.length) {
        pages.splice(insertAtIndex, 0, ...newPages);
    } else {
        pages.push(...newPages);
    }
    saveState();
    renderBookViewer();
    renderMinimap();
    triggerAutosave();
}

function addPagesToModel(targetArray, sourceId, numPages, isSpreadUpload) {
    if (isSpreadUpload) {
        for (let i = 0; i < numPages; i++) {
            targetArray.push({
                id: `${sourceId}_p${i}_L`,
                sourceFileId: sourceId,
                pageIndex: i + 1,
                // Initial PanX: 0.5 to align Left Half of image (center of image to center of Left Page)
                // If image is 2x wide, center is at x=1. Left Page center is x=0.5. Shift +0.5?
                // Wait, logic derived in thought: panX=0.5 shifts image RIGHT.
                settings: { scaleMode: 'fill', alignment: 'center', view: 'left', panX: 0.5, panY: 0 },
                isSpread: false
            });
            targetArray.push({
                id: `${sourceId}_p${i}_R`,
                sourceFileId: sourceId,
                pageIndex: i + 1,
                // Initial PanX: -0.5 to align Right Half of image
                settings: { scaleMode: 'fill', alignment: 'center', view: 'right', panX: -0.5, panY: 0 },
                isSpread: false
            });
        }
    } else {
        for (let i = 0; i < numPages; i++) {
            targetArray.push({
                id: `${sourceId}_p${i}`,
                sourceFileId: sourceId,
                pageIndex: i + 1,
                settings: { scaleMode: 'fit', alignment: 'center', panX: 0, panY: 0 },
                isSpread: false
            });
        }
    }
    renderBookViewer();
    triggerAutosave();
}

async function processCoverFile(file, slotId) {
    try {
        // 1. Set Initial State (Uploading)
        coverSources[slotId] = { 
            file: file, 
            status: 'uploading', 
            isServer: true 
        };
        renderCoverPreview(); 

        const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
        const tempId = Date.now().toString();
        const storagePath = `temp_uploads/${userId}/${tempId}/${file.name}`;
        const storageRef = ref(storage, storagePath);
        
        await uploadBytesResumable(storageRef, file);

        // 2. Update State (Processing)
        coverSources[slotId].status = 'processing';
        renderCoverPreview();

        const generatePreviews = httpsCallable(functions, 'generatePreviews');
        const result = await generatePreviews({
            filePath: storagePath,
            originalName: file.name
        });

        if (result.data && result.data.pages && result.data.pages.length > 0) {
            const firstPage = result.data.pages[0];
            const previewRef = ref(storage, firstPage.tempPreviewPath);
            const previewUrl = await getDownloadURL(previewRef);

            coverSources[slotId] = {
                file: file,
                status: 'ready',
                previewUrl: previewUrl,
                isServer: true
            };
            
            renderCoverPreview();
        } else {
            throw new Error("No preview generated");
        }

    } catch (err) {
        console.error("Cover processing failed", err);
        coverSources[slotId] = { 
            file: file, 
            status: 'error', 
            error: err.message,
            isServer: true 
        };
        renderCoverPreview();
    }
}

async function processServerFile(file, sourceId) {
    try {
        const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
        const tempId = Date.now().toString();
        const storagePath = `temp_uploads/${userId}/${tempId}/${file.name}`;
        const storageRef = ref(storage, storagePath);

        // --- FIX: Update UI with Spinner AND Text ---
        const updateStatus = (msg) => {
            if(sourceFiles[sourceId]) sourceFiles[sourceId].status = 'processing';
            
            const relatedPages = pages.filter(p => p.sourceFileId === sourceId);
            relatedPages.forEach(p => {
                const placeholder = document.getElementById(`placeholder-${p.id}`);
                if (placeholder) {
                    // Re-inject the spinner with the new message
                    placeholder.innerHTML = `
                        <div class="flex flex-col items-center gap-3">
                            <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                            <p class="text-xs text-indigo-600 font-bold tracking-wide uppercase animate-pulse">${msg}</p>
                        </div>
                    `;
                }
            });
        };

        updateStatus("Uploading...");
        await uploadBytesResumable(storageRef, file);

        updateStatus("Processing...");

        const generatePreviews = httpsCallable(functions, 'generatePreviews');
        const result = await generatePreviews({
            filePath: storagePath,
            originalName: file.name
        });

        if (result.data && result.data.pages && result.data.pages.length > 0) {
            const firstPage = result.data.pages[0];
            const previewRef = ref(storage, firstPage.tempPreviewPath);
            const previewUrl = await getDownloadURL(previewRef);

            sourceFiles[sourceId] = {
                file: file,
                status: 'ready',
                previewUrl: previewUrl,
                isServer: true
            };
            
            imageCache.delete(sourceId + '_1_' + file.lastModified);
            renderBookViewer();
        } else {
            throw new Error("No preview generated");
        }

    } catch (err) {
        console.error("Server file processing failed", err);
        sourceFiles[sourceId] = { file: file, status: 'error', error: err.message };
        renderBookViewer();
    }
}

window.updatePageSetting = (pageId, setting, value) => {
    const page = pages.find(p => p.id === pageId);
    if (page) {
        if(setting === 'scaleMode' || setting === 'isSpread') saveState();
        page.settings[setting] = value;

        // If changing spread mode, we need to re-render the whole viewer to adjust grid
        if (setting === 'isSpread') {
             renderBookViewer();
             return;
        }

        // If changing scaleMode, update button states visually
        if (setting === 'scaleMode') {
            const card = document.querySelector(`[data-id="${pageId}"]`);
            if (card) {
                const btns = card.querySelectorAll('.scale-mode-btn'); // Added class to creation logic below
                // Actually we used inline creation, let's update the query or classes.
                // The creation logic uses:
                // btn.onclick = () => updatePageSetting(page.id, 'scaleMode', mode.id);

                // We need to find the buttons. They are in settingsOverlay.
                // Let's query buttons inside the card that correspond to modes.
                // We didn't add a specific class to them in createPageCard previously,
                // just 'p-1.5 rounded border ...'.

                // Let's rely on the `title` attribute or similar since we don't want to break existing DOM.
                // Or better, let's update createPageCard to add a data-mode attribute.
                // But I can't change createPageCard here easily without a huge diff.

                // Let's query buttons and check their title/icon? No.
                // Let's assume the order: fit, fill, stretch.
                const buttons = card.querySelectorAll('button[title]');
                buttons.forEach(btn => {
                    const modeId = btn.title.toLowerCase().includes('fit') ? 'fit' :
                                   btn.title.toLowerCase().includes('fill') ? 'fill' :
                                   btn.title.toLowerCase().includes('stretch') ? 'stretch' : null;

                    if (modeId) {
                        if (modeId === value) {
                            // Active Style
                            btn.className = 'p-1.5 rounded border bg-indigo-600 border-indigo-500 text-white';
                        } else {
                            // Inactive Style
                            btn.className = 'p-1.5 rounded border bg-slate-800/80 border-slate-600 text-gray-400 hover:bg-slate-700 hover:text-white';
                        }
                    }
                });
            }
        }

        const canvas = document.getElementById(`canvas-${pageId}`);
        if (canvas) renderPageCanvas(page, canvas);
    }
    // TRIGGER AUTOSAVE
    triggerAutosave();
};

window.deletePage = (pageId) => {
    saveState();
    pages = pages.filter(p => p.id !== pageId);
    imageCache.delete(pageId); 
    renderBookViewer();
    renderMinimap();
    triggerAutosave();
};

// --- Book Viewer Rendering ---

function renderBookViewer() {
    const container = document.getElementById('book-viewer-container');
    if (!container) return;

    // CLEAR QUEUE: Stop processing old pages if we are re-rendering
    renderQueue.length = 0; 

    container.innerHTML = ''; // Clear DOM

    // Dimensions for layout
    const width = projectSpecs.dimensions.width;
    const height = projectSpecs.dimensions.height;
    const bleed = 0.125;
    const visualScale = (250 * viewerScale) / ((width + bleed * 2) * 96);
    const pixelsPerInch = 96 * visualScale;

    // Helper to run the render via the Queue
    const runPageRender = (page, canvas) => {
        if (!page || !canvas) return Promise.resolve(true);

        // Check if this specific render is already cached to skip the queue
        // This makes scrolling back up instant
        const sourceEntry = sourceFiles[page.sourceFileId];
        if(sourceEntry) {
             const isServer = sourceEntry.isServer;
             const file = isServer ? null : sourceEntry.file; 
             const fileKey = isServer ? (sourceEntry.storagePath || sourceEntry.previewUrl) : (file ? file.name : 'unknown');
             const timestamp = (file && file.lastModified) ? file.lastModified : 'server';
             // Match key format in drawFileWithTransform
             const cacheKey = `${fileKey}_${page.pageIndex || 1}_${timestamp}_full`; 
             
             // If cached, run immediately (don't wait in queue)
             if(imageCache.has(cacheKey)) {
                 return renderPageCanvas(page, canvas).catch(e => true);
             }
        }

        // Otherwise, add to queue
        return enqueueRender(() => renderPageCanvas(page, canvas))
            .catch(err => {
                console.error(`Page ${page?.id} Render Failed:`, err);
                return true;
            });
    };

    const removePlaceholder = (id) => {
        const ph = document.getElementById(`placeholder-${id}`);
        if (ph) {
            ph.style.opacity = '0';
            setTimeout(() => ph.remove(), 300);
        }
    };

    const observer = new IntersectionObserver((entries, obs) => {
        // Sort entries by DOM order to ensure Top-to-Bottom loading priority
        const sortedEntries = entries.sort((a, b) => {
            return a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        sortedEntries.forEach(entry => {
            if (entry.isIntersecting) {
                const card = entry.target;
                const cardId = card.dataset.id;
                obs.unobserve(card); // Unobserve immediately

                if (cardId.startsWith('spread:')) {
                    // Spread pages
                    const parts = cardId.split(':');
                    const id1 = parts[1]; // Left Page ID
                    const id2 = parts[2]; // Right Page ID
                    const page1 = pages.find(p => p.id === id1);
                    const page2 = pages.find(p => p.id === id2);
                    const canvas1 = document.getElementById(`canvas-${id1}`);
                    const canvas2 = document.getElementById(`canvas-${id2}`);

                    // Render Left then Right, but queued
                    Promise.all([
                        runPageRender(page1, canvas1),
                        runPageRender(page2, canvas2)
                    ]).finally(() => {
                        removePlaceholder(id1);
                        removePlaceholder(id2);
                    });

                } else {
                    // Single page
                    const canvas = document.getElementById(`canvas-${cardId}`);
                    const page = pages.find(p => p.id === cardId);

                    if (canvas && page) {
                        runPageRender(page, canvas).finally(() => {
                            removePlaceholder(cardId);
                        });
                    }
                }
            }
        });
    }, { root: container.parentElement, rootMargin: '200px' });

    // --- LOOSE SHEETS / SINGLE LAYOUT ---
    if (projectType === 'single') {
        container.className = "flex flex-wrap gap-8 items-start justify-center p-6";

        const slots = [
            { label: "Front Side", index: 0 },
            { label: "Back Side", index: 1 }
        ];

        slots.forEach(slot => {
            const slotContainer = document.createElement('div');
            slotContainer.className = "flex flex-col items-center gap-2";
            slotContainer.innerHTML = `<h3 class="text-indigo-200 text-xs font-bold uppercase tracking-widest">${slot.label}</h3>`;

            const page = pages[slot.index];

            let content;
            if (page) {
                content = createPageCard(page, slot.index, false, false, width, height, bleed, pixelsPerInch, observer);
            } else {
                content = document.createElement('div');
                content.className = "relative border-2 border-dashed border-slate-600 rounded-lg bg-slate-800/30 hover:bg-slate-800/60 hover:border-indigo-500 transition-all cursor-pointer group flex flex-col items-center justify-center";
                const wPx = (width + (bleed * 2)) * pixelsPerInch;
                const hPx = (height + (bleed * 2)) * pixelsPerInch;
                content.style.width = `${wPx}px`;
                content.style.height = `${hPx}px`;

                content.innerHTML = `
                    <div class="text-center p-4">
                         <svg class="w-8 h-8 text-gray-500 group-hover:text-indigo-400 mb-2 mx-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        <span class="text-xs text-gray-400 group-hover:text-white">Add File</span>
                    </div>
                `;
                content.onclick = () => {
                    window._insertIndex = slot.index;
                    hiddenInteriorInput.click();
                };
                content.addEventListener('dragover', (e) => { e.preventDefault(); content.classList.add('border-indigo-400', 'bg-slate-700'); });
                content.addEventListener('dragleave', (e) => { e.preventDefault(); content.classList.remove('border-indigo-400', 'bg-slate-700'); });
                content.addEventListener('drop', (e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files.length > 0) {
                        addInteriorFiles(e.dataTransfer.files, false, slot.index);
                    }
                });
            }
            slotContainer.appendChild(content);
            container.appendChild(slotContainer);
        });
        validateForm();
        return;
    }

    // --- BOOKLET LAYOUT ---
    if (pages.length === 0) {
         container.appendChild(createInsertBar(0));
         const empty = document.createElement('div');
         empty.className = "flex flex-col items-center justify-center h-32 text-gray-500";
         empty.innerHTML = "<p>Drag files or use the arrows to add pages.</p>";
         container.appendChild(empty);
         return;
    }

    container.appendChild(createInsertBar(0));

    const firstSpread = document.createElement('div');
    firstSpread.className = "spread-row flex justify-center items-end gap-0 mb-4 min-h-[100px] p-2 border border-transparent hover:border-dashed hover:border-gray-600 rounded";
    const spacer = document.createElement('div');
    spacer.style.width = `${width * pixelsPerInch}px`;
    spacer.className = "pointer-events-none";
    firstSpread.appendChild(spacer);

    if (pages[0]) {
        firstSpread.appendChild(createPageCard(pages[0], 0, true, false, width, height, bleed, pixelsPerInch, observer));
    }
    container.appendChild(firstSpread);

    let i = 1;
    while (i < pages.length) {
        container.appendChild(createInsertBar(i));
        const spreadDiv = document.createElement('div');
        spreadDiv.className = "spread-row flex justify-center items-end gap-0 mb-4 min-h-[100px] p-2 border border-transparent hover:border-dashed hover:border-gray-600 rounded";

        const isLeft = pages[i];
        const isRight = pages[i+1];
        let isLinkedSpread = false;
        if (isLeft && isRight && isLeft.sourceFileId && isLeft.sourceFileId === isRight.sourceFileId) {
            if (isLeft.id.endsWith('_L') && isRight.id.endsWith('_R')) {
                isLinkedSpread = true;
            }
        }

        if (isLinkedSpread) {
            const spreadCard = createSpreadCard(isLeft, isRight, i, width, height, bleed, pixelsPerInch, observer);
            spreadDiv.appendChild(spreadCard);
            i += 2;
        } else {
            let leftCard = null;
            if (pages[i]) {
                leftCard = createPageCard(pages[i], i, false, false, width, height, bleed, pixelsPerInch, observer);
                spreadDiv.appendChild(leftCard);
            }
            let rightCard = null;
            if (i + 1 < pages.length) {
                rightCard = createPageCard(pages[i+1], i+1, true, false, width, height, bleed, pixelsPerInch, observer);
                spreadDiv.appendChild(rightCard);
            }
            if (leftCard) leftCard.style.flexShrink = '0';
            if (rightCard) rightCard.style.flexShrink = '0';
            if (!rightCard) {
                 const endSpacer = document.createElement('div');
                 endSpacer.style.width = `${width * pixelsPerInch}px`;
                 endSpacer.className = "pointer-events-none";
                 spreadDiv.appendChild(endSpacer);
            }
            i += 2;
        }
        container.appendChild(spreadDiv);
    }

    container.appendChild(createInsertBar(pages.length));
    validateForm();

    const spreadDivs = container.querySelectorAll('.spread-row');
    spreadDivs.forEach(spreadDiv => {
        new Sortable(spreadDiv, {
            group: { name: 'shared-spreads', pull: true, put: true },
            animation: 150,
            draggable: '.page-card',
            handle: '.drag-handle',
            forceFallback: true,
            fallbackOnBody: true,
            swapThreshold: 0.65,
            ghostClass: 'opacity-50',
            onEnd: (evt) => {
                try {
                    saveState();
                    const allCards = document.querySelectorAll('.page-card');
                    const newOrderIds = Array.from(allCards).map(c => c.dataset.id);
                    const newPages = [];
                    newOrderIds.forEach(id => {
                        if (id.startsWith('spread:')) {
                            const parts = id.split(':');
                            if (parts.length === 3) {
                                const p1 = pages.find(x => x.id === parts[1]);
                                const p2 = pages.find(x => x.id === parts[2]);
                                if (p1) newPages.push(p1);
                                if (p2) newPages.push(p2);
                            }
                        } else {
                            const p = pages.find(x => x.id === id);
                            if (p) newPages.push(p);
                        }
                    });
                    pages = newPages;
                    setTimeout(() => { requestAnimationFrame(() => renderBookViewer()); }, 50);
                    renderMinimap();
                } catch (err) { console.error("Error during drag reorder:", err); }
                triggerAutosave();
            }
        });
    });
}

async function renderMinimap() {
    const container = document.getElementById('minimap-container');
    if (!container || projectType === 'single') {
        if (container) container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    
    // 1. Diffing Strategy: Only rebuild if page count changed to prevent flickering
    // For now, we will clear to ensure correctness, but ideally we diff.
    container.innerHTML = '';

    // 2. Observer Definition
    const thumbObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const wrapper = entry.target;
                const canvas = wrapper.querySelector('canvas');
                
                // Extract data from dataset
                const indices = JSON.parse(wrapper.dataset.indices);
                // Re-find pages (in case global 'pages' array shifted)
                const pageList = indices.map(i => pages[i]).filter(p => p);

                if (canvas && pageList.length > 0) {
                    // Trigger Render
                    populateMinimapCanvas(canvas.getContext('2d'), pageList, 150, 100)
                        .catch(e => console.warn("Thumb render error", e));
                }
                
                // Stop observing this element (it's loaded/loading)
                obs.unobserve(wrapper);
            }
        });
    }, { root: container, rootMargin: '50% 0px' }); // Preload 50% height ahead

    // 3. Helper to create DOM elements
    const createThumbDOM = (pageList, label) => {
        const wrapper = document.createElement('div');
        wrapper.className = "w-full aspect-[3/2] bg-slate-800 rounded cursor-pointer border border-transparent hover:border-indigo-500 transition-all relative overflow-hidden mb-2";
        
        // Store indices 
        const indices = pageList.map(p => pages.indexOf(p));
        wrapper.dataset.indices = JSON.stringify(indices);

        // Click Handler
        const targetPageId = pageList[0].id;
        wrapper.onclick = () => {
            let el = document.querySelector(`[data-id="${targetPageId}"]`);
            if (!el) el = document.querySelector(`[data-id*=":${targetPageId}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-indigo-500');
                setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500'), 1500);
            }
        };

        const canvas = document.createElement('canvas');
        canvas.width = 150; canvas.height = 100;
        canvas.className = "w-full h-full object-contain";
        // Assign ID for the "Push" update from main viewer
        const compositeId = pageList.map(p => p.id).join('_');
        canvas.id = `thumb-canvas-${compositeId}`;

        // Draw Base
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, 150, 100);

        const textDiv = document.createElement('div');
        textDiv.className = "absolute bottom-1 right-1 bg-black/50 text-[10px] px-1 rounded text-white";
        textDiv.textContent = label;

        wrapper.appendChild(canvas);
        wrapper.appendChild(textDiv);
        container.appendChild(wrapper);

        thumbObserver.observe(wrapper);
    };

    // 4. Spawn Loop
    if (pages.length > 0) createThumbDOM([pages[0]], "P1");

    let i = 1;
    while(i < pages.length) {
        const p1 = pages[i];
        const p2 = pages[i+1];
        const label = p2 ? `P${i+1}-${i+2}` : `P${i+1}`;
        const list = p2 ? [p1, p2] : [p1];
        createThumbDOM(list, label);
        i += 2;
    }
}

async function populateMinimapCanvas(ctx, pageList, w, h) {
    const margin = 5;
    const pageW = (w - (margin*3)) / 2;
    const pageH = h - (margin*2);
    const leftX = margin;
    const rightX = margin + pageW + margin;
    const topY = margin;

    // Helper
    const drawPage = async (page, x, y) => {
        ctx.fillStyle = '#ffffff'; 
        ctx.fillRect(x, y, pageW, pageH);

        if (!page || !page.sourceFileId) return;
        const sourceEntry = sourceFiles[page.sourceFileId];
        if (!sourceEntry) return;

        // Force low-res render (0.25) via the queue system
        // We use enqueueRender to ensure we don't clog the main thread,
        // but we rely on browser cache to make it fast.
        await drawFileWithTransform(
            ctx, sourceEntry, x, y, pageW, pageH,
            page.settings.scaleMode || 'fit',
            page.settings.alignment || 'center',
            page.pageIndex || 1,
            page.id,
            'full', 
            0, 0, // Pan X/Y
            0.25 // Force Scale
        );
    };

    // Layout Logic
    // Check if the first page in list is actually Page 1 (Right Only)
    const isFirstPage = (pages.indexOf(pageList[0]) === 0);

    if (isFirstPage) {
        await drawPage(pageList[0], rightX, topY);
    } else {
        if (pageList[0]) await drawPage(pageList[0], leftX, topY);
        if (pageList.length > 1 && pageList[1]) await drawPage(pageList[1], rightX, topY);
    }
}

// --- NEW HELPER: Sync Main View to Thumbnail ---
function updateThumbnailFromMain(page) {
    // 1. Find the thumbnail canvas
    // It might be a single ID or a composite spread ID.
    // We search for any canvas ID containing the page ID.
    const thumbCanvas = document.querySelector(`canvas[id*="thumb-canvas-"][id*="${page.id}"]`);
    if (!thumbCanvas) return;

    const ctx = thumbCanvas.getContext('2d');
    const w = thumbCanvas.width;
    const h = thumbCanvas.height;
    
    const margin = 5;
    const pageW = (w - (margin*3)) / 2;
    const pageH = h - (margin*2);
    const leftX = margin;
    const rightX = margin + pageW + margin;
    const topY = margin;

    // 2. Determine position on thumbnail
    // If page index is 1 (first page), it's always on the Right
    let x = leftX;
    if (page.pageIndex === 1) {
        x = rightX;
    } else {
        // Even index in array = Left, Odd = Right? 
        // Actually, rely on the ID structure or page logic.
        // Simplified: If it's the first ID in the spread string, it's Left.
        if (thumbCanvas.id.includes(`${page.id}_`)) x = leftX; // Start of ID
        else if (thumbCanvas.id.includes(`_${page.id}`)) x = rightX; // End of ID
        
        // Fallback for P1 which might be singular
        if (pages.indexOf(page) === 0) x = rightX;
    }

    // 3. Draw the Full Res Cache onto the Thumbnail
    const sourceEntry = sourceFiles[page.sourceFileId];
    if (!sourceEntry) return;

    drawFileWithTransform(
        ctx, sourceEntry, x, topY, pageW, pageH,
        page.settings.scaleMode || 'fit',
        page.settings.alignment || 'center',
        page.pageIndex || 1,
        page.id,
        'full', 
        page.settings.panX || 0, 
        page.settings.panY || 0,
        0.25 // Request scale
    ).then(() => {
        // Optional: Flash/Highlight thumbnail to show it updated?
    });
}

// Renamed from addMinimapItem to clearly signal it only creates the element.
async function createMinimapItem(pageList, mainIndex, label) {
    const wrapper = document.createElement('div');
    wrapper.className = "w-full aspect-[3/2] bg-slate-800 rounded cursor-pointer border border-transparent hover:border-indigo-500 transition-all relative overflow-hidden";

    const targetPageId = pageList[0]?.id;
    if (targetPageId) {
        wrapper.onclick = () => {
            const el = document.querySelector(`[data-id="${targetPageId}"]`) || document.querySelector(`[data-id^="spread:${targetPageId}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-indigo-500');
                setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500'), 1500);
            }
        };
    }

    const canvas = document.createElement('canvas');
    const w = 150;
    const h = 100;
    canvas.width = w;
    canvas.height = h;
    canvas.className = "w-full h-full object-contain";
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    const margin = 5;
    const pageW = (w - (margin*3)) / 2;
    const pageH = h - (margin*2);
    const leftX = margin;
    const rightX = margin + pageW + margin;
    const topY = margin;

    const drawThumbPage = async (page, x, y, w, h) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);

        if (!page || !page.sourceFileId) return;
        const sourceEntry = sourceFiles[page.sourceFileId];
        if (!sourceEntry) return;

        await drawFileWithTransform(
            ctx, sourceEntry, x, y, w, h,
            page.settings.scaleMode || 'fit',
            page.settings.alignment || 'center',
            page.pageIndex || 1,
            page.id,
            'full',
            page.settings.panX || 0,
            page.settings.panY || 0,
            0.25 // <--- NEW: Force low resolution for speed
        );
    };

    // FIX: Use Promise.all to render both sides simultaneously
    const renderPromises = [];

    if (pageList.length === 1 && mainIndex === 0) {
        // First page (Right)
        renderPromises.push(drawThumbPage(pageList[0], rightX, topY, pageW, pageH));
    } else if (pageList.length >= 1) {
        // Left Page
        renderPromises.push(drawThumbPage(pageList[0], leftX, topY, pageW, pageH));
        // Right Page
        if (pageList[1]) {
            renderPromises.push(drawThumbPage(pageList[1], rightX, topY, pageW, pageH));
        }
    }

    // Wait for both to finish concurrently
    await Promise.all(renderPromises);

    // Add label
    const textDiv = document.createElement('div');
    textDiv.className = "absolute bottom-1 right-1 bg-black/50 text-[10px] px-1 rounded text-white";
    textDiv.textContent = label;

    wrapper.appendChild(canvas);
    wrapper.appendChild(textDiv);
    
    return wrapper; 
}

// Global Pointer Event Handlers for Panning
let activePageId = null;
let partnerPageId = null;
let isDragging = false;
let startX = 0;
let startY = 0;
let startPanX = 0;
let startPanY = 0;
let partnerStartPanX = 0;
let partnerStartPanY = 0;
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // Only re-render if the logic requires dimension recalculations
        // Usually, CSS handles fluid width, but we might need to recalc fitCoverToView
        if (tabCover && !tabCover.classList.contains('text-gray-400')) {
            fitCoverToView();
        }
        // If you want to re-render viewer on resize (e.g. to adjust resolution)
        // renderBookViewer(); 
    }, 200);
});

document.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;

    // Only allow panning if target is canvas (Image)
    if (e.target.tagName.toLowerCase() !== 'canvas') return;

    // Resolve the actual page ID from the Canvas element ID
    // because card.dataset.id might be a composite spread ID (e.g. spread:p1:p2)
    const clickedPageId = e.target.id.replace('canvas-', '');
    const page = pages.find(p => p.id === clickedPageId);

    // Only allow panning if scaleMode is 'fill'
    if (page && page.settings.scaleMode === 'fill') {
        saveState(); // <--- Add this line to enable Undo

        activePageId = clickedPageId;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startPanX = page.settings.panX || 0;
        startPanY = page.settings.panY || 0;

        // Identify Partner Page immediately
        partnerPageId = null;
        if (activePageId.endsWith('_L') || activePageId.endsWith('_R')) {
            const isLeft = activePageId.endsWith('_L');
            const pId = isLeft
                ? activePageId.slice(0, -2) + '_R'
                : activePageId.slice(0, -2) + '_L';

            const partnerPage = pages.find(p => p.id === pId);
            if (partnerPage && partnerPage.sourceFileId === page.sourceFileId) {
                partnerPageId = pId;
                partnerStartPanX = partnerPage.settings.panX || 0;
                partnerStartPanY = partnerPage.settings.panY || 0;
            }
        }

        card.classList.add('cursor-grabbing');
        e.preventDefault(); // Prevent text selection and default drag
    }
});

document.addEventListener('pointermove', (e) => {
    if (!isDragging || !activePageId) return;

    const page = pages.find(p => p.id === activePageId);
    if (!page) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Convert pixels to percentage of canvas size?
    // We need the visual size of the canvas to normalize.
    const canvas = document.getElementById(`canvas-${activePageId}`);
    if (canvas) {
        const rect = canvas.getBoundingClientRect();
        // Normalize delta to [0-1] range relative to the rendered box
        const sensitivity = 1.0;

        if (rect.width > 0 && rect.height > 0) {
            const deltaX = (dx / rect.width) * sensitivity;
            const deltaY = (dy / rect.height) * sensitivity;

            let newPanX = startPanX + deltaX;
            let newPanY = startPanY + deltaY;

            // --- GRID SNAP LOGIC ---
            // Snap to nearest 5% (0.05)
            if (GRID_SIZE) {
                newPanX = Math.round(newPanX / GRID_SIZE) * GRID_SIZE;
                newPanY = Math.round(newPanY / GRID_SIZE) * GRID_SIZE;
            }

            // Update Active Page
            page.settings.panX = Number.isFinite(newPanX) ? newPanX : 0;
            page.settings.panY = Number.isFinite(newPanY) ? newPanY : 0;

            // Update Partner Page (Synced)
            if (partnerPageId) {
                const partnerPage = pages.find(p => p.id === partnerPageId);
                if (partnerPage) {
                    const pNewPanX = partnerStartPanX + deltaX;
                    const pNewPanY = partnerStartPanY + deltaY;

                    partnerPage.settings.panX = Number.isFinite(pNewPanX) ? pNewPanX : 0;
                    partnerPage.settings.panY = Number.isFinite(pNewPanY) ? pNewPanY : 0;

                    const partnerCanvas = document.getElementById(`canvas-${partnerPageId}`);
                    if (partnerCanvas) {
                        requestAnimationFrame(() => {
                            renderPageCanvas(partnerPage, partnerCanvas);
                        });
                    }
                }
            }
        }

        // Re-render active page
        requestAnimationFrame(() => {
            renderPageCanvas(page, canvas);
        });
    }
});

document.addEventListener('pointerup', () => {
    if (activePageId) {
        const card = document.querySelector(`[data-id="${activePageId}"]`);
        if (card) card.classList.remove('cursor-grabbing');
    }
    isDragging = false;
    activePageId = null;
});

function createInsertBar(index) {
    const bar = document.createElement('div');
    bar.className = "w-full flex items-center justify-center gap-4 py-2 group opacity-40 hover:opacity-100 transition-opacity";

    const line = "h-px bg-indigo-500 w-24";

    bar.innerHTML = `
        <div class="${line}"></div>
        <div class="flex gap-2">
            <button type="button" class="text-xs bg-slate-700 hover:bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1" onclick="triggerInsert(${index}, 'left')" title="Insert File">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                File
            </button>
            <button type="button" class="text-xs bg-slate-700 hover:bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1" onclick="triggerInsert(${index}, 'blank')" title="Insert Blank Page">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Blank
            </button>
             <button type="button" class="text-xs bg-slate-700 hover:bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1" onclick="triggerInsert(${index}, 'spread')" title="Insert Spread (File)">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                Spread
            </button>
        </div>
        <div class="${line}"></div>
    `;
    return bar;
}

window.triggerInsert = (index, type) => {
    // Set global state for insertion
    window._insertIndex = index;
    window._insertType = type;

    if (type === 'blank') {
        // Insert blank page(s) immediately
        addBlankPages(index, 1);
    } else {
        insertFileInput.click();
    }
};

function addBlankPages(insertAtIndex, count = 1) {
    const newPages = [];

    // For now, assume inserting SINGLE blank pages unless we want blank spreads?
    // Let's just add standard single pages which will flow into spreads naturally.
    for (let i = 0; i < count; i++) {
        // Use a special ID for blank pages or just null sourceFileId?
        // We need a unique ID for the page itself.
        const pageId = `blank_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        newPages.push({
            id: pageId,
            sourceFileId: null, // Indicates blank
            pageIndex: 1, // Irrelevant
            settings: { scaleMode: 'fit', alignment: 'center', panX: 0, panY: 0 },
            isSpread: false
        });
    }

    if (insertAtIndex !== null && insertAtIndex >= 0 && insertAtIndex <= pages.length) {
        pages.splice(insertAtIndex, 0, ...newPages);
    } else {
        pages.push(...newPages);
    }

    renderBookViewer();
}

insertFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const isSpread = window._insertType === 'spread';
        addInteriorFiles(e.target.files, isSpread, window._insertIndex);
        e.target.value = ''; // Reset
    }
});

function createPageCard(page, index, isRightPage, isFirstPage, width, height, bleed, pixelsPerInch, observer) {
    const card = document.createElement('div');
    card.dataset.id = page.id;

    let classes = "page-card relative group bg-slate-800 shadow-lg border border-slate-700 transition-all hover:border-indigo-500 overflow-hidden cursor-grab active:cursor-grabbing";

    // Prevent frame scaling weirdness by not applying transition to width/height changes if JS handles it
    // But classes is a string.

    if (projectType === 'single') {
        // Loose sheets: Full border, NO rounded corners (Square)
        // Ensure it doesn't scale border thickness. Border is 2px.
        classes += " border-2";
    } else {
        // Booklet: Spread styling
        if (isFirstPage) {
            classes += " border-l-2 border-l-slate-900";
        } else if (isRightPage) {
            classes += " border-l-0";
        } else {
            classes += " border-r-0";
        }
    }
    card.className = classes;

    // Fix: Ensure the CARD element adapts size but doesn't glitch.
    // The card size is usually determined by its content (the canvasContainer).
    // canvasContainer has fixed pixel width/height set by JS.
    // So the card should grow naturally.
    // The "Frame scales up" issue might be due to border-width appearing smaller relative to content?
    // No, border is in CSS pixels. If we zoom (browser zoom or canvas scale?), standard CSS handles it.
    // If we increase `pixelsPerInch`, the DIV grows in pixels.
    // 2px border remains 2px.
    // Maybe the user means the border looks too thin/thick?
    // "Frame scales up as you zoom in and canvas gets larger."
    // If `viewerScale` increases, `pixelsPerInch` increases.
    // `containerW` increases. `style.width` increases.
    // The DOM element gets bigger.
    // The border is constant 1px (or 2px).
    // Visually, the frame (border) should stay relative?
    // Standard behavior is fine. Maybe the user saw layout shift.
    // `flex-shrink-0` on card helps.
    card.style.flexShrink = '0';

    // Layout Logic
    const bleedPx = bleed * pixelsPerInch;
    let containerW, containerH;
    let canvasLeft, canvasTop;

    if (projectType === 'single') {
        // Loose Sheets: Full View
        containerW = (width + (bleed * 2)) * pixelsPerInch;
        containerH = (height + (bleed * 2)) * pixelsPerInch;
        canvasLeft = 0;
        canvasTop = 0;
    } else {
        // Spread Logic
        if (isRightPage) {
            // Right Page: Clip LEFT bleed (Spine)
            containerW = (width + bleed) * pixelsPerInch;
            canvasLeft = -bleedPx;
        } else {
            // Left Page: Clip RIGHT bleed (Spine)
            containerW = (width + bleed) * pixelsPerInch;
            canvasLeft = 0;
        }
        containerH = (height + (bleed*2)) * pixelsPerInch;
        canvasTop = 0;
    }

    const canvasContainer = document.createElement('div');
    canvasContainer.className = "relative overflow-hidden bg-white shadow-sm mx-auto";
    canvasContainer.style.width = `${containerW}px`;
    canvasContainer.style.height = `${containerH}px`;

    const canvas = document.createElement('canvas');
    canvas.id = `canvas-${page.id}`;
    canvas.style.position = "absolute";
    canvas.style.left = `${canvasLeft}px`;
    canvas.style.top = `${canvasTop}px`;

    canvasContainer.appendChild(canvas);

    // Drag Handle
    const dragHandle = document.createElement('div');
    dragHandle.className = "drag-handle absolute top-2 left-2 p-1.5 bg-slate-900/80 text-white rounded cursor-move opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm z-30 hover:bg-indigo-600 shadow-sm";
    dragHandle.title = "Drag to Reorder";
    // Grid/Grip Icon
    dragHandle.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>';
    card.appendChild(dragHandle);

    // Overlay Controls - Always render these
    const controls = document.createElement('div');
    controls.className = "absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 p-1 rounded backdrop-blur-sm z-20";
    controls.innerHTML = `
        <button type="button" onclick="deletePage('${page.id}')" class="text-red-400 hover:text-white p-1" title="Delete Page">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;
    card.appendChild(controls);

    // Overlay Settings (Transparent Buttons) - Always render these
    const settingsOverlay = document.createElement('div');
    settingsOverlay.className = "absolute bottom-0 inset-x-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-slate-900/90 to-transparent flex justify-center gap-2 z-20";

    const modes = [
        { id: 'fit', icon: '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>', title: 'Fit to Page' },
        { id: 'fill', icon: '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4h16v16H4z"/></svg>', title: 'Fill Page' },
        { id: 'stretch', icon: '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"/></svg>', title: 'Stretch to Fit' }
    ];

    modes.forEach(mode => {
        const btn = document.createElement('button');
        btn.type = 'button'; // Prevent form submission
        btn.className = `p-1.5 rounded border ${page.settings.scaleMode === mode.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/80 border-slate-600 text-gray-400 hover:bg-slate-700 hover:text-white'}`;
        btn.innerHTML = mode.icon;
        btn.title = mode.title;
        btn.onclick = () => updatePageSetting(page.id, 'scaleMode', mode.id);
        settingsOverlay.appendChild(btn);
    });
    card.appendChild(settingsOverlay);

    const pageNum = document.createElement('span');
    pageNum.className = "absolute bottom-1 left-2 text-[10px] text-white/50 font-mono z-20";
    pageNum.textContent = `P${index + 1}`;

    card.appendChild(controls);
    card.appendChild(canvasContainer);
    card.appendChild(settingsOverlay);
    card.appendChild(pageNum);

    // Add Placeholder
    const placeholder = document.createElement('div');
    placeholder.className = "absolute inset-0 flex items-center justify-center text-gray-600 bg-slate-200 z-10 transition-opacity duration-300";
    placeholder.innerHTML = '<div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>';
    placeholder.id = `placeholder-${page.id}`;
    canvasContainer.appendChild(placeholder);

    // Add specific drop handling for this card
    // We use the input ID trick again, but specific to this card if needed?
    // Actually, we can just reuse the logic: drop -> updates this page's source.

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        card.addEventListener(eventName, (e) => {
            // Only intercept if it's a FILE drag. Allow SortableJS drags to bubble.
            if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                e.stopPropagation();

                if (eventName === 'dragenter' || eventName === 'dragover') {
                    card.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
                } else {
                    card.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2');
                }
            }
        }, false);
    });

    card.addEventListener('drop', async (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                // Replace content of THIS page
                await updatePageContent(page.id, file);
            }
        }
    });

    observer.observe(card);
    return card;
}

// Helper to replace page content
async function updatePageContent(pageId, file) {
    const page = pages.find(p => p.id === pageId);
    if (!page) return;

    const sourceId = Date.now() + Math.random().toString(16).slice(2);
    const isLocal = file.type === 'application/pdf' || file.type.startsWith('image/');

    if (isLocal) {
        sourceFiles[sourceId] = file;
        page.sourceFileId = sourceId;
        page.pageIndex = 1; // Reset to page 1 of new file

        // If it's a PDF, we might want to know if it has more pages, but for a single replacement we usually just take page 1.
        // Unless we want to expand? For now, simple replacement.

        // Update UI
        const canvas = document.getElementById(`canvas-${pageId}`);
        if (canvas) renderPageCanvas(page, canvas);

    } else {
        // Server side processing needed
        sourceFiles[sourceId] = { file: file, status: 'uploading', previewUrl: null };
        page.sourceFileId = sourceId;
        page.pageIndex = 1;

        const placeholder = document.getElementById(`placeholder-${pageId}`);
        if (placeholder) {
            placeholder.style.opacity = '1';
            placeholder.innerHTML = '<p class="text-xs text-indigo-400 animate-pulse">Processing...</p>';
        }

        await processServerFile(file, sourceId);
    }

    // Trigger re-render to update thumbnails or other UI if needed
    // But renderPageCanvas above might be enough.
    // Safest to re-render viewer if we want to ensure everything syncs?
    // renderPageCanvas is faster.
}

async function renderPageCanvas(page, canvas) {
    const pageIndex = pages.indexOf(page);
    const isRightPage = pageIndex === 0 || pageIndex % 2 === 0;
    let view = isRightPage ? 'right' : 'left';
    if (projectType === 'single') view = 'full';

    // 1. Handle Blank Page
    if (page.sourceFileId === null) {
        drawBlankPage(page, canvas, view);
        return;
    }

    // 2. Validate Source
    const sourceEntry = sourceFiles[page.sourceFileId];
    if (!sourceEntry) {
        // Draw visual error on canvas if source is missing
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f3f4f6'; ctx.fillRect(0,0,canvas.width, canvas.height);
        ctx.fillStyle = '#ef4444'; ctx.font = '10px sans-serif'; 
        ctx.fillText('Missing Source', 10, 20);
        return;
    }

    if (!projectSpecs || !projectSpecs.dimensions) return;

    // 3. Setup Canvas Dimensions & Scale
    const width = projectSpecs.dimensions.width;
    const height = projectSpecs.dimensions.height;
    const bleed = 0.125;
    
    const visualScale = (250 * viewerScale) / ((width + bleed*2) * 96);
    const pixelsPerInch = 96 * visualScale;
    const pixelDensity = 1.5; // Balance between sharpness and performance

    const totalW = width + (bleed*2);
    const totalH = height + (bleed*2);

    canvas.width = Math.ceil(totalW * pixelsPerInch * pixelDensity);
    canvas.height = Math.ceil(totalH * pixelsPerInch * pixelDensity);
    
    canvas.style.width = `${totalW * pixelsPerInch}px`;
    canvas.style.height = `${totalH * pixelsPerInch}px`;
    canvas.style.top = '0px';
    
    if (view === 'right') canvas.style.left = `-${bleed * pixelsPerInch}px`;
    else canvas.style.left = '0px';

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    ctx.scale(pixelsPerInch, pixelsPerInch);

    // 4. Draw Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, totalH);

    // --- OPTIMIZATION 1: Blurry Placeholder ---
    // Check if we have the low-res thumbnail cached. If so, draw it immediately.
    try {
        const file = sourceEntry.isServer ? null : sourceEntry.file;
        const fileKey = sourceEntry.isServer ? (sourceEntry.storagePath || sourceEntry.previewUrl) : (file ? file.name : 'unknown');
        const timestamp = (file && file.lastModified) ? file.lastModified : 'server';
        
        // Look for the 0.25 scale key
        const thumbCacheKey = `${fileKey}_${page.pageIndex || 1}_${timestamp}_s0.25`;

        if (imageCache.has(thumbCacheKey)) {
            const thumbBitmap = imageCache.get(thumbCacheKey);
            if (thumbBitmap) {
                // Calculate positioning for the placeholder (Match drawFileWithTransform logic)
                const srcW = thumbBitmap.width;
                const srcH = thumbBitmap.height;
                const srcRatio = srcW / srcH;
                const targetRatio = totalW / totalH;
                
                let drawW, drawH, drawX, drawY;
                const mode = page.settings.scaleMode || 'fit';
                const panX = page.settings.panX || 0;
                const panY = page.settings.panY || 0;
                
                if (mode === 'stretch') { 
                    drawW = totalW; drawH = totalH; 
                } else if (mode === 'fit') {
                    if (srcRatio > targetRatio) { drawW = totalW; drawH = totalW / srcRatio; }
                    else { drawH = totalH; drawW = totalH * srcRatio; }
                } else { // fill
                    if (srcRatio > targetRatio) { drawH = totalH; drawW = totalH * srcRatio; }
                    else { drawW = totalW; drawH = totalW / srcRatio; }
                }
                
                drawX = (totalW - drawW) / 2 + (panX * totalW);
                drawY = (totalH - drawH) / 2 + (panY * totalH);

                ctx.save();
                ctx.beginPath(); ctx.rect(0, 0, totalW, totalH); ctx.clip();
                // Optional: ctx.filter = 'blur(2px)'; // Add blur if you want a "loading" effect
                ctx.drawImage(thumbBitmap, drawX, drawY, drawW, drawH);
                ctx.restore();
            }
        }
    } catch (e) {
        // Ignore placeholder errors, proceeding to main render
    }
    // ------------------------------------------

    // 5. Draw File (High Res)
    // This overwrites the placeholder with the sharp version
    await drawFileWithTransform(
        ctx, sourceEntry, 0, 0, totalW, totalH, 
        page.settings.scaleMode, 
        page.settings.alignment, 
        page.pageIndex, 
        page.id, 
        view, 
        page.settings.panX, 
        page.settings.panY
    );

    // --- OPTIMIZATION 2: Sync to Thumbnail ---
    // Push the loaded image to the sidebar so it doesn't have to load again
    if (typeof updateThumbnailFromMain === 'function') {
        updateThumbnailFromMain(page);
    }
    // ------------------------------------------

    // 6. Draw Guides
    const guideScale = pixelsPerInch / 72;
    const mockSpecs = {
        dimensions: { width: width, height: height, units: 'in' },
        bleedInches: bleed,
        safetyInches: 0.125
    };

    let renderInfo = {
        x: view === 'right' ? bleed * pixelsPerInch : 0,
        y: 0,
        width: view === 'left' ? (width + bleed) * pixelsPerInch : totalW * pixelsPerInch,
        height: totalH * pixelsPerInch,
        scale: guideScale,
        isSpread: true,
        isLeftPage: view === 'left'
    };
    
    if (view === 'full') {
        renderInfo = { ...renderInfo, isSpread: false, width: totalW * pixelsPerInch };
    }

    ctx.save();
    ctx.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    drawGuides(ctx, mockSpecs, [renderInfo], { trim: true, bleed: true, safety: true });
    ctx.restore();
}

// Updated signature: Added 'view' parameter
function drawBlankPage(page, canvas, view) { 
    if (!projectSpecs.dimensions) return;

    const ctx = canvas.getContext('2d');
    const width = projectSpecs.dimensions.width;
    const height = projectSpecs.dimensions.height;
    const bleed = 0.125;

    // Consistent Scaling Logic
    const visualScale = (250 * viewerScale) / ((width + bleed*2) * 96);
    const pixelsPerInch = 96 * visualScale;
    const pixelDensity = 1.5;

    const totalW = width + (bleed*2);
    const totalH = height + (bleed*2);

    canvas.width = Math.ceil(totalW * pixelsPerInch * pixelDensity);
    canvas.height = Math.ceil(totalH * pixelsPerInch * pixelDensity);

    canvas.style.width = `${totalW * pixelsPerInch}px`;
    canvas.style.height = `${totalH * pixelsPerInch}px`;

    // Position logic
    canvas.style.top = '0px';
    
    // 'view' is now available here
    if (view === 'right') {
        canvas.style.left = `-${bleed * pixelsPerInch}px`;
    } else {
        canvas.style.left = '0px';
    }

    ctx.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    ctx.scale(pixelsPerInch, pixelsPerInch);

    // 1. Draw Background
    ctx.fillStyle = '#f8fafc'; 
    ctx.fillRect(0, 0, totalW, totalH);

    // 2. Draw Dashed Border
    ctx.strokeStyle = '#cbd5e1'; 
    ctx.lineWidth = 2 / pixelsPerInch;
    ctx.setLineDash([10 / pixelsPerInch, 10 / pixelsPerInch]);
    ctx.strokeRect(bleed, bleed, width, height);
    ctx.setLineDash([]);

    // 3. Text
    ctx.fillStyle = '#94a3b8'; 
    ctx.font = 'italic 0.4px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("Drop File Here", totalW / 2, totalH / 2);

    // Draw Guides
    const guideScale = pixelsPerInch / 72; 
    const mockSpecs = {
        dimensions: { width: width, height: height, units: 'in' },
        bleedInches: bleed,
        safetyInches: 0.125
    };

    const renderInfo = {
        x: view === 'right' ? bleed * pixelsPerInch : 0,
        y: 0,
        width: view === 'left' ? (width + bleed) * pixelsPerInch : totalW * pixelsPerInch,
        height: totalH * pixelsPerInch,
        scale: guideScale,
        isSpread: true,
        isLeftPage: view === 'left'
    };

    ctx.save();
    ctx.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    drawGuides(ctx, mockSpecs, [renderInfo], { trim: true, bleed: true, safety: true });
    ctx.restore();
}

// Add 'forceScale' to the arguments (defaults to null)
async function drawFileWithTransform(ctx, sourceEntry, targetX, targetY, targetW, targetH, mode, align, pageIndex = 1, pageId = null, viewMode = 'full', panX = 0, panY = 0, forceScale = null) {
    if (!sourceEntry) return;

    const isServer = sourceEntry.isServer;
    const file = isServer ? null : sourceEntry.file; 
    const status = sourceEntry.status || 'ready';

    if (status === 'error') {
        ctx.fillStyle = '#fee2e2'; ctx.fillRect(targetX, targetY, targetW, targetH); return;
    }
    if (status === 'processing' || status === 'uploading') {
        drawProcessingState(ctx, targetX, targetY, targetW, targetH); return;
    }

    const fileKey = isServer ? (sourceEntry.storagePath || sourceEntry.previewUrl || 'server_url') : (file ? file.name : 'unknown_file');
    const timestamp = (file && file.lastModified) ? file.lastModified : 'server_timestamp';
    
    // Generate unique keys for the requested scale AND the full scale version
    const scaleKey = forceScale ? `_s${forceScale}` : '_full';
    const cacheKey = `${fileKey}_${pageIndex}_${timestamp}${scaleKey}`;
    const fullCacheKey = `${fileKey}_${pageIndex}_${timestamp}_full`; 

    let imgBitmap;

    try {
        // OPTIMIZATION: If requesting a thumbnail (forceScale), check if Full Version is already available/loading
        // This prevents "double downloading" the PDF logic.
        if (forceScale && (imageCache.has(fullCacheKey) || pendingLoadCache.has(fullCacheKey))) {
            imgBitmap = await fetchBitmapWithCache(fullCacheKey, async () => null); 
        } else {
            // Normal Load
            imgBitmap = await fetchBitmapWithCache(cacheKey, async () => {
                // Use 0.25 for thumbnails, 1.5 for server viewer, 1.0 for local viewer
                const renderScale = forceScale || (isServer ? 1.5 : 1.0); 

                if (isServer) {
                    if (!sourceEntry.previewUrl) return null; 
                    let pdfDocPromise = remotePdfDocCache.get(fileKey);
                    if (!pdfDocPromise) {
                        const loadingTask = pdfjsLib.getDocument(sourceEntry.previewUrl);
                        pdfDocPromise = loadingTask.promise;
                        remotePdfDocCache.set(fileKey, pdfDocPromise);
                    }
                    const pdf = await pdfDocPromise;
                    const page = await pdf.getPage(pageIndex);
                    const viewport = page.getViewport({ scale: renderScale }); 
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = viewport.width;
                    tempCanvas.height = viewport.height;
                    await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport: viewport }).promise;
                    return createImageBitmap(tempCanvas);

                } else if (file && file.type === 'application/pdf') {
                    let pdfDoc = pdfDocCache.get(file);
                    if (!pdfDoc) {
                        const arrayBuffer = await file.arrayBuffer(); 
                        pdfDoc = pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                        pdfDocCache.set(file, pdfDoc);
                    }
                    const pdf = await pdfDoc;
                    const page = await pdf.getPage(pageIndex);
                    const viewport = page.getViewport({ scale: renderScale }); 
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = viewport.width;
                    tempCanvas.height = viewport.height;
                    await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport: viewport }).promise;
                    return createImageBitmap(tempCanvas);

                } else if (file && file.type.startsWith('image/')) {
                    return createImageBitmap(file);
                }
                return null;
            });
        }
        
        if (!imgBitmap) {
            ctx.fillStyle = '#f1f5f9'; ctx.fillRect(targetX, targetY, targetW, targetH); return;
        }

        // --- Draw Logic ---
        const srcW = imgBitmap.width;
        const srcH = imgBitmap.height;
        const srcRatio = srcW / srcH;
        const targetRatio = targetW / targetH;
        let drawW, drawH, drawX, drawY;

        if (mode === 'stretch') { drawW = targetW; drawH = targetH; } 
        else if (mode === 'fit') {
            if (srcRatio > targetRatio) { drawW = targetW; drawH = targetW / srcRatio; }
            else { drawH = targetH; drawW = targetH * srcRatio; }
        } else { 
            if (srcRatio > targetRatio) { drawH = targetH; drawW = targetH * srcRatio; }
            else { drawW = targetW; drawH = targetW / srcRatio; }
        }

        drawX = targetX + (targetW - drawW) / 2 + (panX * targetW);
        drawY = targetY + (targetH - drawH) / 2 + (panY * targetH);

        ctx.save();
        ctx.beginPath();
        ctx.rect(targetX, targetY, targetW, targetH);
        ctx.clip();
        ctx.drawImage(imgBitmap, drawX, drawY, drawW, drawH);
        ctx.restore();

    } catch (e) {
        console.error("Draw Render Error:", e);
        ctx.fillStyle = '#fee2e2'; ctx.fillRect(targetX, targetY, targetW, targetH);
    }
}


// --- Locking Logic ---

async function acquireLock() {
    const projectRef = doc(db, 'projects', projectId);
    const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

    try {
        const acquired = await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(projectRef);
            if (!sfDoc.exists()) throw "Project does not exist!";

            const data = sfDoc.data();
            const lock = data.editorLock;
            const now = Date.now();

            // Identification
            const userId = currentUser.uid;
            const userEmail = currentUser.email || (currentUser.isAnonymous ? "Guest User" : "Unknown");

            // Check if locked by someone else
            if (lock && lock.userId !== userId) {
                // Check if expired
                const lockTime = lock.timestamp ? lock.timestamp.toMillis() : 0;
                if (now - lockTime < LOCK_TIMEOUT_MS) {
                    // LOCKED and ACTIVE
                    showLockedScreen(lock);
                    return false; // Failed to acquire
                }
            }

            // Acquire or Renew Lock
            transaction.update(projectRef, {
                editorLock: {
                    userId: userId,
                    userDisplay: userEmail,
                    timestamp: serverTimestamp() // Use server time
                }
            });

            return true; // Acquired
        });

        if (acquired) {
            hasActiveLock = true;
        }
        return acquired;

    } catch (e) {
        console.error("Transaction failed: ", e);
        showError("Failed to acquire edit lock. Please try again.");
        return false;
    }
}

function startLockHeartbeat() {
    // Update lock every 60 seconds
    const intervalId = setInterval(async () => {
        if (!projectId || !currentUser) return;
        try {
            const projectRef = doc(db, 'projects', projectId);

            // Use transaction to safely renew ONLY if we still own the lock
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(projectRef);
                if (!sfDoc.exists()) throw "Project does not exist!";

                const data = sfDoc.data();
                const lock = data.editorLock;

                // If lock is gone or belongs to someone else, stop heartbeat
                if (!lock || lock.userId !== currentUser.uid) {
                    throw new Error("Lock lost");
                }

                transaction.update(projectRef, {
                    "editorLock.timestamp": serverTimestamp()
                });
            });
            console.log("Lock heartbeat sent.");
        } catch (e) {
            if (e.message === "Lock lost" || e === "Lock lost") {
                console.warn("Lock lost (Force Unlock or Expiry). Stopping heartbeat.");
                clearInterval(intervalId);
                alert("Your editing session has been terminated by an administrator.");
                window.location.reload();
            } else {
                console.warn("Failed to send heartbeat:", e);
            }
        }
    }, 60 * 1000);
}

async function releaseLock() {
    // Only release if we actively hold the lock
    if (!projectId || !currentUser || !hasActiveLock) return;

    try {
        const projectRef = doc(db, 'projects', projectId);

        // Use a transaction to ensure we only delete OUR lock
        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(projectRef);
            if (!sfDoc.exists()) return;

            const data = sfDoc.data();
            const lock = data.editorLock;

            // If lock matches our user ID, clear it
            if (lock && lock.userId === currentUser.uid) {
                transaction.update(projectRef, {
                    editorLock: null
                });
            }
        });
        hasActiveLock = false; // Clear local flag
    } catch (e) {
        console.warn("Failed to release lock:", e);
    }
}

function showLockedScreen(lock) {
    loadingState.classList.add('hidden');
    uploadContainer.classList.add('hidden');
    lockedState.classList.remove('hidden');

    const name = lock.userDisplay || "Another User";
    lockedByUserSpan.textContent = name;

    // If Admin, enable Force Unlock
    if (isAdmin) {
        adminUnlockContainer.classList.remove('hidden');
        forceUnlockBtn.onclick = async () => {
            if (confirm(`Are you sure you want to force unlock this project?\n\nUser "${name}" may lose unsaved work.`)) {
                // Break lock
                try {
                    const projectRef = doc(db, 'projects', projectId);
                    await updateDoc(projectRef, { editorLock: null });
                    window.location.reload();
                } catch (e) {
                    alert("Failed to force unlock: " + e.message);
                }
            }
        };
    }
}

// --- Cover Preview Logic ---

function calculateSpineWidth(specs) {
    if (!specs || specs.binding !== 'perfectBound') return 0;

    const paper = HARDCODED_PAPER_TYPES.find(p => p.name === specs.paperType);
    const caliper = paper ? paper.caliper : 0.004; // Fallback default
    
    // Use actual page count from builder if available
    // 'pages' is the global array storing the internal book pages
    let count = (typeof pages !== 'undefined' && pages.length > 0) ? pages.length : (specs.pageCount || 0);

    // Calculate sheets (2 pages = 1 sheet)
    // We use Math.ceil because an odd number of pages (e.g., 3) still uses 2 physical sheets of paper
    const sheets = Math.ceil(count / 2);
    
    let width = sheets * caliper;

    return Math.max(0, width);
}

function fitCoverToView() {
    const container = document.getElementById('cover-preview-canvas')?.parentElement;
    if (!container || !projectSpecs.dimensions) return;

    // 1. Calculate visual size of the book at 1.0 scale (40 PPI)
    const trimWidth = projectSpecs.dimensions.width;
    const trimHeight = projectSpecs.dimensions.height;
    const bleed = 0.125;
    const spineWidth = calculateSpineWidth(projectSpecs);
    
    const totalWidth = (trimWidth * 2) + spineWidth + (bleed * 2);
    const totalHeight = trimHeight + (bleed * 2);
    
    const basePPI = 40;
    const bookPixelW = totalWidth * basePPI;
    const bookPixelH = totalHeight * basePPI;

    // 2. Get Container Size (minus padding)
    const viewW = container.clientWidth - 60; // 30px padding buffer on each side
    const viewH = container.clientHeight - 60;

    if (viewW <= 0 || viewH <= 0) return;

    // 3. Calculate Zoom to Fit
    const scaleX = viewW / bookPixelW;
    const scaleY = viewH / bookPixelH;
    
    // Use the smaller scale to ensure both width and height fit
    let optimalZoom = Math.min(scaleX, scaleY);
    
    // Clamp results (e.g., min 0.3, max 1.5)
    optimalZoom = Math.min(Math.max(optimalZoom, 0.3), 1.5);
    
    // Round to 1 decimal place for the slider
    optimalZoom = Math.floor(optimalZoom * 10) / 10;

    // 4. Apply
    coverZoom = optimalZoom;
    const slider = document.getElementById('cover-zoom');
    if (slider) slider.value = coverZoom;
    
    renderCoverPreview();
}

function drawProcessingState(ctx, x, y, w, h) {
    // Just fill white so the background is clean behind the DOM spinner
    ctx.save();
    ctx.fillStyle = '#ffffff'; 
    ctx.fillRect(x, y, w, h);
    ctx.restore();
}

async function renderCoverPreview() {
    if (!coverCanvas || !projectSpecs || !projectSpecs.dimensions) return;

    // 1. Lock this render ID
    const myRenderId = ++coverRenderId;

    const scale = 2; 
    const trimWidth = projectSpecs.dimensions.width;
    const trimHeight = projectSpecs.dimensions.height;
    const bleed = 0.125;
    const spineWidth = calculateSpineWidth(projectSpecs);

    const totalWidth = (trimWidth * 2) + spineWidth + (bleed * 2);
    const totalHeight = trimHeight + (bleed * 2);

    const basePPI = 40; 
    const pixelsPerInch = basePPI * coverZoom; 
    
    // 2. REUSE Offscreen Canvas
    if (!_previewOffscreen) {
        _previewOffscreen = document.createElement('canvas');
        _previewCtx = _previewOffscreen.getContext('2d', { alpha: false });
    }

    const reqW = Math.ceil(totalWidth * pixelsPerInch * scale);
    const reqH = Math.ceil(totalHeight * pixelsPerInch * scale);

    // Only resize if dimensions changed (avoids clearing memory unnecessarily)
    if (_previewOffscreen.width !== reqW || _previewOffscreen.height !== reqH) {
        _previewOffscreen.width = reqW;
        _previewOffscreen.height = reqH;
    }

    const ctx = _previewCtx;

    // Clear & Setup
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, reqW, reqH);

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.scale(pixelsPerInch, pixelsPerInch);

    const zoneBack = { x: 0, y: 0, w: bleed + trimWidth, h: totalHeight };
    const zoneSpine = { x: bleed + trimWidth, y: 0, w: spineWidth, h: totalHeight };
    const zoneFront = { x: bleed + trimWidth + spineWidth, y: 0, w: trimWidth + bleed, h: totalHeight };
    const zoneBackPlusSpine = { x: 0, y: 0, w: zoneBack.w + zoneSpine.w, h: totalHeight };
    const zoneFrontPlusSpine = { x: zoneSpine.x, y: 0, w: zoneSpine.w + zoneFront.w, h: totalHeight };
    const spineMode = window.currentSpineMode || 'file';

    // --- DRAWING WITH ABORT CHECKS ---
    
    // 1. Back Cover
    if (spineMode === 'wrap-back-stretch') {
        await drawStretched(ctx, coverSources['file-cover-back'], zoneBack, zoneBackPlusSpine, 'left', coverSettings['file-cover-back'].pageIndex);
    } else {
        await drawImageOnCanvas(ctx, coverSources['file-cover-back'], zoneBack.x, zoneBack.y, zoneBack.w, zoneBack.h, coverSettings['file-cover-back'].pageIndex, coverSettings['file-cover-back'].scaleMode);
    }
    if (myRenderId !== coverRenderId) return; // Abort if new zoom happened

    // 2. Spine
    if (spineMode === 'file') {
        await drawImageOnCanvas(ctx, coverSources['file-spine'], zoneSpine.x, zoneSpine.y, zoneSpine.w, zoneSpine.h, coverSettings['file-spine'].pageIndex, coverSettings['file-spine'].scaleMode);
    } else if (spineMode === 'wrap-front-stretch') {
        await drawStretched(ctx, coverSources['file-cover-front'], zoneSpine, zoneFrontPlusSpine, 'right', coverSettings['file-cover-front'].pageIndex);
    } else if (spineMode === 'wrap-back-stretch') {
        await drawStretched(ctx, coverSources['file-cover-back'], zoneSpine, zoneBackPlusSpine, 'left', coverSettings['file-cover-back'].pageIndex);
    } else if (spineMode.includes('wrap')) {
        const isFrontSource = spineMode.includes('front');
        const sourceEntry = isFrontSource ? coverSources['file-cover-front'] : coverSources['file-cover-back'];
        const settings = isFrontSource ? coverSettings['file-cover-front'] : coverSettings['file-cover-back'];
        await drawWrapper(ctx, sourceEntry, zoneSpine.x, zoneSpine.y, zoneSpine.w, zoneSpine.h, 'mirror', isFrontSource, 0, settings.pageIndex);
    }
    if (myRenderId !== coverRenderId) return; // Abort

    // 3. Front Cover
    if (spineMode === 'wrap-front-stretch') {
        await drawStretched(ctx, coverSources['file-cover-front'], zoneFront, zoneFrontPlusSpine, 'right', coverSettings['file-cover-front'].pageIndex);
    } else {
        await drawImageOnCanvas(ctx, coverSources['file-cover-front'], zoneFront.x, zoneFront.y, zoneFront.w, zoneFront.h, coverSettings['file-cover-front'].pageIndex, coverSettings['file-cover-front'].scaleMode);
    }
    if (myRenderId !== coverRenderId) return; // Abort

    // 4. Guides (Fast, no await needed)
    ctx.lineWidth = 1 / pixelsPerInch; 
    const xTrimBackLeft = bleed;
    const xSpineLeft = bleed + trimWidth;
    const xSpineRight = bleed + trimWidth + spineWidth;
    const yBleedTop = bleed;

    // Bleed Fill
    ctx.save();
    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.rect(0, 0, totalWidth, totalHeight);
    ctx.rect(bleed, bleed, trimWidth, trimHeight); 
    if (spineWidth > 0) ctx.rect(bleed + trimWidth, bleed, spineWidth, trimHeight); 
    ctx.rect(bleed + trimWidth + spineWidth, bleed, trimWidth, trimHeight); 
    ctx.fill("evenodd");
    ctx.restore();

    // Trim Lines
    ctx.strokeStyle = '#000000';
    ctx.beginPath(); 
    ctx.rect(bleed, bleed, trimWidth, trimHeight);
    if (spineWidth > 0) ctx.rect(bleed + trimWidth, bleed, spineWidth, trimHeight);
    ctx.rect(bleed + trimWidth + spineWidth, bleed, trimWidth, trimHeight);
    ctx.stroke();

    // Safe Area
    const safe = 0.125;
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
    ctx.beginPath();
    ctx.rect(xTrimBackLeft + safe, yBleedTop + safe, trimWidth - (2*safe), trimHeight - (2*safe));
    ctx.rect(xSpineRight + safe, yBleedTop + safe, trimWidth - (2*safe), trimHeight - (2*safe));
    if (spineWidth > 0.25) {
         ctx.rect(xSpineLeft + safe, yBleedTop + safe, spineWidth - (2*safe), trimHeight - (2*safe));
    }
    ctx.stroke();

    // 5. COMMIT TO MAIN CANVAS
    if (myRenderId !== coverRenderId) return;

    if (spineWidthDisplay) spineWidthDisplay.textContent = spineWidth.toFixed(3);
    
    // Update Placeholder visibility... (Same logic as before)
    const placeholderEl = document.getElementById('cover-preview-placeholder');
    if (placeholderEl) {
        const slots = ['file-cover-front', 'file-cover-back', 'file-spine'];
        const hasContent = slots.some(slot => coverSources[slot] || selectedFiles[slot]);
        if (hasContent) placeholderEl.style.display = 'none';
        else {
            placeholderEl.style.display = 'flex';
            placeholderEl.innerHTML = '<div class="text-center"><p class="text-gray-500 text-sm">Preview will update automatically</p></div>';
        }
    }

    if (coverCanvas.width !== _previewOffscreen.width || coverCanvas.height !== _previewOffscreen.height) {
        coverCanvas.width = _previewOffscreen.width;
        coverCanvas.height = _previewOffscreen.height;
    }
    coverCanvas.style.width = `${totalWidth * pixelsPerInch}px`;
    coverCanvas.style.height = `${totalHeight * pixelsPerInch}px`;

    const mainCtx = coverCanvas.getContext('2d');
    mainCtx.drawImage(_previewOffscreen, 0, 0);
}

async function drawImageOnCanvas(ctx, sourceEntry, x, y, targetW, targetH, pageIndex = 1, scaleMode = 'fill') {
    if (!sourceEntry) return;

    let file, status, isServer, previewUrl;
    if (sourceEntry instanceof File) {
        file = sourceEntry; status = 'ready'; isServer = false;
    } else {
        file = sourceEntry.file; status = sourceEntry.status; isServer = sourceEntry.isServer; previewUrl = sourceEntry.previewUrl;
    }

    if (!file && !isServer) return;

    if (status === 'processing' || status === 'uploading') { drawProcessingState(ctx, x, y, targetW, targetH); return; }
    if (status === 'error') { ctx.fillStyle = '#fee2e2'; ctx.fillRect(x, y, targetW, targetH); return; }

    const fileKey = isServer ? (sourceEntry.storagePath || previewUrl || 'server_url') : (file ? file.name : 'unknown_file');
    const timestamp = (file && file.lastModified) ? file.lastModified : 'server_timestamp';
    const cacheKey = `${fileKey}_${pageIndex}_${timestamp}_cover`;

    let imgBitmap;

    try {
        imgBitmap = await fetchBitmapWithCache(cacheKey, async () => {
            if (isServer) {
                // --- FIX: Remote Document Caching ---
                const docCacheKey = sourceEntry.storagePath || previewUrl;
                let pdfDocPromise = remotePdfDocCache.get(docCacheKey);

                if (!pdfDocPromise) {
                    const loadingTask = pdfjsLib.getDocument(previewUrl);
                    pdfDocPromise = loadingTask.promise;
                    remotePdfDocCache.set(docCacheKey, pdfDocPromise);
                }
                const pdf = await pdfDocPromise;
                // --- END FIX ---
                
                const page = await pdf.getPage(pageIndex);
                const viewport = page.getViewport({ scale: 2 });
                const cvs = document.createElement('canvas');
                cvs.width = viewport.width; cvs.height = viewport.height;
                await page.render({ canvasContext: cvs.getContext('2d'), viewport }).promise;
                return createImageBitmap(cvs);

            } else if (file && file.type === 'application/pdf') {
                // Local PDF logic (using ArrayBuffer and pdfDocCache)
                let pdfDoc = pdfDocCache.get(file);
                if (!pdfDoc) {
                    const arrayBuffer = await file.arrayBuffer();
                    pdfDoc = pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    pdfDocCache.set(file, pdfDoc);
                }
                const pdf = await pdfDoc;
                const page = await pdf.getPage(pageIndex);
                const viewport = page.getViewport({ scale: 2 });
                const cvs = document.createElement('canvas');
                cvs.width = viewport.width; cvs.height = viewport.height;
                await page.render({ canvasContext: cvs.getContext('2d'), viewport }).promise;
                return createImageBitmap(cvs);

            } else if (file && file.type.startsWith('image/')) {
                return createImageBitmap(file);
            }
            return null;
        });

        if (!imgBitmap) return;

        // Drawing Logic (remains the same)
        const srcW = imgBitmap.width;
        const srcH = imgBitmap.height;
        const srcRatio = srcW / srcH;
        const targetRatio = targetW / targetH;

        let drawW, drawH, drawX, drawY;

        if (scaleMode === 'stretch') { drawW = targetW; drawH = targetH; drawX = x; drawY = y; }
        else if (scaleMode === 'fit') {
            if (srcRatio > targetRatio) { drawW = targetW; drawH = targetW / srcRatio; }
            else { drawH = targetH; drawW = targetH * srcRatio; }
            drawX = x + (targetW - drawW) / 2; drawY = y + (targetH - drawH) / 2;
        } else {
            if (srcRatio > targetRatio) { drawH = targetH; drawW = targetH * srcRatio; }
            else { drawW = targetW; drawH = targetW / srcRatio; }
            drawX = x + (targetW - drawW) / 2; drawY = y + (targetH - drawH) / 2;
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, targetW, targetH);
        ctx.clip();
        ctx.drawImage(imgBitmap, drawX, drawY, drawW, drawH);
        ctx.restore();

    } catch (e) {
        console.error("Error rendering cover image:", e);
    }
}

// --- Specs Form Submit Handler ---
specsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveSpecsBtn.disabled = true;
    saveSpecsBtn.textContent = 'Saving...';

    try {
        // Get selected Project Type
        const selectedType = document.querySelector('input[name="projectType"]:checked');
        if (!selectedType) {
            throw new Error('Please select a project type.');
        }
        const typeValue = selectedType.value; // 'loose', 'saddleStitch', 'perfectBound'

        const sizePreset = specSizePreset.value;
        let dimensionsVal; // For Firestore
        let localDimensions; // For local state

        if (!sizePreset) throw new Error("Please select a finished size.");

        if (sizePreset === 'custom') {
            const width = parseFloat(specWidth.value);
            const height = parseFloat(specHeight.value);
            const unit = specUnit.value;

            if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
                throw new Error('Invalid custom dimensions');
            }

            dimensionsVal = {
                width: width,
                height: height,
                units: unit
            };
        } else {
            // Standard Size Key (e.g., 'A4') - Resolve to Object immediately for Backend Consistency
            dimensionsVal = resolveDimensions(sizePreset);
        }

        // Local dimensions are now always the resolved object
        localDimensions = resolveDimensions(dimensionsVal);

        const specsUpdate = {
            'projectType': typeValue === 'loose' ? 'single' : 'booklet',
            'specs.dimensions': dimensionsVal
        };

        // Set Binding Logic
        if (typeValue === 'loose') {
            specsUpdate['specs.binding'] = 'loose';
        } else {
            specsUpdate['specs.binding'] = typeValue; // 'saddleStitch' or 'perfectBound'
            specsUpdate['specs.pageCount'] = parseInt(specPageCount.value) || 0;

            if (typeValue === 'perfectBound') {
                specsUpdate['specs.paperType'] = specPaper.value;
                specsUpdate['specs.coverPaperType'] = specCoverPaper.value;
            }
        }

        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, specsUpdate);

        // Reload page or Update State locally to avoid reload
        projectSpecs = {
            dimensions: localDimensions,
            binding: specsUpdate['specs.binding'],
            pageCount: specsUpdate['specs.pageCount'],
            paperType: specsUpdate['specs.paperType'],
            coverPaperType: specsUpdate['specs.coverPaperType']
        };
        projectType = specsUpdate['projectType'];

        // Hide modal and show upload UI (Logic handled in init mostly, but we trigger refresh)
        specsModal.classList.add('hidden');
        uploadContainer.classList.remove('hidden');

        // Refresh UI logic
        refreshBuilderUI();

        await initializeBuilder();

    } catch (err) {
        console.error("Error saving specs:", err);
        alert("Failed to save specifications: " + err.message);
    } finally {
        saveSpecsBtn.disabled = false;
        saveSpecsBtn.textContent = 'Save & Continue';
    }
});

function refreshBuilderUI() {
    // Update Header Nav
    if (navBackBtn) navBackBtn.classList.remove('hidden');

    // --- 1. INJECT AUTOSAVE STATUS INDICATOR ---
    const headerActions = document.getElementById('submit-button')?.parentElement;
    if (headerActions && !document.getElementById('save-progress-btn')) {
        const statusIndicator = document.createElement('button'); 
        statusIndicator.id = 'save-progress-btn';
        statusIndicator.type = 'button';
        statusIndicator.className = 'mr-4 text-xs font-medium text-gray-400 flex items-center transition-colors hover:text-white cursor-pointer';
        statusIndicator.innerHTML = `
            <svg class="w-4 h-4 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            <span>All changes saved</span>
        `;
        statusIndicator.addEventListener('click', () => triggerAutosave()); 
        headerActions.insertBefore(statusIndicator, document.getElementById('submit-button'));
    }

    // --- 2. INJECT SPINE MODE SELECTOR ---
    const spineGroup = document.getElementById('spine-upload-group');
    if (spineGroup && !document.getElementById('spine-mode-select')) {
        const wrapper = document.createElement('div');
        wrapper.className = "mb-2 flex justify-between items-center";
        wrapper.innerHTML = `
            <label class="text-xs font-medium text-gray-400">Spine Mode</label>
            <select id="spine-mode-select" class="text-xs bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white focus:outline-none">
                <option value="file">Upload File</option>
                <option value="wrap-front">Mirror Front</option>
                <option value="wrap-back">Mirror Back</option>
                <option value="wrap-front-stretch">Stretch Front</option>
                <option value="wrap-back-stretch">Stretch Back</option>
            </select>
        `;
        spineGroup.insertBefore(wrapper, spineGroup.querySelector('.drop-zone'));

        const selectEl = document.getElementById('spine-mode-select');

        // --- RESTORE VALUE IF EXISTS ---
        if (window.currentSpineMode) {
            selectEl.value = window.currentSpineMode;
            const dropZone = spineGroup.querySelector('.drop-zone');
            if (window.currentSpineMode === 'file') dropZone.classList.remove('hidden');
            else dropZone.classList.add('hidden');
        }

        selectEl.addEventListener('change', (e) => {
            window.currentSpineMode = e.target.value;
            const dropZone = spineGroup.querySelector('.drop-zone');
            if (e.target.value === 'file') dropZone.classList.remove('hidden');
            else dropZone.classList.add('hidden');
            renderCoverPreview();
            triggerAutosave(); 
        });
    }

    // --- 3. CONFIGURE TABS & TOOLBARS ---
    // ... (Same as your existing code) ...
    if (projectType === 'single') {
        if (builderTabs) builderTabs.classList.add('hidden');
        if (contentCover) contentCover.classList.add('hidden');
        if (contentInterior) contentInterior.classList.remove('hidden');
        if (toolbarJump) toolbarJump.classList.add('hidden');
        if (toolbarActionsBooklet) toolbarActionsBooklet.classList.add('hidden');
        if (toolbarSpreadUpload) toolbarSpreadUpload.classList.add('hidden');
    } else {
        if (builderTabs) builderTabs.classList.remove('hidden');
        if (toolbarJump) toolbarJump.classList.remove('hidden');
        if (toolbarActionsBooklet) toolbarActionsBooklet.classList.remove('hidden');
        if (toolbarSpreadUpload) toolbarSpreadUpload.classList.remove('hidden');

        if (!document.getElementById('undo-btn')) {
            const toolbar = document.getElementById('toolbar-actions-booklet');
            if (toolbar) {
                const undoBtn = document.createElement('button');
                undoBtn.id = 'undo-btn';
                undoBtn.type = 'button';
                undoBtn.className = 'text-xs bg-slate-700 hover:bg-slate-600 text-gray-200 px-3 py-1.5 rounded border border-slate-600 transition-colors opacity-50 flex items-center gap-1';
                undoBtn.innerHTML = '↶ Undo';
                undoBtn.onclick = () => {
                    window.undo();
                    triggerAutosave(); 
                };
                undoBtn.disabled = true;
                toolbar.prepend(undoBtn);
            }
        }

        if (projectSpecs.binding === 'saddleStitch') {
            if (spineGroup) spineGroup.classList.add('hidden');
        } else {
            if (spineGroup) spineGroup.classList.remove('hidden');
        }

        if (tabInterior) tabInterior.click();
    }
}

async function initializeBuilder() {
    if (builderInitialized) {
        renderBookViewer();
        validateForm();
        return;
    }

    if (projectId !== 'mock-project-id') {
        await restoreBuilderState();
    }

    // Ensure viewer is rendered (initial state)
    renderBookViewer();
    validateForm();

    // FIX: Defer Minimap rendering to allow main pages to start first and render concurrently in the background
    setTimeout(() => {
         renderMinimap(); 
    }, 100); 
    
    builderInitialized = true;
}

async function drawWrapper(ctx, sourceEntry, targetX, targetY, targetW, targetH, type, isFrontSource, neighborWidth, pageIndex = 1) {
    if (!sourceEntry) return;

    const status = sourceEntry.status || 'ready';
    if (status === 'processing' || status === 'uploading') {
        drawProcessingState(ctx, targetX, targetY, targetW, targetH);
        return;
    }
    if (status === 'error') {
        ctx.fillStyle = '#fee2e2';
        ctx.fillRect(targetX, targetY, targetW, targetH);
        return;
    }

    const isServer = sourceEntry.isServer;
    const file = isServer ? null : sourceEntry.file;
    
    const fileKey = isServer ? (sourceEntry.storagePath || sourceEntry.previewUrl || 'server_url') : (file ? file.name : 'unknown_file');
    const timestamp = (file && file.lastModified) ? file.lastModified : 'server_timestamp';
    const cacheKey = `${fileKey}_${pageIndex}_${timestamp}_wrapper`;

    let imgBitmap;

    try {
        imgBitmap = await fetchBitmapWithCache(cacheKey, async () => {
            if (isServer) {
                if (!sourceEntry.previewUrl) return null;

                let pdfDocPromise = remotePdfDocCache.get(fileKey);
                if (!pdfDocPromise) {
                    const loadingTask = pdfjsLib.getDocument(sourceEntry.previewUrl);
                    pdfDocPromise = loadingTask.promise;
                    remotePdfDocCache.set(fileKey, pdfDocPromise);
                }
                const pdf = await pdfDocPromise;
                const page = await pdf.getPage(pageIndex);
                const viewport = page.getViewport({ scale: 2 });
                const cvs = document.createElement('canvas');
                cvs.width = viewport.width; cvs.height = viewport.height;
                await page.render({ canvasContext: cvs.getContext('2d'), viewport }).promise;
                return createImageBitmap(cvs);

            } else if (file && file.type === 'application/pdf') {
                let pdfDoc = pdfDocCache.get(file);
                if (!pdfDoc) {
                    const arrayBuffer = await file.arrayBuffer();
                    pdfDoc = pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    pdfDocCache.set(file, pdfDoc);
                }
                const pdf = await pdfDoc;
                const page = await pdf.getPage(pageIndex);
                const viewport = page.getViewport({ scale: 2 });
                const cvs = document.createElement('canvas');
                cvs.width = viewport.width; cvs.height = viewport.height;
                await page.render({ canvasContext: cvs.getContext('2d'), viewport }).promise;
                return createImageBitmap(cvs);

            } else if (file && file.type.startsWith('image/')) {
                return createImageBitmap(file);
            }
            return null;
        });
    } catch(e) { 
        console.error("Wrapper render error:", e);
        return; 
    }

    if (!imgBitmap) return;

    // --- Draw Logic ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(targetX, targetY, targetW, targetH);
    ctx.clip();

    const scale = targetH / imgBitmap.height;
    const scaledW = imgBitmap.width * scale;
    
    if (isFrontSource) { 
        // Mirror Front: Flip horizontally, draw from right edge
        ctx.translate(targetX + targetW, targetY);
        ctx.scale(-1, 1); 
        // Draw image so the "spine" part (left edge of front cover) meets the actual spine
        ctx.drawImage(imgBitmap, 0, 0, imgBitmap.width, imgBitmap.height, 0, 0, scaledW, targetH);
    } else { 
        // Mirror Back: Flip horizontally, draw from left edge
        ctx.translate(targetX, targetY);
        ctx.scale(-1, 1);
        // Draw image so the "spine" part (right edge of back cover) meets the actual spine
        // We draw at negative width because we want the rightmost part of the image to be at x=0 (after flip)
        ctx.drawImage(imgBitmap, 0, 0, imgBitmap.width, imgBitmap.height, -scaledW, 0, scaledW, targetH);
    }
    ctx.restore();
}

// --- Main Initialization (Trust-Optimized) ---
async function init() {
    // FIX: Clear lingering inputs
    if (insertFileInput) insertFileInput.value = '';
    if (hiddenInteriorInput) hiddenInteriorInput.value = '';
    if (fileInteriorDrop) fileInteriorDrop.value = '';
    
    populateSelects();

    // 1. Show Loading State immediately with specific text
    loadingState.classList.remove('hidden');
    uploadContainer.classList.add('hidden');
    
    // Optional: Update loading text to be more descriptive
    const loadingText = loadingState.querySelector('p') || loadingState;
    // Store original text to revert later if needed, or just set it
    if(loadingText) loadingText.textContent = "Accessing secure upload portal...";

    const params = new URLSearchParams(window.location.search);
    projectId = params.get('projectId') || params.get('id');
    guestToken = params.get('guestToken');

    if (!projectId) {
        showError('Missing project ID.');
        return;
    }

    try {
        // 2. Authenticate
        // If guest token is present, we must use it to sign in as guest.
        // If no token, we assume the user is already logged in (Admin/Owner via dashboard).
        if (guestToken) {
            const authenticateGuest = httpsCallable(functions, 'authenticateGuest');
            const authResult = await authenticateGuest({ projectId, guestToken });

            if (!authResult.data || !authResult.data.token) {
                throw new Error("Failed to obtain access token.");
            }
            await signInWithCustomToken(auth, authResult.data.token);
        } else {
            // Wait for auth state to settle
            await new Promise((resolve, reject) => {
                const unsubscribe = onAuthStateChanged(auth, (user) => {
                    unsubscribe();
                    if (user) {
                        currentUser = user;
                        resolve();
                    } else {
                        // Redirect to login if not signed in
                        window.location.href = 'index.html';
                        reject(new Error("User not signed in"));
                    }
                });
            });
        }

        // Update current user ref after sign in
        currentUser = auth.currentUser;

        // Check if Admin (for UI logic)
        if (currentUser) {
            try {
                const userDoc = await getDoc(doc(db, "users", currentUser.uid));
                if (userDoc.exists() && userDoc.data().role === 'admin') {
                    isAdmin = true;
                }
            } catch (e) {
                // Guests can't read user docs, so this error is expected for them. Ignore.
            }
        }

        // 3. Locking Mechanism
        const lockAcquired = await acquireLock();
        if (!lockAcquired) {
            // UI is already handled in acquireLock (showing Locked State)
            loadingState.classList.add('hidden');
            return; // STOP HERE
        }

        // Start Heartbeat
        startLockHeartbeat();

        // Setup Exit Handlers
        window.addEventListener('beforeunload', releaseLock);

        // 4. Fetch Project Data
        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) {
            showError('Project not found or access denied.');
            return;
        }

        const projectData = projectSnap.data();
        projectNameEl.textContent = projectData.projectName;
        projectType = projectData.projectType || 'single'; 
        projectSpecs = projectData.specs || {}; 

        if (projectSpecs.dimensions) {
            projectSpecs.dimensions = resolveDimensions(projectSpecs.dimensions);
        }

        // 5. UI Setup
        bookletUploadSection.classList.remove('hidden');
        updateFileName('file-cover-front', 'file-name-cover-front');
        updateFileName('file-spine', 'file-name-spine');
        updateFileName('file-cover-back', 'file-name-cover-back');

        // 6. Logic Check
        let specsMissing = false;
        let dimValid = false;
        if (typeof projectSpecs.dimensions === 'object' && projectSpecs.dimensions.width) dimValid = true;
        if (!dimValid || !projectSpecs.binding) specsMissing = true;

        if (specsMissing) {
            // If specs are missing, we can lift the curtain immediately to show the form
            loadingState.classList.add('hidden');
            specsModal.classList.remove('hidden');
            populateSpecsForm();
        } else {
            // 7. RESTORE STATE (Behind the curtain)
            if(loadingText) loadingText.textContent = "Restoring project files...";
            
            // Refresh UI elements (Tabs, buttons)
            refreshBuilderUI();

            // Await the FULL restoration (downloading URLs)
            await restoreBuilderState(); 

            // Initialize Builder (Creates the DOM elements for the viewer)
            await initializeBuilder();

            // 8. CRITICAL: Force the first page to paint pixels
            if (pages.length > 0) {
                if(loadingText) loadingText.textContent = "Rendering preview...";
                // This now ACTUALLY renders the pixels, it doesn't just wait
                await waitForFirstPageRender(); 
            }

            // 9. REVEAL (The Perfect Frame)
            loadingState.classList.add('hidden');
            uploadContainer.classList.remove('hidden');
            
            // Recalculate layout now that elements have dimension
            setTimeout(() => {
                fitCoverToView();
                renderMinimap();
            }, 50);
        }

    } catch (err) {
        console.error('Init Error:', err);
        showError('An error occurred: ' + err.message);
    }
}

// --- Persistence Functions ---

// (Removed unused saveBuilderState function)

// We'll modify the submit handler to call this with the paths.
async function persistStateAfterSubmit(allSourcePaths, status = 'draft') {
    if (!projectId) return;

    try {
        const projectRef = doc(db, 'projects', projectId);
        const sourceFilesState = {};
        
        for (const [id, path] of Object.entries(allSourcePaths)) {
            let type = 'interior_source';
            if (id.startsWith('cover_')) type = id; 
            sourceFilesState[id] = { storagePath: path, type: type };
        }

        // Save to Firestore
        await updateDoc(projectRef, {
            guestBuilderState: {
                pages: pages,
                sourceFiles: sourceFilesState,
                // --- NEW SAVED FIELDS ---
                coverSettings: coverSettings, 
                spineMode: window.currentSpineMode || 'file',
                // ------------------------
                status: status,
                updatedAt: new Date()
            }
        });
        console.log("State persisted with status:", status);
    } catch(e) {
        console.error("Failed to persist state:", e);
    }
}

async function restoreBuilderState() {
    if (!projectId) return;

    try {
        const projectRef = doc(db, 'projects', projectId);
        const docSnap = await getDoc(projectRef);

        if (!docSnap.exists()) return;

        const state = docSnap.data().guestBuilderState;
        if (!state) return;

        // Restore Data Models
        pages = state.pages || [];
        if (state.coverSettings) Object.assign(coverSettings, state.coverSettings);
        
        // Restore Spine UI
        if (state.spineMode) {
            window.currentSpineMode = state.spineMode;
            const spineSelect = document.getElementById('spine-mode-select');
            if (spineSelect) {
                spineSelect.value = state.spineMode;
                const dropZone = document.getElementById('spine-upload-group')?.querySelector('.drop-zone');
                if (dropZone) {
                    if (state.spineMode === 'file') dropZone.classList.remove('hidden');
                    else dropZone.classList.add('hidden');
                }
            }
        }

        // Restore Source Files (Parallelized for Speed)
        if (state.sourceFiles) {
            const entries = Object.entries(state.sourceFiles);
            
            // Create an array of promises
            const restorePromises = entries.map(async ([id, meta]) => {
                try {
                    // We await individual URL fetches here
                    const url = await getDownloadURL(ref(storage, meta.storagePath));
                    
                    if (id.startsWith('cover_')) {
                        // Handle Cover Logic
                        let inputId = (id === 'cover_front') ? 'file-cover-front' : 
                                      (id === 'cover_spine') ? 'file-spine' : 'file-cover-back';
                        
                        if (inputId) {
                            coverSources[inputId] = {
                                status: 'ready',
                                isServer: true,
                                previewUrl: url,
                                storagePath: meta.storagePath 
                            };
                            // Update UI Text immediately
                            const displayId = (id === 'cover_front') ? 'file-name-cover-front' :
                                              (id === 'cover_spine') ? 'file-name-spine' : 'file-name-cover-back';
                            const el = document.getElementById(displayId);
                            if (el) el.textContent = "Restored File";

                            // Setup controls (async, don't block)
                            createCoverControls(inputId, url);
                        }
                    } else {
                        // Handle Interior Logic
                        sourceFiles[id] = {
                            status: 'ready',
                            previewUrl: url,
                            isServer: true,
                            storagePath: meta.storagePath
                        };
                    }
                } catch (e) {
                    console.warn(`Failed to restore source ${id}`, e);
                }
            });

            // BLOCK until all URLs are retrieved.
            // This ensures when the UI reveals, we have every URL needed to render.
            await Promise.all(restorePromises);
        }

    } catch (e) {
        console.error("Error restoring state:", e);
    }
}


// --- Upload Handler ---
// --- NEW: Helper to Upload Files & Save State ---
async function syncProjectState(statusLabel) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressPercent = document.getElementById('progress-percent');
    const uploadProgress = document.getElementById('upload-progress');

    uploadProgress.classList.remove('hidden');
    progressText.textContent = 'Preparing files...';

    // 1. Identify Active Source IDs (Pages + Covers)
    const activeSourceIds = new Set();
    pages.forEach(p => {
        if (p.sourceFileId) activeSourceIds.add(p.sourceFileId);
    });

    // 2. Categorize Sources (New vs Existing)
    const filesToUpload = []; // { id, file, type }
    const allSourcePaths = {}; // id -> storagePath (Final Map)

    // Helper to check source
    const checkSource = (id, src, type) => {
        if (!src) return;
        
        // If we already have a storage path recorded in memory, use it (skip upload)
        if (src.storagePath) {
            allSourcePaths[id] = src.storagePath;
            return;
        }

        // Otherwise, check if we have a file to upload
        if (src instanceof File) {
            filesToUpload.push({ id, file: src, type });
        } else if (src.file instanceof File) {
            filesToUpload.push({ id, file: src.file, type });
        } else if (selectedFiles[id]) {
            // Legacy fallback
            filesToUpload.push({ id, file: selectedFiles[id], type });
        }
    };

    // Check Interior Files
    activeSourceIds.forEach(id => checkSource(id, sourceFiles[id], 'interior_source'));

    // Check Cover Files (Booklet Only)
    if (projectType === 'booklet') {
        checkSource('cover_front', coverSources['file-cover-front'], 'cover_front');
        checkSource('cover_spine', coverSources['file-spine'], 'cover_spine');
        checkSource('cover_back', coverSources['file-cover-back'], 'cover_back');
    }

    // 3. Upload New Files
    let completed = 0;
    const total = filesToUpload.length;

    if (total > 0) {
        for (const item of filesToUpload) {
            const timestamp = Date.now();
            const cleanName = item.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storagePath = `guest_uploads/${projectId}/${timestamp}_${item.type}_${cleanName}`;
            const storageRef = ref(storage, storagePath);

            progressText.textContent = `Uploading ${item.file.name}...`;
            
            await uploadBytesResumable(storageRef, item.file);
            
            // Update Master Map
            allSourcePaths[item.id] = storagePath;
            
            // UPDATE MEMORY: Store the path so we don't re-upload next time
            if (item.type === 'interior_source' && sourceFiles[item.id]) {
                sourceFiles[item.id].storagePath = storagePath;
            } else if (item.type.startsWith('cover_')) {
                // Map remote ID back to local slot ID for updating memory
                const localSlot = item.type === 'cover_front' ? 'file-cover-front' : 
                                  item.type === 'cover_spine' ? 'file-spine' : 'file-cover-back';
                if (coverSources[localSlot]) {
                    coverSources[localSlot].storagePath = storagePath;
                }
            }

            completed++;
            const percent = (completed / total) * 100;
            progressBar.style.width = `${percent}%`;
            progressPercent.textContent = `${Math.round(percent)}%`;
        }
    }

    // 4. Save State to Firestore
    progressText.textContent = 'Saving Project State...';
    await persistStateAfterSubmit(allSourcePaths, statusLabel);
    
    return allSourcePaths;
}

// --- NEW: Save Draft Handler ---
async function handleSaveDraft() {
    const saveBtn = document.getElementById('save-progress-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }
    
    try {
        await syncProjectState('draft');
        
        // UI Feedback
        const uploadProgress = document.getElementById('upload-progress');
        uploadProgress.classList.add('hidden');
        
        if (saveBtn) {
            saveBtn.innerHTML = `<svg class="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Saved`;
            setTimeout(() => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<svg class="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg> Save Progress`;
            }, 2000);
        }
    } catch (err) {
        console.error("Save draft failed:", err);
        alert("Failed to save progress: " + err.message);
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Progress';
        }
    }
}

// --- UPDATED: Final Submit Handler ---
async function handleUpload(e) {
    if (e) e.preventDefault();

    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';

    try {
        // 1. Upload & Save State (Mark as processing)
        const allSourcePaths = await syncProjectState('submitted_processing');
        const progressText = document.getElementById('progress-text');

        // 2. Construct Metadata for Backend
        const bookletMetadata = [];

        // Pages
        pages.forEach(p => {
            const safeSettings = {
                scaleMode: p.settings.scaleMode || 'fit',
                alignment: p.settings.alignment || 'center',
                panX: Number(p.settings.panX) || 0,
                panY: Number(p.settings.panY) || 0,
                view: p.settings.view || 'full'
            };

            if (p.sourceFileId === null) {
                 bookletMetadata.push({
                    storagePath: null, 
                    sourcePageIndex: 0,
                    settings: safeSettings,
                    type: 'interior_page'
                 });
            } else {
                 const path = allSourcePaths[p.sourceFileId];
                 if (path) {
                     bookletMetadata.push({
                        storagePath: path,
                        sourcePageIndex: (p.pageIndex || 1) - 1,
                        settings: safeSettings,
                        type: 'interior_page'
                    });
                 }
            }
        });

        // Covers
        if (allSourcePaths['cover_front']) bookletMetadata.push({ storagePath: allSourcePaths['cover_front'], type: 'cover_front' });
        if (allSourcePaths['cover_spine']) bookletMetadata.push({ storagePath: allSourcePaths['cover_spine'], type: 'cover_spine' });
        if (allSourcePaths['cover_back']) bookletMetadata.push({ storagePath: allSourcePaths['cover_back'], type: 'cover_back' });

        // 3. Call Backend to Generate Proof
        progressText.textContent = 'Generating Proof...';
        
        const generateBooklet = httpsCallable(functions, 'generateBooklet');
        await generateBooklet({ projectId: projectId, files: bookletMetadata });

        progressText.textContent = 'Finalizing...';
        const submitGuestUpload = httpsCallable(functions, 'submitGuestUpload');
        await submitGuestUpload({ projectId: projectId });

        // 4. Update State to Complete
        await persistStateAfterSubmit(allSourcePaths, 'submitted_complete');

        // 5. Show Success
        uploadContainer.classList.add('hidden');
        successState.classList.remove('hidden');

    } catch (err) {
        console.error("Upload failed:", err);
        alert("Upload failed: " + err.message);
        submitButton.disabled = false;
        submitButton.textContent = 'Complete Upload';
        document.getElementById('upload-progress').classList.add('hidden');
    }
}

function saveState() {
    // Deep copy pages to history
    undoStack.push(JSON.stringify(pages));
    // Limit stack size to 50 steps
    if (undoStack.length > 50) undoStack.shift();
    updateUndoUI();
}

window.undo = () => {
    if (undoStack.length === 0) return;
    const prevState = undoStack.pop();
    pages = JSON.parse(prevState);
    renderBookViewer();
    updateUndoUI();
};

function updateUndoUI() {
    const btn = document.getElementById('undo-btn');
    if (btn) {
        btn.disabled = undoStack.length === 0;
        btn.classList.toggle('opacity-50', undoStack.length === 0);
    }
}

// Listen for Ctrl+Z
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        window.undo();
    }
});

// Attach to button click (since it's type="button")
submitButton.addEventListener('click', handleUpload);

// --- RESTORED FUNCTIONALITY ---

// 1. Restore "Set All" Buttons
window.setAllScaleMode = (mode) => {
    saveState(); // Save before changing
    if (confirm(`Set all pages to ${mode}?`)) {
        pages.forEach(p => {
            p.settings.scaleMode = mode;
        });
        renderBookViewer();
        triggerAutosave();
    }
};

if (setAllFitBtn) setAllFitBtn.onclick = () => window.setAllScaleMode('fit');
if (setAllFillBtn) setAllFillBtn.onclick = () => window.setAllScaleMode('fill');
if (setAllStretchBtn) setAllStretchBtn.onclick = () => window.setAllScaleMode('stretch');

// 2. Restore Viewer Zoom
if (viewerZoom) {
    viewerZoom.addEventListener('input', (e) => {
        viewerScale = parseFloat(e.target.value);
        renderBookViewer();
    });
}

// 3. Restore Cover Zoom
if (coverZoomInput) {
    coverZoomInput.addEventListener('input', (e) => {
        coverZoom = parseFloat(e.target.value);
        renderCoverPreview();
    });
}

// 4. Restore Jump To Page
if (jumpToPageInput) {
    jumpToPageInput.addEventListener('change', (e) => {
        const pageNum = parseInt(e.target.value);
        if (isNaN(pageNum) || pageNum < 1) return;

        const pageIndex = pageNum - 1;
        if (pageIndex >= 0 && pageIndex < pages.length) {
            const pageId = pages[pageIndex].id;
            // Try to find the single card or the spread card
            let card = document.querySelector(`[data-id="${pageId}"]`);
            if(!card) {
                // If inside a spread, find the container
                card = document.querySelector(`[data-id*=":${pageId}"]`); 
            }
            
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('ring-2', 'ring-indigo-500');
                setTimeout(() => card.classList.remove('ring-2', 'ring-indigo-500'), 1500);
            }
        } else {
            alert("Page number out of range.");
        }
    });
}

async function waitForFirstPageRender() {
    // 1. Safety Checks
    if (!pages || pages.length === 0) return;
    const firstPage = pages[0];
    
    // Find the canvas element (it exists in DOM now, even if hidden)
    const canvasId = `canvas-${firstPage.id}`;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // 2. Force Render Immediately
    // We call the low-level render function directly, bypassing the queue and the observer.
    // This ensures it runs even if the container is display: none.
    console.log("Forcing initial render of Page 1...");
    try {
        await renderPageCanvas(firstPage, canvas);
    } catch (e) {
        console.warn("Initial render warning:", e);
    }
}

// Initialize
init();
// Helper to create a merged card for a spread
function createSpreadCard(leftPage, rightPage, index, width, height, bleed, pixelsPerInch, observer) {
    const card = document.createElement('div');
    // Use a composite ID for Sortable tracking
    card.dataset.id = `spread:${leftPage.id}:${rightPage.id}`;

    let classes = "page-card relative group bg-slate-800 shadow-lg border border-slate-700 transition-all hover:border-indigo-500 overflow-hidden cursor-grab active:cursor-grabbing flex-shrink-0";
    card.className = classes;

    const bleedPx = bleed * pixelsPerInch;
    // Total Spread Width = (Width * 2) + (Bleed * 2)
    // But we display as two cropped viewports side-by-side

    // Viewport Width per page = Width + Bleed
    const singlePageW = (width + bleed) * pixelsPerInch;
    const singlePageH = (height + (bleed * 2)) * pixelsPerInch;

    // Total Container Width = 2 * singlePageW
    // Actually, visual logic:
    // Left Page: [Bleed, Width, 0] (Right edge clipped/flush)
    // Right Page: [0, Width, Bleed] (Left edge clipped/flush)
    // Total Visual Width = (Width + Bleed) + (Width + Bleed) = 2 * Width + 2 * Bleed

    const totalW = singlePageW * 2;

    // Wrapper for side-by-side
    const wrapper = document.createElement('div');
    wrapper.className = "flex pointer-events-none"; // pointer-events-none to let drag handle work, but re-enable for canvas?
    // Actually, if wrapper is none, we can't pan.
    // Let's make individual canvas containers interactive.
    wrapper.style.pointerEvents = "auto";

    // --- LEFT PAGE RENDER ---
    const leftContainer = document.createElement('div');
    leftContainer.className = "relative overflow-hidden bg-white border-r border-gray-200"; // divider
    leftContainer.style.width = `${singlePageW}px`;
    leftContainer.style.height = `${singlePageH}px`;

    const leftCanvas = document.createElement('canvas');
    leftCanvas.id = `canvas-${leftPage.id}`;
    leftCanvas.style.position = "absolute";
    leftCanvas.style.top = "0";
    leftCanvas.style.left = "0"; // Left page shows left bleed
    leftContainer.appendChild(leftCanvas);

    // --- RIGHT PAGE RENDER ---
    const rightContainer = document.createElement('div');
    rightContainer.className = "relative overflow-hidden bg-white";
    rightContainer.style.width = `${singlePageW}px`;
    rightContainer.style.height = `${singlePageH}px`;

    const rightCanvas = document.createElement('canvas');
    rightCanvas.id = `canvas-${rightPage.id}`;
    rightCanvas.style.position = "absolute";
    rightCanvas.style.top = "0";
    rightCanvas.style.left = `-${bleedPx}px`; // Right page hides left bleed (spine)
    rightContainer.appendChild(rightCanvas);

    wrapper.appendChild(leftContainer);
    wrapper.appendChild(rightContainer);
    card.appendChild(wrapper);

    // Drag Handle (Shared)
    const dragHandle = document.createElement('div');
    dragHandle.className = "drag-handle absolute top-2 left-2 p-1.5 bg-slate-900/80 text-white rounded cursor-move opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm z-30 hover:bg-indigo-600 shadow-sm";
    dragHandle.title = "Drag Spread";
    dragHandle.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>';
    card.appendChild(dragHandle);

    // Controls (Delete)
    const controls = document.createElement('div');
    controls.className = "absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 p-1 rounded backdrop-blur-sm z-20";
    controls.innerHTML = `
        <button type="button" onclick="deletePage('${leftPage.id}'); deletePage('${rightPage.id}')" class="text-red-400 hover:text-white p-1" title="Delete Spread">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;
    card.appendChild(controls);

    // Page Numbers
    const pageNum = document.createElement('span');
    pageNum.className = "absolute bottom-1 left-2 text-[10px] text-white/50 font-mono z-20";
    pageNum.textContent = `P${index + 1}-${index + 2}`;
    card.appendChild(pageNum);

    // Placeholders
    [leftPage, rightPage].forEach(p => {
        const ph = document.createElement('div');
        ph.className = "absolute inset-0 flex items-center justify-center text-gray-600 bg-slate-200 z-10 transition-opacity duration-300 pointer-events-none";
        ph.innerHTML = '<div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>';
        ph.id = `placeholder-${p.id}`;
        // Only show if needed (logic in observer usually hides it)
        // We need to append to the specific container?
        // Placeholders usually overlay the canvas.
        // Let's append to left/right containers respectively.
        if (p === leftPage) leftContainer.appendChild(ph);
        else rightContainer.appendChild(ph);
    });

    // Scale Mode Settings (Applies to both?)
    // If it's a spread upload, they are locked. We can show one set of controls.
    const settingsOverlay = document.createElement('div');
    settingsOverlay.className = "absolute bottom-0 inset-x-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-slate-900/90 to-transparent flex justify-center gap-2 z-20";

    const modes = [
        { id: 'fit', icon: '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>', title: 'Fit to Page' },
        { id: 'fill', icon: '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4h16v16H4z"/></svg>', title: 'Fill Page' },
        { id: 'stretch', icon: '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"/></svg>', title: 'Stretch to Fit' }
    ];

    modes.forEach(mode => {
        const btn = document.createElement('button');
        btn.type = 'button';
        // Use left page setting as source of truth
        btn.className = `p-1.5 rounded border ${leftPage.settings.scaleMode === mode.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/80 border-slate-600 text-gray-400 hover:bg-slate-700 hover:text-white'}`;
        btn.innerHTML = mode.icon;
        btn.title = mode.title;
        btn.onclick = () => {
            updatePageSetting(leftPage.id, 'scaleMode', mode.id);
            updatePageSetting(rightPage.id, 'scaleMode', mode.id);
        };
        settingsOverlay.appendChild(btn);
    });
    card.appendChild(settingsOverlay);

    observer.observe(card);
    return card;
}
