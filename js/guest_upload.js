import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, updateDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getFunctions, httpsCallable, httpsCallableFromURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
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
const GENERATE_PREVIEWS_URL = "https://generate-previews-452256252711.us-central1.run.app";

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

const professionalUploadUI = document.getElementById('professional-upload-ui');
const proUploadForm = document.getElementById('pro-upload-form');
const proFileInterior = document.getElementById('pro-file-interior');
const proFileCover = document.getElementById('pro-file-cover');
const proCoverGroup = document.getElementById('pro-cover-group');
const proUploadBtns = document.querySelectorAll('.pro-upload-btn');

let uploadMode = 'builder';

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
const specReadingDirection = document.getElementById('spec-reading-direction');

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
let coverPreviewMode = 'outside';
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

// --- Helper: Shared PDF Loader ---
// This ensures we never open the same network URL twice, regardless of where it's called
async function getSharedPdfDoc(url, storagePath) {
    // 1. Prefer storagePath as key (stable), fallback to URL
    const cacheKey = storagePath || url;
    
    // 2. Return existing promise if we are already loading this file
    if (remotePdfDocCache.has(cacheKey)) {
        return remotePdfDocCache.get(cacheKey);
    }

    // 3. Create new loading task with strict Range Request settings
    // disableAutoFetch: Prevents downloading the whole 700MB file
    // disableStream: Forces chunk-based fetching
    const loadingTask = pdfjsLib.getDocument({
        url: url,
        disableAutoFetch: true,
        disableStream: true,
        rangeChunkSize: 65536*2 // Fetch in 128kb chunks
    });

    const promise = loadingTask.promise;
    
    // 4. Save to cache
    remotePdfDocCache.set(cacheKey, promise);
    
    // 5. Handle failure (remove from cache so we can try again)
    promise.catch(err => {
        console.error("PDF Load Failed:", err);
        remotePdfDocCache.delete(cacheKey);
    });

    return promise;
}

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

// --- Helper: Busy Overlay ---
// --- Helper: Busy Overlay ---
// --- Helper: Busy Overlay ---
function toggleBusyOverlay(show, msg = "Processing...") {
    let overlay = document.getElementById('busy-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'busy-overlay';
        overlay.className = "fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center transition-opacity opacity-0 pointer-events-none";
        overlay.innerHTML = `
            <div class="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-600 flex flex-col items-center gap-6 transform scale-95 transition-transform max-w-sm w-full">
                <div class="relative">
                    <div class="w-16 h-16 border-4 border-slate-600 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <svg class="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                    </div>
                </div>
                <div class="text-center space-y-2">
                    <h3 id="busy-title" class="text-xl font-bold text-white">Processing</h3>
                    <p id="busy-message" class="text-gray-300 font-medium text-sm animate-pulse">${msg}</p>
                </div>
                <div class="w-full bg-slate-700 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div id="busy-bar" class="bg-indigo-500 h-full rounded-full w-1/3 animate-[shimmer_1.5s_infinite_linear]"></div>
                </div>
            </div>
        `;
        const style = document.createElement('style');
        style.innerHTML = `@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`;
        document.head.appendChild(style);
        document.body.appendChild(overlay);
    }
    
    const msgEl = overlay.querySelector('#busy-message');
    
    if (show) {
        if(msgEl) msgEl.textContent = msg;
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        overlay.querySelector('div').classList.remove('scale-95');
        overlay.querySelector('div').classList.add('scale-100');
    } else {
        overlay.classList.add('opacity-0', 'pointer-events-none');
        overlay.querySelector('div').classList.add('scale-95');
        overlay.querySelector('div').classList.remove('scale-100');
    }
}

function updateBusyMessage(msg) {
    const msgEl = document.getElementById('busy-message');
    if (msgEl) msgEl.textContent = msg;
}

// --- Cover Preview Tabs Logic ---
function setupCoverPreviewTabs() {
    const btnOutside = document.getElementById('btn-preview-outside');
    const btnInside = document.getElementById('btn-preview-inside');
    const groupOuter = document.getElementById('outer-cover-group');
    const groupInner = document.getElementById('inner-cover-group');

    if (btnOutside && btnInside) {
        btnOutside.addEventListener('click', () => {
            coverPreviewMode = 'outside';
            btnOutside.className = 'px-3 py-1 text-xs font-medium rounded text-white bg-indigo-600 shadow-sm transition-colors';
            btnInside.className = 'px-3 py-1 text-xs font-medium rounded text-gray-400 hover:text-white transition-colors';
            
            if(groupOuter) groupOuter.classList.remove('hidden');
            if(groupInner) groupInner.classList.add('hidden');
            
            renderCoverPreview();
        });

        btnInside.addEventListener('click', () => {
            coverPreviewMode = 'inside';
            btnInside.className = 'px-3 py-1 text-xs font-medium rounded text-white bg-indigo-600 shadow-sm transition-colors';
            btnOutside.className = 'px-3 py-1 text-xs font-medium rounded text-gray-400 hover:text-white transition-colors';
            
            if(groupOuter) groupOuter.classList.add('hidden');
            if(groupInner) groupInner.classList.remove('hidden');
            
            renderCoverPreview();
        });
    }
}

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

// --- Professional Upload Mode Switchers ---
if (proUploadBtns) {
    proUploadBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Prevent the click from triggering the parent label's radio select immediately
            // (We handle the selection manually below)
            e.stopPropagation();
            e.preventDefault();

            // Set Mode
            uploadMode = 'professional';
            
            // Select the Binding Radio manually based on the button's data attribute
            const type = btn.dataset.type;
            const radio = document.querySelector(`input[name="projectType"][value="${type}"]`);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change')); // Trigger change to update UI states
            }

            // Update the main "Save" button text to reflect the new flow
            saveSpecsBtn.textContent = 'Continue to Upload';
            
            // [NEW] Update Visuals
            updateSelectionVisuals();
        });
    });
}

// Listen for normal radio clicks to reset mode back to 'builder'
Array.from(projectTypeRadios).forEach(radio => {
    radio.addEventListener('click', () => {
        // If user clicks the big card (not the pro button), revert to standard builder
        if (uploadMode === 'professional') {
            uploadMode = 'builder';
            saveSpecsBtn.textContent = 'Save & Start Builder';
        }
        // [NEW] Update Visuals
        updateSelectionVisuals();
    });
});

if (proUploadForm) {
    proUploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = proUploadForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
            const interiorFile = proFileInterior.files[0];
            const coverFile = proFileCover.files[0];

            // Basic validation
            if (!interiorFile) throw new Error("Interior PDF is required.");
            
            // Initialize tracking
            const allSourcePaths = {};
            const bookletMetadata = [];
            const progressText = document.getElementById('progress-text') || { textContent: '' }; 
            
            // Helper: Upload file to Firebase Storage
            const uploadFile = async (file, type) => {
                const timestamp = Date.now();
                const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const storagePath = `guest_uploads/${projectId}/${timestamp}_pro_${type}_${cleanName}`;
                const storageRef = ref(storage, storagePath);
                await uploadBytesResumable(storageRef, file);
                return storagePath;
            };

            // 1. Upload Interior
            const interiorPath = await uploadFile(interiorFile, 'interior');
            allSourcePaths['pro_interior'] = interiorPath;

            // 2. Parse Interior Page Count (using PDF.js locally)
            const fileUrl = URL.createObjectURL(interiorFile);
            const pdf = await pdfjsLib.getDocument(fileUrl).promise;
            const numPages = pdf.numPages;

            // 3. Create Metadata (Expand Pages)
            // We map every page 0 to N-1 to the single source file
            for (let i = 0; i < numPages; i++) {
                bookletMetadata.push({
                    storagePath: interiorPath,
                    sourcePageIndex: i,
                    settings: { scaleMode: 'fit', alignment: 'center' },
                    type: 'interior_page'
                });
            }

            // 4. Handle Cover
            if (coverFile) {
                const coverPath = await uploadFile(coverFile, 'cover');
                allSourcePaths['pro_cover'] = coverPath;
                
                // For professional uploads, we assume the PDF is a complete pre-imposed cover
                // So we map it to 'cover_front' which the backend treats as the primary cover part
                bookletMetadata.push({
                    storagePath: coverPath,
                    type: 'cover_front',
                    sourcePageIndex: 0,
                    settings: { scaleMode: 'fit' }
                });
            }

            // 5. Generate Booklet
            const generateBooklet = httpsCallable(functions, 'generateBooklet');
            // Pass spineMode='file' to disable any auto-stretch/mirror logic in the backend
            await generateBooklet({ projectId: projectId, files: bookletMetadata, spineMode: 'file' });

            // 6. Submit Status
            const submitGuestUpload = httpsCallable(functions, 'submitGuestUpload');
            await submitGuestUpload({ projectId: projectId });

            // 7. Persist State
            await persistStateAfterSubmit(allSourcePaths, 'submitted_complete');

            // 8. Success Redirect
            professionalUploadUI.classList.add('hidden');
            successState.classList.remove('hidden');
            
            setTimeout(() => {
                if (isAdmin) window.location.href = `admin_project.html?id=${projectId}`;
                else {
                    let url = `proof.html?id=${projectId}`;
                    if (guestToken) url += `&guestToken=${guestToken}`;
                    window.location.href = url;
                }
            }, 3000);

        } catch (error) {
            console.error("Professional Upload Failed:", error);
            alert("Upload failed: " + error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Upload & Generate Proof';
        }
    });
}

// --- Handle Project Type Selection ---
Array.from(projectTypeRadios).forEach(radio => {
    radio.addEventListener('change', (e) => {
        const val = e.target.value;
        specBinding.value = val === 'loose' ? '' : val;

        // Always show the paper section container
        paperSection.classList.remove('hidden');
        
        // Interior Paper is always required/visible
        specPaper.required = true;

        if (val === 'loose') {
            // Hide Cover Paper specifically for loose sheets
            if(specCoverPaper.parentElement) specCoverPaper.parentElement.classList.add('hidden');
            specCoverPaper.required = false;
            // Hide Reading Direction for loose sheets
            if (specReadingDirection && specReadingDirection.parentElement) {
                specReadingDirection.parentElement.classList.add('hidden');
            }
        } else {
            // Show Cover Paper for Saddle Stitch & Perfect Bound
            if(specCoverPaper.parentElement) specCoverPaper.parentElement.classList.remove('hidden');
            specCoverPaper.required = true;
            // Show Reading Direction
            if (specReadingDirection && specReadingDirection.parentElement) {
                specReadingDirection.parentElement.classList.remove('hidden');
            }
        }
        
        // [NEW] Update Visuals
        updateSelectionVisuals();
    });
});

// [NEW] Helper to find standard size key from dimensions object
function findMatchingStandardSize(dims) {
    if (!dims || !dims.width || !dims.height) return null;

    // Convert input dims to points for comparison (1 inch = 72 pts, 1 mm = 2.83465 pts)
    // Use 2.83465 (72/25.4) for mm conversion
    const wPoints = dims.units === 'mm' ? dims.width * 2.83465 : dims.width * 72;
    const hPoints = dims.units === 'mm' ? dims.height * 2.83465 : dims.height * 72;

    // Tolerance for floating point errors (approx 1mm ~ 3 points)
    const tolerance = 3; 

    for (const [key, std] of Object.entries(STANDARD_PAPER_SIZES)) {
        // Standard sizes in the config are likely stored in mm or have mm/in properties
        // Assuming STANDARD_PAPER_SIZES items have width_mm and height_mm
        const stdW = std.width_mm * 2.83465;
        const stdH = std.height_mm * 2.83465;

        // Check exact match (Portrait)
        if (Math.abs(wPoints - stdW) < tolerance && Math.abs(hPoints - stdH) < tolerance) return key;
        // Check rotated match (Landscape)
        if (Math.abs(wPoints - stdH) < tolerance && Math.abs(hPoints - stdW) < tolerance) return key;
    }
    return null;
}

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
        const standardKey = findMatchingStandardSize(projectSpecs.dimensions);
        if (standardKey) {
            specSizePreset.value = standardKey;
            specSizePreset.dispatchEvent(new Event('change'));
        } else {
            specSizePreset.value = 'custom';
            specSizePreset.dispatchEvent(new Event('change'));
            specWidth.value = projectSpecs.dimensions.width || '';
            specHeight.value = projectSpecs.dimensions.height || '';
            if (projectSpecs.dimensions.units) {
                const btn = document.querySelector(`.unit-toggle[data-unit="${projectSpecs.dimensions.units}"]`);
                if (btn) btn.click();
            }
        }
    }

    // 3. Other Fields
    if (specPaper) specPaper.value = projectSpecs.paperType || '';
    if (specCoverPaper) specCoverPaper.value = projectSpecs.coverPaperType || '';
    
    // --- [FIX] Restore Reading Direction ---
    if (specReadingDirection && projectSpecs.readingDirection) {
        specReadingDirection.value = projectSpecs.readingDirection;
    }
    // --------------------------------------

    // [NEW] Update Visuals to match restored state
    updateSelectionVisuals();

    // [NEW] Trigger change on binding to ensure correct visibility of Reading Direction
    const activeRadio = document.querySelector('input[name="projectType"]:checked');
    if (activeRadio) {
        activeRadio.dispatchEvent(new Event('change'));
    }
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

    // 1. Initial Clear
    const existing = container.querySelectorAll('.custom-controls');
    existing.forEach(el => el.remove());

    if (!coverSettings[inputId]) {
        coverSettings[inputId] = { pageIndex: 1, scaleMode: 'fill' };
    }
    const currentSettings = coverSettings[inputId];

    const controls = document.createElement('div');
    controls.className = 'custom-controls mt-2 flex flex-col gap-2 z-20 relative';

    let pdfSourceUrl;
    let isPDF = false;
    let localObjectURL; 

    if (typeof fileOrUrl === 'string') {
        pdfSourceUrl = fileOrUrl;
        isPDF = pdfSourceUrl.toLowerCase().endsWith('.pdf') || true;
    } else if (fileOrUrl && fileOrUrl.type === 'application/pdf') {
        pdfSourceUrl = URL.createObjectURL(fileOrUrl);
        localObjectURL = pdfSourceUrl;
        isPDF = true;
    }
    
    if (isPDF && pdfSourceUrl) {
        try {
            let docPromise;
            if (typeof fileOrUrl === 'string' && fileOrUrl.startsWith('http')) {
                docPromise = remotePdfDocCache.get(fileOrUrl) || pdfjsLib.getDocument(fileOrUrl).promise;
            } else {
                docPromise = pdfjsLib.getDocument(localObjectURL).promise;
            }

            const pdf = await docPromise; 

            // [FIX] Check for duplicates AGAIN after await
            const reCheck = container.querySelectorAll('.custom-controls');
            reCheck.forEach(el => el.remove());

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
            if (localObjectURL) URL.revokeObjectURL(localObjectURL);
        } catch (e) { 
            console.warn("Error loading PDF for controls", e);
            if (localObjectURL) URL.revokeObjectURL(localObjectURL);
        }
    }

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
            toggleBusyOverlay(true, "Loading cover..."); 

            if (display) {
                display.textContent = file.name;
                display.classList.remove('hidden');
            }
            selectedFiles[inputId] = file; 

            const name = file.name.toLowerCase();
            const type = file.type.toLowerCase();

            const isPDF = type === 'application/pdf' || name.endsWith('.pdf');
            const isComplexFormat = /\.(psd|ai|tiff|tif)$/i.test(name);
            const isWebImage = type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(name);
            const isLocal = (isPDF || isWebImage) && !isComplexFormat;

            // Reset settings for new file
            coverSettings[inputId] = { pageIndex: 1, scaleMode: 'fill' };

            try {
                if (!isLocal) {
                    processCoverFile(file, inputId);
                } else {
                    coverSources[inputId] = { 
                        file: file, 
                        status: 'ready', 
                        isServer: false 
                    };
                }

                // Generate Controls
                await createCoverControls(inputId, file);

                if (isLocal) {
                    renderCoverPreview();
                    renderBookViewer(); // [FIX] Update Ghost Pages immediately
                }
                triggerAutosave();
            } catch (err) {
                console.error(err);
            } finally {
                toggleBusyOverlay(false); 
            }

        } else {
            if (display) {
                display.textContent = '';
                display.classList.add('hidden');
            }
            delete selectedFiles[inputId];
            delete coverSources[inputId]; 
            renderCoverPreview();
            renderBookViewer(); // [FIX] Clear Ghost Pages immediately
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
    const file = isServer ? null : sourceEntry.file;
    
    const fileKey = isServer ? (sourceEntry.storagePath || sourceEntry.previewUrl || 'server_url') : (file ? file.name : 'unknown_file');
    const timestamp = (file && file.lastModified) ? file.lastModified : 'server_timestamp';
    const cacheKey = `${fileKey}_${pageIndex}_${timestamp}_stretched`;

    let imgBitmap;

    try {
        imgBitmap = await fetchBitmapWithCache(cacheKey, async () => {
            if (isServer) {
                if (!sourceEntry.previewUrl) return null;

                // [FIX] Check if URL points to an image or PDF
                const pathToCheck = (sourceEntry.storagePath || sourceEntry.previewUrl || '').toLowerCase();
                const cleanPath = pathToCheck.split('?')[0];
                const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(cleanPath);

                if (isImage) {
                    const resp = await fetch(sourceEntry.previewUrl);
                    if (!resp.ok) throw new Error("Failed to fetch image");
                    const blob = await resp.blob();
                    return createImageBitmap(blob);
                } else {
                    // PDF Logic
                    const docCacheKey = sourceEntry.storagePath || sourceEntry.previewUrl;
                    let pdfDocPromise = remotePdfDocCache.get(docCacheKey);
                    if (!pdfDocPromise) {
                        const loadingTask = pdfjsLib.getDocument(sourceEntry.previewUrl);
                        pdfDocPromise = loadingTask.promise;
                        remotePdfDocCache.set(docCacheKey, pdfDocPromise);
                    }
                    const pdf = await pdfDocPromise;
                    const page = await pdf.getPage(pageIndex);
                    const viewport = page.getViewport({ scale: 1.5 });
                    const cvs = document.createElement('canvas');
                    cvs.width = viewport.width;
                    cvs.height = viewport.height;
                    await page.render({ canvasContext: cvs.getContext('2d'), viewport }).promise;
                    return createImageBitmap(cvs);
                }

            } else if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
                // Local PDF
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
                cvs.width = viewport.width;
                cvs.height = viewport.height;
                await page.render({ canvasContext: cvs.getContext('2d'), viewport }).promise;
                return createImageBitmap(cvs);

            } else if (file) {
                // Local Image
                return createImageBitmap(file);
            }
            return null;
        });
    } catch (e) { 
        console.error("drawStretched load error:", e);
        return; 
    }

    if (!imgBitmap) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(targetZone.x, targetZone.y, targetZone.w, targetZone.h);
    ctx.clip();

    const imgW = imgBitmap.width;
    const imgH = imgBitmap.height;

    let scale = totalZone.h / imgH; 
    if (imgW * scale < totalZone.w) {
        scale = totalZone.w / imgW;
    }

    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawY = totalZone.y + (totalZone.h - drawH) / 2;

    let drawX;
    if (anchor === 'right') {
        const totalRight = totalZone.x + totalZone.w;
        drawX = totalRight - drawW;
    } else {
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

// [NEW] Helper to enforce binding constraints (Multiples of 4 or 2)
function balancePages() {
    // 1. Strip existing auto-blanks from the end to "reset"
    // This ensures we don't just keep piling them on.
    while (pages.length > 0 && pages[pages.length - 1].isAutoBlank) {
        pages.pop();
    }

    const binding = projectSpecs?.binding;
    if (!binding || binding === 'loose') {
        renderBookViewer();
        renderMinimap();
        return;
    }

    // Saddle Stitch = Multiple of 4. Perfect Bound = Multiple of 2.
    const multiple = (binding === 'saddleStitch' || binding === 'saddle-stitch') ? 4 : 2;
    const currentCount = pages.length;
    const remainder = currentCount % multiple;

    if (remainder !== 0) {
        const needed = multiple - remainder;
        for (let i = 0; i < needed; i++) {
            const pageId = `auto_blank_${Date.now()}_${i}`;
            pages.push({
                id: pageId,
                sourceFileId: null,
                pageIndex: 1,
                settings: { scaleMode: 'fit', alignment: 'center', panX: 0, panY: 0 },
                isSpread: false,
                isAutoBlank: true // [Tag] Distinguish from user-added blanks
            });
        }
    }
    
    renderBookViewer();
    renderMinimap();
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
    // 1. Capture files immediately to prevent GC of DataTransferItems
    const fileArray = Array.from(files);

    // 2. Show Overlay & Force Paint
    toggleBusyOverlay(true, "Analyzing files...");
    await new Promise(r => setTimeout(r, 50));

    // 3. Cleanup Blanks
    while (pages.length > 0 && pages[pages.length - 1].isAutoBlank) {
        pages.pop();
    }
    
    if (insertAtIndex !== null && insertAtIndex > pages.length) {
        insertAtIndex = pages.length;
    }

    const newPages = [];

    try {
        for (const file of fileArray) {
            updateBusyMessage(`Processing ${file.name}...`);

            const sourceId = Date.now() + Math.random().toString(16).slice(2);
            const name = file.name.toLowerCase();
            const type = file.type.toLowerCase();

            const isPDF = type === 'application/pdf' || name.endsWith('.pdf');
            const isComplexFormat = /\.(psd|ai|tiff|tif)$/i.test(name);
            const isWebImage = type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(name);
            
            // Large File Check (20MB)
            const isLargeFile = file.size > 20 * 1024 * 1024; 
            const isLocal = (isPDF || isWebImage) && !isComplexFormat && !isLargeFile;

            if (isLocal) {
                sourceFiles[sourceId] = file;
                let numPages = 1;
                if (isPDF) {
                     try {
                        const fileUrl = URL.createObjectURL(file);
                        const pdf = await pdfjsLib.getDocument(fileUrl).promise;
                        numPages = pdf.numPages;
                        URL.revokeObjectURL(fileUrl);
                     } catch (e) { console.warn("Could not parse PDF", e); }
                }
                addPagesToModel(newPages, sourceId, numPages, isSpreadUpload);
            } else {
                // Server Processing
                sourceFiles[sourceId] = { file: file, status: 'uploading', previewUrl: null, isServer: true }; 
                
                // Add 1 placeholder
                addPagesToModel(newPages, sourceId, 1, isSpreadUpload);
                
                // Process and wait for results
                const generatedPages = await processServerFile(file, sourceId);
                
                // Add remaining pages
                if (generatedPages && generatedPages.length > 1) {
                    for(let k=1; k < generatedPages.length; k++) {
                        newPages.push({
                            id: `${sourceId}_p${k}`,
                            sourceFileId: sourceId,
                            pageIndex: k + 1,
                            settings: { scaleMode: 'fit', alignment: 'center', panX: 0, panY: 0 },
                            isSpread: false
                        });
                    }
                }
            }
        }

        if (insertAtIndex !== null && insertAtIndex >= 0) {
            pages.splice(insertAtIndex, 0, ...newPages);
        } else {
            pages.push(...newPages);
        }
        
        saveState();
        balancePages();
        triggerAutosave();

    } catch (e) {
        console.error("Error adding files:", e);
        alert("Failed to add files: " + e.message);
    } finally {
        toggleBusyOverlay(false);
    }
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
        // 1. Set Initial State
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
            
            // WE USE THE JPG URL RETURNED BY THE SERVER
            coverSources[slotId] = {
                file: file,
                status: 'ready',
                previewUrl: firstPage.previewUrl, 
                storagePath: storagePath, 
                isServer: true,
                isThumbnail: true 
            };
            
            renderCoverPreview();
            renderBookViewer(); // [FIX] Update Ghost Pages after server processing
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
    let progressUnsubscribe = null;
    const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
    const tempId = Date.now().toString();
    // Create a secure ID for the progress document
    const progressDocId = `${userId}_${tempId}`; 

    try {
        const storagePath = `temp_uploads/${userId}/${tempId}/${file.name}`;
        const storageRef = ref(storage, storagePath);

        // Initial Busy State
        updateBusyMessage("Starting upload...");

        // Helper to update the on-page placeholder
        const updateStatus = (msg) => {
            if(sourceFiles[sourceId]) sourceFiles[sourceId].status = 'processing';
            const relatedPages = pages.filter(p => p.sourceFileId === sourceId);
            relatedPages.forEach(p => {
                const placeholder = document.getElementById(`placeholder-${p.id}`);
                if (placeholder) {
                    placeholder.innerHTML = `
                        <div class="flex flex-col items-center gap-3">
                            <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                            <p class="text-xs text-indigo-600 font-bold tracking-wide uppercase animate-pulse">${msg}</p>
                        </div>
                    `;
                }
            });
        };

        // 1. Upload with Progress Monitoring
        updateStatus("Uploading 0%");
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed', (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            const p = Math.round(progress);
            updateBusyMessage(`Uploading file... ${p}%`);
            updateStatus(`Uploading ${p}%`);
        });

        await uploadTask;

        // 2. Setup Firestore Listener for Real-time Server Progress
        updateStatus("Queued...");
        updateBusyMessage("Waiting for server...");

        const progressRef = doc(db, "temp_processing", progressDocId);
        
        // Initialize the doc so we can listen to it
        await setDoc(progressRef, { status: "Initializing...", createdAt: serverTimestamp() });

        progressUnsubscribe = onSnapshot(progressRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                if (data.status) {
                    updateBusyMessage(data.status);
                    updateStatus(data.status.split('...')[0]); // Short version for card
                }
            }
        });

        // 3. Call Generate Previews (Optimizing)
        // USE THE SPECIFIC URL FOR THE CUSTOM CONTAINER
        if (GENERATE_PREVIEWS_URL.includes("YOUR_CLOUD_RUN")) {
            console.error("Please set the GENERATE_PREVIEWS_URL in guest_upload.js");
            throw new Error("Configuration Error: Missing Server URL");
        }

        const generatePreviews = httpsCallableFromURL(functions, GENERATE_PREVIEWS_URL, { 
            timeout: 540000 // [FIX] 9 Minute Timeout (Client Side)
        });
        
        const result = await generatePreviews({
            filePath: storagePath,
            originalName: file.name,
            progressDocId: progressDocId // [FIX] Pass ID to server
        });

        // 4. Handle Results
        if (result.data && result.data.pages) {
            const generatedPages = result.data.pages;
            
            sourceFiles[sourceId] = {
                file: file,
                status: 'ready',
                previewUrl: generatedPages[0].previewUrl, 
                storagePath: storagePath,
                isServer: true,
                isThumbnail: true,
                pagePreviews: generatedPages 
            };
            
            return generatedPages;
        }

    } catch (err) {
        console.error("Server file processing failed", err);
        sourceFiles[sourceId] = { file: file, status: 'error', error: err.message };
        renderBookViewer();
        throw err; 
    } finally {
        // Cleanup listener
        if (progressUnsubscribe) progressUnsubscribe();
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
    
    // [FIX] Re-balance after deletion
    balancePages();
    triggerAutosave();
};

// --- Book Viewer Rendering ---

// --- New Helper: Ghost Cover Card ---
// --- New Helper: Ghost Cover Card ---
// --- Updated Helper: Ghost Cover Card (Matches Page Card Structure) ---
function createGhostCoverCard(sourceEntry, label, width, height, bleed, pixelsPerInch) {
    // 1. Calculate Inner Dimensions (same as standard pages)
    const containerW = (width + bleed) * pixelsPerInch;
    const containerH = (height + (bleed * 2)) * pixelsPerInch;
    
    // 2. Outer Card (Structural wrapper, no fixed size, matches page-card behavior)
    const card = document.createElement('div');
    // Use flex-shrink-0 to prevent squashing
    card.className = "relative group flex-shrink-0 cursor-default";
    
    // 3. Inner Container (The visual box)
    // We use the same sizing logic as createPageCard's canvasContainer
    const visualContainer = document.createElement('div');
    visualContainer.className = "relative overflow-hidden bg-white border border-dashed border-gray-400 shadow-sm opacity-40 group-hover:opacity-100 transition-opacity duration-300";
    visualContainer.style.width = `${containerW}px`;
    visualContainer.style.height = `${containerH}px`;
    
    // Label Badge
    const labelBadge = document.createElement('div');
    labelBadge.className = "absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md uppercase tracking-wider whitespace-nowrap pointer-events-none select-none";
    labelBadge.textContent = label;
    visualContainer.appendChild(labelBadge);

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.width = containerW * 1.5; // High DPI
    canvas.height = containerH * 1.5;
    canvas.className = "w-full h-full object-contain";
    visualContainer.appendChild(canvas);

    if (sourceEntry) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw the actual cover image/pdf
        drawFileWithTransform(
            ctx, sourceEntry, 0, 0, canvas.width, canvas.height, 
            'fill', 'center', 1, null, 'full', 0, 0
        );
    } else {
        // Empty State Visual
        const emptyState = document.createElement('div');
        emptyState.className = "absolute inset-0 flex items-center justify-center text-center p-4 pointer-events-none";
        emptyState.innerHTML = `<p class="text-xs text-gray-400 select-none italic">No ${label.toLowerCase()} file selected</p>`;
        visualContainer.appendChild(emptyState);
    }

    card.appendChild(visualContainer);
    return card;
}

function renderBookViewer() {
    const container = document.getElementById('book-viewer-container');
    if (!container) return;

    renderQueue.length = 0; 
    container.innerHTML = ''; 

    const width = projectSpecs.dimensions.width;
    const height = projectSpecs.dimensions.height;
    const bleed = 0.125;
    const visualScale = (250 * viewerScale) / ((width + bleed * 2) * 96);
    const pixelsPerInch = 96 * visualScale;

    // ... (Keep runPageRender / removePlaceholder / observer logic exactly as before) ...
    const runPageRender = (page, canvas) => {
        if (!page || !canvas) return Promise.resolve(true);
        const sourceEntry = sourceFiles[page.sourceFileId];
        if(sourceEntry) {
             const isServer = sourceEntry.isServer;
             const file = isServer ? null : sourceEntry.file; 
             const fileKey = isServer ? (sourceEntry.storagePath || sourceEntry.previewUrl) : (file ? file.name : 'unknown');
             const timestamp = (file && file.lastModified) ? file.lastModified : 'server';
             const cacheKey = `${fileKey}_${page.pageIndex || 1}_${timestamp}_full`; 
             if(imageCache.has(cacheKey)) {
                 return renderPageCanvas(page, canvas).catch(e => true);
             }
        }
        return enqueueRender(() => renderPageCanvas(page, canvas)).catch(err => true);
    };

    const removePlaceholder = (id) => {
        const ph = document.getElementById(`placeholder-${id}`);
        if (ph) { ph.style.opacity = '0'; setTimeout(() => ph.remove(), 300); }
    };

    const observer = new IntersectionObserver((entries, obs) => {
        const sortedEntries = entries.sort((a, b) => {
            return a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
        sortedEntries.forEach(entry => {
            if (entry.isIntersecting) {
                const card = entry.target;
                const cardId = card.dataset.id;
                obs.unobserve(card);
                if (cardId.startsWith('spread:')) {
                    const parts = cardId.split(':');
                    const id1 = parts[1]; const id2 = parts[2];
                    Promise.all([
                        runPageRender(pages.find(p => p.id === id1), document.getElementById(`canvas-${id1}`)),
                        runPageRender(pages.find(p => p.id === id2), document.getElementById(`canvas-${id2}`))
                    ]).finally(() => { removePlaceholder(id1); removePlaceholder(id2); });
                } else {
                    runPageRender(pages.find(p => p.id === cardId), document.getElementById(`canvas-${cardId}`)).finally(() => removePlaceholder(cardId));
                }
            }
        });
    }, { root: container.parentElement, rootMargin: '200px' });

    // --- SINGLE LAYOUT ---
    if (projectType === 'single') {
        // ... (Keep existing single logic) ...
        container.className = "flex flex-wrap gap-8 items-start justify-center p-6";
        const slots = [{ label: "Front Side", index: 0 }, { label: "Back Side", index: 1 }];
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
                content.innerHTML = `<div class="text-center p-4"><span class="text-xs text-gray-400 group-hover:text-white">Add File</span></div>`;
                content.onclick = () => { window._insertIndex = slot.index; hiddenInteriorInput.click(); };
                content.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) addInteriorFiles(e.dataTransfer.files, false, slot.index); });
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

    const isRTL = projectSpecs.readingDirection === 'rtl';

    container.appendChild(createInsertBar(0));

    // --- FIRST SPREAD ---
    const firstSpread = document.createElement('div');
    firstSpread.className = "spread-row flex justify-center items-end gap-0 mb-4 min-h-[100px] p-2 border border-transparent hover:border-dashed hover:border-gray-600 rounded";
    
    // Prepare Spacer
    const spacer = document.createElement('div');
    spacer.style.width = `${width * pixelsPerInch}px`;
    spacer.className = "pointer-events-none";

    // [FIX] Inside Front Cover Logic
    let frontCoverGhost = null;
    if (coverSources['file-cover-inside-front'] || projectSpecs.binding !== 'loose') {
        // Even if no file is selected yet, show the ghost slot if it's a booklet
        frontCoverGhost = createGhostCoverCard(
            coverSources['file-cover-inside-front'], 
            "Inside Front Cover", 
            width, height, bleed, pixelsPerInch
        );
    }

    if (isRTL) {
        // RTL: [Page 1, Inside Front Cover]
        if (pages[0]) firstSpread.appendChild(createPageCard(pages[0], 0, false, false, width, height, bleed, pixelsPerInch, observer));
        firstSpread.appendChild(frontCoverGhost || spacer);
    } else {
        // LTR: [Inside Front Cover, Page 1]
        firstSpread.appendChild(frontCoverGhost || spacer);
        if (pages[0]) firstSpread.appendChild(createPageCard(pages[0], 0, true, false, width, height, bleed, pixelsPerInch, observer));
    }
    container.appendChild(firstSpread);

    // --- MIDDLE SPREADS ---
    let i = 1;
    while (i < pages.length) {
        container.appendChild(createInsertBar(i));
        const spreadDiv = document.createElement('div');
        spreadDiv.className = "spread-row flex justify-center items-end gap-0 mb-4 min-h-[100px] p-2 border border-transparent hover:border-dashed hover:border-gray-600 rounded";

        const pA = pages[i];
        const pB = pages[i+1];

        let isLinkedSpread = false;
        if (pA && pB && pA.sourceFileId && pA.sourceFileId === pB.sourceFileId && pA.id.endsWith('_L') && pB.id.endsWith('_R')) {
            isLinkedSpread = true;
        }

        if (isLinkedSpread) {
            spreadDiv.appendChild(createSpreadCard(pA, pB, i, width, height, bleed, pixelsPerInch, observer));
            i += 2;
        } else {
            let leftPageObj, rightPageObj, leftIdx, rightIdx;
            if (isRTL) {
                leftPageObj = pB; leftIdx = i + 1;
                rightPageObj = pA; rightIdx = i;
            } else {
                leftPageObj = pA; leftIdx = i;
                rightPageObj = pB; rightIdx = i + 1;
            }

            if (leftPageObj) spreadDiv.appendChild(createPageCard(leftPageObj, leftIdx, false, false, width, height, bleed, pixelsPerInch, observer));
            else {
                const endSpacer = document.createElement('div');
                endSpacer.style.width = `${width * pixelsPerInch}px`;
                endSpacer.className = "pointer-events-none";
                spreadDiv.appendChild(endSpacer);
            }

            if (rightPageObj) spreadDiv.appendChild(createPageCard(rightPageObj, rightIdx, true, false, width, height, bleed, pixelsPerInch, observer));
            else {
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

    // --- [FIX] INSIDE BACK COVER LOGIC ---
    // We need to determine where the "Inside Back Cover" goes relative to the last page.
    // Total pages (pages.length).
    // If LTR:
    //   Page 1 (Right)
    //   P2 (L), P3 (R)
    //   P4 (L), P5 (R)
    // If last page is Even (Left), e.g., P4. The Right slot is empty. Inside Back goes there.
    // If last page is Odd (Right), e.g., P5. The spread is full. We need a NEW row: [Inside Back, Spacer].
    
    if (coverSources['file-cover-inside-back'] || projectSpecs.binding !== 'loose') {
        const backCoverGhost = createGhostCoverCard(
            coverSources['file-cover-inside-back'], 
            "Inside Back Cover", 
            width, height, bleed, pixelsPerInch
        );

        const lastWasEven = (pages.length % 2 === 0); // If count is 4, last page (P4) is Left.
        
        if (isRTL) {
            // RTL: P1 Left. P2 R, P3 L.
            // Even pages are Right. Odd pages are Left.
            // If Total 4: P4 is Right. Left slot is empty. Inside Back goes Left.
            // If Total 5: P5 is Left. Spread is full. New Row: [Spacer, Inside Back]
            if (lastWasEven) {
                // P_last is Right. Slot to Left is empty.
                // We need to find the *last spread div* we just created and prepend the ghost.
                const lastSpreadDiv = container.lastElementChild.previousElementSibling; // skip insert bar
                if (lastSpreadDiv && lastSpreadDiv.classList.contains('spread-row')) {
                    // Replace the "endSpacer" if it exists, or prepend
                    // In the loop above, if leftPageObj was null, we added a spacer.
                    // If pB was null (even count), leftPageObj (pB) was null.
                    // So the last spread has [Spacer, P_last(Right)].
                    // We replace Spacer with Ghost.
                    if (lastSpreadDiv.firstElementChild.classList.contains('pointer-events-none')) {
                        lastSpreadDiv.replaceChild(backCoverGhost, lastSpreadDiv.firstElementChild);
                    }
                }
            } else {
                // P_last is Left. Spread full. New Row.
                const lastSpread = document.createElement('div');
                lastSpread.className = "spread-row flex justify-center items-end gap-0 mb-4 min-h-[100px] p-2 border border-transparent rounded pointer-events-none opacity-80";
                
                const emptySpacer = document.createElement('div');
                emptySpacer.style.width = `${width * pixelsPerInch}px`;
                
                lastSpread.appendChild(emptySpacer);
                lastSpread.appendChild(backCoverGhost);
                container.appendChild(lastSpread);
            }
        } else {
            // LTR: P1 Right. P2 L, P3 R.
            // Even pages are Left. Odd pages are Right.
            // If Total 4: P4 is Left. Right slot empty. Inside Back goes Right.
            if (lastWasEven) {
                const lastSpreadDiv = container.lastElementChild.previousElementSibling; 
                if (lastSpreadDiv && lastSpreadDiv.classList.contains('spread-row')) {
                    // Last child should be the spacer (right side)
                    if (lastSpreadDiv.lastElementChild.classList.contains('pointer-events-none')) {
                        lastSpreadDiv.replaceChild(backCoverGhost, lastSpreadDiv.lastElementChild);
                    }
                }
            } else {
                // Total 5: P5 is Right. Spread full. New Row.
                const lastSpread = document.createElement('div');
                lastSpread.className = "spread-row flex justify-center items-end gap-0 mb-4 min-h-[100px] p-2 border border-transparent rounded pointer-events-none opacity-80";
                
                const emptySpacer = document.createElement('div');
                emptySpacer.style.width = `${width * pixelsPerInch}px`;
                
                lastSpread.appendChild(backCoverGhost);
                lastSpread.appendChild(emptySpacer);
                container.appendChild(lastSpread);
            }
        }
    }

    validateForm();

    // ... (Keep Sortable logic) ...
    const spreadDivs = container.querySelectorAll('.spread-row');
    spreadDivs.forEach(spreadDiv => {
        // Only make sortable if it doesn't contain a ghost card (to prevent dragging into covers)
        // Or strict filter: draggable: '.page-card' (already set)
        // But we should prevent dropping *onto* ghost cards? Sortable handles lists.
        // As long as ghost cards aren't '.page-card', they won't be dragged.
        // But they might be valid drop targets? 'put: true'.
        // We want to prevent reordering the cover rows.
        // Simple check: don't init sortable on first/last rows if they have covers?
        // Better: Init on all, but filter move. 
        // For now, standard logic applies. The ghost cards are just DOM elements.
        new Sortable(spreadDiv, {
            group: { name: 'shared-spreads', pull: true, put: true },
            animation: 150,
            draggable: '.page-card', // Ghost cards don't have this class
            handle: '.drag-handle',
            // ...
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
    // [FIX] 1. Clear canvas with background color to prevent "ghost" images
    ctx.fillStyle = '#1e293b'; 
    ctx.fillRect(0, 0, w, h);

    const margin = 5;
    const pageW = (w - (margin*3)) / 2;
    const pageH = h - (margin*2);
    const leftX = margin;
    const rightX = margin + pageW + margin;
    const topY = margin;

    // Helper
    const drawPage = async (page, x, y) => {
        // Draw white page background
        ctx.fillStyle = '#ffffff'; 
        ctx.fillRect(x, y, pageW, pageH);

        if (!page || !page.sourceFileId) return;
        const sourceEntry = sourceFiles[page.sourceFileId];
        if (!sourceEntry) return;

        await drawFileWithTransform(
            ctx, sourceEntry, x, y, pageW, pageH,
            page.settings.scaleMode || 'fit',
            page.settings.alignment || 'center',
            page.pageIndex || 1,
            page.id,
            'full', 
            0, 0, 
            0.25 
        );
    };

    // Layout Logic
    const isRTL = projectSpecs.readingDirection === 'rtl';
    const isFirstPage = (pages.indexOf(pageList[0]) === 0);

    if (isFirstPage) {
        // Page 1: LTR = Right, RTL = Left
        const x = isRTL ? leftX : rightX;
        await drawPage(pageList[0], x, topY);
    } else {
        // Spreads: pageList is [EvenPage, OddPage] (e.g., [P2, P3])
        // LTR Visual: [P2, P3] -> P2 is Left, P3 is Right
        // RTL Visual: [P3, P2] -> P3 is Left, P2 is Right
        
        const pLeft = isRTL ? pageList[1] : pageList[0];
        const pRight = isRTL ? pageList[0] : pageList[1];

        if (pLeft) await drawPage(pLeft, leftX, topY);
        if (pRight) await drawPage(pRight, rightX, topY);
    }
}

// --- NEW HELPER: Sync Main View to Thumbnail ---
function updateThumbnailFromMain(page) {
    // 1. Find the thumbnail canvas
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
    
    const isRTL = projectSpecs.readingDirection === 'rtl';

    // 2. Determine position on thumbnail
    let x;
    
    // Check if this is the very first page of the book
    if (pages.indexOf(page) === 0) {
        x = isRTL ? leftX : rightX;
    } else {
        // The ID structure from renderMinimap is `thumb-canvas-${id1}_${id2}`
        // where id1 is the first item in the list (Even page) and id2 is the second (Odd page).
        // e.g., P2_P3
        
        const isFirstInPair = thumbCanvas.id.includes(`thumb-canvas-${page.id}_`);
        
        if (isRTL) {
            // RTL Visual: [P3 (Odd), P2 (Even)]
            // If page is P2 (FirstInPair): It goes on the Right
            // If page is P3 (SecondInPair): It goes on the Left
            x = isFirstInPair ? rightX : leftX;
        } else {
            // LTR Visual: [P2 (Even), P3 (Odd)]
            // If page is P2 (FirstInPair): It goes on the Left
            // If page is P3 (SecondInPair): It goes on the Right
            x = isFirstInPair ? leftX : rightX;
        }
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

        // [FIX] Update the thumbnail now that the drag operation is complete
        const page = pages.find(p => p.id === activePageId);
        if (page && typeof updateThumbnailFromMain === 'function') {
            // Use requestAnimationFrame to ensure the main canvas has finished its last paint
            requestAnimationFrame(() => {
                updateThumbnailFromMain(page);
            });
        }
        
        // Sync changes
        triggerAutosave();
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
    // [FIX] 1. Strip auto-blanks first. 
    // If you have [Content, AutoBlank] and add a Manual Blank, 
    // we want [Content, ManualBlank], not [Content, AutoBlank, ManualBlank].
    while (pages.length > 0 && pages[pages.length - 1].isAutoBlank) {
        pages.pop();
    }

    if (insertAtIndex !== null && insertAtIndex > pages.length) {
        insertAtIndex = pages.length;
    }

    const newPages = [];
    for (let i = 0; i < count; i++) {
        const pageId = `manual_blank_${Date.now()}_${i}`;
        newPages.push({
            id: pageId,
            sourceFileId: null,
            pageIndex: 1,
            settings: { scaleMode: 'fit', alignment: 'center', panX: 0, panY: 0 },
            isSpread: false,
            isAutoBlank: false // [Important] This is a REAL page now
        });
    }

    if (insertAtIndex !== null && insertAtIndex >= 0) {
        pages.splice(insertAtIndex, 0, ...newPages);
    } else {
        pages.push(...newPages);
    }

    saveState();
    // [FIX] 2. Re-balance immediately.
    // If adding this manual blank made the total 3, this will add 1 auto-blank to fix it.
    balancePages();
    triggerAutosave();
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

    let classes = "page-card relative group bg-slate-800 shadow-lg border border-slate-700 transition-all hover:border-indigo-500 cursor-grab active:cursor-grabbing flex-shrink-0";

    if (projectType === 'single') {
        classes += " border-2";
    } else {
        // Visually separate the spine
        if (isFirstPage) {
            classes += " border-l-2 border-l-slate-900";
        } else if (isRightPage) {
            classes += " border-l-0";
        } else {
            classes += " border-r-0";
        }
    }
    card.className = classes;
    card.style.flexShrink = '0';

    // Layout Logic
    const bleedPx = bleed * pixelsPerInch;
    
    // The canvas (the full image) has size: (Trim + 2*Bleed) x (Height + 2*Bleed)
    // We need to determine the Viewport Size (containerW/H) and the Shift (canvasLeft/Top)

    let containerW, containerH;
    let canvasLeft, canvasTop;

    if (projectType === 'single') {
        // Show Everything
        containerW = (width + (bleed * 2)) * pixelsPerInch;
        containerH = (height + (bleed * 2)) * pixelsPerInch;
        canvasLeft = 0;
        canvasTop = 0;
    } else {
        // Booklet Mode:
        // Width displayed is always (Trim + 1 Bleed)
        containerW = (width + bleed) * pixelsPerInch;
        containerH = (height + (bleed*2)) * pixelsPerInch;
        canvasTop = 0;

        if (isRightPage) {
            // RIGHT PAGE: Show [Trim][Right Bleed]. Hide [Left Bleed].
            // Shift canvas LEFT by bleedPx to hide the left bleed.
            canvasLeft = -bleedPx;
        } else {
            // LEFT PAGE: Show [Left Bleed][Trim]. Hide [Right Bleed].
            // Canvas starts at 0. The container width cuts off the Right Bleed.
            canvasLeft = 0;
        }
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
    dragHandle.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>';
    card.appendChild(dragHandle);

    // [FIX] Compact Icon-Only Warning
    const dpiWarning = document.createElement('div');
    dpiWarning.id = `dpi-warning-${page.id}`;
    dpiWarning.className = "hidden absolute top-2 left-9 z-40 group/dpi";
    dpiWarning.innerHTML = `
        <div class="text-yellow-400 bg-slate-900/80 p-1.5 rounded-md backdrop-blur-md border border-yellow-500/30 shadow-md cursor-help transition-colors hover:text-yellow-300 hover:border-yellow-400">
            <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
            </svg>
        </div>
        <div class="absolute left-0 top-full mt-2 w-48 bg-slate-900 text-gray-200 text-[11px] px-3 py-2 rounded-lg border border-slate-600 shadow-xl opacity-0 group-hover/dpi:opacity-100 transition-opacity pointer-events-none z-50">
            <p class="font-bold text-yellow-400 mb-1 flex items-center gap-1">
                Low Resolution (<span id="dpi-val-${page.id}" class="font-mono">0</span> DPI)
            </p>
            <p class="leading-tight text-gray-300">
                300 DPI is standard. 
                <span class="block mt-1 text-gray-400 italic">Images below this may appear blurry or pixelated in print.</span>
            </p>
        </div>
    `;
    card.appendChild(dpiWarning);

    // Overlay Controls
    const controls = document.createElement('div');
    controls.className = "absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 p-1 rounded backdrop-blur-sm z-20";
    controls.innerHTML = `
        <button type="button" onclick="deletePage('${page.id}')" class="text-red-400 hover:text-white p-1" title="Delete Page">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;
    card.appendChild(controls);

    // Overlay Settings
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

    card.appendChild(canvasContainer);
    card.appendChild(pageNum);

    const placeholder = document.createElement('div');
    placeholder.className = "absolute inset-0 flex items-center justify-center text-gray-600 bg-slate-200 z-10 transition-opacity duration-300";
    placeholder.innerHTML = '<div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>';
    placeholder.id = `placeholder-${page.id}`;
    canvasContainer.appendChild(placeholder);

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        card.addEventListener(eventName, (e) => {
            if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault(); e.stopPropagation();
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
            if (files.length > 0) await updatePageContent(page.id, files[0]);
        }
    });

    observer.observe(card);
    return card;
}

// Helper to replace page content
// Helper to replace page content
async function updatePageContent(pageId, file) {
    const page = pages.find(p => p.id === pageId);
    if (!page) return;

    const sourceId = Date.now() + Math.random().toString(16).slice(2);
    
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    
    const isPDF = type === 'application/pdf' || name.endsWith('.pdf');
    const isComplexFormat = /\.(psd|ai|tiff|tif)$/i.test(name);
    const isWebImage = type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(name);
    const isLocal = (isPDF || isWebImage) && !isComplexFormat;

    if (isLocal) {
        sourceFiles[sourceId] = file;
        page.sourceFileId = sourceId;
        page.pageIndex = 1; // Reset to page 1

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
    
    triggerAutosave();
}

async function renderPageCanvas(page, canvas) {
    const pageIndex = pages.indexOf(page);
    
    // [FIX] Correctly determine Visual Side based on Reading Direction
    const isRTL = projectSpecs.readingDirection === 'rtl';
    const isEvenIndex = pageIndex % 2 === 0; // Index 0 (P1), 2 (P3), etc.
    
    // LTR: Even Index (0,2) = Right Page. Odd Index (1,3) = Left Page.
    // RTL: Even Index (0,2) = Left Page. Odd Index (1,3) = Right Page.
    const isRightPage = isRTL ? !isEvenIndex : isEvenIndex;

    let view = isRightPage ? 'right' : 'left';
    if (projectType === 'single') view = 'full';

    // ... (Standard blank check logic) ...
    if (page.sourceFileId === null) {
        drawBlankPage(page, canvas, view);
        const w = document.getElementById(`dpi-warning-${page.id}`);
        if (w) w.classList.add('hidden');
        return;
    }

    // 2. Validate Source
    const sourceEntry = sourceFiles[page.sourceFileId];
    if (!sourceEntry) {
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
    const pixelDensity = 1.5; 

    const totalW = width + (bleed*2);
    const totalH = height + (bleed*2);

    canvas.width = Math.ceil(totalW * pixelsPerInch * pixelDensity);
    canvas.height = Math.ceil(totalH * pixelsPerInch * pixelDensity);
    
    canvas.style.width = `${totalW * pixelsPerInch}px`;
    canvas.style.height = `${totalH * pixelsPerInch}px`;
    canvas.style.top = '0px';
    
    // [FIX] Apply shift based on the CORRECT 'view' variable calculated above
    if (view === 'right') canvas.style.left = `-${bleed * pixelsPerInch}px`;
    else canvas.style.left = '0px';

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    ctx.scale(pixelsPerInch, pixelsPerInch);

    // 4. Draw Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, totalH);

    // --- OPTIMIZATION 1: Blurry Placeholder ---
    try {
        const file = sourceEntry.isServer ? null : sourceEntry.file;
        const fileKey = sourceEntry.isServer ? (sourceEntry.storagePath || sourceEntry.previewUrl) : (file ? file.name : 'unknown');
        const timestamp = (file && file.lastModified) ? file.lastModified : 'server';
        const thumbCacheKey = `${fileKey}_${page.pageIndex || 1}_${timestamp}_s0.25`;

        if (imageCache.has(thumbCacheKey)) {
            const thumbBitmap = imageCache.get(thumbCacheKey);
            if (thumbBitmap) {
                // ... (Keep placeholder drawing logic) ...
                const srcW = thumbBitmap.width; const srcH = thumbBitmap.height;
                const srcRatio = srcW / srcH; const targetRatio = totalW / totalH;
                let drawW, drawH, drawX, drawY;
                const mode = page.settings.scaleMode || 'fit';
                const panX = page.settings.panX || 0; const panY = page.settings.panY || 0;
                
                if (mode === 'stretch') { drawW = totalW; drawH = totalH; } 
                else if (mode === 'fit') {
                    if (srcRatio > targetRatio) { drawW = totalW; drawH = totalW / srcRatio; } else { drawH = totalH; drawW = totalH * srcRatio; }
                } else {
                    if (srcRatio > targetRatio) { drawH = totalH; drawW = totalH * srcRatio; } else { drawW = totalW; drawH = totalW / srcRatio; }
                }
                drawX = (totalW - drawW) / 2 + (panX * totalW);
                drawY = (totalH - drawH) / 2 + (panY * totalH);
                ctx.drawImage(thumbBitmap, drawX, drawY, drawW, drawH);
            }
        }
    } catch (e) {}

    // 5. Draw File (High Res)
    const renderStats = await drawFileWithTransform(
        ctx, sourceEntry, 0, 0, totalW, totalH, 
        page.settings.scaleMode, 
        page.settings.alignment, 
        page.pageIndex, 
        page.id, 
        view, // Pass the correctly calculated view
        page.settings.panX, 
        page.settings.panY
    );

    // ... (Keep DPI Check logic) ...
    const warningEl = document.getElementById(`dpi-warning-${page.id}`);
    const valEl = document.getElementById(`dpi-val-${page.id}`);

    if (renderStats && renderStats.isImage && warningEl && valEl) {
        const effectiveDPI = renderStats.srcW / renderStats.drawW;
        const DPI_THRESHOLD = 290; 
        if (effectiveDPI < DPI_THRESHOLD) {
            valEl.textContent = Math.round(effectiveDPI);
            warningEl.classList.remove('hidden');
            const icon = warningEl.querySelector('div');
            if (icon) {
                if (effectiveDPI < 200) icon.className = "text-red-400 bg-slate-900/80 p-1.5 rounded-md backdrop-blur-md border border-red-500/30 shadow-md cursor-help transition-colors hover:text-red-300 hover:border-red-400";
                else icon.className = "text-yellow-400 bg-slate-900/80 p-1.5 rounded-md backdrop-blur-md border border-yellow-500/30 shadow-md cursor-help transition-colors hover:text-yellow-300 hover:border-yellow-400";
            }
        } else {
            warningEl.classList.add('hidden');
        }
    } else if (warningEl) {
        warningEl.classList.add('hidden');
    }

    if (typeof updateThumbnailFromMain === 'function') {
        updateThumbnailFromMain(page);
    }

    // 6. Draw Guides (Corrected Geometry)
    const guideScale = pixelsPerInch / 72;
    const mockSpecs = {
        dimensions: { width: width, height: height, units: 'in' },
        bleedInches: bleed,
        safetyInches: 0.125
    };

    let renderInfo = {
        x: view === 'right' ? bleed * pixelsPerInch : 0,
        y: 0,
        // [FIX] Ensure guide width matches visual width.
        // If view is 'left' (Index 1/Left Page), we show LeftBleed + Width.
        // If view is 'right' (Index 0/Right Page), we show Width + RightBleed.
        width: (view === 'full') ? totalW * pixelsPerInch : (width + bleed) * pixelsPerInch,
        height: totalH * pixelsPerInch,
        scale: guideScale,
        isSpread: (view !== 'full'),
        isLeftPage: view === 'left'
    };
    
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

    const visualScale = (250 * viewerScale) / ((width + bleed*2) * 96);
    const pixelsPerInch = 96 * visualScale;
    const pixelDensity = 1.5;

    const totalW = width + (bleed*2);
    const totalH = height + (bleed*2);

    canvas.width = Math.ceil(totalW * pixelsPerInch * pixelDensity);
    canvas.height = Math.ceil(totalH * pixelsPerInch * pixelDensity);

    canvas.style.width = `${totalW * pixelsPerInch}px`;
    canvas.style.height = `${totalH * pixelsPerInch}px`;
    canvas.style.top = '0px';
    
    if (view === 'right') canvas.style.left = `-${bleed * pixelsPerInch}px`;
    else canvas.style.left = '0px';

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
    
    // [FIX] Updated text to indicate usability
    if (page.isAutoBlank) {
        ctx.fillText("Required Blank", totalW / 2, totalH / 2 - 0.4);
        ctx.font = '0.25px sans-serif';
        ctx.fillText("(Binding Requirement)", totalW / 2, totalH / 2 + 0.1);
        ctx.fillText("Drag File Here to Replace", totalW / 2, totalH / 2 + 0.5);
    } else {
        ctx.fillText("Drop File Here", totalW / 2, totalH / 2);
    }

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
// Add 'forceScale' to the arguments (defaults to null)
async function drawFileWithTransform(ctx, sourceEntry, targetX, targetY, targetW, targetH, mode, align, pageIndex = 1, pageId = null, viewMode = 'full', panX = 0, panY = 0, forceScale = null) {
    if (!sourceEntry) return null;

    let file, status, isServer, previewUrl, storagePath;
    
    // Normalization Logic
    if (sourceEntry instanceof File) {
        file = sourceEntry;
        status = 'ready';
        isServer = false;
    } else {
        file = sourceEntry.file;
        status = sourceEntry.status || 'ready';
        isServer = sourceEntry.isServer;
        previewUrl = sourceEntry.previewUrl;
        storagePath = sourceEntry.storagePath;
    }

    if (status === 'error') {
        ctx.fillStyle = '#fee2e2'; 
        ctx.fillRect(targetX, targetY, targetW, targetH); 
        return null;
    }
    if (status === 'processing' || status === 'uploading') {
        drawProcessingState(ctx, targetX, targetY, targetW, targetH); 
        return null;
    }

    const fileKey = isServer ? (storagePath || previewUrl || 'server_url') : (file ? file.name : 'unknown_file');
    const timestamp = (file && file.lastModified) ? file.lastModified : 'server_timestamp';
    
    const scaleKey = forceScale ? `_s${forceScale}` : '_full';
    const cacheKey = `${fileKey}_${pageIndex}_${timestamp}${scaleKey}`;
    const fullCacheKey = `${fileKey}_${pageIndex}_${timestamp}_full`; 

    let imgBitmap;

    try {
        // OPTIMIZATION: If requesting a thumbnail (forceScale), check if Full Version is already available
        if (forceScale && (imageCache.has(fullCacheKey) || pendingLoadCache.has(fullCacheKey))) {
            imgBitmap = await fetchBitmapWithCache(fullCacheKey, async () => null); 
        } else {
            imgBitmap = await fetchBitmapWithCache(cacheKey, async () => {
                const renderScale = forceScale || (isServer ? 1.5 : 1.0); 

                if (isServer) {
                    // [FIX] Dynamic Page Lookup
                    // If we have a list of pre-generated thumbnails, find the one for THIS page.
                    let activeUrl = previewUrl;
                    
                    if (sourceEntry.pagePreviews && Array.isArray(sourceEntry.pagePreviews)) {
                        const pageData = sourceEntry.pagePreviews.find(p => p.pageNumber === pageIndex);
                        if (pageData && pageData.previewUrl) {
                            activeUrl = pageData.previewUrl;
                        }
                    }

                    // Check if the resolved URL is an image (Thumbnail)
                    if (sourceEntry.isThumbnail || /\.(jpg|jpeg|png)$/i.test(activeUrl)) {
                         const resp = await fetch(activeUrl);
                         if (!resp.ok) throw new Error("Failed to fetch image");
                         const blob = await resp.blob();
                         return createImageBitmap(blob);
                    }
                    
                    if (!activeUrl) return null; 
                    
                    // Fallback to PDF logic only if not an image
                    const pathToCheck = (storagePath || activeUrl || '').toLowerCase();
                    const cleanPath = pathToCheck.split('?')[0];
                    const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(cleanPath);

                    if (isImage) {
                        const resp = await fetch(activeUrl);
                        if (!resp.ok) throw new Error("Failed to fetch image");
                        const blob = await resp.blob();
                        return createImageBitmap(blob);
                    } else {
                        // Shared PDF Loader with Range Requests
                        const pdf = await getSharedPdfDoc(activeUrl, storagePath);
                        const page = await pdf.getPage(pageIndex);
                        const viewport = page.getViewport({ scale: renderScale }); 
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = viewport.width;
                        tempCanvas.height = viewport.height;
                        await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport: viewport }).promise;
                        return createImageBitmap(tempCanvas);
                    }

                } else if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
                    // Local PDF Logic
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

                } else if (file) {
                    // Local Image Fallback
                    return createImageBitmap(file);
                }
                return null;
            });
        }
        
        if (!imgBitmap) {
            ctx.fillStyle = '#f1f5f9'; ctx.fillRect(targetX, targetY, targetW, targetH); return null;
        }

        const srcW = imgBitmap.width;
        const srcH = imgBitmap.height;
        const srcRatio = srcW / srcH;
        const targetRatio = targetW / targetH;
        let drawW, drawH, drawX, drawY;

        if (mode === 'stretch') { 
            drawW = targetW; 
            drawH = targetH; 
        } else if (mode === 'fit') {
            if (srcRatio > targetRatio) { 
                drawW = targetW; 
                drawH = targetW / srcRatio; 
            } else { 
                drawH = targetH; 
                drawW = targetH * srcRatio; 
            }
        } else { 
            // Fill
            if (srcRatio > targetRatio) { 
                drawH = targetH; 
                drawW = targetH * srcRatio; 
            } else { 
                drawW = targetW; 
                drawH = targetW / srcRatio; 
            }
        }

        drawX = targetX + (targetW - drawW) / 2 + (panX * targetW);
        drawY = targetY + (targetH - drawH) / 2 + (panY * targetH);

        ctx.save();
        ctx.beginPath();
        ctx.rect(targetX, targetY, targetW, targetH);
        ctx.clip();
        ctx.drawImage(imgBitmap, drawX, drawY, drawW, drawH);
        ctx.restore();

        if (!forceScale) {
            const cleanPath = isServer ? (storagePath || previewUrl || '').toLowerCase().split('?')[0] : (file ? file.name.toLowerCase() : '');
            const isImg = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(cleanPath) || (file && file.type.startsWith('image/'));
            return { srcW, drawW, isImage: isImg };
        }
        return null;

    } catch (e) {
        console.error("Draw Render Error:", e);
        ctx.fillStyle = '#fee2e2'; ctx.fillRect(targetX, targetY, targetW, targetH);
        return null;
    }
}

// --- Locking Logic ---

async function acquireLock() {
    // CHANGE: Use specific lock document in sub-collection
    const lockRef = doc(db, 'projects', projectId, 'locks', 'main');
    const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

    try {
        const acquired = await runTransaction(db, async (transaction) => {
            const lockDoc = await transaction.get(lockRef);
            
            let lock = null;
            if (lockDoc.exists()) {
                lock = lockDoc.data();
            }

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
                    // Pass the lock data explicitly since it's no longer on the project doc
                    showLockedScreen(lock);
                    return false; // Failed to acquire
                }
            }

            // Acquire or Renew Lock
            // We use set() with merge for the sub-collection doc
            transaction.set(lockRef, {
                userId: userId,
                userDisplay: userEmail,
                timestamp: serverTimestamp()
            }, { merge: true });

            return true; // Acquired
        });

        if (acquired) {
            hasActiveLock = true;
        }
        return acquired;

    } catch (e) {
        console.error("Transaction failed: ", e);
        // Don't show error UI for lock contention, just return false (or handle gracefully)
        // But if it's a permission/network error, maybe alert.
        if (e.message !== "Lock lost") console.warn("Lock acquisition error", e);
        return false;
    }
}

function startLockHeartbeat() {
    // Update lock every 60 seconds
    const intervalId = setInterval(async () => {
        if (!projectId || !currentUser) return;
        try {
            // CHANGE: Point to the lock document
            const lockRef = doc(db, 'projects', projectId, 'locks', 'main');

            // Use transaction to safely renew ONLY if we still own the lock
            await runTransaction(db, async (transaction) => {
                const lockDoc = await transaction.get(lockRef);
                
                // If doc doesn't exist, we lost the lock (deleted by admin or expired/GC'd)
                if (!lockDoc.exists()) throw new Error("Lock lost");

                const lock = lockDoc.data();

                // If lock belongs to someone else, stop heartbeat
                if (lock.userId !== currentUser.uid) {
                    throw new Error("Lock lost");
                }

                transaction.update(lockRef, {
                    timestamp: serverTimestamp()
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
        // CHANGE: Point to lock document
        const lockRef = doc(db, 'projects', projectId, 'locks', 'main');

        await runTransaction(db, async (transaction) => {
            const lockDoc = await transaction.get(lockRef);
            if (!lockDoc.exists()) return;

            const lock = lockDoc.data();

            // If lock matches our user ID, delete the lock document
            if (lock && lock.userId === currentUser.uid) {
                transaction.delete(lockRef);
            }
        });
        hasActiveLock = false; 
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
                    // CHANGE: Delete the lock document instead of updating project
                    const lockRef = doc(db, 'projects', projectId, 'locks', 'main');
                    const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
                    await deleteDoc(lockRef);
                    
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

    const myRenderId = ++coverRenderId;

    // Switch parent to grid-center
    const parent = coverCanvas.parentElement;
    if (parent) {
        parent.classList.remove('flex', 'items-center', 'justify-center');
        parent.classList.add('grid', 'place-items-center');
    }

    const scale = 2; 
    const trimWidth = projectSpecs.dimensions.width;
    const trimHeight = projectSpecs.dimensions.height;
    const bleed = 0.125;
    
    const paperObj = HARDCODED_PAPER_TYPES.find(p => p.name === projectSpecs.paperType);
    const interiorCaliper = paperObj ? paperObj.caliper : 0.004;
    const coverPaperObj = HARDCODED_PAPER_TYPES.find(p => p.name === projectSpecs.coverPaperType);
    const coverCaliper = coverPaperObj ? coverPaperObj.caliper : (paperObj ? interiorCaliper : 0.004);
    
    const interiorSheets = Math.ceil(pages.length / 2);
    let spineWidth = (interiorSheets * interiorCaliper) + (coverCaliper * 2);
    
    if (projectSpecs.binding === 'saddleStitch' || projectSpecs.binding === 'loose') spineWidth = 0;

    if (spineWidthDisplay) spineWidthDisplay.textContent = spineWidth.toFixed(3);

    const totalWidth = (trimWidth * 2) + spineWidth + (bleed * 2);
    const totalHeight = trimHeight + (bleed * 2);

    const basePPI = 40; 
    const pixelsPerInch = basePPI * coverZoom; 
    
    if (!_previewOffscreen) {
        _previewOffscreen = document.createElement('canvas');
        _previewCtx = _previewOffscreen.getContext('2d', { alpha: false });
    }

    const reqW = Math.ceil(totalWidth * pixelsPerInch * scale);
    const reqH = Math.ceil(totalHeight * pixelsPerInch * scale);

    if (_previewOffscreen.width !== reqW || _previewOffscreen.height !== reqH) {
        _previewOffscreen.width = reqW;
        _previewOffscreen.height = reqH;
    }

    const ctx = _previewCtx;

    // Reset Canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, reqW, reqH);

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.scale(pixelsPerInch, pixelsPerInch);

    // Define Zones
    let zoneLeft = { x: 0, y: 0, w: bleed + trimWidth, h: totalHeight };
    let zoneMid = { x: bleed + trimWidth, y: 0, w: spineWidth, h: totalHeight };
    let zoneRight = { x: bleed + trimWidth + spineWidth, y: 0, w: trimWidth + bleed, h: totalHeight };

    let leftSource, midSource, rightSource;
    let leftSettings, midSettings, rightSettings;
    let drawGlueArea = false;
    let skipMidDraw = false; 

    const isRTL = projectSpecs.readingDirection === 'rtl';

    if (coverPreviewMode === 'inside') {
        if (isRTL) {
            leftSource = coverSources['file-cover-inside-back'];
            leftSettings = coverSettings['file-cover-inside-back'] || { pageIndex: 1, scaleMode: 'fill' };
            rightSource = coverSources['file-cover-inside-front'];
            rightSettings = coverSettings['file-cover-inside-front'] || { pageIndex: 1, scaleMode: 'fill' };
        } else {
            leftSource = coverSources['file-cover-inside-front'];
            leftSettings = coverSettings['file-cover-inside-front'] || { pageIndex: 1, scaleMode: 'fill' };
            rightSource = coverSources['file-cover-inside-back'];
            rightSettings = coverSettings['file-cover-inside-back'] || { pageIndex: 1, scaleMode: 'fill' };
        }
        drawGlueArea = (projectSpecs.binding === 'perfectBound' && spineWidth > 0);
        midSource = null; 
    } else {
        if (isRTL) {
            leftSource = coverSources['file-cover-front'];
            leftSettings = coverSettings['file-cover-front'] || { pageIndex: 1, scaleMode: 'fill' };
            rightSource = coverSources['file-cover-back'];
            rightSettings = coverSettings['file-cover-back'] || { pageIndex: 1, scaleMode: 'fill' };
        } else {
            leftSource = coverSources['file-cover-back'];
            leftSettings = coverSettings['file-cover-back'] || { pageIndex: 1, scaleMode: 'fill' };
            rightSource = coverSources['file-cover-front'];
            rightSettings = coverSettings['file-cover-front'] || { pageIndex: 1, scaleMode: 'fill' };
        }
        
        const spineMode = window.currentSpineMode || 'file';

        if (spineMode === 'file') {
            midSource = coverSources['file-spine'];
            midSettings = coverSettings['file-spine'] || { pageIndex: 1, scaleMode: 'fill' };
        } else {
            if (spineMode === 'wrap-front-stretch') {
                zoneRight.x = zoneMid.x;
                zoneRight.w = zoneMid.w + zoneRight.w; 
                skipMidDraw = true;
            } else if (spineMode === 'wrap-back-stretch') {
                zoneLeft.w = zoneLeft.w + zoneMid.w; 
                skipMidDraw = true;
            } else if (spineMode.includes('wrap') || spineMode.includes('mirror')) {
                const isFrontSource = spineMode.includes('front');
                midSource = isFrontSource ? rightSource : leftSource;
                midSettings = isFrontSource ? rightSettings : leftSettings;
            }
        }
    }

    // --- PARALLEL DRAWING ---
    // We create an array of promises to execute simultaneously
    const drawPromises = [];

    // 1. Left Panel
    drawPromises.push(
        drawImageOnCanvas(ctx, leftSource, zoneLeft.x, zoneLeft.y, zoneLeft.w, zoneLeft.h, leftSettings.pageIndex, leftSettings.scaleMode)
    );

    // 2. Right Panel
    drawPromises.push(
        drawImageOnCanvas(ctx, rightSource, zoneRight.x, zoneRight.y, zoneRight.w, zoneRight.h, rightSettings.pageIndex, rightSettings.scaleMode)
    );

    // 3. Middle Panel (Spine/Glue)
    if (coverPreviewMode === 'inside' && drawGlueArea) {
        // Glue area is drawn synchronously below after images load, or we can just draw it last.
        // For visual stacking, we usually draw images first.
    } else if (coverPreviewMode === 'outside' && !skipMidDraw) {
        const spineMode = window.currentSpineMode || 'file';
        if (spineMode === 'file') {
            drawPromises.push(
                drawImageOnCanvas(ctx, midSource, zoneMid.x, zoneMid.y, zoneMid.w, zoneMid.h, midSettings.pageIndex, midSettings.scaleMode)
            );
        } else if (spineMode.includes('wrap') || spineMode.includes('mirror')) {
             const isFrontSource = spineMode.includes('front');
             const sourceEntry = isFrontSource ? rightSource : leftSource;
             const settings = isFrontSource ? rightSettings : leftSettings;
             // Wrapper drawing
             drawPromises.push(
                drawWrapper(ctx, sourceEntry, zoneMid.x, zoneMid.y, zoneMid.w, zoneMid.h, 'mirror', isFrontSource, 0, settings.pageIndex)
             );
        }
    }

    // AWAIT ALL SIMULTANEOUSLY
    await Promise.all(drawPromises);

    if (myRenderId !== coverRenderId) return;

    // --- Post-Draw Overlays (Glue Area & Guides) ---
    if (coverPreviewMode === 'inside' && drawGlueArea) {
        const overlap = 0.125; 
        const glueW_Inches = spineWidth + (overlap * 2);
        const glueX_Inches = zoneMid.x - overlap;
        
        ctx.save();
        ctx.fillStyle = '#f8fafc'; 
        ctx.fillRect(glueX_Inches, 0, glueW_Inches, totalHeight);
        
        ctx.fillStyle = '#94a3b8';
        ctx.font = `bold ${0.15}px sans-serif`; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.translate(glueX_Inches + (glueW_Inches/2), totalHeight/2);
        ctx.rotate(-Math.PI/2);
        ctx.fillText("GLUE AREA (NO PRINT)", 0, 0);
        ctx.restore();

        ctx.lineWidth = 1 / pixelsPerInch;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.setLineDash([4 / pixelsPerInch, 2 / pixelsPerInch]);
        ctx.beginPath(); ctx.moveTo(glueX_Inches, 0); ctx.lineTo(glueX_Inches, totalHeight); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(glueX_Inches + glueW_Inches, 0); ctx.lineTo(glueX_Inches + glueW_Inches, totalHeight); ctx.stroke();
        ctx.setLineDash([]);
    }

    // Guides
    ctx.lineWidth = 1 / pixelsPerInch; 
    ctx.save();
    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'; 
    ctx.beginPath();
    ctx.rect(0, 0, totalWidth, totalHeight);
    ctx.rect(bleed, bleed, trimWidth, trimHeight); 
    if (spineWidth > 0) ctx.rect(bleed + trimWidth, bleed, spineWidth, trimHeight); 
    ctx.rect(bleed + trimWidth + spineWidth, bleed, trimWidth, trimHeight); 
    ctx.fill("evenodd");
    ctx.restore();

    ctx.strokeStyle = '#000000';
    ctx.beginPath(); 
    ctx.rect(bleed, bleed, trimWidth, trimHeight);
    if (spineWidth > 0) ctx.rect(bleed + trimWidth, bleed, spineWidth, trimHeight);
    ctx.rect(bleed + trimWidth + spineWidth, bleed, trimWidth, trimHeight);
    ctx.stroke();

    const safe = 0.125;
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
    ctx.beginPath();
    ctx.rect(bleed + safe, bleed + safe, trimWidth - (2*safe), trimHeight - (2*safe));
    ctx.rect(bleed + trimWidth + spineWidth + safe, bleed + safe, trimWidth - (2*safe), trimHeight - (2*safe));
    if (spineWidth > 0.25) {
         ctx.rect(bleed + trimWidth + safe, bleed + safe, spineWidth - (2*safe), trimHeight - (2*safe));
    }
    ctx.stroke();

    // Final Commit
    const placeholderEl = document.getElementById('cover-preview-placeholder');
    if (placeholderEl) {
        let hasContent = false;
        if (coverPreviewMode === 'inside') {
            hasContent = (coverSources['file-cover-inside-front'] || coverSources['file-cover-inside-back']);
        } else {
            hasContent = (coverSources['file-cover-front'] || coverSources['file-cover-back'] || coverSources['file-spine']);
        }
        
        if (hasContent || (coverPreviewMode === 'inside' && spineWidth > 0)) placeholderEl.style.display = 'none';
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

    let file, status, isServer, previewUrl, storagePath;
    if (sourceEntry instanceof File) {
        file = sourceEntry; status = 'ready'; isServer = false;
    } else {
        file = sourceEntry.file; status = sourceEntry.status; isServer = sourceEntry.isServer; previewUrl = sourceEntry.previewUrl; storagePath = sourceEntry.storagePath;
    }

    if (!file && !isServer) return;

    if (status === 'processing' || status === 'uploading') { drawProcessingState(ctx, x, y, targetW, targetH); return; }
    if (status === 'error') { ctx.fillStyle = '#fee2e2'; ctx.fillRect(x, y, targetW, targetH); return; }

    const fileKey = isServer ? (storagePath || previewUrl || 'server_url') : (file ? file.name : 'unknown_file');
    const timestamp = (file && file.lastModified) ? file.lastModified : 'server_timestamp';
    const cacheKey = `${fileKey}_${pageIndex}_${timestamp}_cover`;

    let imgBitmap;

    try {
        imgBitmap = await fetchBitmapWithCache(cacheKey, async () => {
            if (isServer) {
                // --- USE SHARED LOADER ---
                const pdf = await getSharedPdfDoc(previewUrl, storagePath);
                // ------------------------
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

        if (!imgBitmap) return;

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
        const typeValue = selectedType.value; 

        const sizePreset = specSizePreset.value;
        let dimensionsVal; 
        let localDimensions; 

        if (!sizePreset) throw new Error("Please select a finished size.");

        // Resolve Dimensions
        if (sizePreset === 'custom') {
            const width = parseFloat(specWidth.value);
            const height = parseFloat(specHeight.value);
            const unit = specUnit.value;

            if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
                throw new Error('Invalid custom dimensions');
            }

            dimensionsVal = { width, height, units: unit };
        } else {
            dimensionsVal = resolveDimensions(sizePreset);
        }

        localDimensions = resolveDimensions(dimensionsVal);

        // Prepare Specs Update
        const specsUpdate = {
            'projectType': typeValue === 'loose' ? 'single' : 'booklet',
            'specs.dimensions': dimensionsVal,
            'specs.binding': typeValue === 'loose' ? 'loose' : typeValue,
            'specs.pageCount': 0, // Dynamic
            'specs.paperType': specPaper.value,
            'specs.bleedInches': 0.125
        };

        if (typeValue === 'loose') {
            specsUpdate['specs.coverPaperType'] = null;
            specsUpdate['specs.readingDirection'] = null;
        } else {
            if (!specCoverPaper.value) throw new Error("Please select a cover paper type.");
            specsUpdate['specs.coverPaperType'] = specCoverPaper.value;
            // Capture Reading Direction
            if (specReadingDirection) {
                specsUpdate['specs.readingDirection'] = specReadingDirection.value || 'ltr';
            }
        }

        // Save to Firestore
        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, specsUpdate);

        // Update Local State
        projectSpecs = {
            dimensions: localDimensions,
            binding: specsUpdate['specs.binding'],
            pageCount: 0,
            paperType: specsUpdate['specs.paperType'],
            coverPaperType: specsUpdate['specs.coverPaperType'],
            readingDirection: specsUpdate['specs.readingDirection'] || 'ltr'
        };
        projectType = specsUpdate['projectType'];

        // --- MODE LOGIC ---
        if (uploadMode === 'professional') {
            // 1. Hide Specs Modal
            specsModal.classList.add('hidden');
            
            // 2. Show Professional UI (NOT the standard upload container)
            professionalUploadUI.classList.remove('hidden');
            
            // 3. Configure Pro UI based on binding
            if (projectType === 'single') {
                // Hide cover input for loose sheets
                document.getElementById('pro-cover-group').classList.add('hidden');
            } else {
                // Show cover input for booklets
                document.getElementById('pro-cover-group').classList.remove('hidden');
            }
        } else {
            // 1. Hide Specs Modal
            specsModal.classList.add('hidden');
            
            // 2. Show Standard Builder UI
            uploadContainer.classList.remove('hidden');
            
            // 3. Initialize Builder
            refreshBuilderUI();
            await initializeBuilder();
        }

    } catch (err) {
        console.error("Error saving specs:", err);
        alert("Failed to save specifications: " + err.message);
    } finally {
        saveSpecsBtn.disabled = false;
        // Reset button text based on current mode (in case validation failed)
        saveSpecsBtn.textContent = uploadMode === 'professional' ? 'Continue to Upload' : 'Save & Start Builder';
    }
});

function refreshBuilderUI() {
    // Update Header Nav
    if(professionalUploadUI) professionalUploadUI.classList.add('hidden');
    if (navBackBtn) navBackBtn.classList.remove('hidden');

    // 1. Inject "Edit Specs" Button
    const headerActions = document.getElementById('submit-button')?.parentElement;
    if (headerActions) {
        const existingEditBtn = document.getElementById('edit-specs-btn');
        if (existingEditBtn) existingEditBtn.remove();

        const editBtn = document.createElement('button');
        editBtn.id = 'edit-specs-btn';
        editBtn.type = 'button';
        editBtn.className = 'mr-4 text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded transition-colors border border-slate-600';
        editBtn.innerHTML = 'Edit Project Specs';
        editBtn.onclick = () => {
            uploadContainer.classList.add('hidden');
            specsModal.classList.remove('hidden');
            populateSpecsForm();
        };
        
        const refNode = document.getElementById('save-progress-btn') || document.getElementById('submit-button');
        headerActions.insertBefore(editBtn, refNode);
    }

    // 2. Inject Autosave Status Indicator
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

    // 3. Inject Spine Mode Selector
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

    // 4. Setup Cover Preview Tabs (Outside/Inside)
    setupCoverPreviewTabs();

    // 5. Configure Tabs & Toolbars based on Project Type
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

        if (tabInterior) {
             // Ensure a tab is active
             if (!tabInterior.classList.contains('text-indigo-400') && !tabCover.classList.contains('text-indigo-400')) {
                  tabInterior.click();
             }
        }
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

function updateSelectionVisuals() {
    const selectedRadio = document.querySelector('input[name="projectType"]:checked');
    const selectedValue = selectedRadio ? selectedRadio.value : null;

    const types = ['loose', 'saddleStitch', 'perfectBound'];

    types.forEach(type => {
        const label = document.getElementById(`label-${type}`);
        const btn = document.querySelector(`.pro-upload-btn[data-type="${type}"]`);
        
        // Reset Base Classes
        if (label) {
            label.className = "cursor-pointer relative group p-5 rounded-xl border-2 border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-all text-center h-full flex flex-col items-center justify-center gap-3 min-h-[180px]";
            // Reset Icon color
            const svg = label.querySelector('svg');
            if(svg) svg.classList.remove('text-indigo-400');
        }
        if (btn) {
            btn.className = "pro-upload-btn w-full py-2 text-xs font-medium text-gray-400 bg-slate-900/50 border border-slate-700 rounded-lg hover:bg-slate-800 hover:text-white hover:border-gray-500 transition-colors flex items-center justify-center gap-1";
        }

        // Apply Active State
        if (type === selectedValue) {
            if (uploadMode === 'builder') {
                // Highlight Card
                if (label) {
                    label.classList.remove('border-slate-700', 'bg-slate-800/50');
                    label.classList.add('border-indigo-500', 'bg-indigo-900/20', 'ring-1', 'ring-indigo-500');
                    const svg = label.querySelector('svg');
                    if(svg) svg.classList.add('text-indigo-400');
                }
            } else if (uploadMode === 'professional') {
                // Highlight Button
                if (btn) {
                    btn.classList.remove('text-gray-400', 'bg-slate-900/50', 'border-slate-700');
                    btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500', 'ring-1', 'ring-indigo-400');
                }
                // Keeping Card somewhat active? No, user wants distinct separation.
                // We leave the card dim to show "Visual Builder" is NOT selected.
            }
        }
    });
}

// --- Main Initialization (Trust-Optimized) ---
async function init() {
    if (insertFileInput) insertFileInput.value = '';
    if (hiddenInteriorInput) hiddenInteriorInput.value = '';
    if (fileInteriorDrop) fileInteriorDrop.value = '';
    
    populateSelects();

    loadingState.classList.remove('hidden');
    uploadContainer.classList.add('hidden');
    
    const loadingText = loadingState.querySelector('p') || loadingState;
    if(loadingText) loadingText.textContent = "Accessing secure upload portal...";

    const params = new URLSearchParams(window.location.search);
    projectId = params.get('projectId') || params.get('id');
    guestToken = params.get('guestToken');

    if (!projectId) {
        showError('Missing project ID.');
        return;
    }


    try {
        if (guestToken) {
            const authenticateGuest = httpsCallable(functions, 'authenticateGuest');
            const authResult = await authenticateGuest({ projectId, guestToken });

            if (!authResult.data || !authResult.data.token) {
                throw new Error("Failed to obtain access token.");
            }
            await signInWithCustomToken(auth, authResult.data.token);
        } else {
            await new Promise((resolve, reject) => {
                const unsubscribe = onAuthStateChanged(auth, (user) => {
                    unsubscribe();
                    if (user) {
                        currentUser = user;
                        resolve();
                    } else {
                        window.location.href = 'index.html';
                        reject(new Error("User not signed in"));
                    }
                });
            });
        }

        currentUser = auth.currentUser;

        if (currentUser) {
            try {
                const userDoc = await getDoc(doc(db, "users", currentUser.uid));
                if (userDoc.exists() && userDoc.data().role === 'admin') {
                    isAdmin = true;
                }
            } catch (e) {}
        }

        const lockAcquired = await acquireLock();
        if (!lockAcquired) {
            loadingState.classList.add('hidden');
            return;
        }

        startLockHeartbeat();
        window.addEventListener('beforeunload', releaseLock);

        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) {
            showError('Project not found or access denied.');
            return;
        }

        const projectData = projectSnap.data();

        // --- ACCESS CHECK: Prevent edits if Approved ---
        const status = projectData.status;
        if (status === 'Approved' || status === 'In Production' || status === 'Imposition Complete') {
             loadingState.classList.add('hidden');
             lockedState.classList.remove('hidden');

             // Customize Locked Message
             const lockedTitle = lockedState.querySelector('h2');
             if(lockedTitle) lockedTitle.textContent = "Project Approved";

             if(lockedByUserSpan) {
                 lockedByUserSpan.parentElement.innerHTML = `
                    <span class="block text-gray-300 mb-4">This project has been approved and is now locked for production.</span>
                    <a href="proof.html?id=${projectId}${guestToken ? '&guestToken='+guestToken : ''}" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                        View Proof
                    </a>
                 `;
             }
             return;
        }

        projectNameEl.textContent = projectData.projectName;
        projectType = projectData.projectType || 'single'; 
        projectSpecs = projectData.specs || {}; 

        if (projectSpecs.dimensions) {
            projectSpecs.dimensions = resolveDimensions(projectSpecs.dimensions);
        }

        bookletUploadSection.classList.remove('hidden');
        updateFileName('file-cover-front', 'file-name-cover-front');
        updateFileName('file-spine', 'file-name-spine');
        updateFileName('file-cover-back', 'file-name-cover-back');
        // [FIX] Wire up new inputs
        updateFileName('file-cover-inside-front', 'file-name-cover-inside-front');
        updateFileName('file-cover-inside-back', 'file-name-cover-inside-back');

        let specsMissing = false;
        let dimValid = false;
        if (projectSpecs && projectSpecs.dimensions) {
             if (typeof projectSpecs.dimensions === 'object' && projectSpecs.dimensions.width > 0) dimValid = true;
        }
        if (!dimValid || !projectSpecs.binding) specsMissing = true;

        if (specsMissing) {
            loadingState.classList.add('hidden');
            specsModal.classList.remove('hidden');
            populateSpecsForm();
        } else {
            if(loadingText) loadingText.textContent = "Restoring project files...";
            
            refreshBuilderUI();

            // --- EVENT LISTENERS FIX ---
        // 1. Setup Drop Zone for Interior
        setupDropZone('file-interior-drop');

        // 2. Setup Drop Zones for Cover (if elements exist)
        if (document.getElementById('file-cover-front')) setupDropZone('file-cover-front');
        if (document.getElementById('file-spine')) setupDropZone('file-spine');
        if (document.getElementById('file-cover-back')) setupDropZone('file-cover-back');
        if (document.getElementById('file-cover-inside-front')) setupDropZone('file-cover-inside-front');
        if (document.getElementById('file-cover-inside-back')) setupDropZone('file-cover-inside-back');

        // 3. Connect "Add Pages" Button
        if (addInteriorFileBtn) {
            addInteriorFileBtn.addEventListener('click', () => {
                 // Reset insert index to end
                 window._insertIndex = pages.length; 
                 hiddenInteriorInput.click();
            });
        }

        // 4. Connect Hidden Input
        if (hiddenInteriorInput) {
            hiddenInteriorInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    addInteriorFiles(e.target.files, false, window._insertIndex);
                    e.target.value = ''; // Reset
                }
            });
        }
        
        // 5. Connect Main Drop Input
        if (fileInteriorDrop) {
             fileInteriorDrop.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    addInteriorFiles(e.target.files, false);
                    e.target.value = '';
                }
             });
        }
        // ---------------------------

            await initializeBuilder();

            if (pages.length > 0) {
                if(loadingText) loadingText.textContent = "Rendering preview...";
                await waitForFirstPageRender(); 
            }

            loadingState.classList.add('hidden');
            uploadContainer.classList.remove('hidden');
            
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
            
            // [FIX] Persist the generated thumbnails if available
            // We check both sourceFiles and coverSources to find the in-memory object
            const memorySource = sourceFiles[id] || coverSources[id === 'cover_front' ? 'file-cover-front' : (id === 'cover_back' ? 'file-cover-back' : (id === 'cover_spine' ? 'file-spine' : (id === 'cover_inside_front' ? 'file-cover-inside-front' : (id === 'cover_inside_back' ? 'file-cover-inside-back' : null))))];
            
            sourceFilesState[id] = { 
                storagePath: path, 
                type: type,
                // Save the array of thumbnail URLs
                pagePreviews: memorySource?.pagePreviews || null,
                // Save flag indicating these are thumbnails
                isThumbnail: memorySource?.isThumbnail || false
            };
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

        pages = state.pages || [];
        if (state.coverSettings) Object.assign(coverSettings, state.coverSettings);
        
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

        if (state.sourceFiles) {
            const entries = Object.entries(state.sourceFiles);
            const restorePromises = entries.map(async ([id, meta]) => {
                try {
                    const url = await getDownloadURL(ref(storage, meta.storagePath));
                    
                    const restoredObject = {
                        status: 'ready',
                        previewUrl: url, 
                        isServer: true,
                        storagePath: meta.storagePath,
                        pagePreviews: meta.pagePreviews || null,
                        isThumbnail: meta.isThumbnail || false
                    };

                    if (restoredObject.pagePreviews && restoredObject.pagePreviews.length > 0) {
                        const p1 = restoredObject.pagePreviews.find(p => p.pageNumber === 1) || restoredObject.pagePreviews[0];
                        restoredObject.previewUrl = p1.previewUrl;
                    }

                    if (id.startsWith('cover_')) {
                        let inputId = null;
                        if (id === 'cover_front') inputId = 'file-cover-front';
                        else if (id === 'cover_spine') inputId = 'file-spine';
                        else if (id === 'cover_back') inputId = 'file-cover-back';
                        else if (id === 'cover_inside_front') inputId = 'file-cover-inside-front';
                        else if (id === 'cover_inside_back') inputId = 'file-cover-inside-back';
                        
                        if (inputId) {
                            coverSources[inputId] = restoredObject;
                            
                            let displayId = inputId.replace('file-', 'file-name-');
                            const el = document.getElementById(displayId);
                            if (el) {
                                el.textContent = "Restored File";
                                el.classList.remove('hidden');
                            }
                            createCoverControls(inputId, restoredObject.previewUrl);
                            
                            renderBookViewer(); // [FIX] Ensure viewer knows about restored cover
                        }
                    } else {
                        sourceFiles[id] = restoredObject;
                    }
                } catch (e) {
                    console.warn(`Failed to restore source ${id}`, e);
                }
            });
            await Promise.all(restorePromises);
        }

    } catch (e) {
        console.error("Error restoring state:", e);
    }
}


// --- Upload Handler ---

let progressInterval;
function simulateProgress(start, end, durationMs) {
    if(progressInterval) clearInterval(progressInterval);
    let current = start;
    // Update every 100ms
    const steps = durationMs / 100;
    const increment = (end - start) / steps;

    progressInterval = setInterval(() => {
        current += increment;
        if (current >= end) {
            current = end;
            clearInterval(progressInterval);
        }
        if(progressBar) progressBar.style.width = `${current}%`;
        if(progressPercent) progressPercent.textContent = `${Math.round(current)}%`;
    }, 100);
}
function stopProgress() { if(progressInterval) clearInterval(progressInterval); }

// --- NEW: Helper to Upload Files & Save State ---
async function syncProjectState(statusLabel) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressPercent = document.getElementById('progress-percent');
    const uploadProgress = document.getElementById('upload-progress');

    uploadProgress.classList.remove('hidden');
    progressText.textContent = 'Preparing files...';

    const activeSourceIds = new Set();
    pages.forEach(p => {
        if (p.sourceFileId) activeSourceIds.add(p.sourceFileId);
    });

    const filesToUpload = []; 
    const allSourcePaths = {}; 

    const checkSource = (id, src, type) => {
        if (!src) return;
        if (src.storagePath) {
            allSourcePaths[id] = src.storagePath;
            return;
        }
        if (src instanceof File) {
            filesToUpload.push({ id, file: src, type });
        } else if (src.file instanceof File) {
            filesToUpload.push({ id, file: src.file, type });
        } else if (selectedFiles[id]) {
            filesToUpload.push({ id, file: selectedFiles[id], type });
        }
    };

    activeSourceIds.forEach(id => checkSource(id, sourceFiles[id], 'interior_source'));

    if (projectType === 'booklet') {
        checkSource('cover_front', coverSources['file-cover-front'], 'cover_front');
        checkSource('cover_spine', coverSources['file-spine'], 'cover_spine');
        checkSource('cover_back', coverSources['file-cover-back'], 'cover_back');
        // [FIX] Add new checks
        checkSource('cover_inside_front', coverSources['file-cover-inside-front'], 'cover_inside_front');
        checkSource('cover_inside_back', coverSources['file-cover-inside-back'], 'cover_inside_back');
    }

    let completed = 0;
    const total = filesToUpload.length;

    if (total > 0) {
        // 1. Calculate Total Bytes
        let totalBytesExpected = 0;
        filesToUpload.forEach(f => totalBytesExpected += f.file.size);
        let totalBytesTransferred = 0;
        const fileProgressMap = new Map(); // id -> bytes

        for (const item of filesToUpload) {
            const timestamp = Date.now();
            const cleanName = item.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storagePath = `guest_uploads/${projectId}/${timestamp}_${item.type}_${cleanName}`;
            const storageRef = ref(storage, storagePath);

            progressText.textContent = `Uploading ${item.file.name}...`;
            
            // Use Upload Task to monitor progress
            const uploadTask = uploadBytesResumable(storageRef, item.file);

            uploadTask.on('state_changed',
                (snapshot) => {
                    // Update this file's progress
                    fileProgressMap.set(item.id, snapshot.bytesTransferred);

                    // Sum all progress
                    let currentTotal = 0;
                    fileProgressMap.forEach(v => currentTotal += v);

                    // Update Total Progress Bar
                    const percent = (currentTotal / totalBytesExpected) * 100;
                    if(progressBar) progressBar.style.width = `${percent}%`;
                    if(progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
                }
            );

            await uploadTask; // Wait for completion

            // Ensure this file is marked 100% (in case state_changed missed the very last byte)
            fileProgressMap.set(item.id, item.file.size);

            allSourcePaths[item.id] = storagePath;
            
            if (item.type === 'interior_source' && sourceFiles[item.id]) {
                sourceFiles[item.id].storagePath = storagePath;
            } else if (item.type.startsWith('cover_')) {
                // Reverse map to update memory
                let localSlot = null;
                if (item.type === 'cover_front') localSlot = 'file-cover-front';
                else if (item.type === 'cover_spine') localSlot = 'file-spine';
                else if (item.type === 'cover_back') localSlot = 'file-cover-back';
                else if (item.type === 'cover_inside_front') localSlot = 'file-cover-inside-front';
                else if (item.type === 'cover_inside_back') localSlot = 'file-cover-inside-back';

                if (localSlot && coverSources[localSlot]) {
                    coverSources[localSlot].storagePath = storagePath;
                }
            }
        }
    }

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
// --- UPDATED: Final Submit Handler (Fixed Timeout) ---
async function handleUpload(e) {
    if (e) e.preventDefault();

    const binding = projectSpecs?.binding;
    const totalInteriorPages = pages.length;
    const COVER_PAGES = 4; 

    if (binding === 'saddleStitch') {
        const MAX_TOTAL = 24;
        const MAX_INTERIOR = MAX_TOTAL - COVER_PAGES; 
        if (totalInteriorPages > MAX_INTERIOR) {
            alert(`Page Count Limit Exceeded.\n\nSaddle Stitch books are limited to ${MAX_TOTAL} total pages.`);
            return;
        }
    } 
    
    balancePages();

    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...'; // Changed text

    try {
        // 1. Upload Files
        const allSourcePaths = await syncProjectState('submitted_processing');
        const progressText = document.getElementById('progress-text');
        const bookletMetadata = [];

        // ... (Keep existing Cover Dims calculation logic) ...
        const paperObj = HARDCODED_PAPER_TYPES.find(p => p.name === projectSpecs.paperType);
        const interiorCaliper = paperObj ? paperObj.caliper : 0.004;
        const coverPaperObj = HARDCODED_PAPER_TYPES.find(p => p.name === projectSpecs.coverPaperType);
        const coverCaliper = coverPaperObj ? coverPaperObj.caliper : (paperObj ? interiorCaliper : 0.004);
        const interiorSheets = Math.ceil(totalInteriorPages / 2);
        let calcSpineW = (interiorSheets * interiorCaliper) + (coverCaliper * 2);
        if (binding === 'saddleStitch' || binding === 'loose') calcSpineW = 0;
        const trimW = projectSpecs.dimensions.width;
        const trimH = projectSpecs.dimensions.height;
        const totalCoverW = (trimW * 2) + calcSpineW;

        await updateDoc(doc(db, 'projects', projectId), {
            'specs.coverDimensions': { width: totalCoverW, height: trimH, units: projectSpecs.dimensions.units },
            'specs.spineWidth': calcSpineW 
        });

        // Construct Metadata
        pages.forEach(p => {
            const safeSettings = {
                scaleMode: p.settings.scaleMode || 'fit',
                alignment: p.settings.alignment || 'center',
                panX: Number(p.settings.panX) || 0,
                panY: Number(p.settings.panY) || 0,
                view: p.settings.view || 'full'
            };
            if (p.sourceFileId === null || p.isAutoBlank) { 
                 bookletMetadata.push({ storagePath: null, sourcePageIndex: 0, settings: safeSettings, type: 'interior_page' });
            } else {
                 const path = allSourcePaths[p.sourceFileId];
                 if (path) bookletMetadata.push({ storagePath: path, sourcePageIndex: (p.pageIndex || 1) - 1, settings: safeSettings, type: 'interior_page' });
            }
        });

        const addCoverMeta = (storageKey, settingsKey, type) => {
            if (allSourcePaths[storageKey]) {
                const settings = coverSettings[settingsKey] || { pageIndex: 1, scaleMode: 'fill' };
                bookletMetadata.push({ storagePath: allSourcePaths[storageKey], type: type, sourcePageIndex: (settings.pageIndex || 1) - 1, settings: settings });
            }
        };

        addCoverMeta('cover_front', 'file-cover-front', 'cover_front');
        addCoverMeta('cover_back', 'file-cover-back', 'cover_back');
        addCoverMeta('cover_inside_front', 'file-cover-inside-front', 'cover_inside_front');
        addCoverMeta('cover_inside_back', 'file-cover-inside-back', 'cover_inside_back');

        const spineMode = window.currentSpineMode || 'file';
        if (spineMode === 'file') addCoverMeta('cover_spine', 'file-spine', 'cover_spine');
        else if (spineMode.includes('wrap') || spineMode.includes('mirror')) {
            if (!spineMode.includes('stretch')) {
                let sourceKey = spineMode.includes('front') ? 'cover_front' : 'cover_back';
                let settingsKey = spineMode.includes('front') ? 'file-cover-front' : 'file-cover-back';
                if (allSourcePaths[sourceKey]) {
                    const sourceSettings = coverSettings[settingsKey] || { pageIndex: 1 };
                    bookletMetadata.push({ storagePath: allSourcePaths[sourceKey], type: 'cover_spine', sourcePageIndex: (sourceSettings.pageIndex || 1) - 1, settings: { scaleMode: 'fill', flip: true } });
                }
            }
        }

        // 2. INSTANT HANDOFF: Queue Processing via Cloud Function
        // We do NOT wait for PDF generation here. The server handles it.
        progressText.textContent = 'Finalizing...';
        
        const submitGuestUpload = httpsCallable(functions, 'submitGuestUpload');
        // Send the metadata payload so the background trigger can pick it up
        await submitGuestUpload({ projectId: projectId, files: bookletMetadata, spineMode: spineMode });

        // 3. Success UI & Redirect
        stopProgress();
        if(progressBar) progressBar.style.width = '100%';
        if(progressPercent) progressPercent.textContent = '100%';

        await persistStateAfterSubmit(allSourcePaths, 'submitted_complete');

        uploadContainer.classList.add('hidden');
        successState.classList.remove('hidden');
        const successText = successState.querySelector('p');
        if(successText) successText.innerHTML = "Upload complete! Redirecting to proof...";

        // Fast Redirect (1.5s)
        setTimeout(() => {
            if (isAdmin) window.location.href = `admin_project.html?id=${projectId}`;
            else {
                let url = `proof.html?id=${projectId}`;
                if (guestToken) url += `&guestToken=${guestToken}`;
                window.location.href = url;
            }
        }, 1500);

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

    // Scale Settings Overlay
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
