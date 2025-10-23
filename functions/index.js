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
  memory: '1GiB',      // More memory for Ghostscript
  cpu: 2,                // More CPU for Ghostscript
  timeoutSeconds: 540,   // Longer timeout for processing
  // NOTE: Gen 2 functions use the default Compute Engine service account.
  // Ensure it has permissions for Storage (Storage Object Admin) and Firestore (Cloud Datastore User).
}, async (event) => {
  
  // The 'object' is now 'event.data'
  const file = event.data;
  const filePath = file.name;
  const contentType = file.contentType;
  const fileBucket = file.bucket;

  // Exit if the file is not a PDF or is already a preview
  if (!contentType.startsWith('application/pdf') || filePath.endsWith('_preview.pdf')) {
    return logger.log('Not a target file or already processed.');
  }

  // Extract projectId, versionNumber from the file path
  // Expected path: proofs/{projectId}/{fileName}
  const parts = filePath.split('/');
  if (parts.length < 3 || parts[0] !== 'proofs') {
      return logger.log(`File path does not match expected structure proofs/{projectId}/{fileName}. Got: ${filePath}`);
  }
  const projectId = parts[1];
  const fileName = path.basename(filePath);

  logger.log(`Processing file: ${fileName} for project: ${projectId}`);

  const bucket = storage.bucket(fileBucket);
  const tempFilePath = path.join(os.tmpdir(), fileName);
  const previewFileName = `${path.basename(fileName, '.pdf')}_preview.pdf`;
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
      expires: '03-09-2491' // A far-future expiration date
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

      // Find the version by matching the fileURL
      // We must encode the original filePath to match how it might be stored
      const encodedFilePath = encodeURIComponent(filePath);
      const versionIndex = versions.findIndex(v => v.fileURL && v.fileURL.includes(encodedFilePath));

      if (versionIndex === -1) {
        // Log the error but don't throw, to prevent retries on a non-existent entry
        logger.warn(`No version found for file path ${filePath} in project ${projectId}. URL in db might not match.`);
        return; // Exit transaction gracefully
      }

      versions[versionIndex].previewURL = signedUrl;
      transaction.update(projectRef, { versions: versions });
      logger.log(`Firestore updated for project ${projectId}, version index ${versionIndex}`);
    });

  } catch (error) {
    logger.error('Error processing PDF:', error);
  } finally {
    // Clean up temporary files
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    if (fs.existsSync(tempPreviewPath)) fs.unlinkSync(tempPreviewPath);
  }

  return null;
});