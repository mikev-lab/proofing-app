// IMPORTANT: This function requires a custom execution environment with Ghostscript installed.
// The standard Cloud Functions environment does not include it by default.
// You can create a custom environment using a Dockerfile with a Gen 2 function.
// Example Dockerfile command: RUN apt-get update && apt-get install -y ghostscript

// Gen 2 Imports:
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { onCall, HttpsError } = require('firebase-functions/v2/https'); // <-- Import for callable function
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require('firebase-functions/logger');
const crypto = require('crypto'); // <-- Import for token generation
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth();

// Your existing imports
const admin =require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child-process-promise');

admin.initializeApp();
const storage = new Storage();
const db = admin.firestore();

// Gen 2 Function Definition:
// Use the correct onObjectFinalized (with a 'd')
exports.optimizePdf = onObjectFinalized({
  region: 'us-central1', // Specify your region
  memory: '4GiB',      // *** INCREASED MEMORY TO 4GiB ***
  cpu: 2,                // More CPU for Ghostscript
  timeoutSeconds: 540,   // Longer timeout for processing
  // NOTE: Gen 2 functions use the default Compute Engine service account.
  // Ensure it has permissions for Storage (Storage Object Admin) and Firestore (Cloud Datastore User).
}, async (event) => {

  // The 'object' is now 'event.data'
  const file = event.data;
  const filePath = file.name; // This is the object path, e.g., proofs/projectId/timestamp_filename.pdf
  const contentType = file.contentType;
  const fileBucket = file.bucket;

  logger.log('Function triggered for file:', filePath, 'Content-Type:', contentType);

  // Exit if this is the preview file we generated
  if (filePath.endsWith('_preview.pdf')) {
    return logger.log('This is a preview file, skipping.');
  }

  // Exit if the file is not a PDF
  if (!contentType || !contentType.startsWith('application/pdf')) {
    return logger.log(`File is not a PDF (contentType: ${contentType}), skipping.`);
  }


  // Extract projectId from the file path
  const parts = filePath.split('/');
  if (parts.length < 2 || parts[0] !== 'proofs') {
      return logger.log(`File path does not match expected structure proofs/{projectId}/{fileName}. Got: ${filePath}`);
  }
  const projectId = parts[1];
  const fullFileName = parts[parts.length - 1]; // Filename including timestamp prefix

  logger.log(`Processing storage file: ${fullFileName} for project: ${projectId}`);


  const bucket = storage.bucket(fileBucket);
  const tempFilePath = path.join(os.tmpdir(), fullFileName);
  const previewFileName = `${path.basename(fullFileName, '.pdf')}_preview.pdf`;
  const tempPreviewPath = path.join(os.tmpdir(), previewFileName);
  const projectRef = db.collection('projects').doc(projectId);

  try {
    // Download the file
    await bucket.file(filePath).download({ destination: tempFilePath });
    logger.log('File downloaded locally to', tempFilePath);

    // --- STEP 1: Run Preflight Checks & Update Firestore ---
    const { spawn } = require('child-process-promise');
    const { preflightStatus, preflightResults } = await runPreflightChecks(tempFilePath, logger);
    logger.log('Preflight checks completed.', { preflightStatus, preflightResults });

    await db.runTransaction(async (transaction) => {
        const projectDoc = await transaction.get(projectRef);
        if (!projectDoc.exists) {
            throw new Error(`Project ${projectId} not found in Firestore.`);
        }
        const projectData = projectDoc.data();
        const versions = projectData.versions || [];
        const versionIndex = versions.findIndex(v => v.filePath === filePath);

        if (versionIndex === -1) {
            logger.warn(`No version found matching filePath "${filePath}" in project ${projectId}.`);
            return;
        }

        // Update the version with preflight results
        versions[versionIndex].preflightStatus = preflightStatus;
        versions[versionIndex].preflightResults = preflightResults;
        // Also set initial processing status if not already set to an error
        if (versions[versionIndex].processingStatus !== 'error') {
            versions[versionIndex].processingStatus = 'processing';
        }

        transaction.update(projectRef, { versions: versions });
        logger.log(`Successfully updated Firestore for project ${projectId}, version index ${versionIndex} with preflight results.`);
    });


    // --- STEP 2: Optimize the PDF using Ghostscript ---
    await spawn('gs', [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/ebook',
        '-dJPEGQ=90',
        '-dColorImageResolution=150',
        '-dGrayImageResolution=150',
        '-dMonoImageResolution=150',
        '-dDetectDuplicateImages=false',
        '-dConvertCMYKImagesToRGB=true',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile=${tempPreviewPath}`,
        tempFilePath
    ]);
    logger.log('PDF optimized and saved to', tempPreviewPath);

    // Upload the optimized PDF
    const destination = filePath.replace(path.basename(filePath), previewFileName);
    await bucket.upload(tempPreviewPath, { destination: destination });
    logger.log('Optimized PDF uploaded to', destination);

    // Get a signed URL for the preview file
    let signedUrl;
    // When running in the emulator, getSignedUrl fails. We construct the URL manually instead.
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
        const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
        const bucketName = bucket.name;
        const encodedDestination = encodeURIComponent(destination);
        signedUrl = `http://${host}/v0/b/${bucketName}/o/${encodedDestination}?alt=media`;
        logger.log(`Generated emulator storage URL: ${signedUrl}`);
    } else {
        const previewFile = bucket.file(destination);
        [signedUrl] = await previewFile.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
        });
    }

    // --- STEP 3 (Success): Update Firestore with SUCCESS status ---
    await db.runTransaction(async (transaction) => {
        const projectDoc = await transaction.get(projectRef);
        if (!projectDoc.exists) {
            throw new Error(`Project ${projectId} not found in Firestore.`);
        }
        const projectData = projectDoc.data();
        const versions = projectData.versions || [];
        const versionIndex = versions.findIndex(v => v.filePath === filePath);

        if (versionIndex === -1) {
            logger.warn(`No version found matching filePath "${filePath}" in project ${projectId}.`);
            return;
        }

        // Update the found version with the previewURL and final status
        versions[versionIndex].previewURL = signedUrl;
        versions[versionIndex].processingStatus = 'complete';
        versions[versionIndex].processingError = null; // Clear any previous error
        transaction.update(projectRef, { versions: versions });
        logger.log(`Successfully updated Firestore for project ${projectId}, version index ${versionIndex} with previewURL and status 'complete'.`);
    });

  } catch (error) {
    logger.error('Error processing PDF:', error);
    // --- STEP 3 (Failure): Update Firestore with ERROR status ---
    try {
      await db.runTransaction(async (transaction) => {
        const projectDoc = await transaction.get(projectRef);
        if (!projectDoc.exists) {
          logger.error(`Project ${projectId} not found. Cannot update with error status.`);
          return;
        }
        const projectData = projectDoc.data();
        const versions = projectData.versions || [];
        const versionIndex = versions.findIndex(v => v.filePath === filePath);

        if (versionIndex === -1) {
          logger.warn(`No version found matching filePath "${filePath}" in project ${projectId} to update with error status.`);
          return;
        }

        // Update with error, but preserve the preflight results from the first update
        versions[versionIndex].processingStatus = 'error';
        versions[versionIndex].processingError = error.message || 'An unknown error occurred during processing.';
        transaction.update(projectRef, { versions: versions });
        logger.log(`Successfully updated Firestore for project ${projectId}, version index ${versionIndex} with status 'error'.`);
      });
    } catch (dbError) {
      logger.error('FATAL: Could not update Firestore with error state.', dbError);
    }

  } finally {
    // Clean up temporary files
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (e) { logger.warn('Failed to delete temp file:', tempFilePath, e); }
    }
    if (fs.existsSync(tempPreviewPath)) {
      try { fs.unlinkSync(tempPreviewPath); } catch (e) { logger.warn('Failed to delete temp preview file:', tempPreviewPath, e); }
    }
  }

  return null;
});

// --- Production Constants ---
const COLOR_CLICK_COST = 0.039;
const BW_CLICK_COST = 0.009;
const GLOSS_LAMINATE_COST_PER_COVER = 0.30;
const MATTE_LAMINATE_COST_PER_COVER = 0.60;
const PRINTING_SPEED_SPM = 15; // Sheets per minute for c3080 (4 seconds per sheet)
const LAMINATING_SPEED_MPM = 5; // Meters per minute
const PERFECT_BINDER_SETUP_MINS = 15;
const PERFECT_BINDER_SPEED_BPH = 300; // Books per hour
const SADDLE_STITCHER_SETUP_MINS = 10;
const SADDLE_STITCHER_SPEED_BPH = 400; // Books per hour (more realistic speed)
const BASE_PREP_TIME_MINS = 20;
const WASTAGE_FACTOR = 0.15; // 15% for materials and general time
const BINDING_INEFFICIENCY_FACTOR = 1.20; // 20% slower than optimal speed to account for real-world conditions
const TRIMMING_SETUP_MINS = 10;
const TRIMMING_BOOKS_PER_CYCLE = 250; // How many books/sheets in a stack for the guillotine
const TRIMMING_CYCLE_TIME_MINS = 5; // Time to load, clamp, cut 3 sides, unload a stack

// --- Conversion Constants ---
const SQ_INCH_TO_SQ_METER = 0.00064516;
const GRAMS_TO_LBS = 0.00220462;

// --- Helper Functions ---
const calculateImposition = (parentW, parentH, jobW, jobH) => {
    if (jobW <= 0 || jobH <= 0) return 0;
    const fit1 = Math.floor(parentW / jobW) * Math.floor(parentH / jobH);
    const fit2 = Math.floor(parentW / jobH) * Math.floor(parentH / jobW);
    return Math.max(fit1, fit2);
};

const getPaperThicknessInches = (paper) => {
    const caliperFactor = paper.type === 'Coated' ? 0.9 : 1.3;
    const caliperMicrons = paper.gsm * caliperFactor;
    return caliperMicrons / 25400;
};

const createEmptyCostBreakdown = (error) => ({
    error,
    bwPaperCost: 0, colorPaperCost: 0, coverPaperCost: 0,
    bwClickCost: 0, colorClickCost: 0, coverClickCost: 0,
    laminationCost: 0, laborCost: 0, shippingCost: 0, subtotal: 0, markupAmount: 0, totalCost: 0, pricePerUnit: 0,
    bwPressSheets: 0, colorPressSheets: 0, coverPressSheets: 0,
    bwImposition: 0, colorImposition: 0, coverImposition: 0,
    totalClicks: 0, productionTimeHours: 0,
    laborTimeBreakdown: { printingTimeMins: 0, laminatingTimeMins: 0, bindingTimeMins: 0, setupTimeMins: 0, trimmingTimeMins: 0, wastageTimeMins: 0 },
    shippingBreakdown: null,
});

// --- Shipping Data (Moved from constants/shippingData.ts) ---
const MAX_WEIGHT_PER_BOX_LBS = 40;
const shippingBoxes = [
    { name: 'Uline S-4100 (6x6x6)', width: 6, length: 6, height: 6, cost: 0.65 },
    { name: 'Uline S-4352 (8x6x4)', width: 8, length: 6, height: 4, cost: 0.61 },
    { name: 'Uline S-167 (9x6x4)', width: 9, length: 6, height: 4, cost: 0.64 },
    { name: 'Uline S-4115 (10x8x6)', width: 10, length: 8, height: 6, cost: 0.94 },
    { name: 'Uline S-10557 (11x8.5x5.5)', width: 11, length: 8.5, height: 5.5, cost: 1.01 },
    { name: 'Uline S-4123 (12x10x8)', width: 12, length: 10, height: 8, cost: 1.25 },
    { name: 'Uline S-4519 (14x12x8)', width: 14, length: 12, height: 8, cost: 1.62 },
    { name: 'Uline S-4133 (16x12x10)', width: 16, length: 12, height: 10, cost: 1.94 },
    { name: 'USPS Large Flat Rate (12x12x5.5)', width: 12, length: 12, height: 5.5, cost: 19.20 },
];

// Simple carrier cost model (replace with real API)
const getCarrierCost = (totalWeightLbs) => {
    if (totalWeightLbs <= 0) return 0;
    if (totalWeightLbs <= 1) return 5.00;
    if (totalWeightLbs <= 5) return 8.00;
    if (totalWeightLbs <= 10) return 12.00;
    if (totalWeightLbs <= 20) return 18.00;
    if (totalWeightLbs <= MAX_WEIGHT_PER_BOX_LBS) return 25.00;
    // For multi-box shipments, estimate per box
    const numBoxes = Math.ceil(totalWeightLbs / MAX_WEIGHT_PER_BOX_LBS);
    return numBoxes * 25.00;
};

const calculateSingleBookWeightLbs = (details, bwPaper, colorPaper, coverPaper, spineWidth) => {
    let totalWeightGrams = 0;
    const { finishedWidth, finishedHeight, bwPages, colorPages, hasCover } = details;

    if (bwPaper && bwPages > 0) {
        const bwSheetAreaSqIn = finishedWidth * finishedHeight;
        const totalBwPaperAreaSqM = (bwPages / 2) * bwSheetAreaSqIn * SQ_INCH_TO_SQ_METER;
        totalWeightGrams += totalBwPaperAreaSqM * bwPaper.gsm;
    }

    if (colorPaper && colorPages > 0) {
        const colorSheetAreaSqIn = finishedWidth * finishedHeight;
        const totalColorPaperAreaSqM = (colorPages / 2) * colorSheetAreaSqIn * SQ_INCH_TO_SQ_METER;
        totalWeightGrams += totalColorPaperAreaSqM * colorPaper.gsm;
    }

    if (hasCover && coverPaper && spineWidth !== undefined) {
        const coverSpreadWidth = (finishedWidth * 2) + spineWidth;
        const coverAreaSqIn = coverSpreadWidth * finishedHeight;
        const coverAreaSqM = coverAreaSqIn * SQ_INCH_TO_SQ_METER;
        totalWeightGrams += coverAreaSqM * coverPaper.gsm;
    }

    return totalWeightGrams * GRAMS_TO_LBS;
};

const calculateShipping = (quantity, bookWidth, bookLength, bookSpine, bookWeightLbs, overrideBoxName) => {
    if (quantity <= 0 || bookWeightLbs <= 0) {
        return { shippingCost: 0, breakdown: null };
    }

    const bookDims = [bookWidth, bookLength, bookSpine].sort((a, b) => b - a);

    const flatBoxes = shippingBoxes.flatMap(box => {
        if (Array.isArray(box.height)) {
            return box.height.map(h => ({ ...box, height: h, name: `${box.name} (${h}")` }));
        }
        return { ...box, height: box.height };
    });

    const boxesToConsider = overrideBoxName
        ? flatBoxes.filter(box => box.name === overrideBoxName)
        : flatBoxes;

    let bestOption = {
        cost: Infinity,
        breakdown: null,
    };

    for (const box of boxesToConsider) {
        const boxDims = [box.width, box.length, box.height].sort((a, b) => b - a);
        if (bookDims[0] > boxDims[0] || bookDims[1] > boxDims[1] || bookDims[2] > boxDims[2]) {
            continue;
        }

        const w = bookWidth, l = bookLength, s = bookSpine;
        const W = box.width, L = box.length, H = box.height;
        const orientations = [
            Math.floor(W / w) * Math.floor(L / l) * Math.floor(H / s),
            Math.floor(W / w) * Math.floor(L / s) * Math.floor(H / l),
            Math.floor(W / l) * Math.floor(L / w) * Math.floor(H / s),
            Math.floor(W / l) * Math.floor(L / s) * Math.floor(H / w),
            Math.floor(W / s) * Math.floor(L / w) * Math.floor(H / l),
            Math.floor(W / s) * Math.floor(L / l) * Math.floor(H / w),
        ];
        let booksPerBox = Math.max(...orientations);
        if (booksPerBox === 0) continue;

        const maxBooksByWeight = Math.floor(MAX_WEIGHT_PER_BOX_LBS / bookWeightLbs);
        if (maxBooksByWeight > 0) {
            booksPerBox = Math.min(booksPerBox, maxBooksByWeight);
        } else {
            continue;
        }

        const boxCount = Math.ceil(quantity / booksPerBox);
        const handlingCost = boxCount * box.cost;
        const totalWeightLbs = quantity * bookWeightLbs;
        const carrierCost = getCarrierCost(totalWeightLbs);
        const totalCost = handlingCost + carrierCost;

        if (totalCost < bestOption.cost) {
            bestOption = {
                cost: totalCost,
                breakdown: {
                    boxName: box.name,
                    boxCount,
                    booksPerBox,
                    totalWeightLbs,
                },
            };
        }
    }

    return { shippingCost: bestOption.cost === Infinity ? 0 : bestOption.cost, breakdown: bestOption.breakdown };
};

// --- Main Calculation Function ---
const calculateCosts = (details, paperData) => {
    const {
        quantity, finishedWidth, finishedHeight,
        bwPages, bwPaperSku, colorPages, colorPaperSku,
        hasCover, coverPaperSku, coverPrintColor, coverPrintsOnBothSides, laminationType, bindingMethod,
        laborRate, markupPercent, spoilagePercent, calculateShipping: shouldCalcShipping
    } = details;

    const bwPaper = paperData.find(p => p.sku === bwPaperSku);
    const colorPaper = paperData.find(p => p.sku === colorPaperSku);
    const coverPaper = paperData.find(p => p.sku === coverPaperSku);

    // --- START: Validation Patch ---
    // This ensures that if a SKU was provided, it was found in our (price-filtered) inventory.

    if (details.bwPages > 0 && !bwPaper) {
        return createEmptyCostBreakdown('The selected B/W paper (SKU: ' + details.bwPaperSku + ') was not found or has no price in our inventory.');
    }
    if (details.colorPages > 0 && !colorPaper) {
        return createEmptyCostBreakdown('The selected Color paper (SKU: ' + details.colorPaperSku + ') was not found or has no price in our inventory.');
    }
    if (details.hasCover && !coverPaper) {
        return createEmptyCostBreakdown('The selected Cover paper (SKU: ' + details.coverPaperSku + ') was not found or has no price in our inventory.');
    }

    // --- END: Validation Patch ---

    const totalInteriorPages = (bwPages > 0 ? bwPages : 0) + (colorPages > 0 ? colorPages : 0);
    if (bindingMethod === 'saddleStitch' && totalInteriorPages > 0 && totalInteriorPages % 4 !== 0) {
        return createEmptyCostBreakdown('Saddle stitch requires the total interior page count to be a multiple of 4.');
    }

    const spoilageMultiplier = 1 + ((spoilagePercent || 0) / 100);

    const bwImposition = bwPaper ? calculateImposition(bwPaper.parentWidth, bwPaper.parentHeight, finishedWidth, finishedHeight) : 0;
    const colorImposition = colorPaper ? calculateImposition(colorPaper.parentWidth, colorPaper.parentHeight, finishedWidth, finishedHeight) : 0;

    let coverImposition = 0;
    let spineWidth = 0;
    if (hasCover && coverPaper) {
        if (bindingMethod === 'perfectBound') {
            const bwLeaves = Math.ceil((bwPages > 0 ? bwPages : 0) / 2);
            const colorLeaves = Math.ceil((colorPages > 0 ? colorPages : 0) / 2);

            const bwPaperThickness = (bwPaper && bwPages > 0) ? getPaperThicknessInches(bwPaper) : 0;
            const colorPaperThickness = (colorPaper && colorPages > 0) ? getPaperThicknessInches(colorPaper) : 0;

            spineWidth = (bwLeaves * bwPaperThickness) + (colorLeaves * colorPaperThickness);
        }
        const coverSpreadWidth = (finishedWidth * 2) + spineWidth;
        const coverSpreadHeight = finishedHeight;
        const maxPossibleImposition = calculateImposition(coverPaper.parentWidth, coverPaper.parentHeight, coverSpreadWidth, coverSpreadHeight);

        if (maxPossibleImposition >= 1) {
            coverImposition = 1;
        } else {
            coverImposition = 0;
        }
    }

    if (bwPaper && bwImposition === 0 && bwPages > 0) return createEmptyCostBreakdown('Finished size does not fit on the B/W interior paper.');
    if (colorPaper && colorImposition === 0 && colorPages > 0) return createEmptyCostBreakdown('Finished size does not fit on the Color interior paper.');
    if (hasCover && coverPaper && coverImposition === 0) return createEmptyCostBreakdown('Full cover spread (including spine) does not fit on the selected cover paper.');

    const bwPressSheets = Math.ceil((bwImposition > 0 ? Math.ceil(quantity * Math.ceil((bwPages > 0 ? bwPages : 0) / 2) / bwImposition) : 0) * spoilageMultiplier);
    const bwPaperCost = bwPaper ? bwPressSheets * bwPaper.costPerSheet : 0;
    const bwClicks = bwPressSheets * 2;
    const bwClickCost = bwClicks * BW_CLICK_COST;

    const colorPressSheets = Math.ceil((colorImposition > 0 ? Math.ceil(quantity * Math.ceil((colorPages > 0 ? colorPages : 0) / 2) / colorImposition) : 0) * spoilageMultiplier);
    const colorPaperCost = colorPaper ? colorPressSheets * colorPaper.costPerSheet : 0;
    const colorClicks = colorPressSheets * 2;
    const colorClickCost = colorClicks * COLOR_CLICK_COST;

    let coverPressSheets = 0, coverPaperCost = 0, coverClickCost = 0, coverClicks = 0;
    if (hasCover) {
        coverPressSheets = Math.ceil((coverImposition > 0 ? Math.ceil(quantity / coverImposition) : 0) * spoilageMultiplier);
        coverPaperCost = coverPaper ? coverPressSheets * coverPaper.costPerSheet : 0;
        const coverClickRate = coverPrintColor === 'COLOR' ? COLOR_CLICK_COST : BW_CLICK_COST; // Use string literal
        coverClicks = coverPressSheets * (coverPrintsOnBothSides ? 2 : 1);
        coverClickCost = coverClicks * coverClickRate;
    }

    const laminationCost = (hasCover && laminationType !== 'none' && quantity > 0) ? (laminationType === 'gloss' ? GLOSS_LAMINATE_COST_PER_COVER : MATTE_LAMINATE_COST_PER_COVER) * quantity : 0;

    const totalPressSheets = bwPressSheets + colorPressSheets + coverPressSheets;
    const printingTimeMins = totalPressSheets / PRINTING_SPEED_SPM;

    let laminatingTimeMins = 0;
    if (hasCover && laminationType !== 'none' && coverPaper && coverPressSheets > 0) {
        const sheetLengthMeters = coverPaper.parentHeight * 0.0254;
        laminatingTimeMins = (coverPressSheets * sheetLengthMeters) / LAMINATING_SPEED_MPM;
    }

    let bindingTimeMins = 0;
    let bindingSetupMins = 0;
    if (quantity > 0 && bindingMethod !== 'none') {
        if (bindingMethod === 'perfectBound') {
            bindingSetupMins = PERFECT_BINDER_SETUP_MINS;
            bindingTimeMins = (quantity / (PERFECT_BINDER_SPEED_BPH / 60));
        } else if (bindingMethod === 'saddleStitch') {
            bindingSetupMins = SADDLE_STITCHER_SETUP_MINS;
            bindingTimeMins = (quantity / (SADDLE_STITCHER_SPEED_BPH / 60));
        }
        bindingTimeMins *= BINDING_INEFFICIENCY_FACTOR;
    }

    const trimmingTimeMins = quantity > 0 ? TRIMMING_SETUP_MINS + (Math.ceil(quantity / TRIMMING_BOOKS_PER_CYCLE) * TRIMMING_CYCLE_TIME_MINS) : 0;

    const setupTimeMins = BASE_PREP_TIME_MINS + bindingSetupMins;
    const totalProductionTimeMins = setupTimeMins + printingTimeMins + laminatingTimeMins + bindingTimeMins + trimmingTimeMins;
    const wastageTimeMins = totalProductionTimeMins * WASTAGE_FACTOR;
    const totalTimeMins = totalProductionTimeMins + wastageTimeMins;
    const productionTimeHours = totalTimeMins / 60;
    const laborCost = productionTimeHours * laborRate;

    const laborTimeBreakdown = { printingTimeMins, laminatingTimeMins, bindingTimeMins, setupTimeMins, trimmingTimeMins, wastageTimeMins };

    const subtotal = (bwPaperCost + colorPaperCost + coverPaperCost) + (bwClickCost + colorClickCost + coverClickCost) + laminationCost + laborCost;
    const markupAmount = subtotal * (markupPercent / 100);

    let shippingCost = 0;
    let shippingBreakdown = null;
    if (shouldCalcShipping) {
        const bookWeightLbs = calculateSingleBookWeightLbs(details, bwPaper, colorPaper, coverPaper, spineWidth);
        const shippingResult = calculateShipping(quantity, finishedWidth, finishedHeight, spineWidth, bookWeightLbs, details.overrideShippingBoxName);
        shippingCost = shippingResult.shippingCost;
        shippingBreakdown = shippingResult.breakdown;
    }

    const totalCost = subtotal + markupAmount + shippingCost;
    const pricePerUnit = quantity > 0 ? totalCost / quantity : 0;
    const totalClicks = bwClicks + colorClicks + coverClicks;

    return {
        bwPaperCost, colorPaperCost, coverPaperCost,
        bwClickCost, colorClickCost, coverClickCost,
        laminationCost, laborCost, shippingCost, subtotal, markupAmount, totalCost, pricePerUnit,
        bwPressSheets, colorPressSheets, coverPressSheets,
        bwImposition, colorImposition, coverImposition,
        totalClicks, productionTimeHours, laborTimeBreakdown, shippingBreakdown
    };
};


exports.estimators_calculateEstimate = onCall({ region: 'us-central1' }, async (request) => {
    // --- Fetch Estimator Defaults ---
    let estimatorDefaults = {
        laborRate: 50, // Hardcoded fallback
        markupPercent: 35, // Hardcoded fallback
        spoilagePercent: 5  // Hardcoded fallback
    };

    try {
        const defaultsDoc = await db.collection('settings').doc('globalEstimatorDefaults').get();
        if (defaultsDoc.exists) {
            const data = defaultsDoc.data();
            estimatorDefaults = {
                laborRate: data.laborRate || 50,
                markupPercent: data.markupPercent || 35,
                spoilagePercent: data.spoilagePercent || 5
            };
        }
    } catch (err) {
        logger.error("Failed to fetch estimator defaults, using fallbacks.", err);
    }
    // --- End Fetch ---
    // All logic from step 2 will go here
    // --- START: Dynamic Pricing Default Patch ---

    const clientDetails = request.data;
    let isAdmin = false;

    if (request.auth && request.auth.uid) {
        try {
            const userDoc = await db.collection('users').doc(request.auth.uid).get();
            if (userDoc.exists && userDoc.data().role === 'admin') {
                isAdmin = true;
            }
        } catch (err) {
            console.warn("Auth check failed for user:", request.auth.uid, err);
        }
    }

    const finalDetails = { ...clientDetails };

    if (!isAdmin) {
        // If user is a customer, FORCE our *dynamic* internal defaults.
        finalDetails.laborRate = estimatorDefaults.laborRate;
        finalDetails.markupPercent = estimatorDefaults.markupPercent;
        finalDetails.spoilagePercent = estimatorDefaults.spoilagePercent;

        // Also force other sensible defaults
        finalDetails.calculateShipping = true;
        finalDetails.coverPrintColor = 'COLOR';
        finalDetails.coverPrintsOnBothSides = false;
    }

    // --- END: Dynamic Pricing Default Patch ---

    // This is the FINAL logic for the Firestore query in 'estimators_calculateEstimate'
    let paperData = [];
    try {
        const inventorySnapshot = await db.collection('inventory').get();
        inventorySnapshot.forEach(doc => {
            const data = doc.data();
            const sku = data.manufacturerSKU;

            // 1. Check for minimum required data
            if (data.dimensions && data.dimensions.width && data.dimensions.height && sku) {

                // 2. Calculate cost
                const costPerM = Math.max(data.latestCostPerM || 0, data.vendorCostPerM || 0);

                // 3. --- NEW RULE ---
                // Only include the paper if it has a valid price.
                if (costPerM > 0) {
                    const costPerSheet = costPerM / 1000;
                    paperData.push({
                        sku: sku,
                        name: data.name,
                        gsm: data.weight || 0,
                        type: data.type || 'Uncoated',
                        finish: data.finish || 'Uncoated',
                        parentWidth: data.dimensions.width,
                        parentHeight: data.dimensions.height,
                        costPerSheet: costPerSheet,
                        usage: data.usage || 'General'
                    });
                }
                // Papers with a cost of 0 are now excluded.
            }
        });
    } catch (error) {
        console.error("Failed to fetch inventory data:", error);
        throw new HttpsError('internal', 'Could not load pricing data. Please try again later.');
    }


    // --- EXECUTION ---
    const costBreakdown = calculateCosts(finalDetails, paperData);

    if (isAdmin) {
        // Staff/Admins get the full breakdown with all cost details
        return costBreakdown;
    } else {
        // Customers/Anonymous users get the sanitized, public-facing price
        return {
            totalPrice: costBreakdown.totalCost,
            pricePerUnit: costBreakdown.pricePerUnit,
            shippingCost: costBreakdown.shippingCost,
            error: costBreakdown.error || null
        };
    }
});

exports.estimators_getQuantityAnalysis = onCall({ region: 'us-central1' }, async (request) => { // 1. Admin-only check
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'You must be authenticated.');
    }
    try {
        const userDoc = await db.collection('users').doc(request.auth.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            throw new HttpsError('permission-denied', 'You must be an admin.');
        }
    } catch (err) {
        throw new HttpsError('internal', 'Admin check failed.');
    } // 2. Get data from client
    const { details, isOwnersLabor } = request.data;
    if (!details || details.quantity <= 0) {
        throw new HttpsError('invalid-argument', 'Valid job details are required.');
    } // 3. Fetch live paper data
    let paperData = [];
    try { // This is the SAME paper query logic from 'estimators_calculateEstimate'
        const inventorySnapshot = await db.collection('inventory').get();
        inventorySnapshot.forEach(doc => {
            const data = doc.data();
            const sku = data.manufacturerSKU;
            if (data.dimensions && data.dimensions.width && data.dimensions.height && sku) {
                const costPerM = Math.max(data.latestCostPerM || 0, data.vendorCostPerM || 0);
                if (costPerM > 0) {
                    paperData.push({
                        sku: sku,
                        name: data.name,
                        gsm: data.weight || 0,
                        type: data.type || 'Uncoated',
                        finish: data.finish || 'Uncoated',
                        parentWidth: data.dimensions.width,
                        parentHeight: data.dimensions.height,
                        costPerSheet: (costPerM / 1000),
                        usage: data.usage || 'General'
                    });
                }
            }
        });
    } catch (error) {
        logger.error("Failed to fetch inventory data:", error);
        throw new HttpsError('internal', 'Could not load pricing data.');
    } // 4. Run the analysis loop
    const quantityTiers = [
        Math.round(details.quantity * 0.25),
        Math.round(details.quantity * 0.5),
        details.quantity,
        Math.round(details.quantity * 2),
        Math.round(details.quantity * 5),
        Math.round(details.quantity * 10),
    ].filter(q => q >= 10);
    const uniqueTiers = [...new Set(quantityTiers)].sort((a, b) => a - b);
    if (uniqueTiers.length === 0) uniqueTiers.push(details.quantity);
    const labels = [],
        expenses = [],
        labor = [],
        profit = [],
        totalPrice = [],
        summaryData = [];
    uniqueTiers.forEach(quantity => { // Call the shared calculateCosts function
        const result = calculateCosts({ ...details,
            quantity
        }, paperData);
        if (result && !result.error && isFinite(result.pricePerUnit) && result.pricePerUnit > 0) {
            labels.push(quantity.toLocaleString());
            const totalExpenses = result.bwPaperCost + result.colorPaperCost + result.coverPaperCost + result.bwClickCost + result.colorClickCost + result.coverClickCost + result.laminationCost;
            let laborValue = result.laborCost;
            let profitValue = result.markupAmount;
            let totalProfitValue = result.markupAmount;
            if (isOwnersLabor) {
                profitValue += laborValue;
                totalProfitValue += laborValue;
                laborValue = 0;
            }
            expenses.push(parseFloat((totalExpenses / quantity).toFixed(4)));
            labor.push(parseFloat((laborValue / quantity).toFixed(4)));
            profit.push(parseFloat((profitValue / quantity).toFixed(4)));
            totalPrice.push(parseFloat(result.pricePerUnit.toFixed(4)));
            summaryData.push({
                quantity,
                totalProfit: totalProfitValue,
                profitPerHour: result.productionTimeHours > 0 ? totalProfitValue / result.productionTimeHours : 0,
            });
        }
    });
    if (labels.length === 0) return {
        chartData: null,
        summaryData: []
    };
    const chartData = {
        labels,
        expenses,
        labor,
        profit,
        totalPrice
    };
    return {
        chartData,
        summaryData
    };
});

exports.estimators_getPublicPaperList = onCall({ region: 'us-central1' }, async (request) => {
    const papers = [];
    try {
        const inventorySnapshot = await db.collection('inventory').get();
        inventorySnapshot.forEach(doc => {
            const data = doc.data();
            const sku = data.manufacturerSKU;
            // 1. Check for minimum required data
            if (data.dimensions && data.dimensions.width && data.dimensions.height && sku) {
                // 2. Check for a valid price
                const costPerM = Math.max(data.latestCostPerM || 0, data.vendorCostPerM || 0);
                // 3. Only include the paper if it has a valid price
                if (costPerM > 0) {
                    papers.push({
                        sku: sku,
                        name: data.name,
                        gsm: data.weight || 0,
                        finish: data.finish || 'Uncoated',
                        type: data.type || 'Uncoated',
                        usage: data.usage || 'General' // Used to sort papers in the UI
                    });
                }
            }
        });

        // Sort papers by usage group, then by name
        papers.sort((a, b) => {
            if (a.usage < b.usage) return -1;
            if (a.usage > b.usage) return 1;
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });

        return { papers: papers };
    } catch (error) {
        console.error("Failed to fetch public paper list:", error);
        throw new HttpsError('internal', 'Could not load paper list.');
    }
});

exports.upsertInventoryItem = onCall({ region: 'us-central1' }, async (request) => {
    // 1. Authentication Check
    if (!request.auth || !request.auth.token) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userUid = request.auth.uid;
    try {
        const userDoc = await db.collection('users').doc(userUid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            throw new HttpsError('permission-denied', 'You must be an admin to perform this action.');
        }
    } catch (error) {
        logger.error('Admin check failed', error);
        throw new HttpsError('internal', 'An error occurred while verifying admin status.');
    }

    // 2. Data Validation & Extraction
    const {
        itemId, name, manufacturerSKU, sheetsPerPackage, type, weight, finish,
        thickness_caliper, location, reorderPoint, dimensions, grainDirection,
        brand, color
    } = request.data;

    // Core fields validation
    if (!name || !sheetsPerPackage || !dimensions || !dimensions.width || !dimensions.height || !dimensions.unit || !grainDirection) {
        throw new HttpsError('invalid-argument', 'Missing required fields: name, sheetsPerPackage, dimensions, or grainDirection.');
    }

    // 3. Build the data object for Firestore
    const itemData = {
        name,
        manufacturerSKU: manufacturerSKU || '',
        sheetsPerPackage: parseInt(sheetsPerPackage, 10),
        type: type || '',
        weight: parseFloat(weight) || 0,
        finish: finish || '',
        thickness_caliper: parseFloat(thickness_caliper) || 0,
        location: location || '',
        reorderPoint: parseInt(reorderPoint, 10) || 0,
        dimensions: {
            width: parseFloat(dimensions.width),
            height: parseFloat(dimensions.height),
            unit: dimensions.unit
        },
        grainDirection,
        brand: brand || '', // Optional
        color: color || '', // Optional
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };


    // 4. Upsert Logic
    try {
        if (itemId) {
            // Update existing item
            const itemRef = db.collection('inventory').doc(itemId);
            await itemRef.update(itemData);
            logger.log(`Successfully updated inventory item ${itemId}.`);
            return { success: true, id: itemId };
        } else {
            // Create new item with a system-generated UUID
            const newId = crypto.randomUUID();
            const itemRef = db.collection('inventory').doc(newId);

            // Add create-time fields
            itemData.createdAt = admin.firestore.FieldValue.serverTimestamp();
            itemData.quantityInPackages = 0;
            itemData.quantityLooseSheets = 0;
            itemData.latestCostPerM = 0;
            itemData.vendorCostPerM = 0;

            await itemRef.set(itemData);
            logger.log(`Successfully created new inventory item ${newId}.`);
            return { success: true, id: newId };
        }
    } catch (error) {
        logger.error('Error upserting inventory item:', error);
        throw new HttpsError('internal', 'An unexpected error occurred while saving the item.');
    }
});

exports.reconcileInventory = onCall({ region: 'us-central1' }, async (request) => {
    // 1. Authentication Check
    if (!request.auth || !request.auth.token) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userUid = request.auth.uid;
    try {
        const userDoc = await db.collection('users').doc(userUid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            throw new HttpsError('permission-denied', 'You must be an admin to perform this action.');
        }
    } catch (error) {
        logger.error('Admin check failed', error);
        throw new HttpsError('internal', 'An error occurred while verifying admin status.');
    }

    // 2. Data Validation
    const { inventoryItemId, totalBoxCount } = request.data;
    if (!inventoryItemId || totalBoxCount === undefined) {
        throw new HttpsError('invalid-argument', 'Missing required fields: inventoryItemId or totalBoxCount.');
    }

    const count = parseInt(totalBoxCount, 10);
    if (isNaN(count) || count < 0) {
        throw new HttpsError('invalid-argument', 'Invalid totalBoxCount.');
    }

    // 3. Firestore Transaction
    try {
        await db.runTransaction(async (transaction) => {
            const inventoryRef = db.collection('inventory').doc(inventoryItemId);
            const inventoryDoc = await transaction.get(inventoryRef);

            if (!inventoryDoc.exists) {
                throw new HttpsError('not-found', `Inventory item with ID ${inventoryItemId} not found.`);
            }

            const inventoryData = inventoryDoc.data();
            const sheetsPerPackage = inventoryData.sheetsPerPackage || 500;

            const newPackagesInStock = Math.max(0, count - 1);
            const newLooseSheets = (count > 0) ? sheetsPerPackage : 0;

            transaction.update(inventoryRef, {
                quantityInPackages: newPackagesInStock,
                quantityLooseSheets: newLooseSheets,
                lastVerified: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        logger.log(`Successfully reconciled inventory for item ${inventoryItemId} to ${count} boxes.`);
        return { success: true };

    } catch (error) {
        logger.error(`Error reconciling inventory for item ${inventoryItemId}:`, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', 'An unexpected error occurred while reconciling inventory.');
    }
});

exports.receiveInventory = onCall({ region: 'us-central1' }, async (request) => {
    // 1. Authentication Check
    if (!request.auth || !request.auth.token) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userUid = request.auth.uid;
    try {
        const userDoc = await db.collection('users').doc(userUid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            throw new HttpsError('permission-denied', 'You must be an admin to perform this action.');
        }
    } catch (error) {
        logger.error('Admin check failed', error);
        throw new HttpsError('internal', 'An error occurred while verifying admin status.');
    }

    // 2. Data Validation
    const { inventoryItemId, packagesQuantity, totalCost } = request.data;
    if (!inventoryItemId || !packagesQuantity || !totalCost) {
        throw new HttpsError('invalid-argument', 'Missing required fields: inventoryItemId, packagesQuantity, or totalCost.');
    }

    const packagesReceived = parseInt(packagesQuantity, 10);
    const cost = parseFloat(totalCost);

    if (isNaN(packagesReceived) || isNaN(cost) || packagesReceived <= 0 || cost <= 0) {
        throw new HttpsError('invalid-argument', 'Invalid packagesQuantity or totalCost.');
    }

    // 3. Firestore Transaction
    try {
        await db.runTransaction(async (transaction) => {
            const inventoryRef = db.collection('inventory').doc(inventoryItemId);
            const inventoryDoc = await transaction.get(inventoryRef);

            if (!inventoryDoc.exists) {
                throw new HttpsError('not-found', `Inventory item with ID ${inventoryItemId} not found.`);
            }

            const inventoryData = inventoryDoc.data();
            const sheetsPerPackage = inventoryData.sheetsPerPackage || 500; // Default if not set
            const totalSheetsReceived = packagesReceived * sheetsPerPackage;
            const costPerSheet = cost / totalSheetsReceived;
            const costPerM = costPerSheet * 1000;

            // Update inventory item
            transaction.update(inventoryRef, {
                quantityInPackages: admin.firestore.FieldValue.increment(packagesReceived),
                latestCostPerM: costPerM
            });

            // Create purchase record
            const purchaseRef = db.collection('inventoryPurchases').doc();
            transaction.set(purchaseRef, {
                inventoryItemRef: inventoryRef,
                purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
                quantityPurchasedInPackages: packagesReceived,
                totalCost: cost,
                costPerM_atPurchase: costPerM,
                receivedBy: userUid
            });
        });

        logger.log(`Successfully received ${packagesReceived} packages for item ${inventoryItemId}.`);
        return { success: true };

    } catch (error) {
        logger.error(`Error receiving inventory for item ${inventoryItemId}:`, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', 'An unexpected error occurred while receiving inventory.');
    }
});


// --- Helper Function for Preflight Checks (using pdfinfo) ---
async function runPreflightChecks(filePath, logger) {
    const { spawn } = require('child-process-promise');

    let preflightStatus = 'passed';
    let preflightResults = {
        dpiCheck: { status: 'skipped', details: 'DPI check not implemented yet.' },
        colorSpaceCheck: { status: 'failed', details: 'Color space analysis not run.' },
        fontCheck: { status: 'failed', details: 'Font analysis not run.' }
    };

    // --- Font Check ---
    try {
        const fontInfoResult = await spawn('pdfinfo', ['-fonts', filePath], { capture: ['stdout', 'stderr'] });
        const fontInfoOutput = fontInfoResult.stdout.toString();
        const lines = fontInfoOutput.split('\n');

        const headerLineIndex = lines.findIndex(line => line.includes('emb sub uni'));
        const unembeddedFonts = [];
        let fontsFound = false;

        if (headerLineIndex !== -1) {
            // Start processing from the line after the header separator
            for (let i = headerLineIndex + 2; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim() === '') continue;
                fontsFound = true;

                const columns = line.trim().split(/\s+/).filter(Boolean);
                if (columns.length > 2 && columns[2] === 'no') {
                    unembeddedFonts.push(columns[0]);
                }
            }
        }

        if (unembeddedFonts.length > 0) {
            preflightResults.fontCheck.status = 'failed';
            preflightResults.fontCheck.details = `Error: ${unembeddedFonts.length} font(s) are not embedded: ${unembeddedFonts.join(', ')}.`;
            preflightStatus = 'failed';
        } else if (!fontsFound) {
            preflightResults.fontCheck.status = 'passed';
            preflightResults.fontCheck.details = 'No fonts listed in the document.';
        } else {
            preflightResults.fontCheck.status = 'passed';
            preflightResults.fontCheck.details = 'All fonts embedded.';
        }
    } catch (error) {
        const stderr = (error.stderr || '').toString();
        // If pdfinfo fails, it might be because there are no fonts. If stderr shows the usage text,
        // we'll treat it as a pass for this check.
        if (stderr.includes('Usage: pdfinfo')) {
            logger.warn('pdfinfo -fonts command failed, likely because no fonts were found. Treating as a pass.');
            preflightResults.fontCheck.status = 'passed';
            preflightResults.fontCheck.details = 'No fonts found in the document.';
        } else {
            logger.error('Error during font check:', stderr || error.message);
            preflightResults.fontCheck.status = 'failed';
            preflightResults.fontCheck.details = 'Failed to execute or parse font analysis.';
            preflightStatus = 'failed';
        }
    }

    // --- Color Space Check ---
    // This check is a best-effort heuristic, as pdfinfo doesn't give a simple summary.
    try {
        const pdfInfoResult = await spawn('pdfinfo', [filePath], { capture: ['stdout', 'stderr'] });
        const pdfInfoOutput = pdfInfoResult.stdout.toString();

        const nonCmykIndicators = ['DeviceRGB', 'CalRGB', 'Separation', 'DeviceN'];
        const detectedIssues = [];

        for (const indicator of nonCmykIndicators) {
            if (pdfInfoOutput.includes(indicator)) {
                detectedIssues.push(indicator);
            }
        }
        // ICCBased can be tricky, check if it's not CMYK
        if (pdfInfoOutput.includes('ICCBased') && !pdfInfoOutput.includes('CMYK')) {
             if(!detectedIssues.includes('ICCBased RGB or other')) {
                detectedIssues.push('ICCBased RGB or other');
             }
        }

        if (detectedIssues.length > 0) {
            preflightResults.colorSpaceCheck.status = 'warning';
            preflightResults.colorSpaceCheck.details = `Warning: Non-CMYK color indicators found: ${[...new Set(detectedIssues)].join(', ')}.`;
            if (preflightStatus !== 'failed') {
                preflightStatus = 'warning';
            }
        } else {
            preflightResults.colorSpaceCheck.status = 'passed';
            preflightResults.colorSpaceCheck.details = 'No non-CMYK color indicators found.';
        }
    } catch (error) {
        logger.error('Error during color space check:', error.stderr || error.message);
        preflightResults.colorSpaceCheck.status = 'failed';
        preflightResults.colorSpaceCheck.details = 'Failed to execute or parse color space analysis.';
        if (preflightStatus !== 'failed') preflightStatus = 'failed';
    }

    return {
        preflightStatus,
        preflightResults
    };
}


// --- NEW Callable Function for Generating Guest Links ---
exports.generateGuestLink = onCall({ region: 'us-central1' }, async (request) => {
  // 1. Authentication Check: Ensure the user is a logged-in admin.
  if (!request.auth || !request.auth.token) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const userUid = request.auth.uid;
  try {
    const userDoc = await db.collection('users').doc(userUid).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      throw new HttpsError('permission-denied', 'You must be an admin to perform this action.');
    }
  } catch (error) {
    logger.error('Admin check failed', error);
    throw new HttpsError('internal', 'An error occurred while verifying admin status.');
  }

  // 2. Data Validation: Check for required input (projectId, permissions).
  const { projectId, permissions, expiresDays = 30 } = request.data;
  if (!projectId || !permissions) {
    throw new HttpsError('invalid-argument', 'The function must be called with a "projectId" and "permissions" object.');
  }
  if (typeof permissions.canApprove !== 'boolean' || typeof permissions.canAnnotate !== 'boolean' || typeof permissions.canSeeComments !== 'boolean') {
    throw new HttpsError('invalid-argument', 'The "permissions" object must contain boolean values for "canApprove", "canAnnotate", and "canSeeComments".');
  }

  // 3. Generate Secure Token.
  const token = crypto.randomBytes(20).toString('hex');

  // 4. Calculate Expiration Date.
  const createdAt = admin.firestore.FieldValue.serverTimestamp();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresDays);
  const expiresAtTimestamp = admin.firestore.Timestamp.fromDate(expiresAt);

  // 5. Create Guest Link Document in Firestore.
  const guestLinkRef = db.collection('projects').doc(projectId).collection('guestLinks').doc(token);

  try {
    await guestLinkRef.set({
      projectId: projectId,
      permissions: permissions,
      createdAt: createdAt,
      expiresAt: expiresAtTimestamp,
      viewHistory: [] // Initialize an empty array for view tracking
    });

    logger.log(`Successfully created guest link for project ${projectId} with token ${token}`);

    // 6. Return the full URL to the client.
    // Note: The base URL should be configured or passed in, but we'll hardcode a placeholder for now.
    const baseUrl = 'https://your-app-domain.com/proof.html'; // Replace with your actual domain
    const guestUrl = `${baseUrl}?projectId=${projectId}&guestToken=${token}`;

    return { success: true, url: guestUrl, token: token };

  } catch (error) {
    logger.error('Error creating guest link document in Firestore:', error);
    throw new HttpsError('internal', 'Failed to create the guest link.');
  }
});

// Scheduled function to delete projects marked for deletion.
exports.scheduledProjectDeletion = onSchedule("every day 03:00", async (event) => {
  logger.log("Running scheduled project deletion job.");
  const now = admin.firestore.Timestamp.now();
  const query = db.collection('projects').where('deleteAt', '<=', now);

  const projectsToDelete = await query.get();

  if (projectsToDelete.empty) {
    logger.log("No projects found for deletion.");
    return null;
  }

  const promises = [];
  projectsToDelete.forEach(doc => {
    const projectId = doc.id;
    const projectData = doc.data();
    logger.log(`Starting deletion for project: ${projectId}`);

    // Delete all associated data
    const deletePromise = (async () => {
      // 1. Delete files from Cloud Storage
      const bucket = storage.bucket();
      const prefix = `proofs/${projectId}/`;
      try {
        await bucket.deleteFiles({ prefix: prefix });
        logger.log(`Successfully deleted files in gs://${bucket.name}/${prefix}`);
      } catch (error) {
        logger.error(`Failed to delete files for project ${projectId}`, error);
        // Continue to Firestore deletion even if storage deletion fails
      }

      // 2. Delete all subcollections from Firestore
      const subcollections = ['comments', 'annotations', 'guestLinks'];
      for (const subcollection of subcollections) {
        const subcollectionRef = db.collection('projects').doc(projectId).collection(subcollection);
        const snapshot = await subcollectionRef.get();
        const batch = db.batch();
        snapshot.docs.forEach(subDoc => {
          batch.delete(subDoc.ref);
        });
        await batch.commit();
        logger.log(`Deleted subcollection ${subcollection} for project ${projectId}`);
      }

      // 3. Delete the main project document
      await db.collection('projects').doc(projectId).delete();
      logger.log(`Successfully deleted project document ${projectId}`);
    })();
    promises.push(deletePromise);
  });

  await Promise.all(promises);
  logger.log(`Deletion job finished. Processed ${projectsToDelete.size} projects.`);
  return null;
});

// --- NEW Imposition Functions ---
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { imposePdf: imposePdfLogic } = require('./imposition'); // Import the core logic
const axios = require('axios');
const { PDFDocument } = require('pdf-lib');
const FormData = require('form-data');
const jszip = require('jszip');

const GOTENBERG_URL = 'https://gotenberg-service-452256252711.us-central1.run.app'; //gotenberg service
const GOTENBERG_AUDIENCE = GOTENBERG_URL; // Audience must be the base URL

async function getAuthenticatedClient() {
    // 1. Get an authenticated client that can fetch the ID token.
    // Cloud Functions Gen 2 automatically uses the default service account's credentials.
    const client = await auth.getIdTokenClient(GOTENBERG_AUDIENCE);

    // 2. Create an axios instance that will use the ID token.
    const authenticatedAxios = axios.create({
        headers: {
            // The fetchIdToken method is used to get the token for the required audience
            // The token is cached and refreshed automatically.
            'Authorization': `Bearer ${await client.idTokenProvider.fetchIdToken(GOTENBERG_AUDIENCE)}`
        }
    });
    
    return authenticatedAxios;
}

// Add required imports at the top of index.js if they aren't there already:
// const { spawn } = require('child-process-promise'); // This is already present later, but adding here for clarity
// const path = require('path');
// const os = require('os');

// --- REFACTORED HELPER: Stores a single PDF page buffer and returns its metadata ---
async function storePageAsPdf({ pageBuffer, pageNum, tempId }) {
    const pageId = crypto.randomBytes(10).toString('hex');
    const bucket = admin.storage().bucket();

    const pdfDoc = await PDFDocument.load(pageBuffer);
    const { width, height } = pdfDoc.getPage(0).getSize();

    // 1. Define paths
    const tempSourcePath = `temp_sources/${tempId}/${pageId}.pdf`; // Changed folder name for clarity
    const sourceFilePath = path.join(os.tmpdir(), `${pageId}_source.pdf`);
    const previewFileName = `${pageId}_preview.pdf`;
    const previewFilePath = path.join(os.tmpdir(), previewFileName);
    const tempPreviewPath = `temp_previews/${tempId}/${previewFileName}`; // NEW: Path for the Cloud Storage preview file

    // 2. Save source buffer to local temp file
    fs.writeFileSync(sourceFilePath, pageBuffer);
    
    // 3. Run Ghostscript to create the optimized PREVIEW file
    logger.log(`Generating preview for page ${pageNum} using Ghostscript...`);
    await spawn('gs', [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/ebook', // Use a small, screen-friendly setting
        '-dConvertCMYKImagesToRGB=true',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile=${previewFilePath}`, // Output to local temp path
        sourceFilePath // Input from local temp path
    ]);
    logger.log(`Preview saved locally to ${previewFilePath}`);

    // 4. Upload the original SOURCE and the new PREVIEW to Cloud Storage
    await bucket.file(tempSourcePath).save(pageBuffer, { contentType: 'application/pdf' });
    logger.log(`Saved single-page SOURCE temporarily to ${tempSourcePath}`);
    
    // Upload the optimized PREVIEW file
    await bucket.upload(previewFilePath, { destination: tempPreviewPath, contentType: 'application/pdf' });
    logger.log(`Saved single-page PREVIEW temporarily to ${tempPreviewPath}`);
    
    // 5. Clean up local temp files
    fs.unlinkSync(sourceFilePath);
    fs.unlinkSync(previewFilePath);

    // 6. Return all required metadata, including the NEW tempPreviewPath
    return {
        pageId,
        pageNumber: pageNum,
        tempSourcePath,
        tempPreviewPath, // <--- 🛑 THE FIX IS HERE
        width,
        height,
        status: 'complete'
    };
}

exports.generatePreviews = onCall({
    region: 'us-central1',
    memory: '4GiB', // Adjust as needed
    timeoutSeconds: 540
}, async (request) => {
    // No projectId needed here, get paths from request data
    const { filePath: originalFilePath, originalName: originalFileName } = request.data;

    if (!originalFilePath || !originalFileName) {
        throw new HttpsError('invalid-argument', 'Missing "filePath" or "originalName".');
    }

    // Extract a temporary identifier from the path (e.g., the folder name after 'temp_uploads/')
    const pathParts = originalFilePath.split('/'); // e.g., ['temp_uploads', tempId, filename]
    const tempId = pathParts.length > 2 ? pathParts[1] : `unknown_${Date.now()}`; // Get tempId

    logger.log(`Generating previews for temp upload: ${originalFilePath}`);

    try {
        const bucket = admin.storage().bucket();
        const authAxios = await getAuthenticatedClient();
        const originalFile = bucket.file(originalFilePath);

        let multiPagePdfBuffer;
        let tempPdfPathForSplit = originalFilePath; // Default to the uploaded file path
        const fileExtension = path.extname(originalFileName).toLowerCase();

        // --- 1. Conversion or Direct Use ---
        if (fileExtension === '.pdf') {
            logger.log('File is already a PDF, proceeding directly.');
            // We need the buffer to check page count later, but conversion is skipped.
            [multiPagePdfBuffer] = await originalFile.download();
            // tempPdfPathForSplit is already originalFilePath
        } else {
            logger.log(`File is '${fileExtension}', calling LibreOffice convert...`);
            // Download buffer to send to Gotenberg for conversion
            const [sourceBuffer] = await originalFile.download();

            // --- LibreOffice Conversion ---
            const convertFormData = new FormData();
            convertFormData.append('files', sourceBuffer, originalFileName);
            
            const convertResponse = await authAxios.post(`${GOTENBERG_URL}/forms/libreoffice/convert`, convertFormData, {
                responseType: 'arraybuffer'
            }).catch(err => { 
                const gotenbergError = err.response?.data ? Buffer.from(err.response.data).toString() : err.message;
                logger.error('Gotenberg LibreOffice conversion failed:', gotenbergError);
                throw new HttpsError('internal', `LibreOffice conversion failed: ${gotenbergError}`); 
            });
            
            multiPagePdfBuffer = convertResponse.data;
            logger.log('LibreOffice conversion successful.');

            // Upload the converted PDF back to storage temporarily to get a path for splitting
            const convertedFileName = path.basename(originalFilePath).replace(fileExtension, '.pdf');
            tempPdfPathForSplit = `temp_uploads/${tempId}/converted_${convertedFileName}`;
            await bucket.file(tempPdfPathForSplit).save(multiPagePdfBuffer, { contentType: 'application/pdf' });
        }


        const tempDoc = await PDFDocument.load(multiPagePdfBuffer);
        const pageCount = tempDoc.getPageCount();

        // --- 2. Handle Single Page Case (No Splitting) ---
        if (pageCount <= 1) {
            logger.log(`Document has only ${pageCount} page(s). Storing single PDF.`);
            
            // Store the single-page PDF, generate the preview, and get its metadata
            const pageData = await storePageAsPdf({
                pageBuffer: multiPagePdfBuffer, // Use the full buffer as the single page source
                pageNum: 1,
                tempId: tempId
            });
            
            // Return the single page data array to the client
            return { pages: [pageData] }; 
        }

        // --- 3. PDF Splitting (Runs ONLY if pageCount > 1) ---

        // 🛑 CRITICAL FIX: Bypass 32MB limit by generating a signed URL for Gotenberg to fetch
        const fileToSplit = bucket.file(tempPdfPathForSplit);
        const [signedUrl] = await fileToSplit.getSignedUrl({
             action: 'read',
             expires: Date.now() + 3600 * 1000 // Expires in 1 hour
        });
        logger.log(`Generated signed URL for splitting: ${signedUrl}`);

        const splitFormData = new FormData();
        // 🚨 FIX: Pass the signed URL with the full options object so Gotenberg's multipart parser 
        // recognizes it as a remote file, not just a string.
        const remoteFile = {
            value: signedUrl,
            options: {
                filename: 'remote_file.pdf', // Gotenberg requires a filename to identify the type
                contentType: 'application/pdf'
            }
        };
        splitFormData.append('files', remoteFile.value, remoteFile.options); // Use the format FormData expects

        splitFormData.append('splitMode', 'pages'); // Tell Gotenberg to split by page
        splitFormData.append('splitSpan', '1-');   // Tell Gotenberg to split all pages (1-to-end)
        logger.log('Calling PDF split using signed URL...');
        
        const splitResponse = await authAxios.post(`${GOTENBERG_URL}/forms/pdfengines/split`, splitFormData, {
            responseType: 'arraybuffer',
        }).catch(err => { 
            const gotenbergError = err.response?.data ? Buffer.from(err.response.data).toString() : err.message;
            logger.error('Gotenberg PDF splitting failed with URL:', gotenbergError);
            throw new HttpsError('internal', `PDF splitting failed: ${gotenbergError}. The file may be too large for the Gotenberg service to handle even via URL.`); 
        });
        logger.log('PDF splitting successful.');

        const zip = await jszip.loadAsync(splitResponse.data);
        const singlePagePdfBuffers = [];
        const fileNames = Object.keys(zip.files).sort(); // Sort numerically (e.g., 1.pdf, 2.pdf ...)

        // Process files in sorted order
        for (const fileName of fileNames) {
            const buffer = await zip.files[fileName].async('nodebuffer');
            singlePagePdfBuffers.push(buffer);
        }
        logger.log(`Extracted ${singlePagePdfBuffers.length} pages from zip.`);

        const processedPagesData = []; // Array to hold results for the client

        // Multi-page processing now uses the helper function for efficiency
        const processingPromises = singlePagePdfBuffers.map(async (pageBuffer, index) => {
            const pageNum = index + 1;

            // Use the helper to store the single-page PDF and return metadata
            const pageData = await storePageAsPdf({
                pageBuffer: pageBuffer, // Use the split page buffer
                pageNum: pageNum,
                tempId: tempId
            });

            processedPagesData.push(pageData);
            return pageData;
        });

        await Promise.all(processingPromises);
        logger.log('All pages processed successfully.');

        // Return the array of processed page data
        processedPagesData.sort((a, b) => a.pageNumber - b.pageNumber);
        return { pages: processedPagesData };

    } catch (error) {
        
        logger.error('Error in generatePreviews:', error.response?.data ? Buffer.from(error.response.data).toString() : error);
        
        // Extract error message from Gotenberg if available
        const message = error.response?.data ? Buffer.from(error.response.data).toString() : (error.message || 'An internal error occurred during preview generation.');
        
        // If it's already an HttpsError, rethrow it, otherwise wrap it
        if (error.code && error.httpErrorCode) {
             throw error;
        }
        throw new HttpsError('internal', message);
    }
});


// HTTP Callable function for manual imposition

exports.generateFinalPdf = onCall({
    region: 'us-central1',
    memory: '4GiB', // Adjust if needed
    timeoutSeconds: 300
}, async (request) => {
    // Auth check (allow admin or relevant user if needed, simplified for now)
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    // *** Get tempSourcePath instead of sourcePaths ***
    const { projectId, tempSourcePath } = request.data;
    const userUid = request.auth.uid; // Keep track of who initiated

    if (!projectId || !Array.isArray(tempSourcePath) || tempSourcePath.length === 0) {
        throw new HttpsError('invalid-argument', 'Missing "projectId" or valid "tempSourcePath" array.');
    }

    logger.log(`Generating final PDF for project ${projectId} from ${tempSourcePath.length} source paths.`);

    let finalPdfPath;
    let finalPdfBuffer;
    let localTempFiles = []; // Array to track temporary files for cleanup

    try {
        const bucket = admin.storage().bucket();
        
        // 1. Download all source pages locally
        logger.log('Downloading all temporary source files locally...');
        const pageFilePaths = []; // To hold paths to downloaded single page files
        
        for (let i = 0; i < tempSourcePath.length; i++) {
            const tempPath = tempSourcePath[i];
            const localFileName = `${crypto.randomBytes(10).toString('hex')}_page_${i + 1}.pdf`;
            const localFilePath = path.join(os.tmpdir(), localFileName);
            
            localTempFiles.push(localFilePath); // Add to cleanup list

            try {
                // Download the single-page PDF to the local file system
                await bucket.file(tempPath).download({ destination: localFilePath });
                pageFilePaths.push(localFilePath);
            } catch (downloadError) {
                logger.error(`Failed to download temporary file: ${tempPath}`, downloadError);
                throw new HttpsError('internal', `Failed to retrieve page source: ${tempPath}`);
            }
        }
        logger.log(`All ${pageFilePaths.length} source pages downloaded locally.`);

        // 2. Local Merge using pdf-lib (REPLACING qpdf)
        logger.log('Starting local PDF merge using pdf-lib...');
        
        // This uses the { PDFDocument } import you already have on line 497
        const mergedPdf = await PDFDocument.create();

        for (const localFilePath of pageFilePaths) {
            // Read the downloaded single-page PDF from /tmp
            // This requires 'const fsPromises = require('fs').promises;' at the top of your file
            const pdfBytes = await fs.promises.readFile(localFilePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            
            // Copy the single page from that doc (assuming each file *is* a single page)
            const [copiedPage] = await mergedPdf.copyPages(pdfDoc, [0]);
            mergedPdf.addPage(copiedPage);
        }

        // 3. Save the merged document into a buffer
        finalPdfBuffer = await mergedPdf.save(); // This variable is already declared higher up

        logger.log('Local PDF merge successful.');

        // 4. Save the final PDF to the correct 'proofs/' path using the REAL projectId
        const finalPdfFileName = `${Date.now()}_GeneratedProof.pdf`;
        finalPdfPath = `proofs/${projectId}/${finalPdfFileName}`; // Use 'proofs/' prefix

        logger.log(`Uploading final merged PDF to ${finalPdfPath}`);
        await bucket.file(finalPdfPath).save(finalPdfBuffer, { contentType: 'application/pdf' });
        logger.log('Final PDF uploaded successfully.');

        // Return the FINAL path
        return { finalPdfPath: finalPdfPath };

    } catch (error) {
        logger.error('Error in generateFinalPdf:', error);
        const message = error.message || 'An internal error occurred generating the final PDF.';
        
        // If it's already an HttpsError, rethrow it, otherwise wrap it
        if (error instanceof HttpsError) {
             throw error;
        } else {
             throw new HttpsError('internal', `PDF merging failed: ${message}`);
        }
    } finally {
        // 5. Cleanup local files (This is still needed for the downloaded pages)
        for (const filePath of localTempFiles) {
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) { logger.warn(`Failed to delete temp file: ${filePath}`, e); }
            }
        }
    }
});

exports.imposePdf = onCall({
  region: 'us-central1',
  memory: '4GiB', // Imposition can be memory intensive
  timeoutSeconds: 540
}, async (request) => {
  // 1. Authentication Check
  if (!request.auth || !request.auth.token) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const userUid = request.auth.uid;
  try {
    const userDoc = await db.collection('users').doc(userUid).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      throw new HttpsError('permission-denied', 'You must be an admin to perform this action.');
    }
  } catch (error) {
    logger.error('Admin check failed', error);
    throw new HttpsError('internal', 'An error occurred while verifying admin status.');
  }

  // 2. Data Validation (ensure projectId and settings are passed)
  const { projectId, settings } = request.data;
  if (!projectId || !settings) {
    throw new HttpsError('invalid-argument', 'Missing "projectId" or "settings".');
  }

  logger.log(`Manual imposition triggered for project ${projectId} by user ${userUid}`);

  try {
    const projectRef = db.collection('projects').doc(projectId);
    const projectDoc = await projectRef.get();
    if (!projectDoc.exists) {
      throw new HttpsError('not-found', `Project ${projectId} not found.`);
    }
    const projectData = projectDoc.data();

    const latestVersion = projectData.versions.reduce((latest, v) => (v.versionNumber > latest.versionNumber ? v : latest), projectData.versions[0]);
    if (!latestVersion || !latestVersion.fileURL) {
      throw new HttpsError('not-found', 'No file found for the latest version.');
    }

    const bucket = admin.storage().bucket();
    const filePath = new URL(latestVersion.fileURL).pathname.split('/o/')[1].replace(/%2F/g, '/');
    const file = bucket.file(decodeURIComponent(filePath));

    // 3. Call main imposition logic
    const imposedPdfBytes = await imposePdfLogic({
      inputFile: file,
      settings: settings,
      jobInfo: projectData,
    });

    // 4. Upload result to storage
    const imposedFileName = `imposed_manual_${Date.now()}.pdf`;
    const imposedFilePath = `imposed/${projectId}/${imposedFileName}`;
    const imposedFile = bucket.file(imposedFilePath);
    await imposedFile.save(imposedPdfBytes, { contentType: 'application/pdf' });
    const [imposedFileUrl] = await imposedFile.getSignedUrl({ action: 'read', expires: '03-09-2491' });

    // 5. Update Firestore
    await projectRef.update({
      impositions: admin.firestore.FieldValue.arrayUnion({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        fileURL: imposedFileUrl,
        settings: settings,
        type: 'manual',
        triggeredBy: userUid,
      }),
    });

    logger.log(`Successfully created manual imposition for project ${projectId}`);
    return { success: true, url: imposedFileUrl };

  } catch (error) {
    logger.error(`Error during manual imposition for project ${projectId}:`, error);
    throw new HttpsError('internal', error.message || 'An internal error occurred.');
  }
});


// Firestore Trigger for automatic imposition
exports.onProjectApprove = onDocumentUpdated('projects/{projectId}', async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  if (beforeData.status !== 'Approved' && afterData.status === 'Approved') {
    const projectId = event.params.projectId;
    logger.log(`Automatic imposition triggered for project ${projectId}`);

    try {
      // 1. Get the latest version's file from the project
      const latestVersion = afterData.versions.reduce((latest, v) => (v.versionNumber > latest.versionNumber ? v : latest), afterData.versions[0]);
      if (!latestVersion || !latestVersion.fileURL) {
        throw new HttpsError('not-found', 'No file found for the latest version of the project.');
      }

      const bucket = admin.storage().bucket();
      const filePath = new URL(latestVersion.fileURL).pathname.split('/o/')[1].replace(/%2F/g, '/');
      const file = bucket.file(decodeURIComponent(filePath));

      // 2. Load the PDF to get its dimensions
      const [fileBytes] = await file.download();
      const { PDFDocument } = require('pdf-lib');
      const inputPdfDoc = await PDFDocument.load(fileBytes);
      const { width, height } = inputPdfDoc.getPage(0).getSize();

      // 3. Run the "Maximize N-Up" algorithm
      const { maximizeNUp } = require('./imposition');
      const settings = await maximizeNUp(width, height);
      logger.log(`Optimal layout for project ${projectId}: ${settings.columns}x${settings.rows} on ${settings.sheet.name}`);

      // 4. Call the main imposition logic
      const imposedPdfBytes = await imposePdfLogic({
        inputFile: file,
        settings: settings,
        jobInfo: afterData
      });

      // 5. Upload result to storage
      const imposedFileName = `imposed_${Date.now()}.pdf`;
      const imposedFilePath = `imposed/${projectId}/${imposedFileName}`;
      const imposedFile = bucket.file(imposedFilePath);
      await imposedFile.save(imposedPdfBytes, { contentType: 'application/pdf' });

      // 6. Update Firestore with the new imposition record
      const projectRef = db.collection('projects').doc(projectId);
      await projectRef.update({
        impositions: admin.firestore.FieldValue.arrayUnion({
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          fileURL: await imposedFile.getSignedUrl({ action: 'read', expires: '03-09-2491' })[0],
          settings: settings,
          type: 'automatic'
        }),
        status: 'Imposition Complete'
      });

      logger.log(`Successfully imposed and updated project ${projectId}`);

    } catch (error) {
      logger.error(`Error during automatic imposition for project ${projectId}:`, error);
      // 7. Handle errors
      const projectRef = db.collection('projects').doc(projectId);
      await projectRef.update({
        status: 'Imposition Failed',
        impositionError: error.message
      });
    }
  }

  return null;
});