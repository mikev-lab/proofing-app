// js/imposition-ui.js
import { maximizeNUp, getSheetSizes, getPageSequenceForSheet } from './imposition-logic.js';
import { drawCropMarks, drawSlugInfo, drawSpineIndicator, drawSpineSlugText, drawPageNumber } from './imposition-drawing.js';
import { INCH_TO_POINTS } from './constants.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

// --- CONSTANTS ---
const IMPOSITION_TYPE_OPTIONS = [
    { value: 'stack', label: 'Stack' },
    { value: 'repeat', label: 'Repeat' },
    { value: 'booklet', label: 'Booklet' },
    { value: 'collateCut', label: 'Collate & Cut' }
];

// --- HELPERS ---
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
    await renderMainPreview(projectData);
    await renderSheetPreview(projectData);
}

async function renderMainPreview(projectData) {
    const canvas = document.getElementById('imposition-preview-canvas');
    const zoomLevelDisplay = document.getElementById('imposition-zoom-level-display');
    if (!canvas || !zoomLevelDisplay) return;

    const ctx = canvas.getContext('2d');
    const sheetConfig = sheetSizes.find(s => s.name === currentSettings.sheet);
    if (!sheetConfig) return;

    let sheetWidth = sheetConfig.longSideInches * INCH_TO_POINTS;
    let sheetHeight = sheetConfig.shortSideInches * INCH_TO_POINTS;
    if (currentSettings.sheetOrientation === 'portrait') {
        [sheetWidth, sheetHeight] = [sheetHeight, sheetWidth];
    }

    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    // Calculate the scale to fit the sheet within the canvas
    const fitScale = Math.min((canvas.width - 20) / sheetWidth, (canvas.height - 20) / sheetHeight);
    const totalScale = fitScale * zoomState.scale;

    // Clear canvas
    ctx.fillStyle = '#262626';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Center the view and apply transformations
    ctx.translate(canvas.width / 2 + zoomState.offsetX, canvas.height / 2 + zoomState.offsetY);
    ctx.scale(totalScale, totalScale);
    ctx.translate(-sheetWidth / 2, -sheetHeight / 2);

    await renderSheetOnCanvas(ctx, sheetWidth, sheetHeight, currentSheetIndex, currentViewSide, projectData);

    ctx.restore();

    zoomLevelDisplay.textContent = `${Math.round(zoomState.scale * 100)}%`;
}

async function renderSheetAndThumbnails(projectData) {
    if (!pdfDoc) return;

    totalSheets = calculateTotalSheets();
    await renderMainPreview(projectData);
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
            await renderSheetOnCanvas(ctx, sheetWidth, sheetHeight, i, side, projectData);
            ctx.restore();
        }
    }
}

async function renderSheetOnCanvas(ctx, sheetWidth, sheetHeight, sheetIndex, side, projectData) {
    // Slip sheet logic
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
        // Still draw QR code on blank back sides if needed
        if (currentSettings.showQRCode) {
            await drawSlugInfo(ctx, sheetIndex + 1, totalSheets, projectData, currentSettings.qrCodePosition);
        }
        return;
    };

    const bleedPoints = (currentSettings.bleedInches || 0) * INCH_TO_POINTS;
    const firstPageProxy = await pdfDoc.getPage(1);
    const pageViewport = firstPageProxy.getViewport({ scale: 1 });
    const { width: pageContentWidth, height: pageContentHeight } = pageViewport;

    const totalRequiredWidth = (pageContentWidth * currentSettings.columns) + (Math.max(0, currentSettings.columns - 1) * (currentSettings.horizontalGutterInches * INCH_TO_POINTS));
    const totalRequiredHeight = (pageContentHeight * currentSettings.rows) + (Math.max(0, currentSettings.rows - 1) * (currentSettings.verticalGutterInches * INCH_TO_POINTS));
    const startX = (sheetWidth - totalRequiredWidth) / 2;
    const startY = (sheetHeight - totalRequiredHeight) / 2;

    for (let row = 0; row < currentSettings.rows; row++) {
        for (let col = 0; col < currentSettings.columns; col++) {
            const slotIndex = row * currentSettings.columns + col;
            const pageNum = pagesOnThisSide[slotIndex];
            if (!pageNum) continue;

            const page = await pdfDoc.getPage(pageNum);
            const x = startX + col * (pageContentWidth + (currentSettings.horizontalGutterInches * INCH_TO_POINTS));
            const y = startY + row * (pageContentHeight + (currentSettings.verticalGutterInches * INCH_TO_POINTS));

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = pageContentWidth;
            tempCanvas.height = pageContentHeight;
            await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport: pageViewport }).promise;
            ctx.drawImage(tempCanvas, x, y);

            drawPageNumber(ctx, pageNum, x, y);

            drawCropMarks(ctx, x + bleedPoints, y + bleedPoints, pageContentWidth - (2 * bleedPoints), pageContentHeight - (2 * bleedPoints), {});
        }
    }
    // QR Code logic
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
        return Math.ceil(pdfDoc.numPages / 4);
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
export async function initializeImpositionUI({ projectData, db }) {
    const imposePdfButton = document.getElementById('impose-pdf-button');
    const impositionModal = document.getElementById('imposition-modal');
    const closeModalButton = document.getElementById('imposition-modal-close-button');
    const form = document.getElementById('imposition-form');
    const thumbnailList = document.getElementById('imposition-thumbnail-list');
    const sideSelectorContainer = document.getElementById('side-selector-container');
    const sideSelector = document.getElementById('side-selector');

    // Populate dropdowns first
    const impTypeSelect = document.getElementById('imposition-type');
    impTypeSelect.innerHTML = '';
    IMPOSITION_TYPE_OPTIONS.forEach(opt => impTypeSelect.add(new Option(opt.label, opt.value)));
    const sheetSelect = document.getElementById('sheet-size');

    // Fetch sheet sizes from Firestore
    sheetSizes = await getSheetSizes(db);
    sheetSelect.innerHTML = '';
    sheetSizes.forEach(s => sheetSelect.add(new Option(s.name, s.name)));

    async function handleFormChange() {
        const formData = new FormData(form);
        currentSettings = Object.fromEntries(formData.entries());
        Object.keys(currentSettings).forEach(key => {
            const el = form.elements[key];
            if (el.type === 'number') currentSettings[key] = parseFloat(el.value || 0);
            if (el.type === 'checkbox') currentSettings[key] = el.checked;
        });

        currentSheetIndex = 0;
        currentViewSide = 'front'; // Default to front view
        if (sideSelectorContainer) sideSelectorContainer.classList.add('hidden');


        await renderSheetAndThumbnails(projectData);
    }

    thumbnailList.addEventListener('click', (e) => {
        const item = e.target.closest('.thumbnail-item');
        if (!item || !item.dataset.sheet || !item.dataset.side) return;

        const newIndex = parseInt(item.dataset.sheet, 10);
        const newSide = item.dataset.side;

        if (newIndex === currentSheetIndex && newSide === currentViewSide) return;

        // Update highlighting
        const currentItem = thumbnailList.querySelector(`[data-sheet="${currentSheetIndex}"][data-side="${currentViewSide}"]`);
        if (currentItem) currentItem.classList.remove('border-indigo-400');
        item.classList.add('border-indigo-400');

        currentSheetIndex = newIndex;
        currentViewSide = newSide;
        renderMainPreview(projectData);
    });

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
            } else {
                initialSettings = { ...globalDefaults, ...maximizeNUp(width, height, sheetSizes) };
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
        renderMainPreview(projectData);
    }

    function resetZoom() {
        zoomState = { scale: 1.0, offsetX: 0, offsetY: 0, isDragging: false, startX: 0, startY: 0 };
        renderMainPreview(projectData);
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
            // Capture start position relative to the current pan offset
            zoomState.startX = e.clientX;
            zoomState.startY = e.clientY;
            canvas.style.cursor = 'grabbing';
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!zoomState.isDragging) return;

            const sheetConfig = sheetSizes.find(s => s.name === currentSettings.sheet);
            if (!sheetConfig) return;
            let sheetWidth = sheetConfig.longSideInches * INCH_TO_POINTS;
            let sheetHeight = sheetConfig.shortSideInches * INCH_TO_POINTS;
            if (currentSettings.sheetOrientation === 'portrait') { [sheetWidth, sheetHeight] = [sheetHeight, sheetWidth]; }
            // Adjust movement by the current zoom level
            const dx = e.clientX - zoomState.startX;
            const dy = e.clientY - zoomState.startY;

            zoomState.offsetX += dx;
            zoomState.offsetY += dy;

            // Update start position for next movement delta
            zoomState.startX = e.clientX;
            zoomState.startY = e.clientY;

            renderMainPreview(projectData);
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


    // Logic for the actual page vs the test harness
    if (imposePdfButton) { // We are in the main app
        const openModal = () => {
            impositionModal.classList.remove('hidden');
            loadDataAndRender().then(resetZoom); // Reset zoom when opening
        }
        imposePdfButton.addEventListener('click', openModal);
        if (closeModalButton) closeModalButton.addEventListener('click', () => impositionModal.classList.add('hidden'));
    } else { // We are in the test harness
        loadDataAndRender();
    }
}
