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

// Your existing imports
const admin =require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const os = require('os');
const fs = require('fs');

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

    // --- Preflight Checks ---
    const { spawn } = require('child-process-promise');
    const preflightResults = await runPreflightChecks(tempFilePath, logger);
    logger.log('Preflight checks completed.', preflightResults);


    // Optimize the PDF using Ghostscript
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
    const previewFile = bucket.file(destination);
    const [signedUrl] = await previewFile.getSignedUrl({
      action: 'read',
      expires: '03-09-2491'
    });

    // --- Update Firestore with SUCCESS status ---
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

      // Update the found version with the previewURL and status
      versions[versionIndex].previewURL = signedUrl;
      versions[versionIndex].processingStatus = 'complete';
      versions[versionIndex].processingError = null; // Clear any previous error
      versions[versionIndex].preflightStatus = preflightResults.preflightStatus;
      versions[versionIndex].preflightResults = preflightResults.preflightResults;
      transaction.update(projectRef, { versions: versions });
      logger.log(`Successfully updated Firestore for project ${projectId}, version index ${versionIndex} with previewURL and status 'complete'.`);
    });

  } catch (error) {
    logger.error('Error processing PDF:', error);
    // --- Update Firestore with ERROR status ---
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


// --- Helper Function for Preflight Checks ---
async function runPreflightChecks(filePath, logger) {
    const { spawn } = require('child-process-promise');
    const results = {
        dpiCheck: { status: 'passed', details: 'No low-resolution images detected.' },
        colorSpaceCheck: { status: 'passed', details: 'Colors appear to be CMYK.' },
        fontCheck: { status: 'passed', details: 'All fonts appear to be embedded.' }
    };
    let overallStatus = 'passed';

    try {
        // 1. DPI Check Heuristic (using pdfimages)
        // This is a HEURISTIC. It can't calculate the *actual* DPI without knowing the
        // physical size of the image on the page. Instead, we identify images that are
        // physically large on the page but have low pixel dimensions.
        const imageListPromise = spawn('pdfimages', ['-list', filePath], { capture: ['stdout', 'stderr'] });
        const imageListResult = await imageListPromise;
        const imageListOutput = imageListResult.stdout.toString();
        const lines = imageListOutput.split('\n').slice(2);

        let lowResImages = [];
        // A4 paper size in points. An image covering a significant portion of a page
        // should have a correspondingly high pixel count.
        const LARGE_DIMENSION_THRESHOLD_PT = 420; // Approx 5.8 inches
        const MIN_PIXEL_DIMENSION_FOR_LARGE_IMAGE = 875; // 5.8 inches * 150 DPI

        for (const line of lines) {
            if (line.trim() === '') continue;
            const columns = line.trim().split(/\s+/);
            const widthPx = parseInt(columns[3], 10);
            const heightPx = parseInt(columns[4], 10);
            const widthPt = parseFloat(columns[9]);
            const heightPt = parseFloat(columns[10]);

            if ([widthPx, heightPx, widthPt, heightPt].some(isNaN)) continue;

            // Check if the image is physically large but has a low pixel count
            if ((widthPt > LARGE_DIMENSION_THRESHOLD_PT || heightPt > LARGE_DIMENSION_THRESHOLD_PT) &&
                (widthPx < MIN_PIXEL_DIMENSION_FOR_LARGE_IMAGE || heightPx < MIN_PIXEL_DIMENSION_FOR_LARGE_IMAGE)) {
                lowResImages.push(`page ${columns[0]}: ${widthPx}x${heightPx}px (at ${widthPt.toFixed(0)}x${heightPt.toFixed(0)}pt)`);
            }
        }

        if (lowResImages.length > 0) {
            results.dpiCheck.status = 'warning';
            results.dpiCheck.details = `Found ${lowResImages.length} image(s) that may be low resolution: ${lowResImages.join(', ')}.`;
            overallStatus = 'warning';
        }

    } catch (error) {
        logger.error('Error during DPI check:', error.stderr || error.message);
        results.dpiCheck.status = 'failed';
        results.dpiCheck.details = 'Failed to analyze image resolutions.';
        overallStatus = 'failed';
    }

    try {
        // 2. Color Space & Font Check (using exiftool)
        const exiftoolPromise = spawn('exiftool', ['-json', '-G', '-S', filePath], { capture: ['stdout', 'stderr'] });
        const exiftoolResult = await exiftoolPromise;
        const exiftoolOutput = JSON.parse(exiftoolResult.stdout.toString())[0];

        // Color Space Check
        const colorIssues = [];
        const hasRGB = Object.values(exiftoolOutput).some(val => typeof val === 'string' && val.includes('RGB'));
        const hasSpot = Object.values(exiftoolOutput).some(val => typeof val === 'string' && val.includes('Separation'));

        if (hasRGB) colorIssues.push('File contains RGB color spaces.');
        if (hasSpot) colorIssues.push('File contains Spot colors.');

        if (colorIssues.length > 0) {
            results.colorSpaceCheck.status = 'warning';
            results.colorSpaceCheck.details = colorIssues.join(' ');
            if (overallStatus !== 'failed') overallStatus = 'warning';
        }

        // Font Check - more reliable
        const allFonts = Object.keys(exiftoolOutput)
            .filter(k => k.startsWith('FontName-'))
            .map(k => exiftoolOutput[k]);

        const unembeddedFonts = allFonts.filter(font =>
            typeof font === 'string' && !(font.includes('(Embedded') || font.includes('Subset)'))
        );

        if (allFonts.length === 0) {
             results.fontCheck.status = 'warning';
             results.fontCheck.details = 'No font information was found. Text may not render correctly.';
             if (overallStatus !== 'failed') overallStatus = 'warning';
        } else if (unembeddedFonts.length > 0) {
            results.fontCheck.status = 'warning';
            results.fontCheck.details = `Found ${unembeddedFonts.length} font(s) that may not be embedded: ${unembeddedFonts.join(', ')}.`;
            if (overallStatus !== 'failed') overallStatus = 'warning';
        }

    } catch (error) {
        logger.error('Error during exiftool check:', error.stderr || error.message);
        results.colorSpaceCheck.status = 'failed';
        results.colorSpaceCheck.details = 'Failed to analyze color spaces.';
        results.fontCheck.status = 'failed';
        results.fontCheck.details = 'Failed to analyze font embedding.';
        overallStatus = 'failed';
    }

    return {
        preflightStatus: overallStatus,
        preflightResults: results
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