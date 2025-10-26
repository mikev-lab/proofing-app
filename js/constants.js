export const INCH_TO_POINTS = 72;
export const MM_TO_POINTS = INCH_TO_POINTS / 25.4;

export const DEFAULT_BLEED_INCHES = 0.125;

export const SHEET_SIZES = [
    { name: "11 x 17 Paper", longSideInches: 17, shortSideInches: 11 },
    { name: "12 x 18 Paper", longSideInches: 18, shortSideInches: 12 },
    { name: "12.5 x 19 Paper", longSideInches: 19, shortSideInches: 12.5 },
    { name: "13 x 19 Paper", longSideInches: 19, shortSideInches: 13 },
];

export const IMPOSITION_TYPE_OPTIONS = [
    { value: 'stack', label: 'Stack' },
    { value: 'repeat', label: 'Repeat' },
    { value: 'collateCut', label: 'Collate & Cut' },
    { value: 'booklet', label: 'Booklet' },
];

export const SHEET_ORIENTATION_OPTIONS = [
    { value: 'auto', label: 'Auto-detect' },
    { value: 'portrait', label: 'Portrait' },
    { value: 'landscape', label: 'Landscape' },
];

export const READING_DIRECTION_OPTIONS = [
    { value: 'ltr', label: 'Left-to-Right' },
    { value: 'rtl', label: 'Right-to-Left' },
];

export const ROW_OFFSET_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'half', label: 'Stagger by 50%' },
];

export const ALTERNATE_ROTATION_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'altCol', label: 'Alternate Columns' },
    { value: 'altRow', label: 'Alternate Rows' },
];
