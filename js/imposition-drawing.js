// js/imposition-drawing.js
import {
    INCH_TO_POINTS, CROP_MARK_LENGTH_POINTS, CROP_MARK_OFFSET_POINTS, CROP_MARK_THICKNESS_POINTS,
    SLUG_AREA_MARGIN_POINTS, QR_CODE_SIZE_POINTS, SLUG_TEXT_FONT_SIZE_POINTS, SLUG_TEXT_QR_PADDING_POINTS,
    SLUG_AREA_BOTTOM_Y_POINTS, QR_GENERATION_PIXEL_SIZE
} from './constants.js';

// Helper to convert base64 data URL to an Image object for canvas drawing
function base64ToImage(base64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = `data:image/png;base64,${base64}`;
  });
}

function formatDateForSlug(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() + userTimezoneOffset);
        const month = (localDate.getMonth() + 1).toString().padStart(2, '0');
        const day = localDate.getDate().toString().padStart(2, '0');
        const year = localDate.getFullYear().toString().slice(-2);
        return `${month}/${day}/${year}`;
    } catch (e) {
        return dateString;
    }
}


export function drawCropMarks(ctx, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, options = {}) {
    ctx.save();
    ctx.strokeStyle = '#000000'; // Registration Black for preview
    ctx.lineWidth = CROP_MARK_THICKNESS_POINTS;

    const { hasTopNeighbor, hasBottomNeighbor, hasLeftNeighbor, hasRightNeighbor } = options;

    ctx.beginPath();
    // TOP
    if (!hasTopNeighbor) {
        ctx.moveTo(trimAreaX, trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS);
        ctx.lineTo(trimAreaX, trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS);
        ctx.moveTo(trimAreaX + trimAreaWidth, trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS);
        ctx.lineTo(trimAreaX + trimAreaWidth, trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS);
    }
    // BOTTOM
    if (!hasBottomNeighbor) {
        ctx.moveTo(trimAreaX, trimAreaY - CROP_MARK_OFFSET_POINTS);
        ctx.lineTo(trimAreaX, trimAreaY - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS);
        ctx.moveTo(trimAreaX + trimAreaWidth, trimAreaY - CROP_MARK_OFFSET_POINTS);
        ctx.lineTo(trimAreaX + trimAreaWidth, trimAreaY - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS);
    }
    // LEFT
    if (!hasLeftNeighbor) {
        ctx.moveTo(trimAreaX - CROP_MARK_OFFSET_POINTS, trimAreaY + trimAreaHeight);
        ctx.lineTo(trimAreaX - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS, trimAreaY + trimAreaHeight);
        ctx.moveTo(trimAreaX - CROP_MARK_OFFSET_POINTS, trimAreaY);
        ctx.lineTo(trimAreaX - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS, trimAreaY);
    }
    // RIGHT
    if (!hasRightNeighbor) {
        ctx.moveTo(trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS, trimAreaY + trimAreaHeight);
        ctx.lineTo(trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS, trimAreaY + trimAreaHeight);
        ctx.moveTo(trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS, trimAreaY);
        ctx.lineTo(trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS, trimAreaY);
    }
    ctx.stroke();
    ctx.restore();
}

export async function drawSlugInfo(ctx, currentSheetId, totalSheets, jobInfo, position = 'bottomLeft') {
    if (!window.QRious) {
        console.error("QRious library not loaded.");
        return;
    }
    ctx.save();
    ctx.fillStyle = 'black';

    const sheetWidth = ctx.canvas.width;
    const sheetHeight = ctx.canvas.height;

    let qrX, qrY, textX, textAnchor;

    switch (position) {
        case 'topLeft':
            qrX = SLUG_AREA_MARGIN_POINTS;
            qrY = SLUG_AREA_MARGIN_POINTS;
            textX = qrX + QR_CODE_SIZE_POINTS + SLUG_TEXT_QR_PADDING_POINTS;
            textAnchor = 'left';
            break;
        case 'topRight':
            qrX = sheetWidth - QR_CODE_SIZE_POINTS - SLUG_AREA_MARGIN_POINTS;
            qrY = SLUG_AREA_MARGIN_POINTS;
            textX = qrX - SLUG_TEXT_QR_PADDING_POINTS;
            textAnchor = 'right';
            break;
        case 'bottomRight':
            qrX = sheetWidth - QR_CODE_SIZE_POINTS - SLUG_AREA_MARGIN_POINTS;
            qrY = sheetHeight - QR_CODE_SIZE_POINTS - SLUG_AREA_MARGIN_POINTS;
            textX = qrX - SLUG_TEXT_QR_PADDING_POINTS;
            textAnchor = 'right';
            break;
        default: // bottomLeft
            qrX = SLUG_AREA_MARGIN_POINTS;
            qrY = sheetHeight - QR_CODE_SIZE_POINTS - SLUG_AREA_MARGIN_POINTS;
            textX = qrX + QR_CODE_SIZE_POINTS + SLUG_TEXT_QR_PADDING_POINTS;
            textAnchor = 'left';
            break;
    }


    const trimSize = (jobInfo.specs?.dimensions?.width && jobInfo.specs?.dimensions?.height)
        ? `${jobInfo.specs.dimensions.width}x${jobInfo.specs.dimensions.height}`
        : 'N/A';
    const dueDateSlug = formatDateForSlug(jobInfo.dueDate);
    const qty = jobInfo.quantity || 'N/A';
    const jobName = jobInfo.projectName || "Job";

    const slugText = `Sheet: ${currentSheetId} of ${totalSheets} | Job: ${jobName.substring(0,20)} | Qty: ${qty} | Due: ${dueDateSlug} | Trim: ${trimSize}`;

    // For canvas, we can't easily get comprehensive job info, so we use a simplified QR
    let qrData = `Sheet: ${currentSheetId}/${totalSheets}\nJobID: ${jobInfo.projectName || 'N/A'}`;

    try {
        const qr = new window.QRious({ value: qrData, size: QR_GENERATION_PIXEL_SIZE, level: 'M' });
        const qrImage = await base64ToImage(qr.toDataURL('image/png').split(',')[1]);
        ctx.drawImage(qrImage, qrX, qrY, QR_CODE_SIZE_POINTS, QR_CODE_SIZE_POINTS);
    } catch (qrError) {
        console.error("Failed to generate or embed QR code:", qrError);
        ctx.strokeStyle = 'black';
        ctx.strokeRect(qrX, qrY, QR_CODE_SIZE_POINTS, QR_CODE_SIZE_POINTS);
        ctx.fillText("QR ERR", qrX + 10, qrY + 20);
    }

    ctx.font = `${SLUG_TEXT_FONT_SIZE_POINTS}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = textAnchor;
    ctx.fillText(slugText, textX, qrY + (QR_CODE_SIZE_POINTS / 2));

    ctx.restore();
}

export function drawSpineIndicator(ctx, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, isSpineOnLeft) {
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.lineWidth = CROP_MARK_THICKNESS_POINTS;

    const TRIANGLE_HEIGHT = 5;
    const TRIANGLE_BASE = 7;
    const TEXT_SIZE = 5;
    const TEXT_OFFSET_Y = 1;
    const INDICATOR_OFFSET_FROM_CROP = 5;

    const indicatorY = trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS + INDICATOR_OFFSET_FROM_CROP;
    const xCenter = isSpineOnLeft ? trimAreaX : trimAreaX + trimAreaWidth;

    ctx.beginPath();
    ctx.moveTo(xCenter - TRIANGLE_BASE / 2, indicatorY);
    ctx.lineTo(xCenter + TRIANGLE_BASE / 2, indicatorY);
    ctx.lineTo(xCenter, indicatorY - TRIANGLE_HEIGHT);
    ctx.closePath();
    ctx.stroke();

    ctx.font = `${TEXT_SIZE}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText("SPINE", xCenter, indicatorY + TEXT_OFFSET_Y + TEXT_SIZE);
    ctx.restore();
};

export function drawSpineSlugText(ctx, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, isSpineOnLeft, isFrontSide, bleedPoints) {
    ctx.save();
    ctx.fillStyle = '#000000';
    const TEXT_SIZE = 5;
    ctx.font = `${TEXT_SIZE}px sans-serif`;

    const label = isFrontSide ? 'FRONT SPINE' : 'BACK SPINE';
    const gapFromBleedEdge = CROP_MARK_OFFSET_POINTS;
    let x;

    ctx.translate(0, trimAreaY); // Move origin to the bottom of the trim area
    ctx.rotate(-Math.PI / 2); // Rotate counter-clockwise for vertical text

    if (isSpineOnLeft) {
        x = -(trimAreaX - bleedPoints - gapFromBleedEdge);
        ctx.textAlign = 'right';
    } else {
        x = -(trimAreaX + trimAreaWidth + bleedPoints + gapFromBleedEdge);
        ctx.textAlign = 'left';
    }

    ctx.fillText(label, 0, x);

    ctx.restore();
};
