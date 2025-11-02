// js/constants.js
export const INCH_TO_POINTS = 72;

// --- Mark and Slug Constants ---
export const CROP_MARK_LENGTH_POINTS = 18;
export const CROP_MARK_OFFSET_POINTS = 9;
export const CROP_MARK_THICKNESS_POINTS = 0.5;

export const SLUG_AREA_MARGIN_POINTS = 18;
export const QR_CODE_SIZE_POINTS = 48; // Approx 2/3 inch
export const SLUG_TEXT_FONT_SIZE_POINTS = 8;
export const SLUG_TEXT_QR_PADDING_POINTS = 12;
export const SLUG_AREA_BOTTOM_Y_POINTS = 18; // From bottom edge of paper

// --- QR Code Specifics ---
export const QR_GENERATION_PIXEL_SIZE = 256; // Higher res for better quality
export const QR_SLUG_SHIFT_RIGHT_POINTS = 0; // Adjust if needed for centering

// --- Slip Sheet Colors ---
// (Not used in client-side preview, but kept for consistency)
export const SLIP_SHEET_COLORS = [
    { name: 'Pink', pdfRgb: [1.0, 0.75, 0.8] },
    { name: 'Yellow', pdfRgb: [1.0, 1.0, 0.0] },
    { name: 'Green', pdfRgb: [0.5, 1.0, 0.5] },
    { name: 'Blue', pdfRgb: [0.5, 0.5, 1.0] },
    { name: 'Grey', pdfRgb: [0.8, 0.8, 0.8] },
];
