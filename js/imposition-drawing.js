// js/imposition-drawing.js
import { INCH_TO_POINTS } from './imposition-logic.js';

const CROP_MARK_LENGTH_POINTS = 18;
const CROP_MARK_OFFSET_POINTS = 9;
const CROP_MARK_THICKNESS_POINTS = 0.5;

export function drawCropMarks(ctx, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, options = {}) {
    ctx.strokeStyle = 'black'; // Use a simple color for canvas preview
    ctx.lineWidth = CROP_MARK_THICKNESS_POINTS;

    const { hasTopNeighbor, hasBottomNeighbor, hasLeftNeighbor, hasRightNeighbor } = options;

    if (!hasTopNeighbor) {
        ctx.beginPath();
        ctx.moveTo(trimAreaX, trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS);
        ctx.lineTo(trimAreaX, trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS);
        ctx.moveTo(trimAreaX + trimAreaWidth, trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS);
        ctx.lineTo(trimAreaX + trimAreaWidth, trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS);
        ctx.stroke();
    }
    // ... (repeat for other sides)
}

export function drawSlugInfo(ctx, sheetWidth, jobInfo) {
    ctx.fillStyle = 'black';
    ctx.font = '10px sans-serif';
    ctx.fillText(`Job: ${jobInfo.projectName}`, 10, sheetHeight - 10);
}
