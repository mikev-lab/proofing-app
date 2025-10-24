export const INCH_TO_POINTS = 72;
export const MM_TO_POINTS = 2.83465;

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

export function getTrimDimensions(dimensionSpec) {
    // Handle new custom dimension object
    if (typeof dimensionSpec === 'object' && dimensionSpec !== null) {
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

    // Handle standard size string
    if (typeof dimensionSpec === 'string' && STANDARD_PAPER_SIZES[dimensionSpec]) {
        const size = STANDARD_PAPER_SIZES[dimensionSpec];
        return {
            width: size.width_mm * MM_TO_POINTS,
            height: size.height_mm * MM_TO_POINTS,
        };
    }

    // Handle legacy custom dimension string (e.g., "5x7")
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
    return null; // Or return a default/error state
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
 * @param {number} [options.lineWidth=1] - The width of the line.
 * @param {number[]} [options.dashPattern=[]] - An array for dashed lines.
 */
function drawBox(ctx, { x, y, width, height, color, lineWidth = 1, dashPattern = [] }) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth / ctx.getTransform().a; // Descale line width
    ctx.setLineDash(dashPattern.map(d => d / ctx.getTransform().a)); // Descale dash pattern
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
}

/**
 * Draws the trim guide based on calculated coordinates.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {object} options - The drawing options object.
 */
export function drawTrimGuide(ctx, options) {
    // Trim guide is the exact boundary of the PDF page's image on the canvas
    drawBox(ctx, {
        x: options.drawX,
        y: options.drawY,
        width: options.drawWidth,
        height: options.drawHeight,
        color: 'cyan',
        lineWidth: 1
    });
}

/**
 * Main function to draw all selected guides onto the canvas.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {object} specs - The project's print specifications.
 * @param {object} renderInfo - Information about the PDF's rendered position and size.
 * @param {object} transformState - The current zoom and pan state.
 * @param {string} viewMode - The current view mode ('single' or 'spread').
 * @param {number} pageNum - The current page or view number.
 * @param {number} numPagesInView - The number of pages in the current view (1 or 2).
 * @param {PDFPageViewport} page1Viewport - The viewport for the first page in the view.
 * @param {PDFPageViewport} [page2Viewport=null] - The viewport for the second page in the view.
 * @param {object} guideOptions - An object indicating which guides to show.
 * @param {boolean} guideOptions.trim - Whether to show the trim guide.
 * @param {boolean} guideOptions.bleed - Whether to show the bleed guide.
 * @param {boolean} guideOptions.safety - Whether to show the safety guide.
 */
export function drawGuides(ctx, specs, renderInfo, guideOptions) {
    if (!specs || !renderInfo) return;

    const trimDimensions = getTrimDimensions(specs.dimensions);
    if (!trimDimensions) return;

    const options = {
        drawX: renderInfo.x,
        drawY: renderInfo.y,
        drawWidth: renderInfo.width,
        drawHeight: renderInfo.height,
        trimWidthPt: trimDimensions.width,
        trimHeightPt: trimDimensions.height,
        bleedPt: specs.bleedInches ? specs.bleedInches * INCH_TO_POINTS : (specs.bleedMillimeters ? specs.bleedMillimeters * MM_TO_POINTS : 0),
        safetyPt: specs.safetyInches ? specs.safetyInches * INCH_TO_POINTS : (specs.safetyMillimeters ? specs.safetyMillimeters * MM_TO_POINTS : 0),
    };

    if (guideOptions.trim) {
        drawTrimGuide(ctx, options);
    }
    if (guideOptions.bleed && options.bleedPt > 0) {
        drawBleedGuide(ctx, options);
    }
    if (guideOptions.safety && options.safetyPt > 0) {
        drawSafetyGuide(ctx, options);
    }
}

/**
 * Draws the bleed guide based on calculated coordinates.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {object} options - The drawing options object.
 */
export function drawBleedGuide(ctx, options) {
    const scale = options.drawWidth / options.trimWidthPt;
    const bleedOffset = options.bleedPt * scale;

    drawBox(ctx, {
        x: options.drawX - bleedOffset,
        y: options.drawY - bleedOffset,
        width: options.drawWidth + (2 * bleedOffset),
        height: options.drawHeight + (2 * bleedOffset),
        color: 'magenta',
        lineWidth: 1,
        dashPattern: [5, 5]
    });
}

/**
 * Draws the safety guide based on calculated coordinates.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {object} options - The drawing options object.
 */
export function drawSafetyGuide(ctx, options) {
    const scale = options.drawWidth / options.trimWidthPt;
    const safetyOffset = options.safetyPt * scale;

    drawBox(ctx, {
        x: options.drawX + safetyOffset,
        y: options.drawY + safetyOffset,
        width: options.drawWidth - (2 * safetyOffset),
        height: options.drawHeight - (2 * safetyOffset),
        color: 'yellow',
        lineWidth: 1,
        dashPattern: [5, 5]
    });
}
