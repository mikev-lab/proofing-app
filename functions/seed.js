const admin = require('firebase-admin');

// When running with `firebase emulators:exec`, the Admin SDK is automatically
// configured, picking up the project ID and database connection details.
admin.initializeApp();

const db = admin.firestore();

/**
 * Retries a promise-based function with a delay.
 * @param {Function} fn The async function to retry.
 * @param {number} retries Number of retries.
 * @param {number} delay Delay in ms between retries.
 * @returns {Promise<any>}
 */
const retry = (fn, retries = 5, delay = 2000) => {
    return new Promise((resolve, reject) => {
        const attempt = async () => {
            try {
                const result = await fn();
                resolve(result);
            } catch (error) {
                if (retries > 0) {
                    console.log(`Attempt failed, retrying in ${delay}ms... (${retries} retries left)`);
                    setTimeout(() => {
                        retries--;
                        attempt();
                    }, delay);
                } else {
                    reject(error);
                }
            }
        };
        attempt();
    });
};


/**
 * Seeds the Firestore database with initial data for inventory and products.
 * Checks if data already exists to prevent re-seeding.
 */
const seedDatabase = async () => {
    console.log('Attempting to connect to Firestore emulator...');
    // Add a retry mechanism to wait for the emulator to be ready
    await retry(async () => {
        // Use a simple, low-cost query to check for connectivity
        await db.collection('__check').limit(1).get();
    });
    console.log('Successfully connected to Firestore.');

    console.log('Checking for existing product data...');
    const productsSnapshot = await db.collection('products').limit(1).get();
    if (!productsSnapshot.empty) {
        console.log('Database already appears to be seeded. Skipping.');
        return;
    }

    console.log('Starting to seed database...');

    const inventoryBatch = db.batch();
    const inventoryRefs = {};

    // Paper Stocks based on user request and common printing standards.
    const inventoryItems = [
        // Covers
        { id: '12pt-c1s-cover', name: '12pt C1S Cover', type: 'Cover', finish: 'Coated 1 Side', weight: '12pt' },
        { id: '14pt-c1s-cover', name: '14pt C1S Cover', type: 'Cover', finish: 'Coated 1 Side', weight: '14pt' },
        { id: '80lb-silk-cover', name: '80# Silk Cover', type: 'Cover', finish: 'Silk', weight: '80#' },
        { id: '100lb-silk-cover', name: '100# Silk Cover', type: 'Cover', finish: 'Silk', weight: '100#' },
        { id: '111lb-silk-cover', name: '111# Silk Cover', type: 'Cover', finish: 'Silk', weight: '111#' },
        { id: '130lb-silk-cover', name: '130# Silk Cover', type: 'Cover', finish: 'Silk', weight: '130#' },
        { id: '80lb-gloss-cover', name: '80# Gloss Cover', type: 'Cover', finish: 'Gloss', weight: '80#' },
        { id: '100lb-gloss-cover', name: '100# Gloss Cover', type: 'Cover', finish: 'Gloss', weight: '100#' },
        { id: '111lb-gloss-cover', name: '111# Gloss Cover', type: 'Cover', finish: 'Gloss', weight: '111#' },
        { id: '130lb-gloss-cover', name: '130# Gloss Cover', type: 'Cover', finish: 'Gloss', weight: '130#' },
        // Text
        { id: '60lb-opaque-text', name: '60# Opaque Text', type: 'Text', finish: 'Opaque', weight: '60#' },
        { id: '80lb-opaque-text', name: '80# Opaque Text', type: 'Text', finish: 'Opaque', weight: '80#' },
        { id: '100lb-opaque-text', name: '100# Opaque Text', type: 'Text', finish: 'Opaque', weight: '100#' },
        { id: '80lb-silk-text', name: '80# Silk Text', type: 'Text', finish: 'Silk', weight: '80#' },
        { id: '100lb-silk-text', name: '100# Silk Text', type: 'Text', finish: 'Silk', weight: '100#' },
        { id: '80lb-gloss-text', name: '80# Gloss Text', type: 'Text', finish: 'Gloss', weight: '80#' },
        { id: '100lb-gloss-text', name: '100# Gloss Text', type: 'Text', finish: 'Gloss', weight: '100#' },
    ];

    console.log('Seeding inventory collection...');
    inventoryItems.forEach(item => {
        const docRef = db.collection('inventory').doc(item.id);
        inventoryBatch.set(docRef, item);
        inventoryRefs[item.id] = docRef;
    });
    await inventoryBatch.commit();
    console.log(`${inventoryItems.length} inventory items seeded.`);


    const productsBatch = db.batch();

    // Product definitions with options that reference the inventory items.
    const products = [
        {
            id: 'business-cards',
            name: 'Business Cards',
            options: {
                sizes: ['3.5" x 2"', '2" x 3.5"'],
                quantities: [100, 250, 500, 1000, 2500, 5000],
                paperStock: [
                    inventoryRefs['14pt-c1s-cover'],
                    inventoryRefs['100lb-silk-cover'],
                    inventoryRefs['130lb-silk-cover'],
                ],
                corners: ['Square', '1/4" Rounded', '1/8" Rounded'],
            },
        },
        {
            id: 'brochures',
            name: 'Brochures',
            options: {
                sizes: ['8.5" x 11"', '11" x 17"', '8.5" x 14"'],
                quantities: [100, 250, 500, 1000, 2500, 5000],
                paperStock: [
                    inventoryRefs['80lb-gloss-text'],
                    inventoryRefs['100lb-gloss-text'],
                    inventoryRefs['80lb-silk-text'],
                    inventoryRefs['100lb-silk-text'],
                ],
                folding: ['None', 'Half-Fold', 'Tri-Fold', 'Z-Fold'],
            },
        },
        {
            id: 'perfect-bound-books',
            name: 'Perfect Bound Books',
            description: 'Get a bookstore-quality finish with our perfect bound books.',
            options: {
                sizes: ['5.5" x 8.5"', '6" x 9"', '8.5" x 11"'],
                quantities: [25, 50, 100, 250, 500, 1000],
                cover: {
                    paperStock: [
                        inventoryRefs['12pt-c1s-cover'],
                        inventoryRefs['100lb-silk-cover'],
                        inventoryRefs['130lb-gloss-cover'],
                    ],
                    lamination: ['None', 'Gloss', 'Matte'],
                },
                inside: {
                     paperStock: [
                        inventoryRefs['60lb-opaque-text'],
                        inventoryRefs['80lb-opaque-text'],
                        inventoryRefs['80lb-silk-text'],
                        inventoryRefs['100lb-gloss-text'],
                    ],
                }
            },
        },
    ];

    console.log('Seeding products collection...');
    products.forEach(product => {
        const docRef = db.collection('products').doc(product.id);
        productsBatch.set(docRef, product);
    });
    await productsBatch.commit();
    console.log(`${products.length} products seeded.`);

    console.log('Database seeding complete!');
};

seedDatabase().catch(error => {
    console.error('Error seeding database:', error);
    process.exit(1);
});
