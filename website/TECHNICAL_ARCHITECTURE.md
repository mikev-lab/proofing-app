# Technical Architecture: Medusa + Firebase Integration

This document defines the strategy for merging the legacy Firebase/Firestore infrastructure with the new Medusa E-commerce engine.

## 1. Authentication & User Management (Single Identity)

**Goal:** Users should never know there are two systems. They use one email/password (Firebase) to access everything.

**Strategy:** **Firebase as the Identity Provider (IdP)**.
Medusa acts as a "dumb" resource server for orders, trusting the identity asserted by Firebase.

### The Flow
1.  **Sign Up:** User registers on `website/register` (Firebase Auth).
2.  **Trigger:** Firebase `functions.auth.user().onCreate` triggers a Cloud Function.
3.  **Sync:** The function calls the Medusa Admin API to create a Customer record with the same email and metadata.
    *   `medusa_customer_id` is saved back to Firestore `users/{uid}`.
    *   `firebase_uid` is saved to Medusa Customer metadata.
4.  **Login:** User logs in via Firebase.
5.  **Checkout:** When calling Medusa endpoints, we pass the email (for guest checkout) or use a JWT sync (advanced) to associate the session.

---

## 2. Inventory Management (The "Manufacturing" Model)

**Problem:** Medusa assumes you sell "Items on a shelf". You sell "Custom Products" made from raw materials.
**Solution:** **Split Domain Responsibility.**

### Medusa (Sales Layer)
*   **Tracks:** "Sales Units".
*   **Concept:** Infinite Inventory (Made to Order).
*   **Product Definition:** "Hardcover Book" (Variant: 8.5x11).
*   **Role:** Records that a customer *bought* 500 books. It does NOT know about paper stock levels.

### Firebase (Production Layer)
*   **Tracks:** "Raw Materials" (Paper Reams, Ink, Glue, Boxes).
*   **Logic:** Your existing `inventory` collection in Firestore.
*   **Role:** Manufacturing execution.

### The Bridge (Inventory Deduction)
1.  **Order Placed (Medusa):** Customer buys 500 Books.
2.  **Webhook:** Medusa sends `order.placed` webhook to Firebase Cloud Functions.
3.  **Calculation:**
    *   Firebase looks up the project specs (linked in Order Metadata).
    *   Calculates BOM (Bill of Materials): *500 books * 32 pages / 4 pages per sheet = 4000 sheets*.
    *   Adds Waste Factor (+5%).
4.  **Deduction:** Firebase runs a transaction to decrement `inventory/80lb-gloss-text` by 4200 sheets.
5.  **Alert:** If stock dips below threshold, Firebase sends an email/notification (existing functionality).

---

## 3. Quoting & Pricing

**Strategy:** **Frontend Price Injection.**
Medusa supports overriding prices in the cart. We will use your existing, complex Firestore calculator as the "Pricing Engine".

### The Flow
1.  **User Configures:** User selects "32 Pages, 500 Copies" on the Product Page.
2.  **Calculate:** Frontend calls `estimators_calculateEstimate` (Firebase Function).
    *   Returns: `$450.00`.
3.  **Add to Cart:** Frontend calls Medusa `cart.lineItems.create`.
    *   Payload includes `unit_price: 45000` (cents).
    *   *Note: This requires a secure signing key or server-side proxy to prevent users from hacking the price in the browser console. For the MVP, we trust the client, but for Production, we wrap this in a Next.js API Route.*

---

## Summary Diagram

| Feature | System of Record | Sync Direction |
| :--- | :--- | :--- |
| **Identity** | Firebase Auth | Firebase $\rightarrow$ Medusa |
| **Catalog** | Medusa | Medusa $\rightarrow$ Website |
| **Pricing Logic** | Firebase (Estimator) | Firebase $\rightarrow$ Website $\rightarrow$ Medusa |
| **Raw Inventory** | Firestore | One-way (Deducted by Orders) |
| **Orders** | Medusa | Medusa $\rightarrow$ Firestore (as Production Jobs) |
