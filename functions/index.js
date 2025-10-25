// IMPORTANT: This function requires a custom execution environment with Ghostscript installed.
// The standard Cloud Functions environment does not include it by default.
// You can create a custom environment using a Dockerfile with a Gen 2 function.
// Example Dockerfile command: RUN apt-get update && apt-get install -y ghostscript

// Gen 2 Imports:
// The function is onObjectFinalized (with a 'd')
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const logger = require('firebase-functions/logger');

// Your existing imports
const admin = require('firebase-admin');
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
  const tempFilePath = path.join(os.tmpdir(), fullFileName); // Use fullFileName for temp download
  const previewFileName = `${path.basename(fullFileName, '.pdf')}_preview.pdf`; // Use fullFileName for preview name base
  const tempPreviewPath = path.join(os.tmpdir(), previewFileName);

  try {
    // Download the file
    await bucket.file(filePath).download({ destination: tempFilePath });
    logger.log('File downloaded locally to', tempFilePath);

    // Optimize the PDF using Ghostscript
    const { spawn } = require('child-process-promise');
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

    // Update Firestore using a transaction
    const projectRef = db.collection('projects').doc(projectId);
    await db.runTransaction(async (transaction) => {
      const projectDoc = await transaction.get(projectRef);
      if (!projectDoc.exists) {
        throw new Error(`Project ${projectId} not found in Firestore.`);
      }

      const projectData = projectDoc.data();
      const versions = projectData.versions || [];

      // --- Use filePath for matching ---
      logger.log(`Attempting to find version index matching filePath: "${filePath}"`);
      // The filePath from the event trigger *is* the storage object path
      const versionIndex = versions.findIndex(v => v.filePath === filePath);
      logger.log(`Result of findIndex: ${versionIndex}`);
      // --- End Match Logic ---

      if (versionIndex === -1) {
        logger.warn(`No version found matching filePath "${filePath}" in project ${projectId}. Check if filePath was stored correctly during upload. Versions found: ${JSON.stringify(versions.map(v => ({ fileName: v.fileName, fileURL: v.fileURL, filePath: v.filePath })))}`);
        return; // Exit transaction gracefully
      }

      // Update the found version with the previewURL
      versions[versionIndex].previewURL = signedUrl;
      transaction.update(projectRef, { versions: versions });
      logger.log(`Firestore updated for project ${projectId}, version index ${versionIndex} with previewURL.`);
    });

  } catch (error) {
    logger.error('Error processing PDF:', error);
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