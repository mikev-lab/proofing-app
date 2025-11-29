// js/imposition-ui.js

import { maximizeNUp, getSheetSizes, getPageSequenceForSheet } from './imposition-logic.js';
import { drawCropMarks, drawSlugInfo, drawPageNumber } from './imposition-drawing.js';
import { INCH_TO_POINTS } from './constants.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js"; // NEW IMPORT

// --- STATE MANAGEMENT ---
let pdfDoc = null;
let currentSheetIndex = 0;
let totalSheets = 0;
let currentSettings = {};
let currentViewSide = 'front';
let sheetSizes = [];
let zoomState = {
    scale: 1.0,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
};
let animationFrameRequest = null;
let contentCanvas = document.createElement('canvas');

// --- CONSTANTS ---
const IMPOSITION_TYPE_OPTIONS = [
    { value: 'stack', label: 'Stack' },
    { value: 'repeat', label: 'Repeat' },
    { value: 'booklet', label: 'Booklet' },
    { value: 'collateCut', label: 'Collate & Cut' }
];

// --- HELPERS ---

function getTrimSizeInPoints(projectData) {
    const specs = projectData.specs;
    if (!specs || !specs.dimensions) {
        console.warn("No specs.dimensions found, defaulting to Letter.");
        return { width: 8.5 * INCH_TO_POINTS, height: 11 * INCH_TO_POINTS };
    }

    if (typeof specs.dimensions === 'object') {
        const w = specs.dimensions.width || 8.5;
        const h = specs.dimensions.height || 11;
        return { width: w * INCH_TO_POINTS, height: h * INCH_TO_POINTS };
    }

    const dimStr = String(specs.dimensions).toLowerCase();
    switch (dimStr) {
        case 'letter':
            return { width: 8.5 * INCH_TO_POINTS, height: 11 * INCH_TO_POINTS };
        case 'tabloid':
            return { width: 11 * INCH_TO_POINTS, height: 17 * INCH_TO_POINTS };
        default:
            console.warn(`Unknown dimension string: ${specs.dimensions}, defaulting to Letter.`);
            return { width: 8.5 * INCH_TO_POINTS, height: 11 * INCH_TO_POINTS };
    }
}

async function getPdfDoc(pdfUrl) {
    const { pdfjsLib } = window;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://mozilla.github.io/pdf.js/build/pdf.worker.mjs`;
    if (!pdfjsLib) return null;
    try {
        return await pdfjsLib.getDocument(pdfUrl).promise;
    } catch (error) {
        console.error('Error getting PDF doc:', error);
        return null;
    }
}

function populateForm(settings) {
    const form = document.getElementById('imposition-form');
    for (const key in settings) {
        const el = form.elements[key];
        if (el) {
            if (el.type === 'checkbox') el.checked = settings[key];
            else el.value = settings[key];
        }
    }
}

// --- CORE RENDERING ---
async function renderAllPreviews(projectData) {
    if (!pdfDoc) return;
    await renderContentCanvas(projectData);
    await renderThumbnailList(projectData);
}

function renderMainPreview(projectData) {
    const canvas = document.getElementById('imposition-preview-canvas');
    const zoomLevelDisplay = document.getElementById('imposition-zoom-level-display');
    
    if (!canvas || !zoomLevelDisplay || !contentCanvas.width) return;

    try {
        const ctx = canvas.getContext('2d');
        const sheetConfig = sheetSizes.find(s => s.name === currentSettings.sheet);
        if (!sheetConfig) return; 

        let sheetWidth = contentCanvas.width;
        let sheetHeight = contentCanvas.height;
       
        const parent = canvas.parentElement;

        if (canvas.width !== parent.clientWidth) {
            canvas.width = parent.clientWidth;
        }
        if (canvas.height !== parent.clientHeight) {
            canvas.height = parent.clientHeight;
        }

        const fitScale = Math.min((canvas.width - 20) / sheetWidth, (canvas.height - 20) / sheetHeight);
        const totalScale = fitScale * zoomState.scale;

        ctx.fillStyle = '#262626';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2 + zoomState.offsetX, canvas.height / 2 + zoomState.offsetY);
        ctx.scale(totalScale, totalScale);
        ctx.translate(-sheetWidth / 2, -sheetHeight / 2);

        ctx.drawImage(contentCanvas, 0, 0);

        ctx.restore();

        zoomLevelDisplay.textContent = `${Math.round(zoomState.scale * 100)}%`;

    } catch (err) {
        console.error("Error during fast render:", err);
    }
}

async function renderContentCanvas(projectData) {
    const sheetConfig = sheetSizes.find(s => s.name === currentSettings.sheet);
    if (!pdfDoc || !sheetConfig) return;

    let sheetWidth = sheetConfig.longSideInches * INCH_TO_POINTS;
    let sheetHeight = sheetConfig.shortSideInches * INCH_TO_POINTS;
    if (currentSettings.sheetOrientation === 'portrait') {
        [sheetWidth, sheetHeight] = [sheetHeight, sheetWidth];
    }

    contentCanvas.width = sheetWidth;
    contentCanvas.height = sheetHeight;

    const ctx = contentCanvas.getContext('2d');

    await renderSheetOnCanvas(ctx, sheetWidth, sheetHeight, currentSheetIndex, currentViewSide, projectData);

    requestRender(projectData);
}

function requestRender(projectData) {
    if (animationFrameRequest) {
        return;
    }
    animationFrameRequest = requestAnimationFrame(() => {
        renderMainPreview(projectData);
        animationFrameRequest = null;
    });
}


async function renderSheetAndThumbnails(projectData) {
    if (!pdfDoc) return;

    totalSheets = calculateTotalSheets();
    await renderContentCanvas(projectData);
    await renderThumbnailList(projectData);
}

async function renderThumbnailList(projectData) {
    const thumbnailList = document.getElementById('imposition-thumbnail-list');
    thumbnailList.innerHTML = '';
    const sides = currentSettings.isDuplex ? ['front', 'back'] : ['front'];

    for (let i = 0; i < totalSheets; i++) {
        for (const side of sides) {
            const sideLabel = side === 'front' ? 'f' : 'b';
            const thumbItem = document.createElement('div');
            thumbItem.className = 'thumbnail-item p-1 rounded-md border-2 border-transparent hover:border-indigo-400 cursor-pointer';

            if (i === currentSheetIndex && side === currentViewSide) {
                thumbItem.classList.add('border-indigo-400');
            }
            thumbItem.dataset.sheet = i;
            thumbItem.dataset.side = side;
            thumbItem.innerHTML = `
                <div class="bg-black/20 flex items-center justify-center rounded-sm overflow-hidden">
                        <canvas class="w-full h-full object-contain"></canvas>
                </div>
                <p class="text-center text-xs mt-1">Sheet ${i + 1}${sideLabel}</p>
            `;
            thumbnailList.appendChild(thumbItem);

            const canvas = thumbItem.querySelector('canvas');
            const sheetConfig = sheetSizes.find(s => s.name === currentSettings.sheet);
            if (!sheetConfig) continue;

            let sheetWidth = sheetConfig.longSideInches * INCH_TO_POINTS;
            let sheetHeight = sheetConfig.shortSideInches * INCH_TO_POINTS;
            if (currentSettings.sheetOrientation === 'portrait') { [sheetWidth, sheetHeight] = [sheetHeight, sheetWidth]; }

            const parentWidth = canvas.parentElement.clientWidth * 2;
            const scale = Math.min(parentWidth / sheetWidth, (parentWidth * (sheetHeight / sheetWidth)) / sheetHeight);
            canvas.width = sheetWidth * scale;
            canvas.height = sheetHeight * scale;

            const ctx = canvas.getContext('2d');
            ctx.save();
            ctx.scale(scale, scale);
            renderSheetOnCanvas(ctx, sheetWidth, sheetHeight, i, side, projectData).finally(() => {
                 ctx.restore();
            });
        }
    }
}

async function renderSheetOnCanvas(ctx, sheetWidth, sheetHeight, sheetIndex, side, projectData) {
    const slipSheetColor = currentSettings.slipSheetColor;
    if (slipSheetColor && slipSheetColor !== 'none' && sheetIndex === 0 && side === 'front') {
        ctx.fillStyle = slipSheetColor;
    } else {
        ctx.fillStyle = 'white';
    }
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);

    if (!pdfDoc || totalSheets === 0) return;

    const sequence = getPageSequenceForSheet(sheetIndex, pdfDoc.numPages, currentSettings);
    const pagesOnThisSide = sequence[side];
    if (!pagesOnThisSide || pagesOnThisSide.every(p => p === null)) {
        if (currentSettings.showQRCode) {
            await drawSlugInfo(ctx, sheetIndex + 1, totalSheets, projectData, currentSettings.qrCodePosition);
        }
        return;
    };

    const { width: trimWidth, height: trimHeight } = getTrimSizeInPoints(projectData);
    const bleedPoints = (currentSettings.bleedInches || 0) * INCH_TO_POINTS;
    const artBoxWidth = trimWidth + (2 * bleedPoints);
    const artBoxHeight = trimHeight + (2 * bleedPoints);

    const firstPageProxy = await pdfDoc.getPage(1);
    const pageViewport = firstPageProxy.getViewport({ scale: 1 });
    const { width: actualFileWidth, height: actualFileHeight } = pageViewport;

    const clipX = (actualFileWidth - artBoxWidth) / 2;
    const clipY = (actualFileHeight - artBoxHeight) / 2;

    const totalRequiredWidth = (artBoxWidth * currentSettings.columns) + (Math.max(0, currentSettings.columns - 1) * (currentSettings.horizontalGutterInches * INCH_TO_POINTS));
    const totalRequiredHeight = (artBoxHeight * currentSettings.rows) + (Math.max(0, currentSettings.rows - 1) * (currentSettings.verticalGutterInches * INCH_TO_POINTS));
    const startX = (sheetWidth - totalRequiredWidth) / 2;
    const startY = (sheetHeight - totalRequiredHeight) / 2;


    for (let row = 0; row < currentSettings.rows; row++) {
        for (let col = 0; col < currentSettings.columns; col++) {
            const slotIndex = row * currentSettings.columns + col;
            const pageNum = pagesOnThisSide[slotIndex];
            if (!pageNum) continue;

            const page = await pdfDoc.getPage(pageNum);
            
            const x = startX + col * (artBoxWidth + (currentSettings.horizontalGutterInches * INCH_TO_POINTS));
            const y = startY + row * (artBoxHeight + (currentSettings.verticalGutterInches * INCH_TO_POINTS));

            const specificViewport = page.getViewport({ scale: 1 });
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = specificViewport.width;
            tempCanvas.height = specificViewport.height;
            
            await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport: specificViewport }).promise;
            
            ctx.drawImage(tempCanvas, 
                clipX, clipY,                     
                artBoxWidth, artBoxHeight,        
                x, y,                             
                artBoxWidth, artBoxHeight         
            );

            drawPageNumber(ctx, pageNum, x, y);

            drawCropMarks(ctx, 
                x + bleedPoints,
                y + bleedPoints,
                trimWidth,
                trimHeight,
                {});
        }
    }
    if (currentSettings.showQRCode) {
        await drawSlugInfo(ctx, sheetIndex + 1, totalSheets, projectData, currentSettings.qrCodePosition);
    }
}


function calculateTotalSheets() {
    if (!pdfDoc) return 0;
    const { impositionType, columns, rows, isDuplex } = currentSettings;
    const slotsPerSheet = columns * rows;
    if (!slotsPerSheet) return 0;

    if (impositionType === 'booklet') {
        const roundedPages = Math.ceil(pdfDoc.numPages / 4) * 4;
        if (roundedPages === 0) return 0;
        return roundedPages / 4;
    }
    if (impositionType === 'repeat') {
        return isDuplex ? Math.ceil(pdfDoc.numPages / 2) : pdfDoc.numPages;
    }
     if (impositionType === 'collateCut') {
        const pagesPerLogicalStack = Math.ceil(pdfDoc.numPages / slotsPerSheet);
        return isDuplex ? Math.ceil(pagesPerLogicalStack / 2) : pagesPerLogicalStack;
    }
    const slots = isDuplex ? slotsPerSheet * 2 : slotsPerSheet;
    return Math.ceil(pdfDoc.numPages / slots);
}

// --- INITIALIZATION ---
// Updated to accept projectId
export async function initializeImpositionUI({ projectData, db, projectId }) {
    const imposePdfButton = document.getElementById('impose-pdf-button');
    const impositionModal = document.getElementById('imposition-modal');
    const closeModalButton = document.getElementById('imposition-modal-close-button');
    const generateButton = document.getElementById('imposition-generate-button'); // Get Generate Button
    const form = document.getElementById('imposition-form');
    const thumbnailList = document.getElementById('imposition-thumbnail-list');
    const sideSelectorContainer = document.getElementById('side-selector-container');

    // Populate dropdowns first
    const impTypeSelect = document.getElementById('imposition-type');
    impTypeSelect.innerHTML = '';
    IMPOSITION_TYPE_OPTIONS.forEach(opt => impTypeSelect.add(new Option(opt.label, opt.value)));
    const sheetSelect = document.getElementById('sheet-size');
    const includeCoverContainer = document.getElementById('include-cover-container');

    // Fetch sheet sizes
    try {
        sheetSizes = await getSheetSizes(db);
        sheetSelect.innerHTML = '';
        sheetSizes.forEach(s => sheetSelect.add(new Option(s.name, s.name)));
    } catch (e) {
        console.error("Could not load sheet sizes:", e);
        if (sheetSizes.length === 0) {
            sheetSizes = [{ name: "Letter (11x8.5)", longSideInches: 11, shortSideInches: 8.5 }];
            sheetSizes.forEach(s => sheetSelect.add(new Option(s.name, s.name)));
        }
    }


    async function handleFormChange() {
        const formData = new FormData(form);
        currentSettings = Object.fromEntries(formData.entries());
        Object.keys(currentSettings).forEach(key => {
            const el = form.elements[key];
            if (el.type === 'number') currentSettings[key] = parseFloat(el.value || 0);
            if (el.type === 'checkbox') currentSettings[key] = el.checked;
        });

        currentSheetIndex = 0;
        currentViewSide = 'front';
        if (sideSelectorContainer) sideSelectorContainer.classList.add('hidden');

        resetZoom(); 
        // Toggle 'Include Cover' visibility
        if (includeCoverContainer) {
            if (currentSettings.impositionType === 'booklet') {
                includeCoverContainer.classList.remove('hidden');
            } else {
                includeCoverContainer.classList.add('hidden');
            }
        }

        await renderSheetAndThumbnails(projectData); 
    }

    thumbnailList.addEventListener('click', async (e) => {
        const item = e.target.closest('.thumbnail-item');
        if (!item || !item.dataset.sheet || !item.dataset.side) return;

        const newIndex = parseInt(item.dataset.sheet, 10);
        const newSide = item.dataset.side;

        if (newIndex === currentSheetIndex && newSide === currentViewSide) return;

        const currentItem = thumbnailList.querySelector(`[data-sheet="${currentSheetIndex}"][data-side="${currentViewSide}"]`);
        if (currentItem) currentItem.classList.remove('border-indigo-400');
        item.classList.add('border-indigo-400');

        currentSheetIndex = newIndex;
        currentViewSide = newSide;
        await renderContentCanvas(projectData);
    });

    // --- Generate Button Listener (Background Mode) ---
    if (generateButton) {
        generateButton.addEventListener('click', () => { // Removed 'async' to not block
            if (!projectId) {
                alert("Error: Project ID not found.");
                return;
            }

            // 1. Prepare Payload
            const sheetConfig = sheetSizes.find(s => s.name === currentSettings.sheet);
            const settingsPayload = { ...currentSettings };
            if (sheetConfig) {
                settingsPayload.sheetLongSideInches = sheetConfig.longSideInches;
                settingsPayload.sheetShortSideInches = sheetConfig.shortSideInches;
            }

            // 2. Close Modal & Show Feedback Immediately
            impositionModal.classList.add('hidden');
            
            // Create "Processing" Toast
            const toastId = 'toast-' + Date.now();
            const processingToast = document.createElement('div');
            processingToast.id = toastId;
            processingToast.className = "fixed bottom-6 right-6 bg-slate-800 border border-slate-600 text-white px-6 py-4 rounded-lg shadow-2xl z-[100] flex items-center space-x-3 animate-pulse";
            processingToast.innerHTML = `
                <div class="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent border-blue-400"></div>
                <span>Generating Imposition... you can continue working.</span>
            `;
            document.body.appendChild(processingToast);

            // 3. Fire Request in Background
            const functions = getFunctions();
            const imposePdf = httpsCallable(functions, 'imposePdf', { timeout: 3600000 });

            imposePdf({
                projectId: projectId,
                settings: settingsPayload
            }).then((result) => {
                // 4. Handle Success
                document.getElementById(toastId)?.remove(); // Remove processing toast

                if (result.data.success) {
                    const successToast = document.createElement('div');
                    successToast.className = "fixed bottom-6 right-6 bg-slate-800 border border-green-500 text-white px-6 py-4 rounded-lg shadow-2xl z-[100]";
                    successToast.innerHTML = `
                        <div class="flex flex-col gap-2">
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                                <span class="font-semibold text-green-400">Imposition Ready!</span>
                            </div>
                            <a href="${result.data.url}" target="_blank" class="bg-green-600 hover:bg-green-500 text-white text-center py-2 px-4 rounded text-sm font-bold transition-colors">
                                Download PDF
                            </a>
                            <button onclick="this.parentElement.parentElement.remove()" class="text-xs text-gray-400 hover:text-white mt-1 text-right">Dismiss</button>
                        </div>
                    `;
                    document.body.appendChild(successToast);
                    
                    // Auto-dismiss after 30 seconds
                    setTimeout(() => { if(successToast.parentElement) successToast.remove() }, 30000);
                }
            }).catch((error) => {
                // 5. Handle Error
                document.getElementById(toastId)?.remove();
                console.error("Imposition error:", error);
                
                const errorToast = document.createElement('div');
                errorToast.className = "fixed bottom-6 right-6 bg-slate-800 border border-red-500 text-white px-6 py-4 rounded-lg shadow-2xl z-[100]";
                errorToast.innerHTML = `
                    <div class="flex items-center gap-2 mb-1">
                         <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                         <span class="font-semibold text-red-400">Imposition Failed</span>
                    </div>
                    <p class="text-sm text-gray-300">${error.message}</p>
                    <button onclick="this.parentElement.remove()" class="text-xs text-gray-500 hover:text-white mt-2 w-full text-right">Close</button>
                `;
                document.body.appendChild(errorToast);
            });
        });
    }

    async function loadDataAndRender() {
        if (!projectData.versions || projectData.versions.length === 0) {
            if (imposePdfButton) imposePdfButton.style.display = 'none';
            return;
        }
        if (imposePdfButton) imposePdfButton.style.display = 'inline-block';

        const latestVersion = projectData.versions.slice().sort((a, b) => b.version - a.version)[0];
        pdfDoc = await getPdfDoc(latestVersion.previewURL || latestVersion.fileURL);
        if (!pdfDoc) return;

        let globalDefaults = {};
        let ruleSettings = null;
        try {
            const globalSettingsSnap = await getDoc(doc(db, 'settings', 'globalImpositionDefaults'));
            if (globalSettingsSnap.exists()) {
                globalDefaults = globalSettingsSnap.data();
            }
            const projectDocSizeName = typeof projectData.specs?.dimensions === 'string' ? projectData.specs.dimensions : null;
            if (projectDocSizeName) {
                const q = query(collection(db, 'impositionDefaults'), where("docSize", "==", projectDocSizeName));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) ruleSettings = querySnapshot.docs[0].data();
            }
        } catch (error) {
            console.warn("Could not fetch settings from Firestore for test environment, using defaults.", error);
        }

        let initialSettings = projectData.impositions?.slice().sort((a,b) => b.createdAt - a.createdAt)[0]?.settings;
        if (!initialSettings) {
             const firstPage = await pdfDoc.getPage(1);
             const { width, height } = firstPage.getViewport({scale: 1});
            if (ruleSettings) {
                initialSettings = { ...globalDefaults, ...ruleSettings, sheet: ruleSettings.pressSheet, impositionType: 'stack' };
            } else if (sheetSizes.length > 0) { 
                initialSettings = { ...globalDefaults, ...maximizeNUp(width, height, sheetSizes) };
            } else {
                initialSettings = { ...globalDefaults, sheet: sheetSizes[0].name, impositionType: 'stack', rows: 1, columns: 1 };
            }
        }

        if (initialSettings) {
            populateForm(initialSettings);
        }
        await handleFormChange();
    }

    form.addEventListener('change', handleFormChange);

    // --- Zoom & Pan Logic ---
    const canvas = document.getElementById('imposition-preview-canvas');
    const zoomInButton = document.getElementById('imposition-zoom-in-button');
    const zoomOutButton = document.getElementById('imposition-zoom-out-button');
    const zoomResetButton = document.getElementById('imposition-zoom-reset-button');

    function zoom(factor) {
        zoomState.scale = Math.max(0.5, Math.min(zoomState.scale * factor, 5));
        requestRender(projectData); 
    }

    function resetZoom() {
        zoomState = { scale: 1.0, offsetX: 0, offsetY: 0, isDragging: false, startX: 0, startY: 0 };
        requestRender(projectData);
    }

    if (zoomInButton) zoomInButton.addEventListener('click', () => zoom(1.25));
    if (zoomOutButton) zoomOutButton.addEventListener('click', () => zoom(0.8));
    if (zoomResetButton) zoomResetButton.addEventListener('click', resetZoom);

    if (canvas) {
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.95 : 1.05;
            zoom(factor);
        });

        canvas.addEventListener('mousedown', (e) => {
            zoomState.isDragging = true;
            zoomState.startX = e.clientX;
            zoomState.startY = e.clientY;
            canvas.style.cursor = 'grabbing';
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!zoomState.isDragging) return;
            const sheetConfig = sheetSizes.find(s => s.name === currentSettings.sheet);
            if (!sheetConfig) return;
            
            const dx = e.clientX - zoomState.startX;
            const dy = e.clientY - zoomState.startY;

            zoomState.offsetX += dx;
            zoomState.offsetY += dy;

            zoomState.startX = e.clientX;
            zoomState.startY = e.clientY;

            requestRender(projectData);
        });

        canvas.addEventListener('mouseup', () => {
            zoomState.isDragging = false;
            canvas.style.cursor = 'grab';
        });

        canvas.addEventListener('mouseleave', () => {
            zoomState.isDragging = false;
            canvas.style.cursor = 'grab';
        });
    }

    if (imposePdfButton) {
        const openModal = () => {
            impositionModal.classList.remove('hidden');
            loadDataAndRender();
        }
        imposePdfButton.addEventListener('click', openModal);
        if (closeModalButton) closeModalButton.addEventListener('click', () => impositionModal.classList.add('hidden'));
    } else {
        loadDataAndRender();
    }
}