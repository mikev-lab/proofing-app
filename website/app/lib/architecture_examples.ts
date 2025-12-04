// architecture_examples.ts
// This file demonstrates the code patterns for syncing Firebase and Medusa.
// It is not meant to be executed directly in the current environment but serves as a blueprint.

// ============================================================================
// 1. USER SYNC (Firebase Auth -> Medusa)
// ============================================================================

import { functions, db } from '../firebase/config';
// Mock Medusa SDK import
const Medusa = { customers: { create: async (data: any) => ({ id: 'cus_123' }) } };

/**
 * Triggered when a new user signs up in Firebase.
 * Creates a corresponding customer in Medusa to ensure Orders can be linked.
 */
export async function onUserCreated(user: { uid: string; email: string; displayName?: string }) {
  try {
    console.log(`[Sync] Creating Medusa customer for ${user.email}...`);

    // 1. Create Customer in Medusa
    const medusaCustomer = await Medusa.customers.create({
      email: user.email,
      first_name: user.displayName?.split(' ')[0] || 'Guest',
      last_name: user.displayName?.split(' ')[1] || '',
      metadata: {
        firebase_uid: user.uid
      }
    });

    // 2. Save Link in Firestore
    // This allows us to quickly look up Medusa orders for a Firebase user
    // db.collection('users').doc(user.uid).update({ medusaCustomerId: medusaCustomer.id });

    console.log(`[Sync] Success! Linked Firebase ${user.uid} to Medusa ${medusaCustomer.id}`);
  } catch (error) {
    console.error("[Sync] Failed to sync user:", error);
  }
}


// ============================================================================
// 2. INVENTORY DEDUCTION (Medusa Order -> Firestore Inventory)
// ============================================================================

interface MedusaOrder {
  id: string;
  items: Array<{
    quantity: number;
    metadata: {
        specs?: string; // e.g. "32 pages, 8.5x11, 80lb Gloss"
        // In a real app, we would store structured spec IDs, not just strings
        paperStockId?: string;
        pageCount?: number;
    }
  }>;
}

/**
 * Triggered by Medusa Webhook 'order.placed'.
 * Calculates raw material usage and updates Firestore.
 */
export async function deductInventoryFromOrder(order: MedusaOrder) {
  console.log(`[Inventory] Processing Order ${order.id}...`);

  for (const item of order.items) {
    // 1. Identify Raw Material (simplified logic)
    // In production, we'd look up the BOM from the linked Project
    const paperStockId = item.metadata.paperStockId || '80lb-gloss-text';
    const pagesPerBook = item.metadata.pageCount || 32;
    const copies = item.quantity; // Assuming 1 unit = 1 Book for this logic (or use metadata.quantity_ordered)

    // 2. Calculate Consumption
    // Logic: (Pages / 4 pages per sheet) * Copies * Waste Factor
    const sheetsPerBook = Math.ceil(pagesPerBook / 4);
    const totalSheets = sheetsPerBook * copies;
    const wasteSheets = Math.ceil(totalSheets * 0.05); // 5% waste
    const deductionAmount = totalSheets + wasteSheets;

    console.log(`[Inventory] Deducting ${deductionAmount} sheets of ${paperStockId}`);

    // 3. Run Firestore Transaction
    /*
    await db.runTransaction(async (transaction) => {
        const ref = db.collection('inventory').doc(paperStockId);
        const doc = await transaction.get(ref);
        if (!doc.exists) throw "Stock not found";

        const newCount = doc.data().quantityLooseSheets - deductionAmount;
        transaction.update(ref, { quantityLooseSheets: newCount });
    });
    */
  }
}
