const { PDFDocument, rgb, degrees, StandardFonts, cmyk } = require('pdf-lib');
const qrcode = require('qrcode');
const admin = require('firebase-admin');

// Constants from the prototype
const INCH_TO_POINTS = 72;
const CROP_MARK_LENGTH_POINTS = 18; // 0.25 inches
const CROP_MARK_OFFSET_POINTS = 9;  // 0.125 inches from trim edge
const CROP_MARK_THICKNESS_POINTS = 0.5;
const SLUG_AREA_MARGIN_POINTS = 9;
const QR_CODE_SIZE_POINTS = 56.69;
const SLUG_TEXT_FONT_SIZE_POINTS = 7;
const SLUG_TEXT_QR_PADDING_POINTS = 7;
const SLUG_AREA_BOTTOM_Y_POINTS = QR_CODE_SIZE_POINTS * 0.15;
const QR_GENERATION_PIXEL_SIZE = 236;
const QR_SLUG_SHIFT_RIGHT_POINTS = 5.67;

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

const drawSlugInfo = async (page, pdfDoc, currentSheetId, totalSheetsForSlug, font, jobInfo, inputFile) => {
    const black = rgb(0, 0, 0);
    const qrX = SLUG_AREA_MARGIN_POINTS;
    const qrY = SLUG_AREA_BOTTOM_Y_POINTS;

    const trimSize = (jobInfo.finalTrimWidth && jobInfo.finalTrimHeight) ? `${jobInfo.finalTrimWidth}x${jobInfo.finalTrimHeight}` : 'N/A';
    const dueDateSlug = formatDateForSlug(jobInfo.dueDate);
    const qty = jobInfo.quantity || 'N/A';
    const jobName = jobInfo.jobIdName || (jobInfo.fileNameTitle || inputFile.name.substring(0, inputFile.name.lastIndexOf('.')) || "Job");
    const slugText = `Sheet: ${currentSheetId} of ${totalSheetsForSlug} | Job: ${jobName.substring(0,20)} | Qty: ${qty} | Due: ${dueDateSlug} | Trim: ${trimSize}`;

    let qrData = `Sheet: ${currentSheetId}/${totalSheetsForSlug}\\n`;
    qrData += `JobID: ${jobInfo.jobIdName || 'N/A'}\\n`;
    qrData += `Customer: ${jobInfo.customerName || 'N/A'}\\n`;
    qrData += `File: ${jobInfo.fileNameTitle || inputFile.name}\\n`;
    qrData += `Qty: ${jobInfo.quantity || 'N/A'}\\n`;
    qrData += `Due: ${dueDateSlug}\\n`;
    qrData += `Trim: ${trimSize}\\n`;
    // Add more fields from jobInfo as needed

    try {
        const qrDataURL = await qrcode.toDataURL(qrData, {
            errorCorrectionLevel: 'M',
            width: QR_GENERATION_PIXEL_SIZE,
            margin: 0,
        });
        const qrPngBytes = Buffer.from(qrDataURL.split(',')[1], 'base64');
        const qrImage = await pdfDoc.embedPng(qrPngBytes);
        page.drawImage(qrImage, {
            x: qrX,
            y: qrY,
            width: QR_CODE_SIZE_POINTS,
            height: QR_CODE_SIZE_POINTS,
        });
    } catch (qrError) {
        console.error("Failed to generate or embed QR code:", qrError);
    }

    const textX = qrX + QR_CODE_SIZE_POINTS + SLUG_TEXT_QR_PADDING_POINTS;
    const fontHeight = font.heightAtSize(SLUG_TEXT_FONT_SIZE_POINTS);
    const textBaselineY = qrY + (QR_CODE_SIZE_POINTS / 2) - (fontHeight / 2) + (fontHeight * 0.15);
    page.drawText(slugText, { x: textX, y: textBaselineY, size: SLUG_TEXT_FONT_SIZE_POINTS, font: font, color: black });
};

async function imposePdfLogic(params) {
    const { inputFile, settings, jobInfo } = params;
    const {
        columns,
        rows,
        bleedInches,
        horizontalGutterInches,
        verticalGutterInches,
        impositionType,
        sheetOrientation,
        isDuplex,
        readingDirection,
        rowOffsetType,
        alternateRotationType,
        creepInches,
        showSpineMarks
    } = settings;

    const fileBytes = await inputFile.download();
    const inputPdfDoc = await PDFDocument.load(fileBytes[0]);
    const numInputPages = inputPdfDoc.getPageCount();
    if (numInputPages === 0) throw new Error("The input PDF has no pages.");

    const bleedPoints = bleedInches * INCH_TO_POINTS;
    const horizontalGutterPoints = horizontalGutterInches * INCH_TO_POINTS;
    const verticalGutterPoints = verticalGutterInches * INCH_TO_POINTS;

    const inputPages = inputPdfDoc.getPages();
    const { width: pageContentWidth, height: pageContentHeight } = inputPages[0].getSize();

    const sheetConfig = SHEET_SIZES.find(s => s.name === settings.sheet);
    if (!sheetConfig) throw new Error(`Sheet size "${settings.sheet}" not found.`);

    const paperLongSidePoints = sheetConfig.longSideInches * INCH_TO_POINTS;
    const paperShortSidePoints = sheetConfig.shortSideInches * INCH_TO_POINTS;

    let actualSheetWidthPoints, actualSheetHeightPoints;
    if (sheetOrientation === 'portrait') {
        actualSheetWidthPoints = paperShortSidePoints;
        actualSheetHeightPoints = paperLongSidePoints;
    } else { // landscape
        actualSheetWidthPoints = paperLongSidePoints;
        actualSheetHeightPoints = paperShortSidePoints;
    }

    const outputPdfDoc = await PDFDocument.create();
    const helveticaFont = await outputPdfDoc.embedFont(StandardFonts.Helvetica);

    let slotsPerSheet = columns * rows;
    if (impositionType === 'booklet') slotsPerSheet = 2;

    let totalPhysicalSheets = 0;
    let paddedPageCount = numInputPages;
    if (impositionType === 'booklet') {
        paddedPageCount = Math.ceil(numInputPages / 4) * 4;
        totalPhysicalSheets = paddedPageCount / 4;
    } else if (impositionType === 'repeat') {
        totalPhysicalSheets = isDuplex ? Math.ceil(numInputPages / 2) : numInputPages;
    } else { // stack or collateCut
        const slotsPerPhysicalSheet = slotsPerSheet * (isDuplex ? 2 : 1);
        totalPhysicalSheets = Math.ceil(numInputPages / slotsPerPhysicalSheet);
    }
    if (totalPhysicalSheets === 0 && numInputPages > 0) totalPhysicalSheets = 1;


    const layoutCellWidth = pageContentWidth;
    const layoutCellHeight = pageContentHeight;
    const currentColumnsForLayout = impositionType === 'booklet' ? 2 : columns;
    const currentRowsForLayout = impositionType === 'booklet' ? 1 : rows;

    const slotPositions = [];
    let totalRequiredWidth = (layoutCellWidth * currentColumnsForLayout) + (Math.max(0, currentColumnsForLayout - 1) * horizontalGutterPoints);
    const totalRequiredHeight = (layoutCellHeight * currentRowsForLayout) + (Math.max(0, currentRowsForLayout - 1) * verticalGutterPoints);
    if (rowOffsetType === 'half' && currentRowsForLayout > 1) {
        totalRequiredWidth += (layoutCellWidth + horizontalGutterPoints) / 2;
    }
    const startXBlock = (actualSheetWidthPoints - totalRequiredWidth) / 2;
    const startYBlock = (actualSheetHeightPoints - totalRequiredHeight) / 2;

    for (let row = 0; row < currentRowsForLayout; row++) {
        for (let col = 0; col < currentColumnsForLayout; col++) {
            let xPos = startXBlock + col * (layoutCellWidth + horizontalGutterPoints);
            const yPos = startYBlock + (currentRowsForLayout - 1 - row) * (layoutCellHeight + verticalGutterPoints);
            if (rowOffsetType === 'half' && row % 2 !== 0) {
                xPos += (layoutCellWidth + horizontalGutterPoints) / 2;
            }
            slotPositions.push({ x: xPos, y: yPos });
        }
    }


    for (let physicalSheetIndex = 0; physicalSheetIndex < totalPhysicalSheets; physicalSheetIndex++) {
        const outputSheetFront = outputPdfDoc.addPage([actualSheetWidthPoints, actualSheetHeightPoints]);

        // Non-booklet logic (simplified for now, full logic can be ported)
        const pagesForFront = [];
        if (impositionType === 'stack') {
            const baseInputIndexForSheet = physicalSheetIndex * slotsPerSheet * (isDuplex ? 2 : 1);
            for (let i = 0; i < slotsPerSheet; i++) {
                const pageIndex = baseInputIndexForSheet + (isDuplex ? i * 2 : i);
                pagesForFront.push(pageIndex < numInputPages ? inputPages[pageIndex] : null);
            }
        } else if (impositionType === 'repeat') {
            const masterPageFront = (physicalSheetIndex * (isDuplex ? 2 : 1) < numInputPages) ? inputPages[physicalSheetIndex * (isDuplex ? 2 : 1)] : null;
            for (let i = 0; i < slotsPerSheet; i++) pagesForFront.push(masterPageFront);
        }

        for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
            const pageToEmbed = pagesForFront[slotIndex];
            if (!pageToEmbed) continue;

            const embeddedPage = await outputPdfDoc.embedPage(pageToEmbed);
            const slotBaseX = slotPositions[slotIndex].x;
            const slotBaseY = slotPositions[slotIndex].y;
            const row = Math.floor(slotIndex / columns);
            const col = slotIndex % columns;

            outputSheetFront.drawPage(embeddedPage, { x: slotBaseX, y: slotBaseY, width: layoutCellWidth, height: layoutCellHeight });

            const trimAreaX = slotBaseX + bleedPoints;
            const trimAreaY = slotBaseY + bleedPoints;
            const trimAreaWidth = layoutCellWidth - (2 * bleedPoints);
            const trimAreaHeight = layoutCellHeight - (2 * bleedPoints);
            drawCropMarks(outputSheetFront, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, {
                hasTopNeighbor: row > 0,
                hasBottomNeighbor: row < rows - 1,
                hasLeftNeighbor: col > 0,
                hasRightNeighbor: col < columns - 1
            });
        }

        await drawSlugInfo(outputSheetFront, outputPdfDoc, `${physicalSheetIndex + 1}F`, totalPhysicalSheets, helveticaFont, jobInfo, inputFile);

        if (isDuplex) {
            const outputSheetBack = outputPdfDoc.addPage([actualSheetWidthPoints, actualSheetHeightPoints]);
            // Back page logic would go here...
            await drawSlugInfo(outputSheetBack, outputPdfDoc, `${physicalSheetIndex + 1}B`, totalPhysicalSheets, helveticaFont, jobInfo, inputFile);
        }
    }

    const pdfBytes = await outputPdfDoc.save();
    return pdfBytes;
}

// ... (maximizeNUp and other helpers remain the same)
const SHEET_SIZES = [
    { name: "11 x 17 Paper", longSideInches: 17, shortSideInches: 11 },
    { name: "12 x 18 Paper", longSideInches: 18, shortSideInches: 12 },
    { name: "12.5 x 19 Paper", longSideInches: 19, shortSideInches: 12.5 },
    { name: "13 x 19 Paper", longSideInches: 19, shortSideInches: 13 },
];

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
