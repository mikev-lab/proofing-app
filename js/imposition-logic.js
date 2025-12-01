// js/imposition-logic.js
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const INCH_TO_POINTS = 72;

// Default sheet sizes to be used if Firestore is unavailable or empty
const DEFAULT_SHEET_SIZES = [
    { name: "Super B (13 x 19 in)", longSideInches: 19, shortSideInches: 13 },
    { name: "Custom (12.5 x 19 in)", longSideInches: 19, shortSideInches: 12.5 },
    { name: "Digital Press (12 x 18 in)", longSideInches: 18, shortSideInches: 12 },
    { name: "Tabloid (11 x 17 in)", longSideInches: 17, shortSideInches: 11 },
    { name: "Letter (8.5 x 11 in)", longSideInches: 11, shortSideInches: 8.5 },
];

// Added for detection logic
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

let sheetSizesCache = null;

export async function getSheetSizes(db) {
    if (sheetSizesCache) {
        return sheetSizesCache;
    }

    try {
        const q = collection(db, 'settings', 'sheetSizes', 'sizes');
        const querySnapshot = await getDocs(q);
        const sizes = [];
        querySnapshot.forEach((doc) => {
            sizes.push(doc.data());
        });

        if (sizes.length > 0) {
            sheetSizesCache = sizes;
            return sizes;
        } else {
            console.warn("No sheet sizes found in Firestore, using default sizes.");
            sheetSizesCache = DEFAULT_SHEET_SIZES;
            return DEFAULT_SHEET_SIZES;
        }
    } catch (error) {
        console.error("Error fetching sheet sizes from Firestore, falling back to defaults:", error);
        sheetSizesCache = DEFAULT_SHEET_SIZES;
        return DEFAULT_SHEET_SIZES;
    }
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

export function maximizeNUp(docWidth, docHeight, sheetSizes) {
    let bestLayout = { count: 0, waste: Infinity, sheet: null, sheetOrientation: null, docRotated: false, columns: 0, rows: 0 };
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

    // --- DETECT BLEED ON INPUT FILE ---
    let detectedBleed = 0.125;
    const TOLERANCE = 5;
    
    for (const [name, dims] of Object.entries(STANDARD_SIZES_POINTS)) {
        const [stdW, stdH] = dims;
        if ((Math.abs(docWidth - stdW) < TOLERANCE && Math.abs(docHeight - stdH) < TOLERANCE) || 
            (Math.abs(docWidth - stdH) < TOLERANCE && Math.abs(docHeight - stdW) < TOLERANCE)) {
            detectedBleed = 0;
            break;
        }
    }
    // ----------------------------------

    if (bestLayout.count === 0) return null;
    return {
        columns: bestLayout.columns,
        rows: bestLayout.rows,
        sheet: bestLayout.sheet.name,
        sheetOrientation: bestLayout.sheetOrientation,
        impositionType: 'stack',
        bleedInches: detectedBleed, // Return detected bleed
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
    const { impositionType, columns, rows, isDuplex, includeCover = true } = settings;
    const slotsPerSheet = columns * rows;
    
    // [FIX] Initialize arrays
    let frontPages = [];
    let backPages = [];

    if (impositionType === 'booklet') {
        let processingPages = numInputPages;
        let pageOffset = 0;

        // Handle Cover Exclusion
        if (includeCover === false && numInputPages >= 4) {
            processingPages = numInputPages - 4; // Ignore 2 at start and 2 at end
            pageOffset = 2; // Start mapping from page index 2 (Page 3)
        }

        const paddedPageCount = Math.ceil(processingPages / 4) * 4;
        const pairs = getBookletPagePairs(sheetIndex, paddedPageCount);
        
        // Helper to resolve mapped index or null
        const resolve = (pIndex) => {
            if (pIndex > processingPages - 1) return null;
            return pIndex + 1 + pageOffset;
        };

        const singleRowFront = [resolve(pairs.front[0]), resolve(pairs.front[1])];
        const singleRowBack = [resolve(pairs.back[0]), resolve(pairs.back[1])];

        // [FIX] Repeat the booklet spread for the number of rows specified
        // If rows=2, we want [Left, Right, Left, Right]
        for (let r = 0; r < rows; r++) {
            frontPages.push(...singleRowFront);
            backPages.push(...singleRowBack);
        }
        
        return { front: frontPages, back: backPages };
    }

    // --- Standard Logic for Stack/Repeat ---

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