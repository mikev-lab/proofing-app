// IMPORTANT: This function requires a custom execution environment with Ghostscript installed.
// The standard Cloud Functions environment does not include it by default.
// You can create a custom environment using a Dockerfile with a Gen 2 function.
// Example Dockerfile command: RUN apt-get update && apt-get install -y ghostscript

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const os = require('os');
const fs = require('fs');

admin.initializeApp();
const storage = new Storage();
const db = admin.firestore();

exports.optimizePdf = functions.storage.object().onFinalize(async (object) => {
  const filePath = object.name;
  const contentType = object.contentType;

  // Exit if the file is not a PDF or is already a preview
  if (!contentType.startsWith('application/pdf') || filePath.endsWith('_preview.pdf')) {
    return functions.logger.log('Not a target file or already processed.');
  }

  // Extract projectId, versionNumber from the file path
  // Expected path: proofs/{projectId}/{fileName}
  // Expected path: proofs/{projectId}/{fileName}
  const parts = filePath.split('/');
  if (parts.length < 3 || parts[0] !== 'proofs') {
      return functions.logger.log(`File path does not match expected structure proofs/{projectId}/{fileName}. Got: ${filePath}`);
  }
  const projectId = parts[1];
  const fileName = path.basename(filePath);

  functions.logger.log(`Processing file: ${fileName} for project: ${projectId}`);

  const bucket = storage.bucket(object.bucket);
  const tempFilePath = path.join(os.tmpdir(), fileName);
  const previewFileName = `${path.basename(fileName, '.pdf')}_preview.pdf`;
  const tempPreviewPath = path.join(os.tmpdir(), previewFileName);

  try {
    // Download the file
    await bucket.file(filePath).download({ destination: tempFilePath });
    functions.logger.log('File downloaded locally to', tempFilePath);

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
    functions.logger.log('PDF optimized and saved to', tempPreviewPath);

    // Upload the optimized PDF
    const destination = filePath.replace(path.basename(filePath), previewFileName);
    await bucket.upload(tempPreviewPath, { destination: destination });
    functions.logger.log('Optimized PDF uploaded to', destination);

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
      const encodedFilePath = encodeURIComponent(filePath);
      const versionIndex = versions.findIndex(v => v.fileURL && v.fileURL.includes(encodedFilePath));

      if (versionIndex === -1) {
        throw new Error(`No version found for file path ${filePath} in project ${projectId}`);
      }

      versions[versionIndex].previewURL = signedUrl;
      transaction.update(projectRef, { versions: versions });
      functions.logger.log(`Firestore updated for project ${projectId}, version index ${versionIndex}`);
    });

  } catch (error) {
    functions.logger.error('Error processing PDF:', error);
  } finally {
    // Clean up temporary files
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    if (fs.existsSync(tempPreviewPath)) fs.unlinkSync(tempPreviewPath);
  }

  return null;
});
