
export const HARDCODED_PAPER_TYPES = [
    { name: "60lb Text", caliper: 0.0032 },
    { name: "70lb Text", caliper: 0.0038 },
    { name: "80lb Text", caliper: 0.0045 },
    { name: "100lb Text", caliper: 0.0055 },
    { name: "80lb Gloss Text", caliper: 0.0035 },
    { name: "100lb Gloss Text", caliper: 0.0045 },
    { name: "80lb Matte Text", caliper: 0.0042 },
    { name: "100lb Matte Text", caliper: 0.0052 },
    // Cover Stocks (for reference, though usually cover thickness is separate)
    { name: "100lb Gloss Cover", caliper: 0.0095 },
    { name: "12pt C1S", caliper: 0.0120 },
    { name: "14pt C1S", caliper: 0.0140 }
];

export const BINDING_TYPES = [
    { value: 'perfectBound', label: 'Perfect Bound' },
    { value: 'saddleStitch', label: 'Saddle Stitch' },
    { value: 'wireO', label: 'Wire-O' },
    { value: 'coil', label: 'Coil / Spiral' },
    { value: 'stapled', label: 'Stapled Corner' }
];
