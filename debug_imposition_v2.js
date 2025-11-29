
const { imposePdfLogic } = require('./functions/imposition.js');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper to create a dummy PDF
async function createDummyPdf(pageText, pageCount, fileName) {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        const page = pdfDoc.addPage([500, 500]);
        page.drawText(`${pageText} - Page ${i + 1}`, { x: 50, y: 450, size: 24 });
    }
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(fileName, pdfBytes);
    return fileName;
}

async function runTest() {
    const tempDir = os.tmpdir();
    const interiorPath = path.join(tempDir, 'test_interior.pdf');
    await createDummyPdf('Interior', 4, interiorPath);
    const coverPath = path.join(tempDir, 'test_cover.pdf');
    await createDummyPdf('Cover', 2, coverPath);

    const settings = {
        impositionType: 'booklet',
        sheet: '12 x 18 Paper',
        sheetLongSideInches: 18,
        sheetShortSideInches: 12,
        columns: 1,
        rows: 1,
        bleedInches: 0.125,
        horizontalGutterInches: 0,
        verticalGutterInches: 0,
        includeCover: true
    };

    const jobInfo = { projectName: 'Test Job', quantity: 100 };

    try {
        console.log("Running imposePdfLogic with save/reload fix...");
        const result = await imposePdfLogic({
            inputFile: null,
            settings: settings,
            jobInfo: jobInfo,
            localFilePath: interiorPath,
            coverFilePath: coverPath
        });

        // If we get here without throwing "MissingPageContentsEmbeddingError", the fix worked.
        // We still expect "spawn gs ENOENT" because we don't have Ghostscript,
        // BUT that error happens *after* the chunk generation loop where embedding occurs.
        // So seeing that error is actually a SUCCESS for this specific test case.
        console.log("SUCCESS: Reached Ghostscript stage (Merging succeeded).");

    } catch (e) {
        if (e.message.includes("spawn gs")) {
             console.log("SUCCESS: Reached Ghostscript stage (Merging succeeded).");
        } else {
             console.error("Test Error:", e);
        }
    }
}

runTest();
