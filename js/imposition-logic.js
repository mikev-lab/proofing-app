// js/imposition-logic.js

export const INCH_TO_POINTS = 72;

export const SHEET_SIZES = [
    // US Sizes
    { name: "Letter (8.5 x 11 in)", longSideInches: 11, shortSideInches: 8.5 },
    { name: "Legal (8.5 x 14 in)", longSideInches: 14, shortSideInches: 8.5 },
    { name: "Tabloid (11 x 17 in)", longSideInches: 17, shortSideInches: 11 },
    { name: "Digital Press (12 x 18 in)", longSideInches: 18, shortSideInches: 12 },
    { name: "Super B (13 x 19 in)", longSideInches: 19, shortSideInches: 13 },
    // International 'A' Sizes (ISO 216)
    { name: "A4 (210 x 297 mm)", longSideInches: 11.69, shortSideInches: 8.27 },
    { name: "A3 (297 x 420 mm)", longSideInches: 16.54, shortSideInches: 11.69 },
    { name: "A2 (420 x 594 mm)", longSideInches: 23.39, shortSideInches: 16.54 },
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

export function maximizeNUp(docWidth, docHeight) {
    let bestLayout = {
        count: 0,
        waste: Infinity,
        sheet: null,
        sheetOrientation: null,
        docRotated: false,
        columns: 0,
        rows: 0,
    };

    for (const sheet of SHEET_SIZES) {
        const longSide = sheet.longSideInches * INCH_TO_POINTS;
        const shortSide = sheet.shortSideInches * INCH_TO_POINTS;

        const portraitLayout = calculateLayout(docWidth, docHeight, shortSide, longSide);
        if (portraitLayout.count > bestLayout.count || (portraitLayout.count === bestLayout.count && portraitLayout.waste < bestLayout.waste)) {
            bestLayout = {
                ...portraitLayout,
                sheet: sheet,
                sheetOrientation: 'portrait',
            };
        }

        const landscapeLayout = calculateLayout(docWidth, docHeight, longSide, shortSide);
        if (landscapeLayout.count > bestLayout.count || (landscapeLayout.count === bestLayout.count && landscapeLayout.waste < bestLayout.waste)) {
            bestLayout = {
                ...landscapeLayout,
                sheet: sheet,
                sheetOrientation: 'landscape',
            };
        }
    }

    if (bestLayout.count === 0) {
        return null; // Return null if no fit is found
    }

    return {
        columns: bestLayout.columns,
        rows: bestLayout.rows,
        sheet: bestLayout.sheet.name,
        sheetOrientation: bestLayout.sheetOrientation,
        bleedInches: 0.125,
        horizontalGutterInches: 0,
        verticalGutterInches: 0,
        impositionType: 'stack',
    };
}
