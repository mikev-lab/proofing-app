import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import * as pdfjsLib from 'https://mozilla.github.io/pdf.js/build/pdf.mjs';
import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js';

import { firebaseConfig } from "./firebase.js";
import { HARDCODED_PAPER_TYPES, BINDING_TYPES } from "./guest_constants.js";
import { drawGuides } from "./guides.js";

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
const imageCache = new Map(); // Cache for rendered ImageBitmaps: key=pageId -> { bitmap, scale }

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
        // Set cover fields as not required
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

async function addInteriorFiles(files, isSpreadUpload = false, insertAtIndex = null) {
    const newPages = [];

    for (const file of Array.from(files)) {
        const sourceId = Date.now() + Math.random().toString(16).slice(2);

        // Check if file is supported locally (PDF, JPG, PNG) or requires server (PSD, AI)
        const isLocal = file.type === 'application/pdf' || file.type.startsWith('image/');

        if (isLocal) {
            sourceFiles[sourceId] = file;

            let numPages = 1;
            if (file.type === 'application/pdf') {
                 try {
                    // Use Blob URL to avoid loading entire file into memory
                    const fileUrl = URL.createObjectURL(file);
                    const pdf = await pdfjsLib.getDocument(fileUrl).promise;
                    numPages = pdf.numPages;
                    URL.revokeObjectURL(fileUrl); // Cleanup
                 } catch (e) {
                     console.warn("Could not parse PDF", e);
                 }
            }

            addPagesToModel(newPages, sourceId, numPages, isSpreadUpload);

        } else {
            // SERVER SIDE PROCESSING (PSD, AI)
            // 1. Create Placeholder Pages immediately so UI updates
            // We assume 1 page for now (Gotenberg splitting for PSD is complex to sync here immediately without waiting)
            // Actually, we can show a "Processing" state on the card itself.

            sourceFiles[sourceId] = { file: file, status: 'uploading', previewUrl: null }; // Placeholder

            // We add 1 placeholder page for now. If the server returns more (e.g. multi-page PDF from AI),
            // we would need to dynamically insert them. For now, let's assume single file = 1 page
            // or we update later. To keep it simple, we'll treat complex files as 1 object for now unless we wait.

            addPagesToModel(newPages, sourceId, 1, isSpreadUpload);

            // 2. Start Background Process
            processServerFile(file, sourceId);
        }
    }

    if (insertAtIndex !== null && insertAtIndex >= 0 && insertAtIndex <= pages.length) {
        pages.splice(insertAtIndex, 0, ...newPages);
    } else {
        pages.push(...newPages);
    }

    renderBookViewer();
}

function addPagesToModel(targetArray, sourceId, numPages, isSpreadUpload) {
    if (isSpreadUpload) {
        for (let i = 0; i < numPages; i++) {
            targetArray.push({
                id: `${sourceId}_p${i}_L`,
                sourceFileId: sourceId,
                pageIndex: i + 1,
                settings: { scaleMode: 'fill', alignment: 'center', view: 'left', panX: 0, panY: 0 },
                isSpread: false
            });
            targetArray.push({
                id: `${sourceId}_p${i}_R`,
                sourceFileId: sourceId,
                pageIndex: i + 1,
                settings: { scaleMode: 'fill', alignment: 'center', view: 'right', panX: 0, panY: 0 },
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
}

async function processServerFile(file, sourceId) {
    try {
        // 1. Upload to Temp Storage
        const tempId = Date.now().toString();
        const storageRef = ref(storage, `temp_uploads/${tempId}/${file.name}`);

        // Find all cards for this source to update status
        const updateStatus = (msg) => {
            const relatedPages = pages.filter(p => p.sourceFileId === sourceId);
            relatedPages.forEach(p => {
                const placeholder = document.getElementById(`placeholder-${p.id}`);
                if (placeholder) placeholder.innerHTML = `<p class="text-xs text-indigo-400 animate-pulse">${msg}</p>`;
            });
        };

        updateStatus("Uploading...");
        await uploadBytesResumable(storageRef, file);

        updateStatus("Processing...");

        // 2. Call Generate Previews
        const generatePreviews = httpsCallable(functions, 'generatePreviews');
        const result = await generatePreviews({
            filePath: `temp_uploads/${tempId}/${file.name}`,
            originalName: file.name
        });

        // 3. Update Source File Data with Result
        if (result.data && result.data.pages && result.data.pages.length > 0) {
            // We only support 1 page preview for complex files in this simplified flow for now,
            // or strictly speaking, we map the first page of the result to our existing page entry.
            // Ideally we'd expand if it turned out to be multi-page.

            const firstPage = result.data.pages[0];

            // Get Signed URL for the preview path (tempPreviewPath)
            // The function returns `tempPreviewPath` which is a storage path.
            const previewRef = ref(storage, firstPage.tempPreviewPath);
            const previewUrl = await getDownloadURL(previewRef);

            // Update the source registry
            sourceFiles[sourceId] = {
                file: file,
                status: 'ready',
                previewUrl: previewUrl,
                isServer: true
            };

            // Clear Image Cache if any (unlikely)
            imageCache.delete(sourceId + '_1_' + file.lastModified);

            // Trigger Re-render
            renderBookViewer();
        } else {
            throw new Error("No preview generated");
        }

    } catch (err) {
        console.error("Server file processing failed", err);
        sourceFiles[sourceId] = { file: file, status: 'error', error: err.message };
        renderBookViewer(); // Will show error state
    }
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
         // Show Initial Insert Bar
         container.appendChild(createInsertBar(0));

         const empty = document.createElement('div');
         empty.className = "flex flex-col items-center justify-center h-32 text-gray-500";
         empty.innerHTML = "<p>Drag files or use the arrows to add pages.</p>";
         container.appendChild(empty);
         return;
    }

    // Dimensions for layout
    const width = projectSpecs.dimensions.width;
    const height = projectSpecs.dimensions.height;
    const bleed = 0.125;
    const visualScale = (250 * viewerScale) / ((width + bleed*2) * 96);
    const pixelsPerInch = 96 * visualScale;

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

    // Render Spreads Loop
    // Pages: [0, 1, 2, 3]
    // Spread 0: [null, 0]
    // Spread 1: [1, 2]
    // Spread 2: [3, null]

    // We start with Index 0.
    // Page 1 is ALWAYS on the Right (Index 0).

    // Insert Bar at Top (Index 0)
    container.appendChild(createInsertBar(0));

    // First Spread (Page 1)
    const firstSpread = document.createElement('div');
    firstSpread.className = "spread-row flex justify-center items-end gap-0 mb-4 min-h-[100px] p-2 border border-transparent hover:border-dashed hover:border-gray-600 rounded";
    // Added min-height and hover effect to make it a drop target even if empty (though it shouldn't be empty usually)

    // Empty Left slot for Page 1
    // IMPORTANT: SortableJS might treat this spacer as a draggable item if we aren't careful.
    // We used draggable: '.page-card' in the config, so this spacer is safe.
    const spacer = document.createElement('div');
    spacer.style.width = `${width * pixelsPerInch}px`; // Match page width
    spacer.className = "pointer-events-none"; // Prevent interaction
    firstSpread.appendChild(spacer);

    // Page 1 (Right)
    if (pages[0]) {
        firstSpread.appendChild(createPageCard(pages[0], 0, true, false, width, height, bleed, pixelsPerInch, observer));
    }
    container.appendChild(firstSpread);

    // Rest of pages
    let i = 1;
    while (i < pages.length) {
        // Insert Bar before this spread
        container.appendChild(createInsertBar(i));

        const spreadDiv = document.createElement('div');
        spreadDiv.className = "spread-row flex justify-center items-end gap-0 mb-4 min-h-[100px] p-2 border border-transparent hover:border-dashed hover:border-gray-600 rounded";

        // Left Page
        let leftCard = null;
        if (pages[i]) {
            leftCard = createPageCard(pages[i], i, false, false, width, height, bleed, pixelsPerInch, observer);
            spreadDiv.appendChild(leftCard);
        }

        // Right Page
        let rightCard = null;
        if (i + 1 < pages.length) {
            rightCard = createPageCard(pages[i+1], i+1, true, false, width, height, bleed, pixelsPerInch, observer);
            spreadDiv.appendChild(rightCard);
        }

        // Fix overlapping borders:
        // If both pages exist, the Left card's right border and Right card's left border are removed by classes,
        // but if any negative margin exists or flex shrinking happens, they overlap.
        // Ensure they don't shrink.
        if (leftCard) leftCard.style.flexShrink = '0';
        if (rightCard) rightCard.style.flexShrink = '0';

        if (!rightCard) {
            // Spacer if single page at end
             const endSpacer = document.createElement('div');
             endSpacer.style.width = `${width * pixelsPerInch}px`;
             endSpacer.className = "pointer-events-none";
             spreadDiv.appendChild(endSpacer);
        }

        container.appendChild(spreadDiv);
        i += 2;
    }

    // Final Insert Bar
    container.appendChild(createInsertBar(pages.length));

    validateForm();

    // Re-initialize Sortable for the new DOM
    // We want shared lists between all spread rows.
    const spreadDivs = container.querySelectorAll('.spread-row');
    spreadDivs.forEach(spreadDiv => {
        new Sortable(spreadDiv, {
            group: 'shared-spreads', // Allow dragging between spreads
            animation: 150,
            draggable: '.page-card', // The actual card
            handle: '.page-card', // Drag by card
            ghostClass: 'opacity-50',
            onEnd: (evt) => {
                // When drop ends, we need to sync the `pages` array order to the new DOM order.
                // 1. Collect all data-ids from the DOM in order.
                const allCards = document.querySelectorAll('.page-card');
                const newOrderIds = Array.from(allCards).map(c => c.dataset.id);

                // 2. Reorder `pages` array
                const newPages = [];
                newOrderIds.forEach(id => {
                    const p = pages.find(x => x.id === id);
                    if (p) newPages.push(p);
                });

                pages = newPages;

                // 3. Re-render fully to fix layout (e.g. Left vs Right page styling)
                // We must delay slightly to let the drag event finish or Sortable might glitch
                setTimeout(() => renderBookViewer(), 50);
            }
        });
    });
}

// Global Pointer Event Handlers for Panning
let activePageId = null;
let isDragging = false;
let startX = 0;
let startY = 0;
let startPanX = 0;
let startPanY = 0;

document.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;

    const pageId = card.dataset.id;
    const page = pages.find(p => p.id === pageId);

    // Only allow panning if scaleMode is 'fill'
    if (page && page.settings.scaleMode === 'fill') {
        activePageId = pageId;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startPanX = page.settings.panX || 0;
        startPanY = page.settings.panY || 0;

        card.classList.add('cursor-grabbing');
        e.preventDefault(); // Prevent text selection
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
        // Note: rect includes the bleed area.

        // Sensitivity factor
        const sensitivity = 1.0;

        if (rect.width > 0 && rect.height > 0) {
            const newPanX = startPanX + ((dx / rect.width) * sensitivity);
            const newPanY = startPanY + ((dy / rect.height) * sensitivity);

            // Ensure valid numbers
            page.settings.panX = Number.isFinite(newPanX) ? newPanX : 0;
            page.settings.panY = Number.isFinite(newPanY) ? newPanY : 0;
        }

        // Re-render immediately (throttling via RAF is better but this is simple)
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
            <button class="text-xs bg-slate-700 hover:bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1" onclick="triggerInsert(${index}, 'left')" title="Insert File">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                File
            </button>
            <button class="text-xs bg-slate-700 hover:bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1" onclick="triggerInsert(${index}, 'blank')" title="Insert Blank Page">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Blank
            </button>
             <button class="text-xs bg-slate-700 hover:bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1" onclick="triggerInsert(${index}, 'spread')" title="Insert Spread (File)">
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

    if (isFirstPage) {
        classes += " rounded-r-lg rounded-l-sm border-l-2 border-l-slate-900";
    } else if (isRightPage) {
        classes += " rounded-r-lg rounded-l-none border-l-0";
    } else {
        classes += " rounded-l-lg rounded-r-none border-r-0";
    }
    card.className = classes;

    // Layout Logic: Show Reader Spreads with Bleed visible on outside edges
    const bleedPx = bleed * pixelsPerInch;

    let containerW, containerH;
    let canvasLeft, canvasTop;

    // Spread Logic
    // Use Math.ceil for containerW/containerH to prevent clipping of sub-pixel bleed areas
    if (isRightPage) {
         // Right Page: Clip LEFT bleed (Spine)
         // Container must be large enough to hold the pixels.
         containerW = Math.ceil((width + bleed) * pixelsPerInch);
         canvasLeft = -bleedPx;
    } else {
         // Left Page: Clip RIGHT bleed (Spine)
         containerW = Math.ceil((width + bleed) * pixelsPerInch);
         canvasLeft = 0;
    }
    // Vertical Bleed always visible
    containerH = Math.ceil((height + (bleed*2)) * pixelsPerInch);
    canvasTop = 0;

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

    // Overlay Controls
    const controls = document.createElement('div');
    controls.className = "absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 p-1 rounded backdrop-blur-sm z-20";
    controls.innerHTML = `
        <button onclick="deletePage('${page.id}')" class="text-red-400 hover:text-white p-1" title="Delete Page">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;

    // Overlay Settings (Transparent Buttons)
    const settingsOverlay = document.createElement('div');
    settingsOverlay.className = "absolute bottom-0 inset-x-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-slate-900/90 to-transparent flex justify-center gap-2 z-20";

    const modes = [
        { id: 'fit', icon: '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>', title: 'Fit to Page' },
        { id: 'fill', icon: '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4h16v16H4z"/></svg>', title: 'Fill Page' },
        { id: 'stretch', icon: '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"/></svg>', title: 'Stretch to Fit' }
    ];

    modes.forEach(mode => {
        const btn = document.createElement('button');
        btn.className = `p-1.5 rounded border ${page.settings.scaleMode === mode.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/80 border-slate-600 text-gray-400 hover:bg-slate-700 hover:text-white'}`;
        btn.innerHTML = mode.icon;
        btn.title = mode.title;
        btn.onclick = () => updatePageSetting(page.id, 'scaleMode', mode.id);
        settingsOverlay.appendChild(btn);
    });

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
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    card.addEventListener('drop', async (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            // Replace content of THIS page
            await updatePageContent(page.id, file);
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
    // Handle Blank Page
    if (page.sourceFileId === null) {
        drawBlankPage(page, canvas);
        return;
    }

    const sourceEntry = sourceFiles[page.sourceFileId];
    if (!sourceEntry || !projectSpecs.dimensions) return;

    // Unwrap Source (handle both raw File and server-processed object)
    const isServer = sourceEntry.isServer;
    const file = isServer ? sourceEntry.file : sourceEntry;

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

    canvas.width = Math.ceil(totalW * pixelsPerInch * pixelDensity);
    canvas.height = Math.ceil(totalH * pixelsPerInch * pixelDensity);

    // Style width/height is set by renderBookViewer container logic mostly,
    // but we need to ensure the canvas element itself has the right size to be positioned.
    canvas.style.width = `${totalW * pixelsPerInch}px`;
    canvas.style.height = `${totalH * pixelsPerInch}px`;

    // Update position to ensure centering (in case scale changed)
    canvas.style.left = `-${bleed * pixelsPerInch}px`;
    canvas.style.top = `-${bleed * pixelsPerInch}px`;

    ctx.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    ctx.scale(pixelsPerInch, pixelsPerInch);

    // Draw Sheet Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, totalH);

    // Draw Content
    // Pass additional Pan Settings
    await drawFileWithTransform(ctx, sourceEntry, 0, 0, totalW, totalH, page.settings.scaleMode, page.settings.alignment, page.pageIndex, page.id, page.settings.view, page.settings.panX, page.settings.panY);

    // Guides
    const mockSpecs = {
        dimensions: { width: width, height: height, units: 'in' },
        bleedInches: bleed,
        safetyInches: 0.125
    };

    // Scale for Guides: guides.js expects points.
    // Canvas context is already transformed by pixelDensity.
    // We are drawing in pixels (pixelsPerInch).
    // 1 point = 1/72 inch.
    // We want 1 inch = pixelsPerInch.
    // So scale = pixelsPerInch / 72.
    const guideScale = pixelsPerInch / 72;

    const renderInfo = {
        x: 0,
        y: 0,
        width: totalW * pixelsPerInch, // Full canvas width in logical pixels
        height: totalH * pixelsPerInch,
        scale: guideScale,
        isSpread: page.settings.view === 'left' || page.settings.view === 'right',
        isLeftPage: page.settings.view === 'left'
    };

    // Ensure guides are drawn on TOP.
    // Reset transform to simple pixel density for drawing guides (which are calculated in pixels)
    // This avoids double-scaling where the guide calculation (in pixels) is multiplied again by pixelsPerInch.
    ctx.save();
    ctx.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    drawGuides(ctx, mockSpecs, [renderInfo], { trim: true, bleed: true, safety: true });
    ctx.restore();
}

function drawBlankPage(page, canvas) {
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
    canvas.style.left = `-${bleed * pixelsPerInch}px`;
    canvas.style.top = `-${bleed * pixelsPerInch}px`;

    ctx.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    ctx.scale(pixelsPerInch, pixelsPerInch);

    // 1. Draw Background (Light Gray to indicate empty)
    ctx.fillStyle = '#f8fafc'; // Slate-50
    ctx.fillRect(0, 0, totalW, totalH);

    // 2. Draw Dashed Border or Icon
    ctx.strokeStyle = '#cbd5e1'; // Slate-300
    ctx.lineWidth = 2 / pixelsPerInch;
    ctx.setLineDash([10 / pixelsPerInch, 10 / pixelsPerInch]);
    ctx.strokeRect(bleed, bleed, width, height); // Trim area
    ctx.setLineDash([]);

    // 3. Text
    ctx.fillStyle = '#94a3b8'; // Slate-400
    ctx.font = 'italic 0.4px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("Drop File Here", totalW / 2, totalH / 2);

    // Draw Guides
    const guideScale = pixelsPerInch / 72; // Correct for guides.js
    const mockSpecs = {
        dimensions: { width: width, height: height, units: 'in' },
        bleedInches: bleed,
        safetyInches: 0.125
    };
    const renderInfo = {
        x: 0,
        y: 0,
        width: totalW * pixelsPerInch,
        height: totalH * pixelsPerInch,
        scale: guideScale,
        isSpread: page.settings.view === 'left' || page.settings.view === 'right',
        isLeftPage: page.settings.view === 'left'
    };

    ctx.save();
    ctx.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    drawGuides(ctx, mockSpecs, [renderInfo], { trim: true, bleed: true, safety: true });
    ctx.restore();
}

async function drawFileWithTransform(ctx, sourceEntry, targetX, targetY, targetW, targetH, mode, align, pageIndex = 1, pageId = null, viewMode = 'full', panX = 0, panY = 0) {
    let imgBitmap;
    let srcW, srcH;

    const isServer = sourceEntry.isServer;
    const file = isServer ? sourceEntry.file : sourceEntry;

    // 1. Check Error/Status
    if (isServer && sourceEntry.status === 'error') {
        ctx.fillStyle = '#fee2e2';
        ctx.fillRect(targetX, targetY, targetW, targetH);
        ctx.fillStyle = '#ef4444';
        ctx.font = '0.2px sans-serif';
        ctx.fillText("Processing Failed", targetX + 0.5, targetY + targetH/2);
        return;
    }

    if (isServer && sourceEntry.status !== 'ready') {
         // Keep placeholder (spinner handled by DOM overlay)
         return;
    }

    // 2. Check Cache
    const cacheKey = (isServer ? sourceEntry.previewUrl : file.name) + '_' + pageIndex + '_' + (file.lastModified || 'server');

    if (imageCache.has(cacheKey)) {
        imgBitmap = imageCache.get(cacheKey);
        srcW = imgBitmap.width;
        srcH = imgBitmap.height;
    } else {
        // Render New
        if (isServer) {
            // Load from Preview URL
            try {
                // For now, assume previewUrl is a PDF (as returned by generatePreviews)
                // But generatePreviews returns a path to a PDF.
                // We need to load that PDF using PDF.js just like a local file, but from URL.

                const loadingTask = pdfjsLib.getDocument(sourceEntry.previewUrl);
                const pdf = await loadingTask.promise;
                // Preview PDFs are usually 1 page per file if split, OR multi-page.
                // Our generatePreviews splits them. So pageIndex 1 is likely correct if it's a single page PDF.
                // But if we kept them merged, we'd use pageIndex.
                // Let's assume we use pageIndex relative to the *preview file*.
                // If `generatePreviews` returns individual pages, we'd map them.
                // In `processServerFile`, we only mapped the first page result.
                // So let's try page 1.
                const page = await pdf.getPage(1);

                const viewport = page.getViewport({ scale: 1.0 });
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;

                await page.render({
                    canvasContext: tempCanvas.getContext('2d'),
                    viewport: viewport
                }).promise;

                imgBitmap = await createImageBitmap(tempCanvas);
                imageCache.set(cacheKey, imgBitmap);
                srcW = viewport.width;
                srcH = viewport.height;

            } catch(e) {
                console.error("Server Preview Render Error", e);
            }

        } else if (file.type === 'application/pdf') {
            try {
                const fileUrl = URL.createObjectURL(file);
                const pdf = await pdfjsLib.getDocument(fileUrl).promise;
                const page = await pdf.getPage(pageIndex);

                const viewport = page.getViewport({ scale: 1.0 });
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;

                await page.render({
                    canvasContext: tempCanvas.getContext('2d'),
                    viewport: viewport
                }).promise;

                imgBitmap = await createImageBitmap(tempCanvas);
                imageCache.set(cacheKey, imgBitmap);
                srcW = viewport.width;
                srcH = viewport.height;

                URL.revokeObjectURL(fileUrl);
            } catch (e) {
                console.error("PDF Render Error", e);
            }
        } else if (file.type.startsWith('image/')) {
            try {
                imgBitmap = await createImageBitmap(file);
                imageCache.set(cacheKey, imgBitmap);
                srcW = imgBitmap.width;
                srcH = imgBitmap.height;
            } catch(e) {}
        }
    }

    if (!imgBitmap) {
        // Grey Box
        ctx.fillStyle = '#f1f5f9';
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

    // Center + Pan
    // PanX/PanY are expected to be in "Inches" or "Normalized"?
    // If we implement drag in pixels on the viewer, we need to convert those pixels to canvas scale here.
    // Let's assume panX/panY are stored in *inches* relative to the paper size, to be resolution independent.
    // In render logic: panPixels = panInches * pixelsPerInch (from renderPageCanvas scope, passed in? No)
    // We need pixelsPerInch here or pass normalized coords.

    // Actually, the simplest way for the interactive drag to work is if we store pan in *percentage* of the SHEET dimensions.
    // Let's say panX = 0.1 means shift right by 10% of sheet width.
    // Then drawX += targetW * 0.1.

    // Let's assume panX, panY are ratios of Target Dimension (0.0 - 1.0).

    drawX = targetX + (targetW - drawW) / 2 + (panX * targetW);
    drawY = targetY + (targetH - drawH) / 2 + (panY * targetH);

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


// Defined at top level so it's accessible
function setAllScaleMode(mode) {
    if (confirm(`Set all pages to ${mode}?`)) {
        pages.forEach(p => {
            p.settings.scaleMode = mode;
        });
        renderBookViewer();
    }
}

if (setAllFitBtn) setAllFitBtn.onclick = () => setAllScaleMode('fit');
if (setAllFillBtn) setAllFillBtn.onclick = () => setAllScaleMode('fill');
if (setAllStretchBtn) setAllStretchBtn.onclick = () => setAllScaleMode('stretch');

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


        // 5. Setup UI based on type
        // Always show booklet section now as it contains the new unified builder
        bookletUploadSection.classList.remove('hidden');

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
            if (p.sourceFileId === null) {
                 // Blank Page
                 bookletMetadata.push({
                    storagePath: null, // Signal blank to backend
                    sourcePageIndex: 0,
                    settings: p.settings,
                    type: 'interior_page' // Keep type as interior_page so it's processed in the interior loop
                 });
            } else {
                 bookletMetadata.push({
                    storagePath: uploadedPaths[p.sourceFileId],
                    sourcePageIndex: p.pageIndex - 1, // Convert to 0-based for backend
                    settings: p.settings,
                    type: 'interior_page'
                });
            }
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
