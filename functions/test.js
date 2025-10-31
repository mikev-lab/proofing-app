
const assert = require('assert');
const admin = require('firebase-admin');
const test = require('firebase-functions-test')();
const sinon = require('sinon');
const axios = require('axios');

// Make sinon quiet
sinon.stub(console, 'log');

describe('Cloud Functions', () => {
    let myFunctions;
    const projectId = process.env.GCLOUD_PROJECT || 'proofing-application';
    // CORRECTED: Use the direct IP address instead of 'localhost'
    const functionsBaseUrl = `http://127.0.0.1:5001/${projectId}/us-central1/default`;

    before(() => {
        // The emulator must be running, which is handled by `firebase emulators:exec`
        // The database should also be seeded by a preceding command.
        // This setup just configures the SDK to connect to the emulators.
        process.env.FUNCTIONS_EMULATOR = 'true';
        process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181'; // Use IP here as well for consistency
        myFunctions = require('./index');
    });

    after(() => {
        test.cleanup();
    });

    describe('getProducts API', () => {
        it('should return a list of products with populated paper stock details', async () => {
            const url = `${functionsBaseUrl}/getProducts`;

            try {
                // It can take a moment for the functions emulator to be ready.
                // We'll add a small retry loop here for stability.
                let response;
                let attempts = 5;
                while (attempts > 0) {
                    try {
                        response = await axios.get(url);
                        break; // Success
                    } catch (error) {
                        if (error.code === 'ECONNREFUSED' && attempts > 1) {
                            console.log('Function emulator not ready, retrying...');
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            attempts--;
                        } else {
                            throw error; // Re-throw other errors immediately
                        }
                    }
                }


                const products = response.data;

                // Basic validation
                assert.ok(Array.isArray(products), 'Response should be an array');
                assert.ok(products.length > 0, 'Should return at least one product');

                // Check for a specific product (e.g., Business Cards)
                const bizCards = products.find(p => p.id === 'business-cards');
                assert.ok(bizCards, 'Business Cards product should exist');
                assert.strictEqual(bizCards.name, 'Business Cards', 'Product name should be correct');

                // Check that the paperStock array is populated with objects, not references
                assert.ok(Array.isArray(bizCards.options.paperStock), 'paperStock should be an array');
                assert.ok(bizCards.options.paperStock.length > 0, 'paperStock array should not be empty');

                const firstStock = bizCards.options.paperStock[0];
                assert.ok(typeof firstStock === 'object', 'paperStock items should be objects');
                assert.ok(firstStock.name, 'Populated stock item should have a name');
                assert.ok(firstStock.type, 'Populated stock item should have a type');

                console.log('Successfully validated getProducts API response.');

            } catch (error) {
                // Provide more detailed error info if the request fails
                if (error.response) {
                    console.error('API Error Response:', error.response.data);
                } else {
                    console.error('API Request Error:', error.message);
                }
                assert.fail(`API request failed: ${error.message}`);
            }
        }).timeout(15000); // Increase timeout to allow for retries
    });
});
