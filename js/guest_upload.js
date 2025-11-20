import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import * as pdfjsLib from 'https://mozilla.github.io/pdf.js/build/pdf.mjs';
import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js';

import { firebaseConfig } from "./firebase.js";
import { HARDCODED_PAPER_TYPES, BINDING_TYPES } from "./guest_constants.js";

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
const singleUploadSection = document.getElementById('single-upload-section');
const bookletUploadSection = document.getElementById('booklet-upload-section');
const uploadForm = document.getElementById('upload-form');
const submitButton = document.getElementById('submit-button');
const uploadProgress = document.getElementById('upload-progress');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressPercent = document.getElementById('progress-percent');

// Specs Modal Elements
const specsModal = document.getElementById('specs-modal');
const specsForm = document.getElementById('specs-form');
const specWidth = document.getElementById('spec-width');
const specHeight = document.getElementById('spec-height');
const specBinding = document.getElementById('spec-binding'); // Hidden input now
const specPaper = document.getElementById('spec-paper');
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
const interiorFileList = document.getElementById('interior-file-list');
const interiorEmptyState = document.getElementById('interior-empty-state');
const addInteriorFileBtn = document.getElementById('add-interior-file-btn');
const hiddenInteriorInput = document.getElementById('hidden-interior-input');
const fileInteriorDrop = document.getElementById('file-interior-drop');

// Page Settings Modal Elements
const pageSettingsModal = document.getElementById('page-settings-modal');
const closeSettingsModal = document.getElementById('close-settings-modal');
const applySettingsBtn = document.getElementById('apply-settings-btn');
const settingsPreviewCanvas = document.getElementById('settings-preview-canvas');
const settingAlignment = document.getElementById('setting-alignment');
const scaleModeBtns = document.querySelectorAll('.scale-mode-btn');


// State
let projectId = null;
let guestToken = null;
let projectType = 'single'; // Default
let selectedFiles = {}; // Keep for Legacy/Single logic
let interiorFiles = []; // Array of { id, file, name, pageCount, settings: { scaleMode, alignment } }
let projectSpecs = {}; // Store loaded/saved specs here
let currentEditingFileId = null; // ID of file being edited in settings modal

// --- Helper: Parse URL Params ---
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        projectId: params.get('projectId'),
        guestToken: params.get('guestToken')
    };
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
    // Populate Paper
    specPaper.innerHTML = '<option value="" disabled selected>Select Paper Type</option>';
    HARDCODED_PAPER_TYPES.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        specPaper.appendChild(opt);
    });
}

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
        }
    });
});


// --- Helper: Update File Name Display (Legacy/Cover) ---
function updateFileName(inputId, displayId) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    // Ensure elements exist before adding listeners (crucial for booklet mode where some might not exist)
    if(!input) return;

    input.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            if(display) display.textContent = file.name;
            selectedFiles[inputId] = file;

            // Trigger preview update if it's a cover file
            if (inputId.includes('cover') || inputId.includes('spine')) {
                await renderCoverPreview();
            }
        } else {
            if(display) display.textContent = '';
            delete selectedFiles[inputId];
             if (inputId.includes('cover') || inputId.includes('spine')) {
                await renderCoverPreview();
            }
        }
        validateForm();
    });
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
    if (projectType === 'booklet') {
        // Booklet needs at least interior files OR just cover files?
        // Let's require at least one interior file OR full cover
        if (interiorFiles.length > 0) isValid = true;
    } else {
        // Single needs the main file - ACTUALLY, if it's 'loose sheets' builder mode (which uses interiorFiles now), check that list
        if (interiorFiles.length > 0) isValid = true;
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
        tabCover.classList.add('text-indigo-400', 'border-indigo-500');
        tabCover.classList.remove('text-gray-400', 'hover:text-gray-200');
        tabInterior.classList.add('text-gray-400', 'hover:text-gray-200');
        tabInterior.classList.remove('text-indigo-400', 'border-indigo-500');

        contentCover.classList.remove('hidden');
        contentInterior.classList.add('hidden');

        // Render preview when tab opens (in case of window resize or init)
        renderCoverPreview();
    });
}


// --- Interior Builder Logic ---

function addInteriorFiles(files) {
    Array.from(files).forEach(async (file) => {
        const id = Date.now() + Math.random().toString(16).slice(2);
        let pageCount = 1;

        if (file.type === 'application/pdf') {
             try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                pageCount = pdf.numPages;
             } catch (e) {
                 console.warn("Could not count pages", e);
             }
        }

        const item = {
            id,
            file,
            name: file.name,
            pageCount,
            settings: {
                scaleMode: 'fit', // fit, fill, stretch
                alignment: 'center'
            }
        };

        interiorFiles.push(item);
        renderInteriorList();
    });
}

function renderInteriorList() {
    interiorFileList.innerHTML = '';

    if (interiorFiles.length === 0) {
        interiorFileList.appendChild(interiorEmptyState);
        validateForm();
        return;
    }

    interiorFiles.forEach((item, index) => {
        const el = document.createElement('div');
        el.className = "bg-slate-800 border border-slate-700 rounded p-3 flex justify-between items-center";
        el.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="bg-slate-700 w-10 h-10 flex items-center justify-center rounded text-gray-400 flex-shrink-0">
                    ${item.file.type.includes('pdf') ? '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>' : '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>'}
                </div>
                <div class="min-w-0">
                    <p class="text-sm text-white font-medium truncate">${item.name}</p>
                    <p class="text-xs text-gray-400">${item.pageCount} Page${item.pageCount !== 1 ? 's' : ''} • ${item.settings.scaleMode.toUpperCase()}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button type="button" class="text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded" onclick="openSettings('${item.id}')">Settings</button>
                <button type="button" class="text-gray-500 hover:text-red-400" onclick="removeInteriorFile('${item.id}')">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
        interiorFileList.appendChild(el);
    });

    // Init Sortable
    new Sortable(interiorFileList, {
        animation: 150,
        ghostClass: 'opacity-50',
        onEnd: (evt) => {
            // Reorder array based on DOM
            const itemEl = interiorFiles[evt.oldIndex];
            interiorFiles.splice(evt.oldIndex, 1);
            interiorFiles.splice(evt.newIndex, 0, itemEl);
        }
    });

    validateForm();
}

window.removeInteriorFile = (id) => {
    interiorFiles = interiorFiles.filter(f => f.id !== id);
    renderInteriorList();
};

window.openSettings = (id) => {
    currentEditingFileId = id;
    const item = interiorFiles.find(f => f.id === id);
    if (!item) return;

    // Set UI state
    settingAlignment.value = item.settings.alignment;
    scaleModeBtns.forEach(btn => {
        if (btn.dataset.mode === item.settings.scaleMode) {
            btn.classList.add('bg-indigo-600', 'border-indigo-500');
            btn.classList.remove('bg-slate-700', 'border-transparent');
        } else {
            btn.classList.remove('bg-indigo-600', 'border-indigo-500');
            btn.classList.add('bg-slate-700', 'border-transparent');
        }
    });

    pageSettingsModal.classList.remove('hidden');
    renderSettingsPreview();
};

// --- Settings Modal Logic ---
closeSettingsModal.addEventListener('click', () => pageSettingsModal.classList.add('hidden'));

scaleModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update Visuals
        scaleModeBtns.forEach(b => {
            b.classList.remove('bg-indigo-600', 'border-indigo-500');
            b.classList.add('bg-slate-700', 'border-transparent');
        });
        btn.classList.add('bg-indigo-600', 'border-indigo-500');
        btn.classList.remove('bg-slate-700', 'border-transparent');

        // Trigger Preview Update
        renderSettingsPreview();
    });
});

settingAlignment.addEventListener('change', renderSettingsPreview);

applySettingsBtn.addEventListener('click', () => {
    if (!currentEditingFileId) return;
    const item = interiorFiles.find(f => f.id === currentEditingFileId);
    if (item) {
        const activeBtn = document.querySelector('.scale-mode-btn.bg-indigo-600');
        item.settings.scaleMode = activeBtn ? activeBtn.dataset.mode : 'fit';
        item.settings.alignment = settingAlignment.value;
        renderInteriorList();
    }
    pageSettingsModal.classList.add('hidden');
});


async function renderSettingsPreview() {
    if (!currentEditingFileId || !settingsPreviewCanvas) return;
    const item = interiorFiles.find(f => f.id === currentEditingFileId);
    if (!item) return;

    const activeBtn = document.querySelector('.scale-mode-btn.bg-indigo-600');
    const mode = activeBtn ? activeBtn.dataset.mode : 'fit';
    const align = settingAlignment.value;

    const ctx = settingsPreviewCanvas.getContext('2d');
    const width = projectSpecs.dimensions.width;
    const height = projectSpecs.dimensions.height;
    const bleed = 0.125;

    // Set Canvas Size
    const pixelsPerInch = 40;
    const totalW = width + (bleed*2);
    const totalH = height + (bleed*2);

    settingsPreviewCanvas.width = totalW * pixelsPerInch * 2; // 2x Retina
    settingsPreviewCanvas.height = totalH * pixelsPerInch * 2;

    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.scale(pixelsPerInch, pixelsPerInch);

    // Draw Sheet Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, totalH);

    // Draw Image with Settings
    // Calculate Target Rect (Trim Box)
    // Actually, "Fill" usually means Fill to Bleed. "Fit" usually means Fit to Safe/Trim.

    // Let's define the drawing area as the full bleed size for Fill, or Trim for Fit?
    // Standard practice:
    // Fill: Fills the Bleed Box (TotalW, TotalH)
    // Fit: Fits inside the Trim Box? Or Bleed Box? Usually Bleed Box to be safe.

    const drawAreaX = 0;
    const drawAreaY = 0;
    const drawAreaW = totalW;
    const drawAreaH = totalH;

    await drawFileWithTransform(ctx, item.file, drawAreaX, drawAreaY, drawAreaW, drawAreaH, mode, align);

    // Guides
    ctx.lineWidth = 1 / pixelsPerInch;
    // Bleed
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.strokeRect(0, 0, totalW, totalH);
    // Trim
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
    ctx.strokeRect(bleed, bleed, width, height);
}

async function drawFileWithTransform(ctx, file, targetX, targetY, targetW, targetH, mode, align) {
    let imgBitmap;
    let srcW, srcH;

    if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 2 }); // High res
        const tc = document.createElement('canvas');
        tc.width = vp.width;
        tc.height = vp.height;
        await page.render({ canvasContext: tc.getContext('2d'), viewport: vp }).promise;
        imgBitmap = await createImageBitmap(tc);
        srcW = vp.width;
        srcH = vp.height;
    } else if (file.type.startsWith('image/')) {
        imgBitmap = await createImageBitmap(file);
        srcW = imgBitmap.width;
        srcH = imgBitmap.height;
    } else {
        // PSD or other
        ctx.fillStyle = '#ccc';
        ctx.fillRect(targetX, targetY, targetW, targetH);
        return;
    }

    // Calculate Aspect Ratios
    const srcRatio = srcW / srcH;
    const targetRatio = targetW / targetH;

    let drawW, drawH, drawX, drawY;

    if (mode === 'stretch') {
        drawW = targetW;
        drawH = targetH;
        drawX = targetX;
        drawY = targetY;
    } else if (mode === 'fit') {
        // Fit entirely inside
        if (srcRatio > targetRatio) {
            drawW = targetW;
            drawH = targetW / srcRatio;
        } else {
            drawH = targetH;
            drawW = targetH * srcRatio;
        }
    } else if (mode === 'fill') {
        // Cover entire area
        if (srcRatio > targetRatio) {
            drawH = targetH;
            drawW = targetH * srcRatio;
        } else {
            drawW = targetW;
            drawH = targetW / srcRatio;
        }
    }

    // Alignment (Center default)
    // Logic handles centering based on computed draw dimensions vs target
    drawX = targetX + (targetW - drawW) / 2;
    drawY = targetY + (targetH - drawH) / 2;

    if (align === 'top-left') {
        drawX = targetX;
        drawY = targetY;
    }

    // Clip to target area
    ctx.save();
    ctx.beginPath();
    ctx.rect(targetX, targetY, targetW, targetH);
    ctx.clip();
    ctx.drawImage(imgBitmap, drawX, drawY, drawW, drawH);
    ctx.restore();
}


// --- Listeners for Interior Builder ---
if (addInteriorFileBtn) {
    addInteriorFileBtn.addEventListener('click', () => hiddenInteriorInput.click());
    hiddenInteriorInput.addEventListener('change', (e) => addInteriorFiles(e.target.files));
}

if (fileInteriorDrop) {
    fileInteriorDrop.addEventListener('change', (e) => addInteriorFiles(e.target.files));
    setupDropZone('file-interior-drop'); // Enable drag/drop styles
}


// --- Cover Preview Logic ---

function calculateSpineWidth(specs) {
    if (!specs || specs.binding !== 'perfectBound') return 0;

    const paper = HARDCODED_PAPER_TYPES.find(p => p.name === specs.paperType);
    const caliper = paper ? paper.caliper : 0.004; // Fallback default
    const pageCount = specs.pageCount || 0;

    // Simple calculation: (Pages / 2) * Caliper
    // (Assuming caliper is per sheet, i.e., 2 pages)
    let width = (pageCount / 2) * caliper;

    // Ensure minimum spine for glue if needed (optional logic)
    return Math.max(0, width);
}

async function renderCoverPreview() {
    if (!coverCanvas || !projectSpecs || !projectSpecs.dimensions) return;

    const ctx = coverCanvas.getContext('2d');
    const dpi = 96; // Screen DPI
    const scale = 2; // Retain high res

    // 1. Calculate Dimensions
    const trimWidth = projectSpecs.dimensions.width;
    const trimHeight = projectSpecs.dimensions.height;
    const bleed = 0.125; // Standard 1/8 inch bleed
    const spineWidth = calculateSpineWidth(projectSpecs);

    // Update display
    if (spineWidthDisplay) spineWidthDisplay.textContent = spineWidth.toFixed(3);

    // Full Spread Dimensions (Back + Spine + Front)
    // Width = Bleed + Back + Spine + Front + Bleed
    // Height = Bleed + Height + Bleed
    const totalWidth = (trimWidth * 2) + spineWidth + (bleed * 2);
    const totalHeight = trimHeight + (bleed * 2);

    // Set Canvas Size
    // We limit visual height to 400px usually in CSS, but canvas pixels should match ratio
    // Let's map 1 inch to X pixels.
    const pixelsPerInch = 40; // Base scale for canvas drawing
    coverCanvas.width = totalWidth * pixelsPerInch * scale;
    coverCanvas.height = totalHeight * pixelsPerInch * scale;

    // Reset Transform
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.scale(pixelsPerInch, pixelsPerInch);

    // Clear
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // --- Draw Zones ---

    // Coordinates (origin is top-left of bleed box)
    const y0 = 0;
    const yBleedTop = bleed;
    const yBleedBottom = totalHeight - bleed;
    const hFull = totalHeight;

    const x0 = 0;
    const xBleedBackLeft = 0;
    const xTrimBackLeft = bleed;
    const xSpineLeft = bleed + trimWidth;
    const xSpineRight = bleed + trimWidth + spineWidth;
    const xTrimFrontRight = bleed + trimWidth + spineWidth + trimWidth;
    const xBleedFrontRight = totalWidth;

    // Draw Content (Placeholders or Images)
    await drawImageOnCanvas(ctx, selectedFiles['file-cover-back'], xTrimBackLeft, yBleedTop, trimWidth, trimHeight);
    await drawImageOnCanvas(ctx, selectedFiles['file-spine'], xSpineLeft, yBleedTop, spineWidth, trimHeight);
    await drawImageOnCanvas(ctx, selectedFiles['file-cover-front'], xSpineRight, yBleedTop, trimWidth, trimHeight);

    // --- Draw Guides ---
    ctx.lineWidth = 1 / pixelsPerInch; // 1px line at this scale

    // 1. Bleed Line (Red) - The outer edge of the canvas is the bleed edge actually.
    // But let's visualize it.
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'; // Red-500
    ctx.strokeRect(0, 0, totalWidth, totalHeight);

    // 2. Trim Line (Blue) - The actual cut line
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'; // Blue-500
    ctx.beginPath();
    // Back Trim
    ctx.rect(xTrimBackLeft, yBleedTop, trimWidth, trimHeight);
    // Spine Trim (Only if width > 0)
    if (spineWidth > 0) {
        ctx.rect(xSpineLeft, yBleedTop, spineWidth, trimHeight);
    }
    // Front Trim
    ctx.rect(xSpineRight, yBleedTop, trimWidth, trimHeight);
    ctx.stroke();

    // 3. Safe Area (Green) - 0.125" inside Trim
    const safe = 0.125;
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)'; // Green-500
    ctx.beginPath();
    // Back Safe
    ctx.rect(xTrimBackLeft + safe, yBleedTop + safe, trimWidth - (2*safe), trimHeight - (2*safe));
    // Front Safe
    ctx.rect(xSpineRight + safe, yBleedTop + safe, trimWidth - (2*safe), trimHeight - (2*safe));
    // Spine Safe (Usually smaller, maybe 0.0625?)
    if (spineWidth > 0.25) {
         ctx.rect(xSpineLeft + safe, yBleedTop + safe, spineWidth - (2*safe), trimHeight - (2*safe));
    }
    ctx.stroke();
}

async function drawImageOnCanvas(ctx, file, x, y, targetW, targetH) {
    if (!file) return;

    try {
        let imgBitmap;

        if (file.type === 'application/pdf') {
            // Render first page of PDF
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            const page = await pdf.getPage(1);

            // Get viewport at high scale
            const viewport = page.getViewport({ scale: 2 });
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;

            await page.render({
                canvasContext: tempCanvas.getContext('2d'),
                viewport: viewport
            }).promise;

            imgBitmap = await createImageBitmap(tempCanvas);

        } else if (file.type.startsWith('image/')) {
            // Standard Image
            imgBitmap = await createImageBitmap(file);
        } else {
            // Unsupported for preview (e.g. PSD)
            // Draw placeholder text
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(x, y, targetW, targetH);
            ctx.fillStyle = '#64748b';
            ctx.font = '0.4px sans-serif';
            ctx.fillText('Preview Unavailable', x + 0.5, y + (targetH/2));
            return;
        }

        // Draw Image (Stretch to fit for now - sophisticated "fit/fill" is next step)
        // Actually, usually Cover is "Fill with Bleed".
        // But for this visualizer, let's just fit it into the TRIM box.
        // The user uploads "Front Cover". We assume it's the full size.

        ctx.drawImage(imgBitmap, x, y, targetW, targetH);


    } catch (e) {
        console.error("Error rendering preview image:", e);
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

        const width = parseFloat(specWidth.value);
        const height = parseFloat(specHeight.value);

        if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
            throw new Error('Invalid dimensions');
        }

        const specsUpdate = {
            'projectType': typeValue === 'loose' ? 'single' : 'booklet',
            'specs.dimensions': {
                width: width,
                height: height,
                units: 'in' // Default to inches for now
            }
        };

        // Set Binding Logic
        if (typeValue === 'loose') {
            specsUpdate['specs.binding'] = 'loose';
        } else {
            specsUpdate['specs.binding'] = typeValue; // 'saddleStitch' or 'perfectBound'
            specsUpdate['specs.pageCount'] = parseInt(specPageCount.value) || 0;

            if (typeValue === 'perfectBound') {
                specsUpdate['specs.paperType'] = specPaper.value;
            }
        }

        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, specsUpdate);

        // Reload page or Update State locally to avoid reload
        projectSpecs = {
            dimensions: { width, height, units: 'in' },
            binding: specsUpdate['specs.binding'],
            pageCount: specsUpdate['specs.pageCount'],
            paperType: specsUpdate['specs.paperType']
        };
        projectType = specsUpdate['projectType'];

        // Hide modal and show upload UI (Logic handled in init mostly, but we trigger refresh)
        specsModal.classList.add('hidden');
        uploadContainer.classList.remove('hidden');

        // Refresh UI logic
        refreshBuilderUI();

    } catch (err) {
        console.error("Error saving specs:", err);
        alert("Failed to save specifications: " + err.message);
    } finally {
        saveSpecsBtn.disabled = false;
        saveSpecsBtn.textContent = 'Save & Continue';
    }
});

function refreshBuilderUI() {
    // Show/Hide Tabs based on project type
    if (projectType === 'single') {
        // For Loose Sheets, hide Cover Builder
        tabCover.classList.add('hidden');
        // Ensure Interior is active
        tabInterior.click();
    } else {
        // Booklet
        tabCover.classList.remove('hidden');
        // Configure Cover Builder
        if (projectSpecs.binding === 'saddleStitch') {
            // Hide Spine Upload & Display
            if(fileSpineInput) fileSpineInput.closest('.drop-zone').parentElement.classList.add('hidden');
            // Or disable it? Hidden is better.
        } else {
            if(fileSpineInput) fileSpineInput.closest('.drop-zone').parentElement.classList.remove('hidden');
        }
        // Re-render preview
        renderCoverPreview();
    }
}


// --- Main Initialization ---
async function init() {
    populateSelects();
    const params = getUrlParams();
    projectId = params.projectId;
    guestToken = params.guestToken;

    if (!projectId || !guestToken) {
        showError('Invalid link parameters.');
        return;
    }

    try {
        // 1. Authenticate via Backend (Custom Token)
        const authenticateGuest = httpsCallable(functions, 'authenticateGuest');
        const authResult = await authenticateGuest({ projectId, guestToken });

        if (!authResult.data || !authResult.data.token) {
            throw new Error("Failed to obtain access token.");
        }

        // Sign in with the custom token which contains claims: { guestProjectId: '...', guestPermissions: {...} }
        await signInWithCustomToken(auth, authResult.data.token);

        // 2. Fetch Project Details
        // Now that we are authenticated with the right claims, we can read the project doc
        // (assuming firestore.rules allows it based on the claim)

        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) {
            showError('Project not found or access denied.');
            return;
        }

        const projectData = projectSnap.data();
        projectNameEl.textContent = projectData.projectName;
        projectType = projectData.projectType || 'single'; // Default to single if not set
        projectSpecs = projectData.specs || {}; // Load specs

        loadingState.classList.add('hidden');

        // --- Check Specs ---
        let specsMissing = false;
        const specs = projectSpecs;

        // Check Dimensions
        if (!specs.dimensions || !specs.dimensions.width || !specs.dimensions.height) {
            specsMissing = true;
        }

        // Check Binding if it's missing (Old projects might not have it)
        if (!specs.binding) specsMissing = true;

        // We want to FORCE the new flow if any required data is missing
        // But if they already set it, we skip.

        if (specsMissing) {
            // Show Modal
            specsModal.classList.remove('hidden');
            // Reset form state if needed

            // Pre-fill if some data exists
            if (specs.dimensions) {
                specWidth.value = specs.dimensions.width || '';
                specHeight.value = specs.dimensions.height || '';
            }

        } else {
            // Specs exist, show upload UI directly
            uploadContainer.classList.remove('hidden');
            refreshBuilderUI();
        }


        // 5. Setup UI based on type (even if modal is shown, we prep the background UI)
        // Always show booklet section now as it contains the new unified builder
        bookletUploadSection.classList.remove('hidden');
        singleUploadSection.classList.add('hidden'); // Deprecated single section

        setupDropZone('file-interior'); // Legacy ref cleanup if needed

        // Init Sortable for the new list
        new Sortable(interiorFileList, {
            animation: 150,
            ghostClass: 'opacity-50',
            onEnd: (evt) => {
                const item = interiorFiles[evt.oldIndex];
                interiorFiles.splice(evt.oldIndex, 1);
                interiorFiles.splice(evt.newIndex, 0, item);
            }
        });

        updateFileName('file-cover-front', 'file-name-cover-front');
        updateFileName('file-spine', 'file-name-spine');
        updateFileName('file-cover-back', 'file-name-cover-back');

        validateForm();

    } catch (err) {
        console.error('Init Error:', err);
        let msg = 'An error occurred while loading the page. Please try again.';
        if (err.message.includes('expired')) msg = 'This link has expired.';
        if (err.message.includes('Invalid')) msg = 'Invalid guest link.';
        showError(msg);
    }
}


// --- Upload Handler ---
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Disable inputs
    submitButton.disabled = true;
    submitButton.textContent = 'Uploading...';
    uploadProgress.classList.remove('hidden');

    const filesToUpload = [];

    // Interior
    interiorFiles.forEach((item, i) => {
        filesToUpload.push({
            file: item.file,
            type: `interior_${i}`, // Maintain order in filename
            settings: item.settings
        });
    });

    // Cover (Only if Booklet)
    if (projectType === 'booklet') {
        if (selectedFiles['file-cover-front']) filesToUpload.push({ file: selectedFiles['file-cover-front'], type: 'cover_front' });
        if (selectedFiles['file-spine']) filesToUpload.push({ file: selectedFiles['file-spine'], type: 'cover_spine' });
        if (selectedFiles['file-cover-back']) filesToUpload.push({ file: selectedFiles['file-cover-back'], type: 'cover_back' });
    }

    if (filesToUpload.length === 0) return;

    let completed = 0;
    const total = filesToUpload.length;

    // Store metadata for the backend (filename -> settings)
    const uploadMetadata = [];

    try {
        for (const item of filesToUpload) {
            const file = item.file;
            const timestamp = Date.now();
            const ext = file.name.split('.').pop();

            const storagePath = `proofs/${projectId}/${timestamp}_${item.type}.${ext}`;
            const storageRef = ref(storage, storagePath);

            progressText.textContent = `Uploading ${file.name}...`;

            const uploadTask = uploadBytesResumable(storageRef, file);

            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    },
                    (error) => reject(error),
                    () => resolve()
                );
            });

            // Add to metadata list
            uploadMetadata.push({
                storagePath: storagePath,
                type: item.type,
                settings: item.settings || {} // Pass settings (scaleMode etc.)
            });

            completed++;
            const percent = (completed / total) * 100;
            progressBar.style.width = `${percent}%`;
            progressPercent.textContent = `${Math.round(percent)}%`;
        }

        // Call Backend to Finalize
        progressText.textContent = 'Finalizing...';

        // Trigger Build
        const generateBooklet = httpsCallable(functions, 'generateBooklet');
        await generateBooklet({ projectId: projectId, files: uploadMetadata });

        // Then call the notification one
        const submitGuestUpload = httpsCallable(functions, 'submitGuestUpload');
        await submitGuestUpload({ projectId: projectId });

        // Show Success
        uploadContainer.classList.add('hidden');
        successState.classList.remove('hidden');

    } catch (err) {
        console.error("Upload failed:", err);
        alert("Upload failed: " + err.message);
        submitButton.disabled = false;
        submitButton.textContent = 'Start Upload';
        uploadProgress.classList.add('hidden');
    }
});

// Initialize
init();
