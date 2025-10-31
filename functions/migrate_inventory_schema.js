const admin = require('firebase-admin');

// Initialize the Firebase Admin SDK
admin.initializeApp({
  // We don't need credentials for the emulator
  projectId: 'testing-project-id', // Use a dummy project ID
});

const db = admin.firestore();

// Set the emulator host
db.settings({
  host: "localhost:8080", // Default Firestore emulator port
  ssl: false
});


async function migrateInventorySchema() {
  const inventoryRef = db.collection('inventory');
  const snapshot = await inventoryRef.get();

  if (snapshot.empty) {
    console.log('No documents found in the inventory collection.');
    return;
  }

  const batch = db.batch();

  snapshot.forEach(doc => {
    const data = doc.data();
    const newData = { ...data };

    // Rename quantity to quantityInPackages
    if (newData.quantity !== undefined) {
      newData.quantityInPackages = newData.quantity;
      delete newData.quantity;
    }

    // Rename currentCostPerSheet to latestCostPerM
    if (newData.currentCostPerSheet !== undefined) {
      newData.latestCostPerM = newData.currentCostPerSheet;
      delete newData.currentCostPerSheet;
    }

    // Add new fields with default values
    newData.quantityLooseSheets = 0;
    newData.sheetsPerPackage = 500;
    newData.reorderPoint = 1;
    newData.vendorCostPerM = 0;

    batch.set(doc.ref, newData, { merge: true });
  });

  await batch.commit();
  console.log('Inventory schema migration completed successfully.');
}

migrateInventorySchema().catch(console.error);
