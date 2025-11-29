const { PDFDocument, rgb, degrees, StandardFonts, cmyk } = require('pdf-lib');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child-process-promise');

// Constants
const INCH_TO_POINTS = 72;
const CROP_MARK_LENGTH_POINTS = 18;
const CROP_MARK_OFFSET_POINTS = 9;
const CROP_MARK_THICKNESS_POINTS = 0.5;
const SLUG_AREA_MARGIN_POINTS = 9;
const QR_CODE_SIZE_POINTS = 56.69;
const SLUG_TEXT_FONT_SIZE_POINTS = 7;
const SLUG_TEXT_QR_PADDING_POINTS = 7;
const QR_GENERATION_PIXEL_SIZE = 236;
const BATCH_SIZE = 10; 

// Standard Paper Sizes (in Points) for Reverse Lookup
const STANDARD_SIZES_POINTS = {
    'Letter': [612, 792],
    'Legal': [612, 1008],
    'Tabloid': [792, 1224],
    'A4': [595.28, 841.89],
    'A3': [841.89, 1190.55],
    '11x17': [792, 1224],
    '12x18': [864, 1296],
    '13x19': [936, 1368]
};

// Internal list for Auto-Imposition fallback
const SHEET_SIZES = [
    { name: "11 x 17 Paper", longSideInches: 17, shortSideInches: 11 },
    { name: "12 x 18 Paper", longSideInches: 18, shortSideInches: 12 },
    { name: "12.5 x 19 Paper", longSideInches: 19, shortSideInches: 12.5 },
    { name: "13 x 19 Paper", longSideInches: 19, shortSideInches: 13 },
];

function formatDateForSlug(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() + userTimezoneOffset);
        const month = (localDate.getMonth() + 1).toString().padStart(2, '0');
        const day = localDate.getDate().toString().padStart(2, '0');
        const year = localDate.getFullYear().toString().slice(-2);
        return `${month}/${day}/${year}`;
    } catch (e) {
        return dateString;
    }
}

function getSlipSheetColorRgb(colorName) {
    switch (colorName) {
        case 'yellow': return rgb(1, 1, 0);
        case 'pink': return rgb(1, 0.75, 0.8);
        case 'green': return rgb(0.5, 1, 0.5);
        case 'blue': return rgb(0.5, 0.8, 1);
        case 'grey': return rgb(0.8, 0.8, 0.8);
        default: return null;
    }
}

const drawCropMarks = (page, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, options = {}) => {
    const registrationBlack = cmyk(1, 1, 1, 1);
    const commonOptions = { thickness: CROP_MARK_THICKNESS_POINTS, color: registrationBlack };
    const { hasTopNeighbor, hasBottomNeighbor, hasLeftNeighbor, hasRightNeighbor } = options;
    
    if (!hasTopNeighbor) {
        page.drawLine({ start: { x: trimAreaX, y: trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS }, end: { x: trimAreaX, y: trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS }, ...commonOptions });
        page.drawLine({ start: { x: trimAreaX + trimAreaWidth, y: trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS }, end: { x: trimAreaX + trimAreaWidth, y: trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS }, ...commonOptions });
    }
    if (!hasBottomNeighbor) {
        page.drawLine({ start: { x: trimAreaX, y: trimAreaY - CROP_MARK_OFFSET_POINTS }, end: { x: trimAreaX, y: trimAreaY - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS }, ...commonOptions });
        page.drawLine({ start: { x: trimAreaX + trimAreaWidth, y: trimAreaY - CROP_MARK_OFFSET_POINTS }, end: { x: trimAreaX + trimAreaWidth, y: trimAreaY - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS }, ...commonOptions });
    }
    if (!hasLeftNeighbor) {
        page.drawLine({ start: { x: trimAreaX - CROP_MARK_OFFSET_POINTS, y: trimAreaY + trimAreaHeight }, end: { x: trimAreaX - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS, y: trimAreaY + trimAreaHeight }, ...commonOptions });
        page.drawLine({ start: { x: trimAreaX - CROP_MARK_OFFSET_POINTS, y: trimAreaY }, end: { x: trimAreaX - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS, y: trimAreaY }, ...commonOptions });
    }
    if (!hasRightNeighbor) {
        page.drawLine({ start: { x: trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS, y: trimAreaY + trimAreaHeight }, end: { x: trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS, y: trimAreaY + trimAreaHeight }, ...commonOptions });
        page.drawLine({ start: { x: trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS, y: trimAreaY }, end: { x: trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS, y: trimAreaY }, ...commonOptions });
    }
};

const drawSlugInfo = async (page, pdfDoc, currentSheetId, totalSheetsForSlug, font, jobInfo, inputFile, position = 'bottomLeft') => {
    const black = rgb(0, 0, 0);
    const { width, height } = page.getSize();
    const margin = SLUG_AREA_MARGIN_POINTS;
    let qrX, qrY;
    
    switch(position) {
        case 'topLeft': qrX = margin; qrY = height - margin - QR_CODE_SIZE_POINTS; break;
        case 'topRight': qrX = width - margin - QR_CODE_SIZE_POINTS; qrY = height - margin - QR_CODE_SIZE_POINTS; break;
        case 'bottomRight': qrX = width - margin - QR_CODE_SIZE_POINTS; qrY = margin; break;
        case 'bottomLeft': default: qrX = margin; qrY = margin; break;
    }

    const qty = jobInfo.quantity || 'N/A';
    const inputName = inputFile && inputFile.name ? inputFile.name : "Generated_File.pdf";
    const jobName = jobInfo.jobIdName || (jobInfo.fileNameTitle || inputName.substring(0, inputName.lastIndexOf('.')) || "Job");
    
    const dueDateSlug = formatDateForSlug(jobInfo.dueDate);
    const slugText = `${currentSheetId}/${totalSheetsForSlug} | ${jobName.substring(0,15)} | Qty:${qty} | ${dueDateSlug}`;

    let qrData = `Sheet: ${currentSheetId}/${totalSheetsForSlug}\nJobID: ${jobInfo.jobIdName || 'N/A'}\nQty: ${jobInfo.quantity || 'N/A'}`;

    try {
        const qrDataURL = await qrcode.toDataURL(qrData, { errorCorrectionLevel: 'M', width: QR_GENERATION_PIXEL_SIZE, margin: 0 });
        const qrPngBytes = Buffer.from(qrDataURL.split(',')[1], 'base64');
        const qrImage = await pdfDoc.embedPng(qrPngBytes);
        page.drawImage(qrImage, { x: qrX, y: qrY, width: QR_CODE_SIZE_POINTS, height: QR_CODE_SIZE_POINTS });
    } catch (qrError) {
        console.error("Failed to generate or embed QR code:", qrError);
    }

    const fontHeight = font.heightAtSize(SLUG_TEXT_FONT_SIZE_POINTS);
    const textY = qrY + (QR_CODE_SIZE_POINTS / 2) - (fontHeight / 2);
    let textX;
    if (position.includes('Left')) {
        textX = qrX + QR_CODE_SIZE_POINTS + SLUG_TEXT_QR_PADDING_POINTS;
        page.drawText(slugText, { x: textX, y: textY, size: SLUG_TEXT_FONT_SIZE_POINTS, font: font, color: black });
    } else {
        const textWidth = font.widthOfTextAtSize(slugText, SLUG_TEXT_FONT_SIZE_POINTS);
        textX = qrX - SLUG_TEXT_QR_PADDING_POINTS - textWidth;
        page.drawText(slugText, { x: textX, y: textY, size: SLUG_TEXT_FONT_SIZE_POINTS, font: font, color: black });
    }
};

async function imposePdfLogic(params) {
    const { inputFile, settings, jobInfo, localFilePath, preLoadedPdfDoc } = params; 
    const {
        columns, rows, bleedInches, horizontalGutterInches, verticalGutterInches,
        impositionType, sheetOrientation, isDuplex, rowOffsetType,
        showQRCode, qrCodePosition, slipSheetColor,
        creepInches = 0
    } = settings;

    let inputPdfDoc;
    let tempInputPath;
    let shouldCleanupTemp = true;

    if (preLoadedPdfDoc) {
        inputPdfDoc = preLoadedPdfDoc;
        shouldCleanupTemp = false; 
    } else if (localFilePath) {
        tempInputPath = localFilePath;
        const inputPdfBuffer = fs.readFileSync(tempInputPath);
        inputPdfDoc = await PDFDocument.load(inputPdfBuffer);
        shouldCleanupTemp = false; 
    } else {
        tempInputPath = path.join(os.tmpdir(), `input_${Date.now()}.pdf`);
        await inputFile.download({ destination: tempInputPath });
        const inputPdfBuffer = fs.readFileSync(tempInputPath);
        inputPdfDoc = await PDFDocument.load(inputPdfBuffer);
    }

    const numInputPages = inputPdfDoc.getPageCount();
    const bleedPoints = bleedInches * INCH_TO_POINTS;
    const horizontalGutterPoints = horizontalGutterInches * INCH_TO_POINTS;
    const verticalGutterPoints = verticalGutterInches * INCH_TO_POINTS;
    const { width: pageContentWidth, height: pageContentHeight } = inputPdfDoc.getPages()[0].getSize();
    
    const trimWidth = pageContentWidth - (2 * bleedPoints);

    // --- SHEET SIZE RESOLUTION ---
    let paperLongSidePoints, paperShortSidePoints;
    
    if (settings.sheetLongSideInches && settings.sheetShortSideInches) {
        paperLongSidePoints = settings.sheetLongSideInches * INCH_TO_POINTS;
        paperShortSidePoints = settings.sheetShortSideInches * INCH_TO_POINTS;
    } else {
        const sheetConfig = SHEET_SIZES.find(s => s.name === settings.sheet);
        if (!sheetConfig) {
             if (shouldCleanupTemp && tempInputPath) { try { fs.unlinkSync(tempInputPath); } catch(e) {} }
             throw new Error(`Sheet size "${settings.sheet}" not found in internal lookup and no explicit dimensions provided.`);
        }
        paperLongSidePoints = sheetConfig.longSideInches * INCH_TO_POINTS;
        paperShortSidePoints = sheetConfig.shortSideInches * INCH_TO_POINTS;
    }

    let actualSheetWidthPoints, actualSheetHeightPoints;
    if (sheetOrientation === 'portrait') {
        actualSheetWidthPoints = paperShortSidePoints;
        actualSheetHeightPoints = paperLongSidePoints;
    } else {
        actualSheetWidthPoints = paperLongSidePoints;
        actualSheetHeightPoints = paperShortSidePoints;
    }

    // --- LAYOUT CALCULATIONS ---
    let slotsPerSheet = columns * rows;
    if (impositionType === 'booklet') {
        slotsPerSheet = 2 * rows; 
    }

    let totalPhysicalSheets = 0;
    if (impositionType === 'booklet') {
        const paddedPageCount = Math.ceil(numInputPages / 4) * 4;
        totalPhysicalSheets = paddedPageCount / 4;
    } else if (impositionType === 'repeat') {
        totalPhysicalSheets = isDuplex ? Math.ceil(numInputPages / 2) : numInputPages;
    } else {
        const slotsPerPhysicalSheet = slotsPerSheet * (isDuplex ? 2 : 1);
        totalPhysicalSheets = Math.ceil(numInputPages / slotsPerPhysicalSheet);
    }
    if (totalPhysicalSheets === 0 && numInputPages > 0) totalPhysicalSheets = 1;

    // Grid Calculations
    const currentColumnsForLayout = impositionType === 'booklet' ? 2 : columns;
    const currentRowsForLayout = rows;
    
    const slotPositions = [];
    
    let colStepX;
    if (impositionType === 'booklet') {
        colStepX = trimWidth + horizontalGutterPoints;
    } else {
        colStepX = pageContentWidth + horizontalGutterPoints;
    }

    let totalRequiredWidth;
    if (impositionType === 'booklet') {
        totalRequiredWidth = (trimWidth * (currentColumnsForLayout - 1)) + pageContentWidth + ((currentColumnsForLayout - 1) * horizontalGutterPoints);
    } else {
        totalRequiredWidth = (pageContentWidth * currentColumnsForLayout) + (Math.max(0, currentColumnsForLayout - 1) * horizontalGutterPoints);
    }

    const totalRequiredHeight = (pageContentHeight * currentRowsForLayout) + (Math.max(0, currentRowsForLayout - 1) * verticalGutterPoints);
    
    const startXBlock = (actualSheetWidthPoints - totalRequiredWidth) / 2;
    const startYBlock = (actualSheetHeightPoints - totalRequiredHeight) / 2;

    for (let row = 0; row < currentRowsForLayout; row++) {
        for (let col = 0; col < currentColumnsForLayout; col++) {
            let xPos = startXBlock + col * colStepX;
            const yPos = startYBlock + (currentRowsForLayout - 1 - row) * (pageContentHeight + verticalGutterPoints);
            if (rowOffsetType === 'half' && row % 2 !== 0 && impositionType !== 'booklet') xPos += (pageContentWidth + horizontalGutterPoints) / 2;
            slotPositions.push({ x: xPos, y: yPos });
        }
    }

    // --- CREEP CALCULATION HELPERS ---
    const calculateCreepShift = (sheetIndex, isLeftPage) => {
        if (impositionType !== 'booklet' || !creepInches || creepInches === 0) return 0;
        
        const safeTotalSheets = Math.max(1, totalPhysicalSheets - 1);
        const creepStep = (creepInches * INCH_TO_POINTS) / safeTotalSheets;
        
        // [FIX] Reverse Order: Sheet 0 (Cover) gets MAX creep. Sheet N (Center) gets 0.
        // This moves the outer pages INWARD the most, or centers content on the inner-most page.
        const inverseIndex = safeTotalSheets - sheetIndex;
        const shiftAmount = inverseIndex * creepStep;

        // Direction: INWARD (Towards Spine)
        // Left Page (Col 0) -> Spine on Right -> Move Right (+)
        // Right Page (Col 1) -> Spine on Left -> Move Left (-)
        return isLeftPage ? shiftAmount : -shiftAmount;
    };

    // --- CHUNKED PROCESSING ---
    const partialFiles = [];
    
    let currentBatchDoc = await PDFDocument.create();
    let currentBatchFont = await currentBatchDoc.embedFont(StandardFonts.Helvetica);
    let batchPageCache = new Map(); 
    
    const embedPageForBatch = async (pageIndex) => {
        if (pageIndex === 'OUT_OF_BOUNDS' || pageIndex === null || pageIndex >= numInputPages) return null;
        if (batchPageCache.has(pageIndex)) return batchPageCache.get(pageIndex);
        const sourcePage = inputPdfDoc.getPages()[pageIndex];
        try {
            const embeddedPage = await currentBatchDoc.embedPage(sourcePage);
            batchPageCache.set(pageIndex, embeddedPage);
            return embeddedPage;
        } catch (e) {
            batchPageCache.set(pageIndex, null);
            return null;
        }
    };

    const { pushGraphicsState, popGraphicsState, clip, endPath, rect } = require('pdf-lib');

    for (let physicalSheetIndex = 0; physicalSheetIndex < totalPhysicalSheets; physicalSheetIndex++) {

        if (physicalSheetIndex > 0 && physicalSheetIndex % BATCH_SIZE === 0) {
            const batchPath = path.join(os.tmpdir(), `chunk_${Date.now()}_${partialFiles.length}.pdf`);
            const batchBytes = await currentBatchDoc.save();
            fs.writeFileSync(batchPath, batchBytes);
            partialFiles.push(batchPath);

            currentBatchDoc = await PDFDocument.create();
            currentBatchFont = await currentBatchDoc.embedFont(StandardFonts.Helvetica);
            batchPageCache.clear(); 
            if (global.gc) { try { global.gc(); } catch(e) {} }
        }

        const outputSheetFront = currentBatchDoc.addPage([actualSheetWidthPoints, actualSheetHeightPoints]);

        if (physicalSheetIndex === 0 && slipSheetColor && slipSheetColor !== 'none') {
            const rgbColor = getSlipSheetColorRgb(slipSheetColor);
            if (rgbColor) outputSheetFront.drawRectangle({ x: 0, y: 0, width: actualSheetWidthPoints, height: actualSheetHeightPoints, color: rgbColor });
        }

        const pagesForFrontIndices = [];
        if (impositionType === 'booklet') {
            const totalBookletPages = totalPhysicalSheets * 4; 
            const s = physicalSheetIndex;
            const leftVirtual = totalBookletPages - 1 - (2 * s);
            const rightVirtual = 0 + (2 * s);
            for (let r = 0; r < rows; r++) {
                pagesForFrontIndices.push(leftVirtual);
                pagesForFrontIndices.push(rightVirtual);
            }
        } else if (impositionType === 'stack') {
            const baseInputIndex = physicalSheetIndex * slotsPerSheet * (isDuplex ? 2 : 1);
            for (let i = 0; i < slotsPerSheet; i++) pagesForFrontIndices.push(baseInputIndex + (isDuplex ? i * 2 : i));
        } else if (impositionType === 'repeat') {
            const masterIndex = physicalSheetIndex * (isDuplex ? 2 : 1);
            for (let i = 0; i < slotsPerSheet; i++) pagesForFrontIndices.push(masterIndex);
        }

        for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
            const pIndex = pagesForFrontIndices[slotIndex];
            const embeddedPage = await embedPageForBatch(pIndex);
            if (!embeddedPage) continue; 

            let { x, y } = slotPositions[slotIndex]; 
            const gridCols = impositionType === 'booklet' ? 2 : columns;
            const gridRows = rows;
            const row = Math.floor(slotIndex / gridCols);
            const col = slotIndex % gridCols;

            if (impositionType === 'booklet') {
                const isLeftPage = (col === 0);
                x += calculateCreepShift(physicalSheetIndex, isLeftPage);
            }

            if (impositionType === 'booklet') {
                outputSheetFront.pushOperators(pushGraphicsState());
                if (col === 0) {
                    outputSheetFront.pushOperators(rect(x - bleedPoints, y, bleedPoints + trimWidth, pageContentHeight));
                    outputSheetFront.pushOperators(clip(), endPath());
                    outputSheetFront.drawPage(embeddedPage, { x: x - bleedPoints, y, width: pageContentWidth, height: pageContentHeight });
                } else {
                    outputSheetFront.pushOperators(rect(x, y, trimWidth + bleedPoints, pageContentHeight));
                    outputSheetFront.pushOperators(clip(), endPath());
                    outputSheetFront.drawPage(embeddedPage, { x: x - bleedPoints, y, width: pageContentWidth, height: pageContentHeight });
                }
                outputSheetFront.pushOperators(popGraphicsState());
            } else {
                outputSheetFront.drawPage(embeddedPage, { x, y, width: pageContentWidth, height: pageContentHeight });
            }

            const trimAreaY = y + bleedPoints;
            const trimAreaH = pageContentHeight - (2 * bleedPoints);
            let finalCropX = x + bleedPoints;
            if (impositionType === 'booklet') {
                if (col === 0) finalCropX = x;
                if (col === 1) finalCropX = x;
            }

            drawCropMarks(outputSheetFront, finalCropX, trimAreaY, trimWidth, trimAreaH, {
                hasTopNeighbor: row > 0, hasBottomNeighbor: row < gridRows - 1,
                hasLeftNeighbor: col > 0, hasRightNeighbor: col < gridCols - 1
            });
        }

        if (showQRCode) await drawSlugInfo(outputSheetFront, currentBatchDoc, `${physicalSheetIndex + 1}F`, totalPhysicalSheets, currentBatchFont, jobInfo, inputFile, qrCodePosition);

        if (isDuplex) {
            const outputSheetBack = currentBatchDoc.addPage([actualSheetWidthPoints, actualSheetHeightPoints]);
            const pagesForBackIndices = [];
            
            if (impositionType === 'booklet') {
                const totalBookletPages = totalPhysicalSheets * 4;
                const s = physicalSheetIndex;
                const leftVirtual = 0 + (2 * s) + 1;
                const rightVirtual = totalBookletPages - 1 - (2 * s) - 1;
                for (let r = 0; r < rows; r++) {
                    pagesForBackIndices.push(leftVirtual);
                    pagesForBackIndices.push(rightVirtual);
                }
            } else if (impositionType === 'stack') {
                const baseInputIndex = physicalSheetIndex * slotsPerSheet * 2;
                for (let i = 0; i < slotsPerSheet; i++) pagesForBackIndices.push(baseInputIndex + (i * 2) + 1);
            } else if (impositionType === 'repeat') {
                 const masterIndex = (physicalSheetIndex * 2) + 1;
                 for (let i = 0; i < slotsPerSheet; i++) pagesForBackIndices.push(masterIndex);
            }

            for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
                const pIndex = pagesForBackIndices[slotIndex];
                const embeddedPage = await embedPageForBatch(pIndex);
                if (!embeddedPage) continue;

                let { x, y } = slotPositions[slotIndex]; 
                const gridCols = impositionType === 'booklet' ? 2 : columns;
                const gridRows = rows;
                const row = Math.floor(slotIndex / gridCols);
                const col = slotIndex % gridCols;

                if (impositionType === 'booklet') {
                    const isLeftPage = (col === 0);
                    x += calculateCreepShift(physicalSheetIndex, isLeftPage);
                }

                if (impositionType === 'booklet') {
                    outputSheetBack.pushOperators(pushGraphicsState());
                    if (col === 0) {
                        outputSheetBack.pushOperators(rect(x - bleedPoints, y, bleedPoints + trimWidth, pageContentHeight));
                        outputSheetBack.pushOperators(clip(), endPath());
                        outputSheetBack.drawPage(embeddedPage, { x: x - bleedPoints, y, width: pageContentWidth, height: pageContentHeight });
                    } else {
                        outputSheetBack.pushOperators(rect(x, y, trimWidth + bleedPoints, pageContentHeight));
                        outputSheetBack.pushOperators(clip(), endPath());
                        outputSheetBack.drawPage(embeddedPage, { x: x - bleedPoints, y, width: pageContentWidth, height: pageContentHeight });
                    }
                    outputSheetBack.pushOperators(popGraphicsState());
                } else {
                    outputSheetBack.drawPage(embeddedPage, { x, y, width: pageContentWidth, height: pageContentHeight });
                }

                const trimAreaY = y + bleedPoints;
                const trimAreaH = pageContentHeight - (2 * bleedPoints);
                let finalCropX = x + bleedPoints;
                if (impositionType === 'booklet') {
                    if (col === 0) finalCropX = x;
                    if (col === 1) finalCropX = x;
                }

                drawCropMarks(outputSheetBack, finalCropX, trimAreaY, trimWidth, trimAreaH, {
                    hasTopNeighbor: row > 0, hasBottomNeighbor: row < gridRows - 1,
                    hasLeftNeighbor: col > 0, hasRightNeighbor: col < gridCols - 1
                });
            }
            
            if (showQRCode) await drawSlugInfo(outputSheetBack, currentBatchDoc, `${physicalSheetIndex + 1}B`, totalPhysicalSheets, currentBatchFont, jobInfo, inputFile, qrCodePosition);
        }
    }

    if (currentBatchDoc.getPageCount() > 0) {
        const batchPath = path.join(os.tmpdir(), `chunk_${Date.now()}_final.pdf`);
        const batchBytes = await currentBatchDoc.save();
        fs.writeFileSync(batchPath, batchBytes);
        partialFiles.push(batchPath);
    }

    const finalOutputPath = path.join(os.tmpdir(), `imposed_final_${Date.now()}.pdf`);
    await spawn('gs', [
        '-q', '-dNOPAUSE', '-dSAFER', '-sDEVICE=pdfwrite',
        '-dPDFSETTINGS=/prepress',
        '-dCompatibilityLevel=1.4',
        '-dJPEGQ=95',
        '-dAutoRotatePages=/None',
        `-sOutputFile=${finalOutputPath}`, '-dBATCH',
        ...partialFiles
    ]);

    try {
        if (shouldCleanupTemp && tempInputPath) fs.unlinkSync(tempInputPath);
        partialFiles.forEach(p => fs.unlinkSync(p));
    } catch (e) { console.warn("Cleanup error", e); }

    return { filePath: finalOutputPath };
}

// ... (helpers same)
function calculateLayout(docWidth, docHeight, sheetWidth, sheetHeight, gutterH = 0, gutterV = 0) {
    const effectiveSheetWidth = sheetWidth + gutterH;
    const effectiveSheetHeight = sheetHeight + gutterV;
    const effectiveDocWidth = docWidth + gutterH;
    const effectiveDocHeight = docHeight + gutterV;

    const cols1 = Math.floor(effectiveSheetWidth / effectiveDocWidth);
    const rows1 = Math.floor(effectiveSheetHeight / effectiveDocHeight);
    const count1 = cols1 * rows1;
    
    const effectiveDocWidthRotated = docHeight + gutterH; 
    const effectiveDocHeightRotated = docWidth + gutterV;
    
    const cols2 = Math.floor(effectiveSheetWidth / effectiveDocWidthRotated);
    const rows2 = Math.floor(effectiveSheetHeight / effectiveDocHeightRotated);
    const count2 = cols2 * rows2;

    if (count1 > count2) {
        return { count: count1, cols: cols1, rows: rows1, docRotated: false };
    } else if (count2 > count1) {
        return { count: count2, cols: cols2, rows: rows2, docRotated: true };
    } else {
        return { count: count1, cols: cols1, rows: rows1, docRotated: false };
    }
}

function getStandardSizeName(w, h) {
    const TOLERANCE = 5;
    const BLEED_ADDITION = 18; 

    for (const [name, dims] of Object.entries(STANDARD_SIZES_POINTS)) {
        const [stdW, stdH] = dims;
        const matchTrimPortrait = (Math.abs(w - stdW) < TOLERANCE && Math.abs(h - stdH) < TOLERANCE);
        const matchTrimLandscape = (Math.abs(w - stdH) < TOLERANCE && Math.abs(h - stdW) < TOLERANCE);
        const matchBleedPortrait = (Math.abs(w - (stdW + BLEED_ADDITION)) < TOLERANCE && Math.abs(h - (stdH + BLEED_ADDITION)) < TOLERANCE);
        const matchBleedLandscape = (Math.abs(w - (stdH + BLEED_ADDITION)) < TOLERANCE && Math.abs(h - (stdW + BLEED_ADDITION)) < TOLERANCE);
        if (matchTrimPortrait || matchTrimLandscape || matchBleedPortrait || matchBleedLandscape) return name;
    }
    return null;
}

async function maximizeNUp(docWidth, docHeight, db) {
    const sheetSizesSnapshot = await db.collection('settings').doc('sheetSizes').collection('sizes').get();
    const sheetSizes = sheetSizesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (sheetSizes.length === 0) throw new Error("No sheet sizes are defined in Firestore settings.");

    let forcedSheet = null;
    let forcedRuleSettings = null; 

    const docSizeName = getStandardSizeName(docWidth, docHeight);

    if (docSizeName) {
        const rulesSnapshot = await db.collection('impositionDefaults').get();
        rulesSnapshot.forEach(doc => {
            const data = doc.data();
            const ruleDocSize = data.docSize ? data.docSize.toLowerCase() : '';
            if (ruleDocSize === docSizeName.toLowerCase()) {
                let match = null;
                if (data.pressSheetId) match = sheetSizes.find(s => s.id === data.pressSheetId);
                if (!match && data.pressSheet) match = sheetSizes.find(s => s.name.trim() === data.pressSheet.trim());
                if (match) { forcedSheet = match; forcedRuleSettings = data; }
            }
        });
    }

    let ruleHGutPts = 0;
    let ruleVGutPts = 0;
    let ruleHGutInches = 0;
    let ruleVGutInches = 0;

    if (forcedRuleSettings) {
        ruleHGutInches = parseFloat(forcedRuleSettings.horizontalGutter) || 0;
        ruleVGutInches = parseFloat(forcedRuleSettings.verticalGutter) || 0;
        ruleHGutPts = ruleHGutInches * INCH_TO_POINTS;
        ruleVGutPts = ruleVGutInches * INCH_TO_POINTS;
    }

    let bestLayout = { count: 0, waste: Infinity };

    if (forcedSheet) {
        const longSidePts = parseFloat(forcedSheet.longSideInches) * INCH_TO_POINTS;
        const shortSidePts = parseFloat(forcedSheet.shortSideInches) * INCH_TO_POINTS;
        const portraitLayout = calculateLayout(docWidth, docHeight, shortSidePts, longSidePts, ruleHGutPts, ruleVGutPts);
        const landscapeLayout = calculateLayout(docWidth, docHeight, longSidePts, shortSidePts, ruleHGutPts, ruleVGutPts);
        if (portraitLayout.count > landscapeLayout.count) bestLayout = { ...portraitLayout, sheet: forcedSheet, sheetOrientation: 'portrait' };
        else bestLayout = { ...landscapeLayout, sheet: forcedSheet, sheetOrientation: 'landscape' };
    } else {
        for (const sheet of sheetSizes) {
            const longSide = parseFloat(sheet.longSideInches) * INCH_TO_POINTS;
            const shortSide = parseFloat(sheet.shortSideInches) * INCH_TO_POINTS;
            if (isNaN(longSide) || isNaN(shortSide)) continue;
            const portraitLayout = calculateLayout(docWidth, docHeight, shortSide, longSide);
            if (portraitLayout.count > bestLayout.count || (portraitLayout.count === bestLayout.count && portraitLayout.waste < bestLayout.waste)) {
                bestLayout = { ...portraitLayout, sheet: sheet, sheetOrientation: 'portrait' };
            }
            const landscapeLayout = calculateLayout(docWidth, docHeight, longSide, shortSide);
            if (landscapeLayout.count > bestLayout.count || (landscapeLayout.count === bestLayout.count && landscapeLayout.waste < bestLayout.waste)) {
                bestLayout = { ...landscapeLayout, sheet: sheet, sheetOrientation: 'landscape' };
            }
        }
    }

    if (bestLayout.count === 0) throw new Error("Document dimensions are too large to fit on any available sheet size.");

    let impositionSettings = {
        columns: bestLayout.cols,
        rows: bestLayout.rows,
        impositionType: 'stack',
        horizontalGutterInches: 0,
        verticalGutterInches: 0
    };

    if (forcedRuleSettings) {
        if (forcedRuleSettings.impositionType) impositionSettings.impositionType = forcedRuleSettings.impositionType;
        if (forcedRuleSettings.slipSheetColor) impositionSettings.slipSheetColor = forcedRuleSettings.slipSheetColor;
        impositionSettings.horizontalGutterInches = ruleHGutInches;
        impositionSettings.verticalGutterInches = ruleVGutInches;
    } else {
        const ruleSnapshot = await db.collection('impositionDefaults').where('pressSheetId', '==', bestLayout.sheet.id).get();
        if (!ruleSnapshot.empty) {
            const rule = ruleSnapshot.docs[0].data();
            impositionSettings.impositionType = rule.type || 'stack';
        }
    }
    
    return {
        ...impositionSettings,
        sheet: bestLayout.sheet.name,
        sheetLongSideInches: parseFloat(bestLayout.sheet.longSideInches),
        sheetShortSideInches: parseFloat(bestLayout.sheet.shortSideInches),
        sheetOrientation: bestLayout.sheetOrientation,
        bleedInches: 0.125,
        horizontalGutterInches: impositionSettings.horizontalGutterInches,
        verticalGutterInches: impositionSettings.verticalGutterInches
    };
}

module.exports = { imposePdfLogic, maximizeNUp };