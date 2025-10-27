// js/imposition-logic.js

export const INCH_TO_POINTS = 72;

export const SHEET_SIZES = [
    // ... (SHEET_SIZES array remains unchanged)
    { name: "Letter (8.5 x 11 in)", longSideInches: 11, shortSideInches: 8.5 },
    { name: "Legal (8.5 x 14 in)", longSideInches: 14, shortSideInches: 8.5 },
    { name: "Tabloid (11 x 17 in)", longSideInches: 17, shortSideInches: 11 },
    { name: "Digital Press (12 x 18 in)", longSideInches: 18, shortSideInches: 12 },
    { name: "Super B (13 x 19 in)", longSideInches: 19, shortSideInches: 13 },
    { name: "A4 (210 x 297 mm)", longSideInches: 11.69, shortSideInches: 8.27 },
    { name: "A3 (297 x 420 mm)", longSideInches: 16.54, shortSideInches: 11.69 },
    { name: "A2 (420 x 594 mm)", longSideInches: 23.39, shortSideInches: 16.54 },
];

function calculateLayout(docWidth, docHeight, sheetWidth, sheetHeight) {
    // ... (calculateLayout function remains unchanged)
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

export function maximizeNUp(docWidth, docHeight) {
    // ... (maximizeNUp function remains unchanged)
    let bestLayout = { count: 0, waste: Infinity, sheet: null, sheetOrientation: null, docRotated: false, columns: 0, rows: 0 };
    for (const sheet of SHEET_SIZES) {
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
    if (bestLayout.count === 0) return null;
    return {
        columns: bestLayout.columns,
        rows: bestLayout.rows,
        sheet: bestLayout.sheet.name,
        sheetOrientation: bestLayout.sheetOrientation,
        impositionType: 'stack',
    };
}


function getBookletPagePairs(sheetIndex, paddedPageCount) {
    const pageIndexFR = sheetIndex * 2;
    const pageIndexFL = paddedPageCount - (sheetIndex * 2) - 1;
    const pageIndexBL = sheetIndex * 2 + 1;
    const pageIndexBR = paddedPageCount - (sheetIndex * 2) - 2;

    // Returns pages in visual order: [Front-Left, Front-Right], [Back-Left, Back-Right]
    return {
        front: [pageIndexFL, pageIndexFR],
        back: [pageIndexBL, pageIndexBR]
    };
}


export function getPageSequenceForSheet(sheetIndex, numInputPages, settings) {
    const { impositionType, columns, rows, isDuplex } = settings;
    const slotsPerSheet = columns * rows;
    const pages = Array(slotsPerSheet * 2).fill(null); // Max size for duplex

    if (impositionType === 'booklet') {
        const paddedPageCount = Math.ceil(numInputPages / 4) * 4;
        const pairs = getBookletPagePairs(sheetIndex, paddedPageCount);
        // The booklet logic uses a fixed 2-column, 1-row layout for its pairs
        const frontPages = [pairs.front[0] + 1, pairs.front[1] + 1].map(p => p > paddedPageCount ? null : p);
        const backPages = [pairs.back[0] + 1, pairs.back[1] + 1].map(p => p > paddedPageCount ? null : p);
        return { front: frontPages, back: backPages };
    }

    const frontPages = [];
    const backPages = [];

    if (impositionType === 'stack') {
        const baseIndex = sheetIndex * slotsPerSheet * (isDuplex ? 2 : 1);
        for (let i = 0; i < slotsPerSheet; i++) {
            const frontIndex = baseIndex + (isDuplex ? i * 2 : i);
            frontPages.push(frontIndex < numInputPages ? frontIndex + 1 : null);
            if (isDuplex) {
                const backIndex = frontIndex + 1;
                backPages.push(backIndex < numInputPages ? backIndex + 1 : null);
            }
        }
    } else if (impositionType === 'repeat') {
        const masterFrontIndex = sheetIndex * (isDuplex ? 2 : 1);
        const masterBackIndex = masterFrontIndex + 1;
        const masterFrontPage = masterFrontIndex < numInputPages ? masterFrontIndex + 1 : null;
        const masterBackPage = masterBackIndex < numInputPages ? masterBackIndex + 1 : null;

        for (let i = 0; i < slotsPerSheet; i++) {
            frontPages.push(masterFrontPage);
            if (isDuplex) {
                backPages.push(masterBackPage);
            }
        }
    } else if (impositionType === 'collateCut') {
        const pagesPerLogicalStack = Math.ceil(numInputPages / slotsPerSheet);
        const totalSheetsForMode = isDuplex ? Math.ceil(pagesPerLogicalStack / 2) : pagesPerLogicalStack;
        const totalSlotsPerColumn = totalSheetsForMode * (isDuplex ? 2 : 1);

        const logicalPageIndexFront = sheetIndex * (isDuplex ? 2 : 1);
        for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
            const pageOffset = slotIndex * totalSlotsPerColumn;
            const pageToEmbedIndex = logicalPageIndexFront + pageOffset;
            frontPages.push(pageToEmbedIndex < numInputPages ? pageToEmbedIndex + 1 : null);
        }

        if (isDuplex) {
            const logicalPageIndexBack = logicalPageIndexFront + 1;
             for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
                const pageOffset = slotIndex * totalSlotsPerColumn;
                const pageToEmbedIndex = logicalPageIndexBack + pageOffset;
                backPages.push(pageToEmbedIndex < numInputPages ? pageToEmbedIndex + 1 : null);
            }
        }
    }

    // Work-and-turn logic for duplex stack/collate
    if (isDuplex && (impositionType === 'stack' || impositionType === 'collateCut') && columns > 1) {
        const reversedRows = [];
        for (let row = 0; row < rows; row++) {
            const rowSlice = backPages.slice(row * columns, (row + 1) * columns);
            reversedRows.push(...rowSlice.reverse());
        }
        return { front: frontPages, back: reversedRows };
    }

    return { front: frontPages, back: backPages };
}
