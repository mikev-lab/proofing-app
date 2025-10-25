export const INCH_TO_POINTS = 72;
export const MM_TO_POINTS = 2.83465;

// Define standard paper sizes with dimensions in millimeters
export const STANDARD_PAPER_SIZES = {
    // ISO A Series
    'A0': { name: 'A0', width_mm: 841, height_mm: 1189, group: 'ISO A' },
    'A1': { name: 'A1', width_mm: 594, height_mm: 841, group: 'ISO A' },
    'A2': { name: 'A2', width_mm: 420, height_mm: 594, group: 'ISO A' },
    'A3': { name: 'A3', width_mm: 297, height_mm: 420, group: 'ISO A' },
    'A4': { name: 'A4', width_mm: 210, height_mm: 297, group: 'ISO A' },
    'A5': { name: 'A5', width_mm: 148, height_mm: 210, group: 'ISO A' },
    'A6': { name: 'A6', width_mm: 105, height_mm: 148, group: 'ISO A' },
    // ISO B Series
    'B0': { name: 'B0', width_mm: 1000, height_mm: 1414, group: 'ISO B' },
    'B1': { name: 'B1', width_mm: 707, height_mm: 1000, group: 'ISO B' },
    'B2': { name: 'B2', width_mm: 500, height_mm: 707, group: 'ISO B' },
    'B3': { name: 'B3', width_mm: 353, height_mm: 500, group: 'ISO B' },
    'B4': { name: 'B4', width_mm: 250, height_mm: 353, group: 'ISO B' },
    'B5': { name: 'B5', width_mm: 176, height_mm: 250, group: 'ISO B' },
    'B6': { name: 'B6', width_mm: 125, height_mm: 176, group: 'ISO B' },
    // JIS B Series
    'JIS_B0': { name: 'JIS B0', width_mm: 1030, height_mm: 1456, group: 'JIS B' },
    'JIS_B1': { name: 'JIS B1', width_mm: 728, height_mm: 1030, group: 'JIS B' },
    'JIS_B2': { name: 'JIS B2', width_mm: 515, height_mm: 728, group: 'JIS B' },
    'JIS_B3': { name: 'JIS B3', width_mm: 364, height_mm: 515, group: 'JIS B' },
    'JIS_B4': { name: 'JIS B4', width_mm: 257, height_mm: 364, group: 'JIS B' },
    'JIS_B5': { name: 'JIS B5', width_mm: 182, height_mm: 257, group: 'JIS B' },
    'JIS_B6': { name: 'JIS B6', width_mm: 128, height_mm: 182, group: 'JIS B' },
    'JIS_B7': { name: 'JIS B7', width_mm: 91, height_mm: 128, group: 'JIS B' },
    // US Sizes
    'US_Letter': { name: 'Letter', width_mm: 215.9, height_mm: 279.4, group: 'US Standard' },
    'US_Legal': { name: 'Legal', width_mm: 215.9, height_mm: 355.6, group: 'US Standard' },
    'US_Tabloid': { name: 'Tabloid / Ledger', width_mm: 279.4, height_mm: 431.8, group: 'US Standard' },
    'US_Junior_Legal': { name: 'Junior Legal', width_mm: 127, height_mm: 203.2, group: 'US Standard' },
    // Common Business Cards
    'US_Business_Card': { name: 'US Business Card', width_mm: 88.9, height_mm: 50.8, group: 'Business Cards' },
    'EU_Business_Card': { name: 'EU Business Card', width_mm: 85, height_mm: 55, group: 'Business Cards' },
    'JP_Business_Card': { name: 'JP Business Card', width_mm: 91, height_mm: 55, group: 'Business Cards' },
    // Common Postcards
    'US_Postcard': { name: 'US Postcard', width_mm: 101.6, height_mm: 152.4, group: 'Postcards' },
    'US_Postcard_Large': { name: 'US Postcard Large', width_mm: 127, height_mm: 177.8, group: 'Postcards' },
    'A6_Postcard': { name: 'A6 Postcard', width_mm: 105, height_mm: 148, group: 'Postcards' },
};

/**
 * Gets the trim dimensions in points (pt) based on the dimension specification.
 * Handles standard size names (like 'A4', 'US_Letter'), custom dimension objects,
 * and legacy custom dimension strings (like '5x7').
 * @param {string|object} dimensionSpec - The dimension specification.
 * @returns {object|null} An object with { width, height } in points, or null if invalid.
 */
export function getTrimDimensions(dimensionSpec) {
    // Handle new custom dimension object { width, height, units }
    if (typeof dimensionSpec === 'object' && dimensionSpec !== null && dimensionSpec.units) {
        const { width, height, units } = dimensionSpec;
        if (units === 'in') {
            return {
                width: width * INCH_TO_POINTS,
                height: height * INCH_TO_POINTS,
            };
        } else if (units === 'mm') {
            return {
                width: width * MM_TO_POINTS,
                height: height * MM_TO_POINTS,
            };
        }
    }

    // Handle standard size string (e.g., 'A4', 'US_Letter')
    if (typeof dimensionSpec === 'string' && STANDARD_PAPER_SIZES[dimensionSpec]) {
        const size = STANDARD_PAPER_SIZES[dimensionSpec];
        return {
            width: size.width_mm * MM_TO_POINTS,
            height: size.height_mm * MM_TO_POINTS,
        };
    }

    // Handle legacy custom dimension string (e.g., "5x7" - assume inches)
    if (typeof dimensionSpec === 'string' && dimensionSpec.includes('x')) {
        const parts = dimensionSpec.toLowerCase().split('x');
        if (parts.length === 2) {
            const widthInches = parseFloat(parts[0]);
            const heightInches = parseFloat(parts[1]);
            if (!isNaN(widthInches) && !isNaN(heightInches)) {
                return {
                    width: widthInches * INCH_TO_POINTS,
                    height: heightInches * INCH_TO_POINTS,
                };
            }
        }
    }

    console.warn('Could not determine trim dimensions for spec:', dimensionSpec);
    return null; // Return null for invalid or unrecognized specs
}

/**
 * Draws a box on the canvas based on provided options.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 * @param {object} options - Drawing parameters.
 * @param {number} options.x - The top-left x-coordinate of the box.
 * @param {number} options.y - The top-left y-coordinate of the box.
 * @param {number} options.width - The width of the box.
 * @param {number} options.height - The height of the box.
 * @param {string} options.color - The stroke color for the box.
 * @param {number} [options.lineWidth=1] - The width of the line in pixels (will appear constant regardless of zoom).
 * @param {number[]} [options.dashPattern=[]] - An array for dashed lines in pixels (will appear constant regardless of zoom).
 */
function drawBox(ctx, { x, y, width, height, color, lineWidth = 1, dashPattern = [] }) {
    ctx.save();
    ctx.strokeStyle = color;
    // Apply line width and dash pattern independent of current transform scale
    const currentScale = ctx.getTransform().a; // Assuming uniform scaling (a=d)
    ctx.lineWidth = lineWidth / currentScale; // Counteract the scale
    ctx.setLineDash(dashPattern.map(d => d / currentScale)); // Counteract the scale
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
}

/**
 * Draws the trim guide based on calculated coordinates.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {object} params - The drawing parameters object.
 */
function drawTrimGuide(ctx, params) {
    drawBox(ctx, {
        x: params.trimX,
        y: params.trimY,
        width: params.trimWidth,
        height: params.trimHeight,
        color: 'black', // Trim is typically black or cyan
        lineWidth: 1 // Keep this thin
    });
}

/**
 * Draws the bleed guide based on calculated coordinates.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {object} params - The drawing parameters object.
 */
function drawBleedGuide(ctx, params) {
    drawBox(ctx, {
        x: params.bleedX,
        y: params.bleedY,
        width: params.bleedWidth,
        height: params.bleedHeight,
        color: 'red', // Bleed is typically red
        lineWidth: 1,
        dashPattern: [5, 5] // Dashed line
    });
}

/**
 * Draws the safety guide based on calculated coordinates.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {object} params - The drawing parameters object.
 */
function drawSafetyGuide(ctx, params) {
     drawBox(ctx, {
        x: params.safetyX,
        y: params.safetyY,
        width: params.safetyWidth,
        height: params.safetyHeight,
        color: 'green', // Safety is often green or blue
        lineWidth: 1,
        dashPattern: [5, 5] // Dashed line
    });
}


/**
 * Calculates guide positions and draws them for a single rendered page.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {object} specs - The project's print specifications.
 * @param {object} pageRenderInfo - Information about the specific page's rendered position and size {x, y, width, height, scale}.
 * @param {object} guideOptions - An object indicating which guides to show { trim, bleed, safety }.
 */
function drawGuidesForPage(ctx, specs, pageRenderInfo, guideOptions) {
    console.log("drawGuidesForPage - pageRenderInfo:", pageRenderInfo);

    if (!specs || !pageRenderInfo) {
        console.warn("drawGuidesForPage: Missing specs or pageRenderInfo.");
        return;
    }

    const trimDimensions = getTrimDimensions(specs.dimensions);
    if (!trimDimensions || trimDimensions.width <= 0 || trimDimensions.height <= 0) {
        console.warn("drawGuidesForPage: Invalid trim dimensions calculated from specs:", specs.dimensions);
        return;
    }

    // Get bleed and safety margins in points, defaulting to 0 if not specified or invalid
    const bleedPt = Math.max(0, specs.bleedInches ? specs.bleedInches * INCH_TO_POINTS : (specs.bleedMillimeters ? specs.bleedMillimeters * MM_TO_POINTS : 0));
    const safetyPt = Math.max(0, specs.safetyInches ? specs.safetyInches * INCH_TO_POINTS : (specs.safetyMillimeters ? specs.safetyMillimeters * MM_TO_POINTS : 0));

    console.log(`drawGuidesForPage - bleedPt: ${bleedPt}, safetyPt: ${safetyPt}`);

    // Use the scale provided by the viewer for this specific page
    const scale = pageRenderInfo.scale;
    if (!scale || scale <= 0) {
        console.warn("drawGuidesForPage: Invalid scale provided in pageRenderInfo:", scale);
        return;
    }

    // Calculate the dimensions of the trim box in *drawing* coordinates
    const trimDrawWidth = trimDimensions.width * scale;
    const trimDrawHeight = trimDimensions.height * scale;

    // Calculate the top-left corner (x, y) of the trim box, centered within the pageRenderInfo area
    const trimDrawX = pageRenderInfo.x + (pageRenderInfo.width - trimDrawWidth) / 2;
    const trimDrawY = pageRenderInfo.y + (pageRenderInfo.height - trimDrawHeight) / 2;

     console.log(`drawGuidesForPage - Trim Box - x: ${trimDrawX.toFixed(2)}, y: ${trimDrawY.toFixed(2)}, w: ${trimDrawWidth.toFixed(2)}, h: ${trimDrawHeight.toFixed(2)}`);


    // Calculate dimensions and positions for bleed and safety relative to the trim box
    const scaledBleed = bleedPt * scale;
    const scaledSafety = safetyPt * scale;

    const bleedDrawX = trimDrawX - scaledBleed;
    const bleedDrawY = trimDrawY - scaledBleed;
    const bleedDrawWidth = trimDrawWidth + (2 * scaledBleed);
    const bleedDrawHeight = trimDrawHeight + (2 * scaledBleed);

    const safetyDrawX = trimDrawX + scaledSafety;
    const safetyDrawY = trimDrawY + scaledSafety;
    const safetyDrawWidth = trimDrawWidth - (2 * scaledSafety);
    const safetyDrawHeight = trimDrawHeight - (2 * scaledSafety);

    const guideParams = {
        trimX: trimDrawX,
        trimY: trimDrawY,
        trimWidth: trimDrawWidth,
        trimHeight: trimDrawHeight,
        bleedX: bleedDrawX,
        bleedY: bleedDrawY,
        bleedWidth: bleedDrawWidth,
        bleedHeight: bleedDrawHeight,
        safetyX: safetyDrawX,
        safetyY: safetyDrawY,
        safetyWidth: safetyDrawWidth,
        safetyHeight: safetyDrawHeight,
    };

    // Draw the guides based on options
    if (guideOptions.trim) {
        console.log("Drawing Trim Guide...");
        drawTrimGuide(ctx, guideParams);
    }
    if (guideOptions.bleed && bleedPt > 0) {
         console.log(`Drawing Bleed Guide - x: ${bleedDrawX.toFixed(2)}, y: ${bleedDrawY.toFixed(2)}, w: ${bleedDrawWidth.toFixed(2)}, h: ${bleedDrawHeight.toFixed(2)}`);
        drawBleedGuide(ctx, guideParams);
    } else {
         console.log("Skipping Bleed Guide draw (bleedPt <= 0)");
    }
    if (guideOptions.safety && safetyPt > 0) {
        // Ensure safety dimensions are positive before drawing
        if (safetyDrawWidth > 0 && safetyDrawHeight > 0) {
             console.log(`Drawing Safety Guide - x: ${safetyDrawX.toFixed(2)}, y: ${safetyDrawY.toFixed(2)}, w: ${safetyDrawWidth.toFixed(2)}, h: ${safetyDrawHeight.toFixed(2)}`);
            drawSafetyGuide(ctx, guideParams);
        } else {
             console.warn("Skipping Safety Guide draw (calculated width/height is zero or negative)");
        }
    } else {
         console.log("Skipping Safety Guide draw (safetyPt <= 0)");
    }
}


/**
 * Main function to draw all selected guides onto the canvas. Iterates through pages if needed.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {object} specs - The project's print specifications.
 * @param {Array<object>} pageRenderInfos - An array of render info objects for each page in the current view [{x, y, width, height, scale}, ...].
 * @param {object} guideOptions - An object indicating which guides to show { trim, bleed, safety }.
 */
export function drawGuides(ctx, specs, pageRenderInfos, guideOptions) {
    // Check if pageRenderInfos is a valid array
    if (!Array.isArray(pageRenderInfos) || pageRenderInfos.length === 0) {
        console.error("drawGuides expects an array of pageRenderInfos.");
        return;
    }

    // Loop through each page's render info and draw guides for it
    pageRenderInfos.forEach((pageInfo, index) => {
        console.log(`Drawing guides for page index ${index}`);
        drawGuidesForPage(ctx, specs, pageInfo, guideOptions);
    });
}