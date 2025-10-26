
const assert = require('assert');
const admin = require('firebase-admin');
const test = require('firebase-functions-test')();
const sinon = require('sinon');

// Make sinon quiet
sinon.stub(console, 'log');

describe('Cloud Functions', () => {
    let myFunctions;

    before(() => {
        // IMPORTANT: The emulator must be running for this to work.
        process.env.FUNCTIONS_EMULATOR = 'true';
        process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8181'; // Use the custom port
        myFunctions = require('./index'); // Corrected path
    });

    after(() => {
        test.cleanup();
    });

    describe('onProjectApprove', () => {
        it('should trigger imposition when project status is updated to Approved', async () => {
            const projectId = `test-project-${Date.now()}`;
            const projectRef = admin.firestore().collection('projects').doc(projectId);

            // 1. Setup initial project state
            const initialData = {
                projectName: 'Test Impose Project',
                status: 'pending',
                versions: [{
                    version: 1,
                    // NOTE: This URL must be accessible to the function's environment.
                    // Using a real URL from storage for a more realistic test.
                    fileURL: 'https://firebasestorage.googleapis.com/v0/b/proofing-application.appspot.com/o/proofs%2FOrJNtwmfjRJ3lPoqK7jx%2F1720546809292_dummy.pdf?alt=media'
                }],
                specs: {
                    dimensions: { width: 8.5, height: 11, units: 'in' }
                }
            };
            await projectRef.set(initialData);

            // 2. Make the change that should trigger the function
            const beforeSnap = test.firestore.makeDocumentSnapshot(initialData, `projects/${projectId}`);
            const afterData = { ...initialData, status: 'Approved' };
            const afterSnap = test.firestore.makeDocumentSnapshot(afterData, `projects/${projectId}`);
            const change = test.makeChange(beforeSnap, afterSnap);

            // 3. Call the wrapped function
            const wrapped = test.wrap(myFunctions.onProjectApprove);
            await wrapped(change, { params: { projectId: projectId } });

            // 4. Check the result in Firestore
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for async operations

            const finalDoc = await projectRef.get();
            const finalData = finalDoc.data();

            // 5. Assertions
            assert.strictEqual(finalData.status, 'Imposition Complete', 'Status should be updated to Imposition Complete');
            assert.ok(finalData.impositions, 'Impositions array should exist');
            assert.strictEqual(finalData.impositions.length, 1, 'Impositions array should have one entry');
            assert.strictEqual(finalData.impositions[0].type, 'automatic', 'Imposition type should be automatic');
        }).timeout(20000); // Increase timeout for this test
    });
});
