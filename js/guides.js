const INCH_TO_POINTS = 72;
const MM_TO_POINTS = 2.83465;

const STANDARD_PAPER_SIZES = {
    // Millimeters for precision, will be converted to points
    'A5': { width: 148, height: 210 },
    'B5': { width: 182, height: 257 },
    'US Manga': { width: 127, height: 191 }, // 5 x 7.5 inches
    'Light Novel': { width: 130, height: 188 }, // 5.12 x 7.4 inches
    'US Comic': { width: 168, height: 260 }, // 6.63 x 10.25 inches
};

/**
 * Parses the project's dimension spec and returns dimensions in points.
 * @param {string} dimensionSpec - The dimension string from project specs (e.g., "A5", "custom", "5x7").
 * @param {string} customDimensionValue - The custom dimension string (e.g., "5x7").
 * @returns {{width: number, height: number}} Dimensions in points.
 */
export function getTrimDimensions(dimensionSpec, customDimensionValue) {
    if (dimensionSpec === 'custom' && customDimensionValue) {
        const parts = customDimensionValue.toLowerCase().split('x');
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
    } else if (STANDARD_PAPER_SIZES[dimensionSpec]) {
        const size = STANDARD_PAPER_SIZES[dimensionSpec];
        return {
            width: size.width * MM_TO_POINTS,
            height: size.height * MM_TO_POINTS,
        };
    }
    console.warn('Could not determine trim dimensions for spec:', dimensionSpec);
    return null; // Or return a default/error state
}

/**
 * Draws a centered box on the canvas.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 * @param {number} canvasWidth - The width of the canvas.
 * @param {number} canvasHeight - The height of the canvas.
 * @param {number} boxWidth - The width of the box to draw (in points).
 * @param {number} boxHeight - The height of the box to draw (in points).
 * @param {string} color - The stroke color for the box.
 * @param {number} lineWidth - The width of the line.
 * @param {number[]} [dashPattern=[]] - An array for dashed lines, e.g., [5, 5].
 */
function drawCenteredBox(ctx, canvasWidth, canvasHeight, boxWidth, boxHeight, color, lineWidth, dashPattern = []) {
    const x = (canvasWidth - boxWidth) / 2;
    const y = (canvasHeight - boxHeight) / 2;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dashPattern);
    ctx.strokeRect(x, y, boxWidth, boxHeight);
    ctx.restore();
}

/**
 * Draws the trim guide.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {number} canvasWidth - The width of the canvas.
 * @param {number} canvasHeight - The height of the canvas.
 * @param {{width: number, height: number}} trimDimensions - The target trim dimensions in points.
 */
export function drawTrimGuide(ctx, canvasWidth, canvasHeight, trimDimensions) {
    drawCenteredBox(ctx, canvasWidth, canvasHeight, trimDimensions.width, trimDimensions.height, 'cyan', 1);
}

/**
 * Draws the bleed guide.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {number} canvasWidth - The width of the canvas.
 * @param {number} canvasHeight - The height of the canvas.
 * @param {{width: number, height: number}} trimDimensions - The target trim dimensions in points.
 */
export function drawBleedGuide(ctx, canvasWidth, canvasHeight, trimDimensions) {
    const bleedOffset = 0.125 * INCH_TO_POINTS;
    const bleedWidth = trimDimensions.width + (2 * bleedOffset);
    const bleedHeight = trimDimensions.height + (2 * bleedOffset);
    drawCenteredBox(ctx, canvasWidth, canvasHeight, bleedWidth, bleedHeight, 'magenta', 1, [5, 5]);
}

/**
 * Draws the safety guide.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {number} canvasWidth - The width of the canvas.
 * @param {number} canvasHeight - The height of the canvas.
 * @param {{width: number, height: number}} trimDimensions - The target trim dimensions in points.
 */
export function drawSafetyGuide(ctx, canvasWidth, canvasHeight, trimDimensions) {
    const safetyOffset = 0.125 * INCH_TO_POINTS;
    const safetyWidth = trimDimensions.width - (2 * safetyOffset);
    const safetyHeight = trimDimensions.height - (2 * safetyOffset);
    drawCenteredBox(ctx, canvasWidth, canvasHeight, safetyWidth, safetyHeight, 'yellow', 1, [5, 5]);
}
