// ... (imports)

async function renderPreview() {
    if (!currentPdfDoc) return;

    const canvas = document.getElementById('imposition-preview-canvas');
    const ctx = canvas.getContext('2d');
    const form = document.getElementById('imposition-form');
    // ... (get settings from form)

    const previewPdfDoc = await PDFDocument.create();
    // ... (embed pages)

    const { width: pageW, height: pageH } = inputPages[0].size();

    let sheetW = selectedSheet.longSideInches * INCH_TO_POINTS;
    let sheetH = selectedSheet.shortSideInches * INCH_TO_POINTS;
    // ... (handle orientation)

    const page = previewPdfDoc.addPage([sheetW, sheetH]);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
            // ... (calculate position with gutters and offsets)

            const drawOptions = { x, y, width: pageW, height: pageH };

            let shouldRotate = alternateRotationType === 'altCol' ? c % 2 !== 0 : alternateRotationType === 'altRow' ? r % 2 !== 0 : false;
            if (shouldRotate) {
                drawOptions.rotate = degrees(180);
                drawOptions.x += pageW;
                drawOptions.y += pageH;
            }

            page.drawPage(inputPages[pageIndex], drawOptions);
        }
    }

    // ... (render PDF to image and draw on canvas)
}

// ... (rest of the file)
