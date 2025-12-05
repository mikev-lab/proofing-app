// website/app/lib/guides.ts

export const INCH_TO_POINTS = 72;
export const MM_TO_POINTS = 2.83465;

export interface Dimensions {
    width: number;
    height: number;
    units?: 'in' | 'mm';
}

export interface ProjectSpecs {
    dimensions: Dimensions | string;
    bleedInches?: number;
    bleed?: number;
    safetyInches?: number;
    readingDirection?: 'ltr' | 'rtl';
    [key: string]: any;
}

export interface PageRenderInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    isSpread: boolean;
    isLeftPage: boolean;
}

export interface GuideOptions {
    trim: boolean;
    bleed: boolean;
    safety: boolean;
}

export const STANDARD_PAPER_SIZES: Record<string, { name: string; width_mm: number; height_mm: number; group: string }> = {
    // ISO A Series
    'A0': { name: 'A0', width_mm: 841, height_mm: 1189, group: 'ISO A' },
    'A1': { name: 'A1', width_mm: 594, height_mm: 841, group: 'ISO A' },
    'A2': { name: 'A2', width_mm: 420, height_mm: 594, group: 'ISO A' },
    'A3': { name: 'A3', width_mm: 297, height_mm: 420, group: 'ISO A' },
    'A4': { name: 'A4', width_mm: 210, height_mm: 297, group: 'ISO A' },
    'A5': { name: 'A5', width_mm: 148, height_mm: 210, group: 'ISO A' },
    'A6': { name: 'A6', width_mm: 105, height_mm: 148, group: 'ISO A' },
    // US Sizes
    'US_Letter': { name: 'Letter', width_mm: 215.9, height_mm: 279.4, group: 'US Standard' },
    'US_Legal': { name: 'Legal', width_mm: 215.9, height_mm: 355.6, group: 'US Standard' },
    'US_Tabloid': { name: 'Tabloid / Ledger', width_mm: 279.4, height_mm: 431.8, group: 'US Standard' },
    // ... Add others as needed
};

export function getTrimDimensions(dimensionSpec: Dimensions | string): { width: number; height: number } | null {
    if (typeof dimensionSpec === 'object' && dimensionSpec !== null && dimensionSpec.units) {
        const { width, height, units } = dimensionSpec;
        const w = typeof width === 'string' ? parseFloat(width) : width;
        const h = typeof height === 'string' ? parseFloat(height) : height;

        if (units === 'in') {
            return { width: w * INCH_TO_POINTS, height: h * INCH_TO_POINTS };
        } else if (units === 'mm') {
            return { width: w * MM_TO_POINTS, height: h * MM_TO_POINTS };
        }
    }

    if (typeof dimensionSpec === 'string') {
        if (STANDARD_PAPER_SIZES[dimensionSpec]) {
            const size = STANDARD_PAPER_SIZES[dimensionSpec];
            return { width: size.width_mm * MM_TO_POINTS, height: size.height_mm * MM_TO_POINTS };
        }
        if (dimensionSpec.includes('x')) {
            const parts = dimensionSpec.toLowerCase().split('x');
            if (parts.length === 2) {
                const w = parseFloat(parts[0]);
                const h = parseFloat(parts[1]);
                if (!isNaN(w) && !isNaN(h)) {
                    return { width: w * INCH_TO_POINTS, height: h * INCH_TO_POINTS };
                }
            }
        }
    }
    return null;
}

function calculatePageGuideGeometries(specs: ProjectSpecs, pageRenderInfo: PageRenderInfo) {
    if (!specs || !pageRenderInfo) return null;

    const trimDimensions = getTrimDimensions(specs.dimensions);
    if (!trimDimensions || trimDimensions.width <= 0 || trimDimensions.height <= 0) return null;

    const bleedInches = (specs.bleedInches !== undefined && specs.bleedInches !== null) ? Number(specs.bleedInches) : 0.125;
    const safetyInches = (specs.safetyInches !== undefined && specs.safetyInches !== null) ? Number(specs.safetyInches) : 0.125;

    const bleedPt = Math.max(0, bleedInches * INCH_TO_POINTS);
    const safetyPt = Math.max(0, safetyInches * INCH_TO_POINTS);

    const { scale, isSpread, isLeftPage, x: renderX, y: renderY, width: renderWidth, height: renderHeight } = pageRenderInfo;

    if (!scale || scale <= 0) return null;

    const scaledTrimWidth = trimDimensions.width * scale;
    const scaledTrimHeight = trimDimensions.height * scale;
    const scaledBleed = bleedPt * scale;
    const scaledSafety = safetyPt * scale;

    const centerY = renderY + renderHeight / 2;

    // 1. Trim Box
    let trimX, trimY = centerY - scaledTrimHeight / 2;

    if (isSpread) {
        if (isLeftPage) {
            trimX = renderX + renderWidth - scaledTrimWidth;
        } else {
            trimX = renderX;
        }
    } else {
        trimX = renderX + (renderWidth - scaledTrimWidth) / 2;
    }
    const trimBox = { x: trimX, y: trimY, width: scaledTrimWidth, height: scaledTrimHeight };

    // 2. Bleed Box
    let bleedX = trimX - scaledBleed;
    let bleedY = trimY - scaledBleed;
    let bleedWidth = scaledTrimWidth + 2 * scaledBleed;
    let bleedHeight = scaledTrimHeight + 2 * scaledBleed;
    let clippedSide: 'left' | 'right' | null = null;

    if (isSpread) {
        if (isLeftPage) {
            const maxX = trimX + scaledTrimWidth;
            bleedWidth = maxX - bleedX;
            clippedSide = 'right';
        } else {
            const minX = trimX;
            bleedWidth = (bleedX + bleedWidth) - minX;
            bleedX = minX;
            clippedSide = 'left';
        }
    }
    const bleedBox = { x: bleedX, y: bleedY, width: bleedWidth, height: bleedHeight, clippedSide };

    // 3. Safety Box
    const safetyX = trimX + scaledSafety;
    const safetyY = trimY + scaledSafety;
    const safetyWidth = scaledTrimWidth - 2 * scaledSafety;
    const safetyHeight = scaledTrimHeight - 2 * scaledSafety;
    const safetyBox = { x: safetyX, y: safetyY, width: safetyWidth, height: safetyHeight };

    return { trimBox, bleedBox, safetyBox };
}

function drawBox(ctx: CanvasRenderingContext2D, { x, y, width, height, color, lineWidth = 1, dashPattern = [], clippedSide }: any) {
    if (width <= 0 || height <= 0) return;
    ctx.save();
    ctx.strokeStyle = color;

    // Use CSS pixel scale
    const currentScale = 1;

    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dashPattern);

    // Always draw full box for Trim and Safety, even if clipped, to show spine line.
    // If it's Bleed, `clippedSide` is handled in `drawBleedVisuals`.
    // But `drawBox` is generic.
    // The previous implementation used strokeRect, which draws all 4 sides.
    // That should be correct for Trim/Safety.
    // If the box is clipped by CSS on the page wrapper, this canvas overlay (which is NOT clipped)
    // should show the line crossing the spine.

    ctx.strokeRect(x, y, width, height);
    ctx.restore();
}

function drawBleedVisuals(ctx: CanvasRenderingContext2D, trimBox: any, bleedBox: any) {
    const { x: bleedX, y: bleedY, width: bleedWidth, height: bleedHeight, clippedSide } = bleedBox;
    const { x: trimX, y: trimY, width: trimWidth, height: trimHeight } = trimBox;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.rect(bleedX, bleedY, bleedWidth, bleedHeight);
    ctx.rect(trimX + trimWidth, trimY, -trimWidth, trimHeight); // Counter-clockwise to create hole
    ctx.fill();

    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (!clippedSide) {
        ctx.rect(bleedX, bleedY, bleedWidth, bleedHeight);
    } else {
        if (clippedSide === 'right') {
            ctx.moveTo(bleedX + bleedWidth, bleedY);
            ctx.lineTo(bleedX, bleedY);
            ctx.lineTo(bleedX, bleedY + bleedHeight);
            ctx.lineTo(bleedX + bleedWidth, bleedY + bleedHeight);
        } else if (clippedSide === 'left') {
            ctx.moveTo(bleedX, bleedY);
            ctx.lineTo(bleedX + bleedWidth, bleedY);
            ctx.lineTo(bleedX + bleedWidth, bleedY + bleedHeight);
            ctx.lineTo(bleedX, bleedY + bleedHeight);
        }
    }
    ctx.stroke();
    ctx.restore();
}

export function drawGuides(ctx: CanvasRenderingContext2D, specs: ProjectSpecs, pageRenderInfos: PageRenderInfo[], guideOptions: GuideOptions) {
    if (!pageRenderInfos || pageRenderInfos.length === 0) return;

    pageRenderInfos.forEach(pageInfo => {
        const geometries = calculatePageGuideGeometries(specs, pageInfo);
        if (!geometries) return;

        const { trimBox, bleedBox, safetyBox } = geometries;

        if (guideOptions.trim) drawBox(ctx, { ...trimBox, color: 'black', lineWidth: 1 });
        if (guideOptions.bleed) drawBleedVisuals(ctx, trimBox, bleedBox);
        if (guideOptions.safety) drawBox(ctx, { ...safetyBox, color: 'green', lineWidth: 1, dashPattern: [5, 5] });
    });
}

// Hit Detection Logic
function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function isPointNearRect(px: number, py: number, rect: any, tolerance = 10) {
    const { x, y, width, height, clippedSide } = rect;
    const right = x + width;
    const bottom = y + height;
    const dists = [];

    if (clippedSide !== 'right') dists.push(distanceToSegment(px, py, right, y, right, bottom));
    if (clippedSide !== 'left') dists.push(distanceToSegment(px, py, x, y, x, bottom));
    dists.push(distanceToSegment(px, py, x, y, right, y));
    dists.push(distanceToSegment(px, py, x, bottom, right, bottom));

    return Math.min(...dists) <= tolerance;
}

export function getGuideHit(x: number, y: number, specs: ProjectSpecs, pageRenderInfos: PageRenderInfo[], guideOptions: GuideOptions) {
    const HIT_TOLERANCE = 5;
    for (const pageInfo of pageRenderInfos) {
        const geom = calculatePageGuideGeometries(specs, pageInfo);
        if (!geom) continue;

        if (guideOptions.safety && isPointNearRect(x, y, geom.safetyBox, HIT_TOLERANCE)) {
            return { title: "Safety Line (Green)", description: "Keep important text and logos inside this line." };
        }
        if (guideOptions.trim && isPointNearRect(x, y, geom.trimBox, HIT_TOLERANCE)) {
            return { title: "Trim Line (Black)", description: "Where the page will be cut." };
        }
        if (guideOptions.bleed && isPointNearRect(x, y, geom.bleedBox, HIT_TOLERANCE)) {
            return { title: "Bleed Line (Red)", description: "Background artwork must extend to this line." };
        }
    }
    return null;
}
