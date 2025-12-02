// js/imposition-ui.js

import { maximizeNUp, getSheetSizes, getPageSequenceForSheet } from './imposition-logic.js';
import { drawCropMarks, drawSlugInfo, drawPageNumber, drawSpineIndicator, drawSpineSlugText } from './imposition-drawing.js';
import { INCH_TO_POINTS } from './constants.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js"; 

// ... (State variables) ...
let realInteriorPdfDoc = null; // Storing the actual interior doc
let realCoverPdfDoc = null; // Storing the actual cover doc
let interiorPdfDoc = null; // The one currently used for preview (could be cover if source=cover)
let coverPdfDoc = null; // The cover doc for booklet merge
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

// ... (Constants) ...
const IMPOSITION_TYPE_OPTIONS = [
    { value: 'stack', label: 'Stack' },
    { value: 'repeat', label: 'Repeat' },
    { value: 'booklet', label: 'Booklet' },
    { value: 'collateCut', label: 'Collate & Cut' }
];

const PAPER_CALIPERS = {
    "60lb Text": 0.0032,
    "70lb Text": 0.0038,
    "80lb Text": 0.0045,
    "100lb Text": 0.0055,
    "80lb Gloss Text": 0.0035,
    "100lb Gloss Text": 0.0045,
    "80lb Matte Text": 0.0042,
    "100lb Matte Text": 0.0052,
    "100lb Gloss Cover": 0.0095,
    "12pt C1S": 0.0120,
    "14pt C1S": 0.0140,
    "Coated": 0.004,
    "Uncoated": 0.0045
};

// ... (Helpers) ...
function getTrimSizeInPoints(projectData) {
    const specs = projectData.specs;
    if (!specs || !specs.dimensions) {
        return { width: 8.5 * INCH_TO_POINTS, height: 11 * INCH_TO_POINTS };
    }
    if (typeof specs.dimensions === 'object') {
        const w = specs.dimensions.width || 8.5;
        const h = specs.dimensions.height || 11;
        return { width: w * INCH_TO_POINTS, height: h * INCH_TO_POINTS };
    }
    const dimStr = String(specs.dimensions).toLowerCase();
    switch (dimStr) {
        case 'letter': return { width: 8.5 * INCH_TO_POINTS, height: 11 * INCH_TO_POINTS };
        case 'tabloid': return { width: 11 * INCH_TO_POINTS, height: 17 * INCH_TO_POINTS };
        default: return { width: 8.5 * INCH_TO_POINTS, height: 11 * INCH_TO_POINTS };
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

function calculateSuggestedCreep(projectData) {
    if (!interiorPdfDoc) return 0;
    let pageCount = interiorPdfDoc.numPages;
    const sheets = Math.ceil(pageCount / 4);
    if (sheets <= 1) return 0;
    const paperName = projectData.specs?.paperType || "";
    const paperWeight = projectData.specs?.paperWeight || ""; 
    let caliper = 0.004; 
    if (PAPER_CALIPERS[paperWeight]) {
        caliper = PAPER_CALIPERS[paperWeight];
    } else if (PAPER_CALIPERS[paperName]) {
        caliper = PAPER_CALIPERS[paperName];
    } else {
        const searchStr = (paperWeight + " " + paperName).toLowerCase();
        if (searchStr.includes("gloss")) caliper = 0.0035;
        else if (searchStr.includes("matte")) caliper = 0.0042;
        else if (searchStr.includes("cover")) caliper = 0.0095;
    }
    const totalCreep = (sheets - 1) * caliper;
    return parseFloat(totalCreep.toFixed(4));
}

// ... (Rendering logic) ...
async function renderAllPreviews(projectData) {
    if (!interiorPdfDoc) return;
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
        if (canvas.width !== parent.clientWidth) canvas.width = parent.clientWidth;
        if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight;
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
    if (!interiorPdfDoc || !sheetConfig) return;
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
    if (animationFrameRequest) return;
    animationFrameRequest = requestAnimationFrame(() => {
        renderMainPreview(projectData);
        animationFrameRequest = null;
    });
}

async function renderSheetAndThumbnails(projectData) {
    if (!interiorPdfDoc) return;
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
            renderSheetOnCanvas(ctx, sheetWidth, sheetHeight, i, side, projectData).finally(() => { ctx.restore(); });
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

    if (!interiorPdfDoc || totalSheets === 0) return;

    const totalInteriorPages = interiorPdfDoc.numPages;
    const isBooklet = currentSettings.impositionType === 'booklet';
    const hasCover = !!coverPdfDoc && currentSettings.includeCover && isBooklet;
    const coverPageCount = hasCover ? 4 : 0;
    const virtualTotalPages = totalInteriorPages + coverPageCount;

    let isSpreadCover = false;
    if (hasCover && coverPdfDoc.numPages === 2) {
        const intPage = await interiorPdfDoc.getPage(1);
        const covPage = await coverPdfDoc.getPage(1);
        if (covPage.view[2] > intPage.view[2] * 1.5) {
            isSpreadCover = true;
        }
    }

    const sequence = getPageSequenceForSheet(sheetIndex, virtualTotalPages, currentSettings);
    const pagesOnThisSide = sequence[side];

    if (!pagesOnThisSide || pagesOnThisSide.every(p => p === null)) {
        if (currentSettings.showQRCode) {
            await drawSlugInfo(ctx, sheetIndex + 1, totalSheets, projectData, currentSettings.qrCodePosition);
        }
        return;
    };

    let trimWidth, trimHeight;
    let bleedPoints = (currentSettings.bleedInches || 0) * INCH_TO_POINTS;

    // [FIX] If imposing cover directly, use the PDF dimensions as the trim size
    // ensuring the centering logic uses the full wrap width.
    if (currentSettings.source === 'cover' && interiorPdfDoc) {
        const page = await interiorPdfDoc.getPage(1);
        const view = page.getViewport({ scale: 1 });
        trimWidth = view.width;
        trimHeight = view.height;
        // If the file is already a wrap, we typically assume it includes bleed or is the net format.
        // For centering, we treat the file as the 'art box'.
        // We set bleed to 0 effectively for the grid calculation to avoid double-adding.
        bleedPoints = 0;
    } else {
        const dims = getTrimSizeInPoints(projectData);
        trimWidth = dims.width;
        trimHeight = dims.height;
    }

    const artBoxWidth = trimWidth + (2 * bleedPoints);
    const artBoxHeight = trimHeight + (2 * bleedPoints);

    const gridCols = isBooklet ? 2 : currentSettings.columns;
    const gridRows = currentSettings.rows;

    const colStepX = isBooklet 
        ? trimWidth + (currentSettings.horizontalGutterInches * INCH_TO_POINTS) 
        : artBoxWidth + (currentSettings.horizontalGutterInches * INCH_TO_POINTS);

    const rowStepY = artBoxHeight + (currentSettings.verticalGutterInches * INCH_TO_POINTS);

    let startX;
    if (isBooklet) {
        const totalTrimWidth = (trimWidth * gridCols) + (Math.max(0, gridCols - 1) * (currentSettings.horizontalGutterInches * INCH_TO_POINTS));
        startX = (sheetWidth - totalTrimWidth) / 2;
    } else {
        const totalContentWidth = (artBoxWidth * gridCols) + (Math.max(0, gridCols - 1) * (currentSettings.horizontalGutterInches * INCH_TO_POINTS));
        startX = (sheetWidth - totalContentWidth) / 2;
    }

    const totalRequiredHeight = (artBoxHeight * gridRows) + (Math.max(0, gridRows - 1) * (currentSettings.verticalGutterInches * INCH_TO_POINTS));
    const startY = (sheetHeight - totalRequiredHeight) / 2;

    // --- PASS 1: MARKS (Layer 1) ---
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            // nominalX = Fixed Spine Location
            let nominalX;
            if (isBooklet) {
                nominalX = startX + col * colStepX;
            } else {
                nominalX = startX + (col * colStepX) + bleedPoints;
            }

            const y = startY + row * rowStepY;

            let contentX = nominalX;
            let shiftAmount = 0;
            
            if (isBooklet && currentSettings.creepInches) {
                const isCenterSheet = (sheetIndex === totalSheets - 1);
                if (currentSettings.preserveCenterSpread && isCenterSheet) {
                } else {
                    const safeTotalSheets = Math.max(1, totalSheets - 1);
                    const creepStep = (currentSettings.creepInches * INCH_TO_POINTS) / safeTotalSheets;
                    shiftAmount = sheetIndex * creepStep;
                    const isLeftPage = (col === 0);
                    contentX += isLeftPage ? shiftAmount : -shiftAmount; 
                }
            }

            let finalCropX = isBooklet ? contentX : nominalX;

            let hasLeft = false;
            let hasRight = false;
            let hasTop = false;
            let hasBottom = false;

            if (isBooklet) {
                hasLeft = (col === 1); 
                hasRight = (col === 0);
            }

            drawCropMarks(ctx, 
                finalCropX,
                y + bleedPoints,
                trimWidth,
                trimHeight,
                {
                    hasTopNeighbor: hasTop, hasBottomNeighbor: hasBottom,
                    hasLeftNeighbor: hasLeft, hasRightNeighbor: hasRight
                });

            if (isBooklet) {
                const isSpineOnLeft = (col !== 0); 
                drawSpineIndicator(ctx, 
                    finalCropX, 
                    y + bleedPoints, 
                    trimWidth, 
                    trimHeight, 
                    isSpineOnLeft
                );

                if (Math.abs(shiftAmount) > 0.5) { 
                     drawSpineSlugText(ctx, finalCropX, y + bleedPoints, trimWidth, trimHeight, isSpineOnLeft, side==='front', bleedPoints);
                }

                // Fixed Spine Mark at nominalX
                if (col === 1) { // Draw once per spread
                    ctx.save();
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 0.5;
                    const offset = 9; 
                    const length = 18;
                    // Top
                    ctx.beginPath();
                    ctx.moveTo(nominalX, y + bleedPoints + trimHeight + offset);
                    ctx.lineTo(nominalX, y + bleedPoints + trimHeight + offset + length);
                    ctx.stroke();
                    // Bottom
                    ctx.beginPath();
                    ctx.moveTo(nominalX, y + bleedPoints - offset);
                    ctx.lineTo(nominalX, y + bleedPoints - offset - length);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
    }

    // --- PASS 2: CONTENT (Layer 2) ---
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const slotIndex = row * gridCols + col;
            const virtualPageNum = pagesOnThisSide[slotIndex];

            // Re-calculate positions for content placement
            // nominalX = Fixed Spine Location
            let nominalX;
            if (isBooklet) {
                nominalX = startX + col * colStepX;
            } else {
                nominalX = startX + (col * colStepX) + bleedPoints;
            }

            const y = startY + row * rowStepY;

            let contentX = nominalX;
            let shiftAmount = 0;

            if (isBooklet && currentSettings.creepInches) {
                const isCenterSheet = (sheetIndex === totalSheets - 1);
                if (currentSettings.preserveCenterSpread && isCenterSheet) {
                } else {
                    const safeTotalSheets = Math.max(1, totalSheets - 1);
                    const creepStep = (currentSettings.creepInches * INCH_TO_POINTS) / safeTotalSheets;
                    shiftAmount = sheetIndex * creepStep;
                    const isLeftPage = (col === 0);
                    contentX += isLeftPage ? shiftAmount : -shiftAmount;
                }
            }

            if (!virtualPageNum) continue;

            let pdfToUse = interiorPdfDoc;
            let actualPageNum = virtualPageNum;
            let spreadShiftMode = 'none'; 

            // If we are imposing the cover as content (Source=Interior, Include Cover=True), handle logic.
            // If Source=Cover, interiorPdfDoc IS the cover doc, so we don't need special 'hasCover' logic in that sense,
            // UNLESS the user is trying to "Include Cover" on a Cover imposition (which we should prevent).
            // But here, 'hasCover' is derived from `currentSettings.includeCover` and `coverPdfDoc`.
            // We need to ensure that if source='cover', we treat it as simple pages.
            // However, the `virtualPageNum` mapping happens in `calculateTotalSheets` and `getPageSequenceForSheet`.
            // If `source` is 'cover', `getPageSequenceForSheet` likely just returns 1..N.
            // So we need to be careful with this block.

            if (currentSettings.source === 'cover') {
                 // Simple mapping: virtualPageNum IS the page num
                 pdfToUse = interiorPdfDoc; // This is the cover doc
                 actualPageNum = virtualPageNum;
            } else if (hasCover) {
                if (virtualPageNum === 1) { 
                    pdfToUse = coverPdfDoc; actualPageNum = 1; if(isSpreadCover) spreadShiftMode = 'rightHalf'; 
                } else if (virtualPageNum === 2) { 
                    pdfToUse = coverPdfDoc; actualPageNum = 2; if(isSpreadCover) spreadShiftMode = 'leftHalf'; 
                } else if (virtualPageNum === virtualTotalPages - 1) { 
                    pdfToUse = coverPdfDoc; actualPageNum = isSpreadCover ? 2 : (coverPdfDoc.numPages > 2 ? 3 : 2); if(isSpreadCover) spreadShiftMode = 'rightHalf'; 
                } else if (virtualPageNum === virtualTotalPages) { 
                    pdfToUse = coverPdfDoc; actualPageNum = isSpreadCover ? 1 : (coverPdfDoc.numPages >= 4 ? 4 : 1); if(isSpreadCover) spreadShiftMode = 'leftHalf'; 
                } else { actualPageNum = virtualPageNum - 2; }
            }

            if (actualPageNum > pdfToUse.numPages || actualPageNum < 1) continue;

            const page = await pdfToUse.getPage(actualPageNum);
            const viewport = page.getViewport({ scale: 1 });
            
            ctx.save();

            // MASKING
            if (isBooklet) {
                ctx.beginPath();
                if (col === 0) {
                    // Left Page: Clip Right Edge/Spine
                    const clipX = contentX - bleedPoints;
                    const clipW = (nominalX + trimWidth) - clipX;
                    ctx.rect(clipX, y, clipW, artBoxHeight);
                } else {
                    // Right Page: Clip Left Edge/Spine
                    const clipX = nominalX;
                    const clipW = (contentX + trimWidth + bleedPoints) - clipX;
                    ctx.rect(clipX, y, clipW, artBoxHeight);
                }
                ctx.clip();
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport }).promise;

            let drawX = contentX - bleedPoints;
            let drawY = y; 
            let drawW = viewport.width;
            let drawH = viewport.height;

            if (isSpreadCover && pdfToUse === coverPdfDoc && currentSettings.source !== 'cover') {
                const scaleFactor = artBoxHeight / viewport.height;
                drawW = viewport.width * scaleFactor;
                drawH = viewport.height * scaleFactor;
                drawY = y; 

                // [FIX] Swapped logic for [Back | Spine | Front] layout
                // Right Slot (Front) -> Needs Right half of image. Shift image Left.
                // Left Slot (Back) -> Needs Left half of image. Draw at origin.

                if (spreadShiftMode === 'rightHalf') {
                    // Page 1 (Front) -> Right Slot
                    // DrawX = contentX - (LeftHalfWidth). LeftHalf is Back+Spine (~DrawW/2).
                    drawX = contentX - (drawW / 2);
                } else if (spreadShiftMode === 'leftHalf') {
                    // Page N (Back) -> Left Slot
                    // DrawX = contentX. We want Left edge of image at Left edge of Slot.
                    // But wait, the slot width is Trim. Image is 2xTrim.
                    // If we draw at contentX, we see Back. Correct.
                    drawX = contentX;
                }
            }

            ctx.drawImage(tempCanvas, drawX, drawY, drawW, drawH);
            ctx.restore(); 

            drawPageNumber(ctx, virtualPageNum, contentX + 5, y + bleedPoints + 5);
        }
    }
    if (currentSettings.showQRCode) {
        await drawSlugInfo(ctx, sheetIndex + 1, totalSheets, projectData, currentSettings.qrCodePosition);
    }
}

// ... (Rest of file unchanged) ...
function calculateTotalSheets() {
    if (!interiorPdfDoc) return 0;
    const { impositionType, columns, rows, isDuplex, includeCover } = currentSettings;
    const effectiveCols = impositionType === 'booklet' ? 2 : columns;
    const slotsPerSheet = effectiveCols * rows;
    if (!slotsPerSheet) return 0;
    let processingPages = interiorPdfDoc.numPages;
    if (coverPdfDoc && includeCover && impositionType === 'booklet') {
        processingPages += 4; 
    }
    if (impositionType === 'booklet') {
        const roundedPages = Math.ceil(processingPages / 4) * 4;
        if (roundedPages === 0) return 0;
        return roundedPages / 4;
    }
    if (impositionType === 'repeat') return isDuplex ? Math.ceil(processingPages / 2) : processingPages;
    if (impositionType === 'collateCut') {
        const pagesPerLogicalStack = Math.ceil(processingPages / slotsPerSheet);
        return isDuplex ? Math.ceil(pagesPerLogicalStack / 2) : pagesPerLogicalStack;
    }
    const slots = isDuplex ? slotsPerSheet * 2 : slotsPerSheet;
    return Math.ceil(processingPages / slots);
}

// ... (initializeImpositionUI same as before)
export async function initializeImpositionUI({ projectData, db, projectId }) {
    const imposePdfButton = document.getElementById('impose-pdf-button');
    const impositionModal = document.getElementById('imposition-modal');
    const closeModalButton = document.getElementById('imposition-modal-close-button');
    const generateButton = document.getElementById('imposition-generate-button');
    const form = document.getElementById('imposition-form');
    const thumbnailList = document.getElementById('imposition-thumbnail-list');
    const sideSelectorContainer = document.getElementById('side-selector-container');

    const impTypeSelect = document.getElementById('imposition-type');
    impTypeSelect.innerHTML = '';
    IMPOSITION_TYPE_OPTIONS.forEach(opt => impTypeSelect.add(new Option(opt.label, opt.value)));
    const sheetSelect = document.getElementById('sheet-size');

    try {
        sheetSizes = await getSheetSizes(db);
        sheetSelect.innerHTML = '';
        sheetSizes.forEach(s => sheetSelect.add(new Option(s.name, s.name)));
    } catch (e) {
        if (sheetSizes.length === 0) {
            sheetSizes = [{ name: "Letter (11x8.5)", longSideInches: 11, shortSideInches: 8.5 }];
            sheetSizes.forEach(s => sheetSelect.add(new Option(s.name, s.name)));
        }
    }

    if (!document.getElementById('creep-control-group')) {
        const creepGroup = document.createElement('div');
        creepGroup.id = 'creep-control-group';
        creepGroup.className = "mb-4 hidden space-y-3"; 
        
        creepGroup.innerHTML = `
            <div>
                <label for="creepInches" class="block text-sm font-medium text-gray-300">Total Creep (in)</label>
                <div class="flex space-x-2">
                    <input type="number" name="creepInches" id="creepInches" step="0.001" value="0" class="mt-1 block w-full rounded-lg border-0 bg-white/5 py-2 px-3 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-indigo-500">
                    <button type="button" id="auto-calc-creep-btn" class="mt-1 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded text-xs font-semibold whitespace-nowrap">Auto</button>
                </div>
            </div>
            <div class="flex items-center">
                <input id="preserveCenterSpread" name="preserveCenterSpread" type="checkbox" class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-600">
                <label for="preserveCenterSpread" class="ml-2 block text-sm text-gray-300">Preserve Center Spread</label>
            </div>
            <p class="text-xs text-gray-500">Center spread will have 0 shift if checked.</p>
        `;
        
        const coverContainer = document.getElementById('include-cover-container');
        if (coverContainer && coverContainer.parentNode) {
            coverContainer.parentNode.insertBefore(creepGroup, coverContainer.nextSibling);
        } else {
            const settingsPanel = document.getElementById('imposition-settings-panel')?.querySelector('form');
            if(settingsPanel) settingsPanel.appendChild(creepGroup);
        }

        const autoCalcBtn = document.getElementById('auto-calc-creep-btn');
        if (autoCalcBtn) {
            autoCalcBtn.addEventListener('click', () => {
                const suggestion = calculateSuggestedCreep(projectData);
                document.getElementById('creepInches').value = suggestion;
                const event = new Event('change');
                document.getElementById('imposition-form').dispatchEvent(event);
            });
        }
    }

    async function handleFormChange() {
        const formData = new FormData(form);
        currentSettings = Object.fromEntries(formData.entries());
        Object.keys(currentSettings).forEach(key => {
            const el = form.elements[key];
            if (el.type === 'number') {
                const val = parseFloat(el.value);
                currentSettings[key] = isNaN(val) ? 0 : val;
            }
            if (el.type === 'checkbox') currentSettings[key] = el.checked;
        });
        if (typeof currentSettings.creepInches === 'undefined' || isNaN(currentSettings.creepInches)) {
            currentSettings.creepInches = 0;
        }
        const creepGroup = document.getElementById('creep-control-group');
        const coverContainer = document.getElementById('include-cover-container');

        // Handle Source Switching Logic
        if (currentSettings.source === 'cover') {
            interiorPdfDoc = realCoverPdfDoc;
            // When imposing cover, we generally don't "Include Cover" recursively
            if (coverContainer) {
                coverContainer.classList.add('hidden');
                document.getElementById('include-cover').checked = false;
                currentSettings.includeCover = false;
            }
        } else {
            interiorPdfDoc = realInteriorPdfDoc;
            coverPdfDoc = realCoverPdfDoc;
            if (currentSettings.impositionType === 'booklet' && coverContainer) {
                coverContainer.classList.remove('hidden');
            }
        }

        if (currentSettings.impositionType === 'booklet') {
            if (creepGroup) creepGroup.classList.remove('hidden');
            if (currentSettings.source !== 'cover' && coverContainer) {
                coverContainer.classList.remove('hidden');
            } else if (coverContainer) {
                coverContainer.classList.add('hidden');
            }
        } else {
            if (creepGroup) creepGroup.classList.add('hidden');
            if (coverContainer) coverContainer.classList.add('hidden');
        }

        // If we switched source and the new doc is null (e.g. no cover), handle gracefully
        if (!interiorPdfDoc) {
             // Maybe alert or just clear?
             // For now, let render fail gracefully
        }

        currentSheetIndex = 0;
        currentViewSide = 'front';
        if (sideSelectorContainer) sideSelectorContainer.classList.add('hidden');
        resetZoom(); 
        await renderSheetAndThumbnails(projectData); 
    }

    form.addEventListener('change', handleFormChange);
    form.addEventListener('input', handleFormChange);

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

    if (generateButton) {
        generateButton.addEventListener('click', () => { 
            if (!projectId) {
                alert("Error: Project ID not found.");
                return;
            }
            const sheetConfig = sheetSizes.find(s => s.name === currentSettings.sheet);
            const settingsPayload = { ...currentSettings };
            if (sheetConfig) {
                settingsPayload.sheetLongSideInches = sheetConfig.longSideInches;
                settingsPayload.sheetShortSideInches = sheetConfig.shortSideInches;
            }
            impositionModal.classList.add('hidden');
            const toastId = 'toast-' + Date.now();
            const processingToast = document.createElement('div');
            processingToast.id = toastId;
            processingToast.className = "fixed bottom-6 right-6 bg-slate-800 border border-slate-600 text-white px-6 py-4 rounded-lg shadow-2xl z-[100] flex items-center space-x-3 animate-pulse";
            processingToast.innerHTML = `
                <div class="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent border-blue-400"></div>
                <span>Generating Imposition... you can continue working.</span>
            `;
            document.body.appendChild(processingToast);
            const functions = getFunctions();
            const imposePdf = httpsCallable(functions, 'imposePdf', { timeout: 3600000 });
            imposePdf({ projectId: projectId, settings: settingsPayload }).then((result) => {
                document.getElementById(toastId)?.remove();
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
                    setTimeout(() => { if(successToast.parentElement) successToast.remove() }, 30000);
                }
            }).catch((error) => {
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
        const latestVersion = projectData.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
        realInteriorPdfDoc = await getPdfDoc(latestVersion.previewURL || latestVersion.fileURL);
        interiorPdfDoc = realInteriorPdfDoc;

        if (projectData.cover && projectData.cover.fileURL) {
            try {
                realCoverPdfDoc = await getPdfDoc(projectData.cover.previewURL || projectData.cover.fileURL);
                coverPdfDoc = realCoverPdfDoc;
                console.log("Cover PDF loaded for preview");
            } catch (e) {
                console.warn("Failed to load cover PDF for preview", e);
            }
        }
        if (!interiorPdfDoc) return;
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
            console.warn("Could not fetch settings from Firestore, using defaults.", error);
        }
        let initialSettings = projectData.impositions?.slice().sort((a,b) => b.createdAt - a.createdAt)[0]?.settings;
        if (!initialSettings) {
             const firstPage = await interiorPdfDoc.getPage(1);
             const { width, height } = firstPage.getViewport({scale: 1});
            if (ruleSettings) {
                initialSettings = { ...globalDefaults, ...ruleSettings, sheet: ruleSettings.pressSheet, impositionType: 'stack' };
            } else if (sheetSizes.length > 0) { 
                initialSettings = { ...globalDefaults, ...maximizeNUp(width, height, sheetSizes) };
            } else {
                initialSettings = { ...globalDefaults, sheet: sheetSizes[0].name, impositionType: 'stack', rows: 1, columns: 1 };
            }
        }
        if (initialSettings.impositionType === 'booklet' && (!initialSettings.creepInches || initialSettings.creepInches === 0)) {
        }
        if (initialSettings) {
            populateForm(initialSettings);
        }
        await handleFormChange();
    }

    form.addEventListener('change', handleFormChange);
    // ... (rest of function - same as previous, ending with openModal logic) ...
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