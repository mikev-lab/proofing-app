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
 * Calculates the exact geometries for Trim, Bleed, and Safety boxes.
 * This logic is shared between drawing and hit-testing to ensure consistency.
 */
function calculatePageGuideGeometries(specs, pageRenderInfo) {
    if (!specs || !pageRenderInfo) return null;

    const trimDimensions = getTrimDimensions(specs.dimensions);
    if (!trimDimensions || trimDimensions.width <= 0 || trimDimensions.height <= 0) return null;

    // [FIX] Default to 0.125 if undefined/null. Only use 0 if explicitly set to 0.
    const bleedInches = (specs.bleedInches !== undefined && specs.bleedInches !== null) ? specs.bleedInches : 0.125;
    const safetyInches = (specs.safetyInches !== undefined && specs.safetyInches !== null) ? specs.safetyInches : 0.125;

    const bleedPt = Math.max(0, bleedInches * INCH_TO_POINTS);
    const safetyPt = Math.max(0, safetyInches * INCH_TO_POINTS);
    
    const scale = pageRenderInfo.scale;
    const { isSpread, isLeftPage, x: renderX, y: renderY, width: renderWidth, height: renderHeight } = pageRenderInfo;

    if (!scale || scale <= 0) return null;

    // Scaled dimensions
    const scaledTrimWidth = trimDimensions.width * scale;
    const scaledTrimHeight = trimDimensions.height * scale;
    const scaledBleed = bleedPt * scale;
    const scaledSafety = safetyPt * scale;

    const centerY = renderY + renderHeight / 2;

    // 1. Trim Box
    let trimX, trimY, trimWidth, trimHeight;
    trimY = centerY - scaledTrimHeight / 2;
    trimHeight = scaledTrimHeight;
    trimWidth = scaledTrimWidth;

    if (isSpread) {
        if (isLeftPage) {
            trimX = renderX + renderWidth - trimWidth;
        } else {
            trimX = renderX;
        }
    } else {
        trimX = renderX + (renderWidth - trimWidth) / 2;
    }
    const trimBox = { x: trimX, y: trimY, width: trimWidth, height: trimHeight };

    // 2. Bleed Box
    let bleedX = trimX - scaledBleed;
    let bleedY = trimY - scaledBleed;
    let bleedWidth = trimWidth + 2 * scaledBleed;
    let bleedHeight = trimHeight + 2 * scaledBleed;

    // Handle Spread Clipping for Bleed
    let clippedSide = null; 
    if (isSpread) {
        if (isLeftPage) {
            const maxX = trimX + trimWidth;
            bleedWidth = maxX - bleedX;
            clippedSide = 'right';
        } else {
            const minX = trimX;
            const originalRight = bleedX + bleedWidth;
            bleedX = minX;
            bleedWidth = originalRight - minX;
            clippedSide = 'left';
        }
    }
    const bleedBox = { x: bleedX, y: bleedY, width: bleedWidth, height: bleedHeight, clippedSide };

    // 3. Safety Box
    const safetyX = trimX + scaledSafety;
    const safetyY = trimY + scaledSafety;
    const safetyWidth = trimWidth - 2 * scaledSafety;
    const safetyHeight = trimHeight - 2 * scaledSafety;
    const safetyBox = { x: safetyX, y: safetyY, width: safetyWidth, height: safetyHeight };

    return { trimBox, bleedBox, safetyBox };
}


// --- Drawing Functions ---

function drawBox(ctx, { x, y, width, height, color, lineWidth = 1, dashPattern = [] }) {
    if (width <= 0 || height <= 0) return;
    ctx.save();
    ctx.strokeStyle = color;
    const currentScale = ctx.getTransform().a;
    ctx.lineWidth = lineWidth / currentScale;
    ctx.setLineDash(dashPattern.map(d => d / currentScale));
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
}

function drawBleedVisuals(ctx, trimBox, bleedBox) {
    const { x: bleedX, y: bleedY, width: bleedWidth, height: bleedHeight, clippedSide } = bleedBox;
    const { x: trimX, y: trimY, width: trimWidth, height: trimHeight } = trimBox;

    ctx.save();
    
    // Fill Danger Zone
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.rect(bleedX, bleedY, bleedWidth, bleedHeight); // Outer rect
    // Subtract Inner Trim Rect (Counter-Clockwise)
    ctx.rect(trimX + trimWidth, trimY, -trimWidth, trimHeight);
    ctx.fill();

    // Draw Border Line (Handling clipped side)
    ctx.strokeStyle = 'red';
    const currentScale = ctx.getTransform().a; 
    ctx.lineWidth = 1 / currentScale; 
    
    ctx.beginPath();
    if (!clippedSide) {
        ctx.rect(bleedX, bleedY, bleedWidth, bleedHeight);
    } else {
        if (clippedSide === 'right') {
            // Open on right: Top-Right -> Top-Left -> Bottom-Left -> Bottom-Right
            ctx.moveTo(bleedX + bleedWidth, bleedY); 
            ctx.lineTo(bleedX, bleedY);
            ctx.lineTo(bleedX, bleedY + bleedHeight);
            ctx.lineTo(bleedX + bleedWidth, bleedY + bleedHeight);
        } else if (clippedSide === 'left') {
             // Open on left: Top-Left -> Top-Right -> Bottom-Right -> Bottom-Left
             ctx.moveTo(bleedX, bleedY);
             ctx.lineTo(bleedX + bleedWidth, bleedY);
             ctx.lineTo(bleedX + bleedWidth, bleedY + bleedHeight);
             ctx.lineTo(bleedX, bleedY + bleedHeight);
        }
    }
    ctx.stroke();
    ctx.restore();
}

/**
 * Draws guides for a single page using shared geometry calculation.
 */
function drawGuidesForPage(ctx, specs, pageRenderInfo, guideOptions) {
    const geometries = calculatePageGuideGeometries(specs, pageRenderInfo);
    if (!geometries) return;

    const { trimBox, bleedBox, safetyBox } = geometries;

    if (guideOptions.trim) {
        drawBox(ctx, { ...trimBox, color: 'black', lineWidth: 1 });
    }
    if (guideOptions.bleed) {
        drawBleedVisuals(ctx, trimBox, bleedBox);
    }
    if (guideOptions.safety) {
        drawBox(ctx, { ...safetyBox, color: 'green', lineWidth: 1, dashPattern: [5, 5] });
    }
}

/**
 * Main function to draw all selected guides onto the canvas.
 */
export function drawGuides(ctx, specs, pageRenderInfos, guideOptions) {
    if (!Array.isArray(pageRenderInfos) || pageRenderInfos.length === 0) {
        console.error("drawGuides expects a non-empty array of pageRenderInfos.");
        return;
    }
    pageRenderInfos.forEach((pageInfo) => {
        drawGuidesForPage(ctx, specs, pageInfo, guideOptions);
    });
}

// --- Hit Detection for Tooltips ---

function distanceToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function isPointNearRect(px, py, rect, tolerance = 10) {
    const { x, y, width, height, clippedSide } = rect;
    const right = x + width;
    const bottom = y + height;

    // Check all 4 sides, unless clipped
    let dists = [];

    if (clippedSide !== 'right') {
        // Check Right side line
        dists.push(distanceToSegment(px, py, right, y, right, bottom));
    }
    if (clippedSide !== 'left') {
        // Check Left side line
        dists.push(distanceToSegment(px, py, x, y, x, bottom));
    }
    
    // Top and Bottom are always checked
    dists.push(distanceToSegment(px, py, x, y, right, y)); // Top
    dists.push(distanceToSegment(px, py, x, bottom, right, bottom)); // Bottom

    return Math.min(...dists) <= tolerance;
}

/**
 * Checks if a point hits any guide lines.
 * @param {number} x - X coordinate in canvas space (untransformed).
 * @param {number} y - Y coordinate in canvas space (untransformed).
 * @param {object} specs - Project specs.
 * @param {Array} pageRenderInfos - Array of page info.
 * @param {object} guideOptions - Active guides.
 * @returns {object|null} - { title, description } or null.
 */
export function getGuideHit(x, y, specs, pageRenderInfos, guideOptions) {
    if (!Array.isArray(pageRenderInfos)) return null;

    const HIT_TOLERANCE = 5; // Tolerance in base points

    for (const pageInfo of pageRenderInfos) {
        const geom = calculatePageGuideGeometries(specs, pageInfo);
        if (!geom) continue;

        // Check Safety (Priority 1)
        if (guideOptions.safety && isPointNearRect(x, y, geom.safetyBox, HIT_TOLERANCE)) {
            return {
                title: "Safety Line (Green)",
                description: "Keep important text and logos inside this line to prevent them from being trimmed off."
            };
        }

        // Check Trim (Priority 2)
        if (guideOptions.trim && isPointNearRect(x, y, geom.trimBox, HIT_TOLERANCE)) {
            return {
                title: "Trim Line (Black)",
                description: "This is where the page will be cut. Content outside this line will be removed."
            };
        }

        // Check Bleed (Priority 3)
        if (guideOptions.bleed && isPointNearRect(x, y, geom.bleedBox, HIT_TOLERANCE)) {
            return {
                title: "Bleed Line (Red)",
                description: "Background artwork must extend to this line to ensure edge-to-edge printing."
            };
        }
    }
    return null;
}