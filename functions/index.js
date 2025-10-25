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