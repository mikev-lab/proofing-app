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

    try {
        // Optional: Add permission checks here if needed (e.g., check if user is admin or belongs to the project's company)

        const bucket = admin.storage().bucket();
        const authAxios = await getAuthenticatedClient();
        const mergeFormData = new FormData();

        // Download files from temporary source paths
        logger.log('Downloading temporary source files...');
        for (let i = 0; i < tempSourcePath.length; i++) {
            const tempPath = tempSourcePath[i];
            if (!tempPath || typeof tempPath !== 'string') {
                 throw new HttpsError('invalid-argument', `Invalid source path provided at index ${i}`);
            }
            try {
                const [buffer] = await bucket.file(tempPath).download();
                 // Use index for filename to ensure order if Gotenberg relies on it
                mergeFormData.append('files', buffer, `${String(i).padStart(4, '0')}.pdf`);
            } catch (downloadError) {
                 logger.error(`Failed to download temporary file: ${tempPath}`, downloadError);
                 throw new HttpsError('internal', `Failed to retrieve page source: ${tempPath}`);
            }
        }
        logger.log('Temporary source files downloaded.');

        // Call Gotenberg merge API
        logger.log('Calling Gotenberg merge...');
        const mergeResponse = await authAxios.post(`${GOTENBERG_URL}/forms/pdfengines/merge`, mergeFormData, {
            responseType: 'arraybuffer'
        }).catch(err => { throw new HttpsError('internal', `PDF merging failed: ${err.message}`); });
        logger.log('Gotenberg merge successful.');

        const finalPdfBuffer = mergeResponse.data;

        // *** Save the final PDF to the correct 'proofs/' path using the REAL projectId ***
        const finalFileName = `${Date.now()}_GeneratedProof.pdf`;
        const finalPdfPath = `proofs/${projectId}/${finalFileName}`; // Use 'proofs/' prefix

        logger.log(`Uploading final merged PDF to ${finalPdfPath}`);
        await bucket.file(finalPdfPath).save(finalPdfBuffer, { contentType: 'application/pdf' });
        logger.log('Final PDF uploaded successfully.');

        // Return the FINAL path
        return { finalPdfPath: finalPdfPath };

    } catch (error) {
        logger.error('Error in generateFinalPdf:', error.response?.data ? Buffer.from(error.response.data).toString() : error);
        const message = error.response?.data ? Buffer.from(error.response.data).toString() : (error.message || 'An internal error occurred generating the final PDF.');
        // If it's already an HttpsError, rethrow it, otherwise wrap it
        if (error instanceof HttpsError) {
             throw error;
        } else {
             throw new HttpsError('internal', message);
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