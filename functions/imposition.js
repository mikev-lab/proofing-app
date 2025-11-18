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
const BATCH_SIZE = 20; // Process 20 sheets at a time to manage memory

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

    const trimSize = (jobInfo.finalTrimWidth && jobInfo.finalTrimHeight) ? `${jobInfo.finalTrimWidth}x${jobInfo.finalTrimHeight}` : 'N/A';
    const dueDateSlug = formatDateForSlug(jobInfo.dueDate);
    const qty = jobInfo.quantity || 'N/A';
    const jobName = jobInfo.jobIdName || (jobInfo.fileNameTitle || inputFile.name.substring(0, inputFile.name.lastIndexOf('.')) || "Job");
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
    const { inputFile, settings, jobInfo } = params;
    const {
        columns, rows, bleedInches, horizontalGutterInches, verticalGutterInches,
        impositionType, sheetOrientation, isDuplex, rowOffsetType,
        showQRCode, qrCodePosition, slipSheetColor
    } = settings;

    // 1. Download Input to Temp File
    const tempInputPath = path.join(os.tmpdir(), `input_${Date.now()}.pdf`);
    await inputFile.download({ destination: tempInputPath });
    
    const inputPdfBuffer = fs.readFileSync(tempInputPath);
    const inputPdfDoc = await PDFDocument.load(inputPdfBuffer);
    const numInputPages = inputPdfDoc.getPageCount();

    const bleedPoints = bleedInches * INCH_TO_POINTS;
    const horizontalGutterPoints = horizontalGutterInches * INCH_TO_POINTS;
    const verticalGutterPoints = verticalGutterInches * INCH_TO_POINTS;
    const { width: pageContentWidth, height: pageContentHeight } = inputPdfDoc.getPages()[0].getSize();

    // Sheet Size Logic
    let paperLongSidePoints, paperShortSidePoints;
    if (settings.sheetLongSideInches && settings.sheetShortSideInches) {
        paperLongSidePoints = settings.sheetLongSideInches * INCH_TO_POINTS;
        paperShortSidePoints = settings.sheetShortSideInches * INCH_TO_POINTS;
    } else {
        const sheetConfig = SHEET_SIZES.find(s => s.name === settings.sheet);
        if (!sheetConfig) throw new Error(`Sheet size "${settings.sheet}" not found.`);
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

    // Layout Calculations
    let slotsPerSheet = columns * rows;
    if (impositionType === 'booklet') slotsPerSheet = 2;

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
    const currentRowsForLayout = impositionType === 'booklet' ? 1 : rows;
    const slotPositions = [];
    let totalRequiredWidth = (pageContentWidth * currentColumnsForLayout) + (Math.max(0, currentColumnsForLayout - 1) * horizontalGutterPoints);
    const totalRequiredHeight = (pageContentHeight * currentRowsForLayout) + (Math.max(0, currentRowsForLayout - 1) * verticalGutterPoints);
    if (rowOffsetType === 'half' && currentRowsForLayout > 1) totalRequiredWidth += (pageContentWidth + horizontalGutterPoints) / 2;
    
    const startXBlock = (actualSheetWidthPoints - totalRequiredWidth) / 2;
    const startYBlock = (actualSheetHeightPoints - totalRequiredHeight) / 2;

    for (let row = 0; row < currentRowsForLayout; row++) {
        for (let col = 0; col < currentColumnsForLayout; col++) {
            let xPos = startXBlock + col * (pageContentWidth + horizontalGutterPoints);
            const yPos = startYBlock + (currentRowsForLayout - 1 - row) * (pageContentHeight + verticalGutterPoints);
            if (rowOffsetType === 'half' && row % 2 !== 0) xPos += (pageContentWidth + horizontalGutterPoints) / 2;
            slotPositions.push({ x: xPos, y: yPos });
        }
    }

    // --- CHUNKED PROCESSING ---
    const partialFiles = [];
    
    // Initial Batch setup
    let currentBatchDoc = await PDFDocument.create();
    let currentBatchFont = await currentBatchDoc.embedFont(StandardFonts.Helvetica);
    let batchPageCache = new Map(); 
    
    const embedPageForBatch = async (pageIndex) => {
        if (pageIndex >= numInputPages) return null;
        if (batchPageCache.has(pageIndex)) return batchPageCache.get(pageIndex);
        const sourcePage = inputPdfDoc.getPages()[pageIndex];
        const embeddedPage = await currentBatchDoc.embedPage(sourcePage);
        batchPageCache.set(pageIndex, embeddedPage);
        return embeddedPage;
    };

    for (let physicalSheetIndex = 0; physicalSheetIndex < totalPhysicalSheets; physicalSheetIndex++) {

        // Flush Batch Logic
        if (physicalSheetIndex > 0 && physicalSheetIndex % BATCH_SIZE === 0) {
            const batchPath = path.join(os.tmpdir(), `chunk_${Date.now()}_${partialFiles.length}.pdf`);
            const batchBytes = await currentBatchDoc.save();
            fs.writeFileSync(batchPath, batchBytes);
            partialFiles.push(batchPath);

            // Reset for next batch
            currentBatchDoc = await PDFDocument.create();
            currentBatchFont = await currentBatchDoc.embedFont(StandardFonts.Helvetica);
            batchPageCache.clear(); 
            if (global.gc) global.gc();
        }

        const outputSheetFront = currentBatchDoc.addPage([actualSheetWidthPoints, actualSheetHeightPoints]);

        // Slip Sheet
        if (physicalSheetIndex === 0 && slipSheetColor && slipSheetColor !== 'none') {
            const rgbColor = getSlipSheetColorRgb(slipSheetColor);
            if (rgbColor) outputSheetFront.drawRectangle({ x: 0, y: 0, width: actualSheetWidthPoints, height: actualSheetHeightPoints, color: rgbColor });
        }

        // Logic to determine which pages go on Front
        const pagesForFrontIndices = [];
        if (impositionType === 'stack') {
            const baseInputIndex = physicalSheetIndex * slotsPerSheet * (isDuplex ? 2 : 1);
            for (let i = 0; i < slotsPerSheet; i++) pagesForFrontIndices.push(baseInputIndex + (isDuplex ? i * 2 : i));
        } else if (impositionType === 'repeat') {
            const masterIndex = physicalSheetIndex * (isDuplex ? 2 : 1);
            for (let i = 0; i < slotsPerSheet; i++) pagesForFrontIndices.push(masterIndex);
        }

        // Draw Front
        for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
            const pIndex = pagesForFrontIndices[slotIndex];
            if (pIndex === undefined) continue;
            
            const embeddedPage = await embedPageForBatch(pIndex);
            if (!embeddedPage) continue;

            const { x, y } = slotPositions[slotIndex];
            const row = Math.floor(slotIndex / columns);
            const col = slotIndex % columns;

            outputSheetFront.drawPage(embeddedPage, { x, y, width: pageContentWidth, height: pageContentHeight });

            const trimAreaX = x + bleedPoints;
            const trimAreaY = y + bleedPoints;
            const trimAreaW = pageContentWidth - (2 * bleedPoints);
            const trimAreaH = pageContentHeight - (2 * bleedPoints);
            drawCropMarks(outputSheetFront, trimAreaX, trimAreaY, trimAreaW, trimAreaH, {
                hasTopNeighbor: row > 0, hasBottomNeighbor: row < rows - 1,
                hasLeftNeighbor: col > 0, hasRightNeighbor: col < columns - 1
            });
        }

        if (showQRCode) await drawSlugInfo(outputSheetFront, currentBatchDoc, `${physicalSheetIndex + 1}F`, totalPhysicalSheets, currentBatchFont, jobInfo, inputFile, qrCodePosition);

        // Draw Back (if Duplex)
        if (isDuplex) {
            const outputSheetBack = currentBatchDoc.addPage([actualSheetWidthPoints, actualSheetHeightPoints]);
            const pagesForBackIndices = [];
             if (impositionType === 'stack') {
                const baseInputIndex = physicalSheetIndex * slotsPerSheet * 2;
                for (let i = 0; i < slotsPerSheet; i++) pagesForBackIndices.push(baseInputIndex + (i * 2) + 1);
            } else if (impositionType === 'repeat') {
                 const masterIndex = (physicalSheetIndex * 2) + 1;
                 for (let i = 0; i < slotsPerSheet; i++) pagesForBackIndices.push(masterIndex);
            }

            for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
                const pIndex = pagesForBackIndices[slotIndex];
                if (pIndex === undefined) continue;
                const embeddedPage = await embedPageForBatch(pIndex);
                if (!embeddedPage) continue;
                
                const { x, y } = slotPositions[slotIndex]; 
                const row = Math.floor(slotIndex / columns);
                const col = slotIndex % columns;

                outputSheetBack.drawPage(embeddedPage, { x, y, width: pageContentWidth, height: pageContentHeight });

                const trimAreaX = x + bleedPoints;
                const trimAreaY = y + bleedPoints;
                const trimAreaW = pageContentWidth - (2 * bleedPoints);
                const trimAreaH = pageContentHeight - (2 * bleedPoints);
                drawCropMarks(outputSheetBack, trimAreaX, trimAreaY, trimAreaW, trimAreaH, {
                    hasTopNeighbor: row > 0, hasBottomNeighbor: row < rows - 1,
                    hasLeftNeighbor: col > 0, hasRightNeighbor: col < columns - 1
                });
            }
            
            if (showQRCode) await drawSlugInfo(outputSheetBack, currentBatchDoc, `${physicalSheetIndex + 1}B`, totalPhysicalSheets, currentBatchFont, jobInfo, inputFile, qrCodePosition);
        }
    }

    // Save final partial
    if (currentBatchDoc.getPageCount() > 0) {
        const batchPath = path.join(os.tmpdir(), `chunk_${Date.now()}_final.pdf`);
        const batchBytes = await currentBatchDoc.save();
        fs.writeFileSync(batchPath, batchBytes);
        partialFiles.push(batchPath);
    }

    // Merge Partials with Ghostscript
    const finalOutputPath = path.join(os.tmpdir(), `imposed_final_${Date.now()}.pdf`);
    await spawn('gs', [
        '-q', '-dNOPAUSE', '-dSAFER', '-sDEVICE=pdfwrite',
        '-dPDFSETTINGS=/prepress',                 // Use Prepress (300dpi) as base settings
        '-dDownsampleColorImages=false',           // Disable Downsampling (keep original dpi)
        '-dDownsampleGrayImages=false',
        '-dDownsampleMonoImages=false',
        '-dAutoFilterColorImages=false',           // Disable Auto-Filter (don't convert to JPEG)
        '-dAutoFilterGrayImages=false',
        '-dColorImageFilter=/FlateEncode',         // Use Flate (Lossless/Zip) instead of DCT (JPEG)
        '-dGrayImageFilter=/FlateEncode',
        '-dAutoRotatePages=/None',
        `-sOutputFile=${finalOutputPath}`, '-dBATCH',
        ...partialFiles
    ]);

    // Clean up
    try {
        fs.unlinkSync(tempInputPath);
        partialFiles.forEach(p => fs.unlinkSync(p));
    } catch (e) { console.warn("Cleanup error", e); }

    return { filePath: finalOutputPath };
}

function calculateLayout(docWidth, docHeight, sheetWidth, sheetHeight) {
    const cols1 = Math.floor(sheetWidth / docWidth);
    const rows1 = Math.floor(sheetHeight / docHeight);
    const count1 = cols1 * rows1;
    const waste1 = (sheetWidth * sheetHeight) - (count1 * docWidth * docHeight);
    const cols2 = Math.floor(sheetWidth / docHeight);
    const rows2 = Math.floor(sheetHeight / docWidth);
    const count2 = cols2 * rows2;
    const waste2 = (sheetWidth * sheetHeight) - (count2 * docWidth * docHeight);
    if (count1 > count2) {
        return { count: count1, waste: waste1, docRotated: false, cols: cols1, rows: rows1 };
    } else if (count2 > count1) {
        return { count: count2, waste: waste2, docRotated: true, cols: cols2, rows: rows2 };
    } else {
        return waste1 <= waste2
            ? { count: count1, waste: waste1, docRotated: false, cols: cols1, rows: rows1 }
            : { count: count2, waste: waste2, docRotated: true, cols: cols2, rows: rows2 };
    }
}

async function maximizeNUp(docWidth, docHeight) {
    const sheetSizes = SHEET_SIZES;
    let bestLayout = { count: 0, waste: Infinity };

    for (const sheet of sheetSizes) {
        const longSide = sheet.longSideInches * INCH_TO_POINTS;
        const shortSide = sheet.shortSideInches * INCH_TO_POINTS;

        const portraitLayout = calculateLayout(docWidth, docHeight, shortSide, longSide);
        if (portraitLayout.count > bestLayout.count || (portraitLayout.count === bestLayout.count && portraitLayout.waste < bestLayout.waste)) {
            bestLayout = { ...portraitLayout, sheet: sheet, sheetOrientation: 'portrait' };
        }

        const landscapeLayout = calculateLayout(docWidth, docHeight, longSide, shortSide);
        if (landscapeLayout.count > bestLayout.count || (landscapeLayout.count === bestLayout.count && landscapeLayout.waste < bestLayout.waste)) {
            bestLayout = { ...landscapeLayout, sheet: sheet, sheetOrientation: 'landscape' };
        }
    }

    if (bestLayout.count === 0) {
        throw new Error("Document dimensions are too large to fit on any available sheet size.");
    }

    return {
        columns: bestLayout.cols,
        rows: bestLayout.rows,
        sheet: bestLayout.sheet.name,
        sheetOrientation: bestLayout.sheetOrientation,
        bleedInches: 0.125,
        horizontalGutterInches: 0,
        verticalGutterInches: 0,
        impositionType: 'stack',
    };
}

module.exports = { imposePdfLogic, maximizeNUp };