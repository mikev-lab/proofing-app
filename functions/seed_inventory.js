const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'testing-project-id',
});

const db = admin.firestore();

db.settings({
  host: "localhost:8080",
  ssl: false
});

async function seedInventory() {
  const inventoryRef = db.collection('inventory');

  console.log('Adding sample inventory item...');

  await inventoryRef.doc('PAPER-00123').set({
    internalId: 'PAPER-00123',
    name: 'Sample Paper Stock',
    manufacturerSKU: 'XYZ-123',
    vendorRef: db.doc('vendors/KELLY_PAPER'),
    type: 'Coated',
    weight: 80,
    finish: 'Gloss',
    thickness_caliper: 0.005,
    currentCostPerSheet: 0.15, // This will be migrated
    location: 'Aisle 3, Shelf 2',
    quantity: 5, // This will be migrated
    reorderPoint: 2,
    lastVerified: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('Sample inventory item added successfully.');
}

seedInventory().catch(console.error);
