const test = require('firebase-functions-test')();
const assert = require('assert');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

describe('optimizePdf', () => {
  let myFunctions;

  before(() => {
    myFunctions = require('./index.js');
  });

  after(() => {
    test.cleanup();
  });

  it('should create a preview of a newly uploaded pdf', async () => {
    const projectId = `project-${Date.now()}`;
    const fileName = `test-${Date.now()}.pdf`;
    const filePath = `proofs/${projectId}/${fileName}`;
    const tempFilePath = path.join(__dirname, 'test-data', 'test.pdf');
    const storage = new Storage();
    const bucket = storage.bucket('default-bucket');

    // Upload the test file to the storage emulator
    await bucket.upload(tempFilePath, { destination: filePath });

    // Create a fake event
    const event = {
      data: {
        bucket: 'default-bucket',
        name: filePath,
        contentType: 'application/pdf',
      },
    };

    // Create a project in firestore
    await admin.firestore().collection('projects').doc(projectId).set({
      versions: [{ fileURL: `gs://default-bucket/${filePath}` }],
    });

    // Run the function
    await myFunctions.optimizePdf(event);

    // Check that the preview file was created
    const previewFileName = `${path.basename(fileName, '.pdf')}_preview.pdf`;
    const previewFilePath = `proofs/${projectId}/${previewFileName}`;
    const fileExists = await bucket.file(previewFilePath).exists();
    assert.strictEqual(fileExists[0], true);
  }).timeout(10000);
});
