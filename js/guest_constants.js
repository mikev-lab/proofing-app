
export const HARDCODED_PAPER_TYPES = [
    { name: "60lb Opaque Text", caliper: 0.0046 }, //checked
    { name: "80lb Opaque Text", caliper: 0.0061 }, //checked
    { name: "80lb Silk Text", caliper: 0.0043 }, //checked
    { name: "100lb Silk Text", caliper: 0.0056 }, //checked
    { name: "80lb Gloss Text", caliper: 0.0038 }, //checked
    { name: "100lb Gloss Text", caliper: 0.0049 }, //checked
    // Cover Stocks (for reference, though usually cover thickness is separate)
    { name: "80lb Silk Cover", caliper: 0.0090 },
    { name: "100lb Silk Cover", caliper: 0.0110 },
    { name: "111lb Silk Cover", caliper: 0.0125 },
    { name: "12pt Silk (C1S)", caliper: 0.0120 },
    { name: "14pt Silk (C1S)", caliper: 0.0140 }
];

export const BINDING_TYPES = [
    { value: 'perfectBound', label: 'Perfect Bound' },
    { value: 'saddleStitch', label: 'Saddle Stitch' },
    { value: 'wireO', label: 'Wire-O' },
    { value: 'coil', label: 'Coil / Spiral' },
    { value: 'stapled', label: 'Stapled Corner' }
];
