export const INCH_TO_POINTS = 72;
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
