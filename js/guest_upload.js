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
const jumpToPageInput = document.getElementById('jump-to-page');

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
let projectSpecs = {}; // Store loaded/saved specs here

// New Data Model for Virtual Book
let sourceFiles = {}; // Map: id -> File object
let pages = []; // Array: { id, sourceFileId, pageIndex, settings: { scaleMode, alignment }, isSpread: boolean }
let viewerScale = 0.5; // Zoom level for viewer

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
            specCoverPaper.required = true;
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
    // Check if we have pages in the virtual book
    if (pages.length > 0) {
        isValid = true;
    }

    // Also consider cover files if booklet
    if (projectType === 'booklet') {
         if (selectedFiles['file-cover-front'] && selectedFiles['file-cover-back']) {
             // Maybe allow just cover? For now let's say valid if pages exist OR full cover exists.
             isValid = true;
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


// --- Data Model Logic ---

async function addInteriorFiles(files) {
    for (const file of Array.from(files)) {
        const sourceId = Date.now() + Math.random().toString(16).slice(2);
        sourceFiles[sourceId] = file;

        let numPages = 1;
        if (file.type === 'application/pdf') {
             try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                numPages = pdf.numPages;
             } catch (e) {
                 console.warn("Could not parse PDF", e);
             }
        }

        for (let i = 0; i < numPages; i++) {
            pages.push({
                id: `${sourceId}_p${i}`,
                sourceFileId: sourceId,
                pageIndex: i + 1, // 1-based for display/pdfjs
                settings: { scaleMode: 'fit', alignment: 'center' },
                isSpread: false
            });
        }
    }
    renderBookViewer();
}

window.updatePageSetting = (pageId, setting, value) => {
    const page = pages.find(p => p.id === pageId);
    if (page) {
        page.settings[setting] = value;

        // If changing spread mode, we need to re-render the whole viewer to adjust grid
        if (setting === 'isSpread') {
             renderBookViewer();
             return;
        }

        // Clear cache for this page as appearance changed
        // Actually, the source bitmap is the same, only the transform changes.
        // But renderPageCanvas handles drawing. We don't need to clear imageCache if it stores the *source* file render.
        // But currently imageCache (in my plan) stores the *final* canvas? No, better to cache the source render.
        // Let's refine the cache strategy in renderPageCanvas.

        const canvas = document.getElementById(`canvas-${pageId}`);
        if (canvas) renderPageCanvas(page, canvas);
    }
};

window.deletePage = (pageId) => {
    pages = pages.filter(p => p.id !== pageId);
    imageCache.delete(pageId); // Cleanup
    renderBookViewer();
};

// --- Book Viewer Rendering ---

function renderBookViewer() {
    const container = document.getElementById('book-viewer-container');
    if (!container) return;

    container.innerHTML = ''; // Clear

    if (pages.length === 0) {
        // Empty State
         container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30">
                <p class="text-gray-400 mb-2">Your book is empty.</p>
                <p class="text-gray-500 text-sm">Drag files here to add pages.</p>
            </div>
         `;
    } else {
        const grid = document.createElement('div');
        // Spread Layout: CSS Grid with 2 columns
        grid.className = "grid grid-cols-2 gap-x-0 gap-y-8 justify-items-center items-end pb-12";
        grid.id = "book-grid";

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const card = entry.target;
                    const pageId = card.dataset.id;
                    const canvas = document.getElementById(`canvas-${pageId}`);
                    const page = pages.find(p => p.id === pageId);

                    if (canvas && page) {
                        renderPageCanvas(page, canvas).then(() => {
                            const placeholder = document.getElementById(`placeholder-${pageId}`);
                            if(placeholder) placeholder.style.opacity = '0';
                            setTimeout(() => placeholder?.remove(), 300);
                        });
                        obs.unobserve(card);
                    }
                }
            });
        }, { root: container.parentElement, rootMargin: '200px' });

        pages.forEach((page, index) => {
            const card = document.createElement('div');
            card.dataset.id = page.id;

            // Determine Position (Left vs Right)
            // Index 0 -> Page 1 -> Right Side (Start of Book)
            // Index 1 -> Page 2 -> Left Side
            // Index 2 -> Page 3 -> Right Side

            const isRightPage = (index % 2 === 0); // 0, 2, 4... are Right Pages
            const isFirstPage = (index === 0);

            // Base Classes
            let classes = "relative group bg-slate-800 shadow-lg border border-slate-700 transition-all hover:border-indigo-500 overflow-hidden";

            // Spread Styling logic
            if (isFirstPage) {
                card.style.gridColumnStart = "2"; // Push to Right Column
                classes += " rounded-r-lg rounded-l-sm border-l-2 border-l-slate-900"; // Spine visual
            } else if (isRightPage) {
                card.style.justifySelf = "start"; // Right Column aligns start (leftwards to spine)
                classes += " rounded-r-lg rounded-l-none border-l-0"; // Connect to spine
            } else {
                // Left Page (Odd indices 1, 3...)
                card.style.justifySelf = "end"; // Left Column aligns end (rightwards to spine)
                classes += " rounded-l-lg rounded-r-none border-r-0"; // Connect to spine
            }

            card.className = classes;

            // Size the card based on aspect ratio + zoom
            // For now fixed CSS width, canvas fits inside
            const cardWidth = 200 * viewerScale; // Zoom factor
            // card.style.width = `${cardWidth}px`; // Let canvas dictate size? No, uniform width looks better.

            // Canvas Container
            const canvasContainer = document.createElement('div');
            canvasContainer.className = "p-2 relative overflow-hidden";
            const canvas = document.createElement('canvas');
            canvas.id = `canvas-${page.id}`;
            canvas.className = "bg-white shadow-sm mx-auto";
            // Height auto?
            canvasContainer.appendChild(canvas);

            // Overlay Controls
            const controls = document.createElement('div');
            controls.className = "absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 p-1 rounded backdrop-blur-sm";
            controls.innerHTML = `
                <button onclick="deletePage('${page.id}')" class="text-red-400 hover:text-white p-1" title="Delete Page">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            `;

            // Footer Controls (Settings)
            const footer = document.createElement('div');
            footer.className = "px-3 py-2 bg-slate-900/50 border-t border-slate-700 flex justify-between items-center rounded-b-lg";

            // Select for Fit/Fill
            const select = document.createElement('select');
            select.className = "bg-slate-800 text-[10px] text-white border border-slate-600 rounded px-1 py-0.5 focus:outline-none focus:border-indigo-500";
            select.innerHTML = `
                <option value="fit" ${page.settings.scaleMode === 'fit' ? 'selected' : ''}>Fit</option>
                <option value="fill" ${page.settings.scaleMode === 'fill' ? 'selected' : ''}>Fill</option>
                <option value="stretch" ${page.settings.scaleMode === 'stretch' ? 'selected' : ''}>Stretch</option>
            `;
            select.onchange = (e) => updatePageSetting(page.id, 'scaleMode', e.target.value);

            // Page Number
            const pageNum = document.createElement('span');
            pageNum.className = "text-xs text-gray-400 font-mono";
            pageNum.textContent = `P${index + 1}`;

            footer.appendChild(pageNum);
            footer.appendChild(select);

            card.appendChild(controls);
            card.appendChild(canvasContainer);
            card.appendChild(footer);
            grid.appendChild(card);

            // Add Placeholder for Lazy Loading
            const placeholder = document.createElement('div');
            placeholder.className = "absolute inset-0 flex items-center justify-center text-gray-600 bg-slate-200 z-10 transition-opacity duration-300";
            placeholder.innerHTML = '<div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>';
            placeholder.id = `placeholder-${page.id}`;
            canvasContainer.appendChild(placeholder);

            // Observe for Lazy Loading
            observer.observe(card);
        });

        container.appendChild(grid);

        // Init Sortable
        new Sortable(grid, {
            animation: 150,
            ghostClass: 'opacity-50',
            onEnd: (evt) => {
                const item = pages[evt.oldIndex];
                pages.splice(evt.oldIndex, 1);
                pages.splice(evt.newIndex, 0, item);
                // Re-render to update page numbers?
                renderBookViewer();
            }
        });
    }
    validateForm();
}

async function renderPageCanvas(page, canvas) {
    const file = sourceFiles[page.sourceFileId];
    if (!file || !projectSpecs.dimensions) return;

    const ctx = canvas.getContext('2d', { alpha: false }); // Optimize alpha
    const width = projectSpecs.dimensions.width;
    const height = projectSpecs.dimensions.height;
    const bleed = 0.125;

    // Visual Scale for Thumbnails
    // Use lower resolution for thumbnails (1.5x density max for retina, down to 1.0 if fast scrolling needed)
    const visualScale = (250 * viewerScale) / ((width + bleed*2) * 96);
    const pixelsPerInch = 96 * visualScale;
    const pixelDensity = 1.5; // Lowered from 2 to improve performance

    const totalW = width + (bleed*2);
    const totalH = height + (bleed*2);

    canvas.width = totalW * pixelsPerInch * pixelDensity;
    canvas.height = totalH * pixelsPerInch * pixelDensity;
    canvas.style.width = `${totalW * pixelsPerInch}px`;
    canvas.style.height = `${totalH * pixelsPerInch}px`;

    ctx.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    ctx.scale(pixelsPerInch, pixelsPerInch);

    // Draw Sheet Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, totalH);

    // Draw Content
    await drawFileWithTransform(ctx, file, 0, 0, totalW, totalH, page.settings.scaleMode, page.settings.alignment, page.pageIndex, page.id);

    // Guides
    ctx.lineWidth = 1.0 / pixelsPerInch;
    // Trim (Blue) - Draw this first so content can (optionally) be clipped visually if we wanted, but for preview we show bleed.
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.strokeRect(bleed, bleed, width, height);

    // Bleed (Red)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.strokeRect(0, 0, totalW, totalH);
}

async function drawFileWithTransform(ctx, file, targetX, targetY, targetW, targetH, mode, align, pageIndex = 1, pageId = null) {
    let imgBitmap;
    let srcW, srcH;

    // Check Cache (Memory Caching)
    // Key format: fileId + pageIndex (since transform is applied at draw time, we cache the source render)
    // Actually we want to cache the *rendered bitmap* of the source file, not the final canvas.
    const cacheKey = file.name + '_' + pageIndex + '_' + file.lastModified;

    if (imageCache.has(cacheKey)) {
        imgBitmap = imageCache.get(cacheKey);
        srcW = imgBitmap.width;
        srcH = imgBitmap.height;
    } else {
        // Render New
        if (file.type === 'application/pdf') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                const page = await pdf.getPage(pageIndex);

                // Lower scale slightly for thumbnail performance
                const viewport = page.getViewport({ scale: 1.0 });
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;

                await page.render({
                    canvasContext: tempCanvas.getContext('2d'),
                    viewport: viewport
                }).promise;

                imgBitmap = await createImageBitmap(tempCanvas);
                // Cache it!
                imageCache.set(cacheKey, imgBitmap);

                srcW = viewport.width;
                srcH = viewport.height;
            } catch (e) {
                console.error("PDF Render Error", e);
                return;
            }
        } else if (file.type.startsWith('image/')) {
            imgBitmap = await createImageBitmap(file);
            imageCache.set(cacheKey, imgBitmap);
            srcW = imgBitmap.width;
            srcH = imgBitmap.height;
        }
    }

    if (!imgBitmap && file.type.startsWith('image/')) {
        imgBitmap = await createImageBitmap(file);
        srcW = imgBitmap.width;
        srcH = imgBitmap.height;
    } else {
         // Placeholder
        ctx.fillStyle = '#ccc';
        ctx.fillRect(targetX, targetY, targetW, targetH);
        return;
    }

    // Standard Transform Logic
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
    } else if (mode === 'fill') {
        if (srcRatio > targetRatio) {
            drawH = targetH;
            drawW = targetH * srcRatio;
        } else {
            drawW = targetW;
            drawH = targetW / srcRatio;
        }
    }

    // Center Alignment
    drawX = targetX + (targetW - drawW) / 2;
    drawY = targetY + (targetH - drawH) / 2;

    // Clip
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

if (viewerZoom) {
    viewerZoom.addEventListener('input', (e) => {
        viewerScale = parseFloat(e.target.value);
        renderBookViewer();
    });
}

if (jumpToPageInput) {
    jumpToPageInput.addEventListener('change', (e) => {
        const pageNum = parseInt(e.target.value);
        if (isNaN(pageNum) || pageNum < 1) return;

        const pageIndex = pageNum - 1;
        if (pageIndex >= 0 && pageIndex < pages.length) {
            const pageId = pages[pageIndex].id;
            const card = document.querySelector(`[data-id="${pageId}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Highlight momentarily
                card.classList.add('ring-2', 'ring-indigo-500');
                setTimeout(() => card.classList.remove('ring-2', 'ring-indigo-500'), 1500);
            }
        } else {
            alert("Page number out of range.");
        }
    });
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

        // Draw Image using "Aspect Fill" logic
        const srcW = imgBitmap.width;
        const srcH = imgBitmap.height;
        const srcRatio = srcW / srcH;
        const targetRatio = targetW / targetH;

        let drawW, drawH, drawX, drawY;

        if (srcRatio > targetRatio) {
            // Image is wider than target: Crop width
            drawH = targetH;
            drawW = targetH * srcRatio;
            drawY = y;
            drawX = x - (drawW - targetW) / 2; // Center horizontally
        } else {
            // Image is taller than target: Crop height
            drawW = targetW;
            drawH = targetW / srcRatio;
            drawX = x;
            drawY = y - (drawH - targetH) / 2; // Center vertically
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, targetW, targetH);
        ctx.clip();
        ctx.drawImage(imgBitmap, drawX, drawY, drawW, drawH);
        ctx.restore();


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
                specsUpdate['specs.coverPaperType'] = specCoverPaper.value;
            }
        }

        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, specsUpdate);

        // Reload page or Update State locally to avoid reload
        projectSpecs = {
            dimensions: { width, height, units: 'in' },
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

        // Note: Sortable is initialized in renderBookViewer now, not here.

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

    // 1. Identify Unique Source Files from Pages + Cover
    const uniqueSourceIds = new Set();
    pages.forEach(p => uniqueSourceIds.add(p.sourceFileId));

    const filesToUploadMap = {}; // id -> { file, storagePath }

    // Add Interior Files
    uniqueSourceIds.forEach(id => {
        if (sourceFiles[id]) {
            filesToUploadMap[id] = { file: sourceFiles[id], type: 'interior_source' };
        }
    });

    // Add Cover Files (Only if Booklet)
    if (projectType === 'booklet') {
        if (selectedFiles['file-cover-front']) filesToUploadMap['cover_front'] = { file: selectedFiles['file-cover-front'], type: 'cover_front' };
        if (selectedFiles['file-spine']) filesToUploadMap['cover_spine'] = { file: selectedFiles['file-spine'], type: 'cover_spine' };
        if (selectedFiles['file-cover-back']) filesToUploadMap['cover_back'] = { file: selectedFiles['file-cover-back'], type: 'cover_back' };
    }

    const filesToUpload = Object.values(filesToUploadMap);
    if (filesToUpload.length === 0 && pages.length === 0) return;

    // 2. Upload Files
    let completed = 0;
    const total = filesToUpload.length;

    // Map for mapping local ID to remote path
    const uploadedPaths = {}; // localId -> storagePath

    try {
        for (const localId in filesToUploadMap) {
            const item = filesToUploadMap[localId];
            const file = item.file;
            const timestamp = Date.now();
            const ext = file.name.split('.').pop();

            // Use a 'sources/' subfolder to keep raw uploads separate from processed proofs
            const storagePath = `proofs/${projectId}/sources/${timestamp}_${item.type}_${file.name}`;
            const storageRef = ref(storage, storagePath);

            progressText.textContent = `Uploading ${file.name}...`;

            await uploadBytesResumable(storageRef, file);

            uploadedPaths[localId] = storagePath;

            completed++;
            const percent = (completed / total) * 100;
            progressBar.style.width = `${percent}%`;
            progressPercent.textContent = `${Math.round(percent)}%`;
        }

        // 3. Construct Metadata (Page List)
        const bookletMetadata = [];

        // Add Pages (Interior)
        pages.forEach(p => {
            bookletMetadata.push({
                storagePath: uploadedPaths[p.sourceFileId],
                sourcePageIndex: p.pageIndex - 1, // Convert to 0-based for backend
                settings: p.settings,
                type: 'interior_page'
            });
        });

        // Add Cover Parts (if uploaded)
        if (uploadedPaths['cover_front']) bookletMetadata.push({ storagePath: uploadedPaths['cover_front'], type: 'cover_front' });
        if (uploadedPaths['cover_spine']) bookletMetadata.push({ storagePath: uploadedPaths['cover_spine'], type: 'cover_spine' });
        if (uploadedPaths['cover_back']) bookletMetadata.push({ storagePath: uploadedPaths['cover_back'], type: 'cover_back' });

        // Use variable name expected by next block
        const uploadMetadata = bookletMetadata;

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
