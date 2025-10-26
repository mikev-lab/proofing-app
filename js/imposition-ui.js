// js/imposition-ui.js
import { maximizeNUp, SHEET_SIZES, getPageSequenceForSheet } from './imposition-logic.js';
import { drawCropMarks, drawSlugInfo, drawSpineIndicator, drawSpineSlugText } from './imposition-drawing.js';
import { INCH_TO_POINTS } from './constants.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- STATE MANAGEMENT ---
let pdfDoc = null;
let currentSheetIndex = 0;
let totalSheets = 0;
let currentSettings = {};
let currentViewSide = 'front';

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
    if (!canvas) return; // Guard for test harness
    const ctx = canvas.getContext('2d');
    const sheetConfig = SHEET_SIZES.find(s => s.name === currentSettings.sheet);
    if (!sheetConfig) return;
    let sheetWidth = sheetConfig.longSideInches * INCH_TO_POINTS;
    let sheetHeight = sheetConfig.shortSideInches * INCH_TO_POINTS;
    if (currentSettings.sheetOrientation === 'portrait') { [sheetWidth, sheetHeight] = [sheetHeight, sheetWidth]; }

    const scale = Math.min((canvas.parentElement.clientWidth - 20) / sheetWidth, (canvas.parentElement.clientHeight - 20) / sheetHeight);
    canvas.width = sheetWidth * scale;
    canvas.height = sheetHeight * scale;
    ctx.save();
    ctx.scale(scale, scale);
    await renderSheetOnCanvas(ctx, sheetWidth, sheetHeight, 0, currentViewSide, projectData);
    ctx.restore();
}

async function renderSheetPreview(projectData) {
    if (!pdfDoc) return;
    const canvas = document.getElementById('imposition-sheet-preview-canvas');
    const container = document.getElementById('imposition-sheet-preview-container');
    const navDisplay = document.getElementById('sheet-nav-display');
    const ctx = canvas.getContext('2d');

    totalSheets = calculateTotalSheets();
    navDisplay.textContent = `Sheet ${currentSheetIndex + 1} of ${Math.max(1, totalSheets)}`;

    const sheetConfig = SHEET_SIZES.find(s => s.name === currentSettings.sheet);
    if (!sheetConfig) return;
    let sheetWidth = sheetConfig.longSideInches * INCH_TO_POINTS;
    let sheetHeight = sheetConfig.shortSideInches * INCH_TO_POINTS;
    if (currentSettings.sheetOrientation === 'portrait') { [sheetWidth, sheetHeight] = [sheetHeight, sheetWidth]; }

    const scale = Math.min(container.clientWidth / sheetWidth, container.clientHeight / sheetHeight);
    canvas.width = sheetWidth * scale;
    canvas.height = sheetHeight * scale;

    ctx.save();
    ctx.scale(scale, scale);
    await renderSheetOnCanvas(ctx, sheetWidth, sheetHeight, currentSheetIndex, currentViewSide, projectData);
    ctx.restore();
}

async function renderSheetOnCanvas(ctx, sheetWidth, sheetHeight, sheetIndex, side, projectData) {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);
    if (!pdfDoc || totalSheets === 0) return;

    const sequence = getPageSequenceForSheet(sheetIndex, pdfDoc.numPages, currentSettings);
    const pagesOnThisSide = sequence[side];
    if (!pagesOnThisSide || pagesOnThisSide.every(p => p === null)) return;

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

            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`P${pageNum}`, x + pageContentWidth / 2, y + pageContentHeight / 2);
            ctx.restore();

            drawCropMarks(ctx, x + bleedPoints, y + bleedPoints, pageContentWidth - (2 * bleedPoints), pageContentHeight - (2 * bleedPoints), {});
        }
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
    const prevSheetBtn = document.getElementById('prev-sheet-button');
    const nextSheetBtn = document.getElementById('next-sheet-button');
    const sideSelectorContainer = document.getElementById('side-selector-container');
    const sideSelector = document.getElementById('side-selector');

    // Populate dropdowns first
    const impTypeSelect = document.getElementById('imposition-type');
    impTypeSelect.innerHTML = '';
    IMPOSITION_TYPE_OPTIONS.forEach(opt => impTypeSelect.add(new Option(opt.label, opt.value)));
    const sheetSelect = document.getElementById('sheet-size');
    sheetSelect.innerHTML = '';
    SHEET_SIZES.forEach(s => sheetSelect.add(new Option(s.name, s.name)));

    async function handleFormChange() {
        const formData = new FormData(form);
        currentSettings = Object.fromEntries(formData.entries());
        Object.keys(currentSettings).forEach(key => {
            const el = form.elements[key];
            if (el.type === 'number') currentSettings[key] = parseFloat(el.value || 0);
            if (el.type === 'checkbox') currentSettings[key] = el.checked;
        });

        currentSheetIndex = 0;
        currentViewSide = sideSelector.value;
        sideSelectorContainer.classList.toggle('hidden', !currentSettings.isDuplex);

        await renderAllPreviews(projectData);
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

        const globalSettingsSnap = await getDoc(doc(db, 'settings', 'globalImpositionDefaults'));
        const globalDefaults = globalSettingsSnap.exists() ? globalSettingsSnap.data() : {};
        const projectDocSizeName = typeof projectData.specs?.dimensions === 'string' ? projectData.specs.dimensions : null;
        let ruleSettings = null;
        if (projectDocSizeName) {
            const q = query(collection(db, 'impositionDefaults'), where("docSize", "==", projectDocSizeName));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) ruleSettings = querySnapshot.docs[0].data();
        }

        let initialSettings = projectData.impositions?.slice().sort((a,b) => b.createdAt - a.createdAt)[0]?.settings;
        if (!initialSettings) {
             const firstPage = await pdfDoc.getPage(1);
             const { width, height } = firstPage.getViewport({scale: 1});
            if (ruleSettings) {
                initialSettings = { ...globalDefaults, ...ruleSettings, sheet: ruleSettings.pressSheet, impositionType: 'stack' };
            } else {
                initialSettings = { ...globalDefaults, ...maximizeNUp(width, height) };
            }
        }

        if (initialSettings) {
            populateForm(initialSettings);
        }
        await handleFormChange();
    }

    form.addEventListener('change', handleFormChange);
    prevSheetBtn.addEventListener('click', () => {
        if (currentSheetIndex > 0) {
            currentSheetIndex--;
            renderSheetPreview(projectData);
        }
    });
    nextSheetBtn.addEventListener('click', () => {
        if (currentSheetIndex < totalSheets - 1) {
            currentSheetIndex++;
            renderSheetPreview(projectData);
        }
    });

    // Logic for the actual page vs the test harness
    if (imposePdfButton) { // We are in the main app
        const openModal = () => {
            impositionModal.classList.remove('hidden');
            loadDataAndRender();
        }
        imposePdfButton.addEventListener('click', openModal);
        if (closeModalButton) closeModalButton.addEventListener('click', () => impositionModal.classList.add('hidden'));
    } else { // We are in the test harness
        loadDataAndRender();
    }
}
