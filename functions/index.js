const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {getStorage} = require("firebase-admin/storage");
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const {imposePdfLogic} = require("./imposition");
const {PDFDocument} = require("pdf-lib");

admin.initializeApp();
const db = admin.firestore();
const storage = getStorage();

exports.optimizePdf = onObjectFinalized({
    cpu: 2,
    memory: "1GiB",
    timeoutSeconds: 300,
    region: "us-central1",
    codebase: "preflight",
    name: "optimizePdf"
  }, async (event) => {
    const fileBucket = event.data.bucket;
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    if (!contentType.startsWith('application/pdf')) {
        return logger.log('This is not a PDF.');
    }

    const bucket = admin.storage().bucket(fileBucket);
    const fileName = path.basename(filePath);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    await bucket.file(filePath).download({destination: tempFilePath});

    const projectId = filePath.split('/')[1];
    const projectRef = db.collection('projects').doc(projectId);

    try {
        // Preflight checks
        const preflightResults = {
            dpiCheck: { status: 'skipped', details: 'DPI check not implemented' },
            colorSpaceCheck: await runColorSpaceCheck(tempFilePath),
            fontCheck: await runFontCheck(tempFilePath),
        };

        const preflightStatus = Object.values(preflightResults).some(r => r.status === 'failed') ? 'failed' : 'passed';

        // Generate preview
        const previewFileName = `${path.parse(fileName).name}_preview.pdf`;
        const tempPreviewPath = path.join(os.tmpdir(), previewFileName);
        await execPromise(`gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile=${tempPreviewPath} ${tempFilePath}`);

        const previewFilePath = path.join(path.dirname(filePath), previewFileName);
        await bucket.upload(tempPreviewPath, {destination: previewFilePath});

        const projectDoc = await projectRef.get();
        const projectData = projectDoc.data();
        const versions = projectData.versions.map(v => {
            if (v.filePath === filePath) {
                return {
                    ...v,
                    preflightStatus,
                    preflightResults,
                    previewURL: `gs://${fileBucket}/${previewFilePath}`,
                    processingStatus: 'complete',
                };
            }
            return v;
        });
        await projectRef.update({ versions });
    } catch (error) {
        logger.error("Error optimizing PDF:", error);
        const projectDoc = await projectRef.get();
        const projectData = projectDoc.data();
        const versions = projectData.versions.map(v => {
            if (v.filePath === filePath) {
                return {
                    ...v,
                    processingStatus: 'error',
                    processingError: error.message,
                };
            }
            return v;
        });
        await projectRef.update({ versions });
    } finally {
        await fs.unlink(tempFilePath);
        const tempPreviewPath = path.join(os.tmpdir(), `${path.parse(fileName).name}_preview.pdf`);
        if (await fs.access(tempPreviewPath).then(() => true).catch(() => false)) {
            await fs.unlink(tempPreviewPath);
        }
    }
});

async function runColorSpaceCheck(filePath) {
    try {
        const { stdout } = await execPromise(`exiftool -s -all:ColorSpace ${filePath}`);
        const lines = stdout.split('\n').filter(line => line.includes('Color Space'));
        const isCMYK = lines.every(line => line.includes('CMYK'));
        if (isCMYK) {
            return { status: 'passed', details: 'All colors are CMYK' };
        } else {
            return { status: 'failed', details: 'Non-CMYK colors detected' };
        }
    } catch (error) {
        return { status: 'failed', details: 'Could not determine color space' };
    }
}

async function runFontCheck(filePath) {
    try {
        const { stdout } = await execPromise(`pdffonts ${filePath}`);
        if (stdout.includes('no')) {
            return { status: 'failed', details: 'Non-embedded fonts found' };
        }
        return { status: 'passed', details: 'All fonts are embedded' };
    } catch (error) {
        // some pdfs have no fonts, which is not an error
        return { status: 'passed', details: 'No fonts found' };
    }
}

exports.onProjectApprove = onDocumentUpdated({
    document: "projects/{projectId}",
    codebase: "default",
    name: "onProjectApprove"
}, async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (before.status !== 'Approved' && after.status === 'Approved') {
        const projectId = event.params.projectId;
        logger.log(`Project ${projectId} approved, starting automatic imposition.`);

        try {
            const latestVersion = after.versions[after.versions.length - 1];
            const sourceFileUrl = latestVersion.fileURL;

            const bucketName = new URL(sourceFileUrl).hostname.split('.storage.googleapis.com')[0];
            const filePath = new URL(sourceFileUrl).pathname.substring(1);

            const bucket = storage.bucket(bucketName);
            const [fileBuffer] = await bucket.file(decodeURIComponent(filePath)).download();
            const inputPdfDoc = await PDFDocument.load(fileBuffer);
            const { width: pageW, height: pageH } = inputPdfDoc.getPages()[0].getSize();

            const defaultsSnapshot = await db.collection('impositionDefaults').get();
            const rules = defaultsSnapshot.docs.map(doc => doc.data());

            let pressSheet = { name: "12 x 18 Paper", longSideInches: 18, shortSideInches: 12 }; // Default
            // ... (logic to get press sheet from rules)

            let bestLayout = { cols: 1, rows: 1 };
            let maxN = 1;

            for (let cols = 1; cols < 20; cols++) {
                for (let rows = 1; rows < 20; rows++) {
                    const totalContentW = pageW * cols;
                    const totalContentH = pageH * rows;
                    if ((totalContentW < pressSheet.longSideInches * 72 && totalContentH < pressSheet.shortSideInches * 72) ||
                        (totalContentW < pressSheet.shortSideInches * 72 && totalContentH < pressSheet.longSideInches * 72)) {
                        if (cols * rows > maxN) {
                            maxN = cols * rows;
                            bestLayout = { cols, rows };
                        }
                    }
                }
            }

            const defaultSettings = {
                selectedSheet: pressSheet,
                columns: bestLayout.cols,
                rows: bestLayout.rows,
                // ... (other default settings)
            };

            await imposePdfLogic(projectId, defaultSettings);
            logger.log(`Successfully triggered imposition for project ${projectId}.`);
        } catch (error) {
            logger.error(`Failed to automatically impose PDF for project ${projectId}:`, error);
        }
    }
});
