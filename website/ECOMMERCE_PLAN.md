# E-commerce Integration Plan: Medusa + Firebase

## Overview

This document outlines the strategy for integrating **Medusa** (an open-source, Node.js-based headless commerce engine) with the existing **Firebase/Next.js** infrastructure.

The goal is to modernize the Order Management and Checkout experience while preserving the robust, legacy logic for File Uploads and Project Specifications that currently lives in Firestore.

## The "Hybrid" Architecture

We do not need to replace Firebase. Instead, we treat Medusa as a specialized microservice for handling **Money and Orders**, while Firebase remains the source of truth for **Production Data**.

### Stack
*   **Frontend**: Next.js (Existing) + Medusa Client (New)
*   **Project Database**: Firestore (Existing)
*   **Order Database**: PostgreSQL (New - required for Medusa)
*   **Functions**: Firebase Cloud Functions (Existing) + Medusa Server (New)

### Why this approach?
1.  **Cost Effective**: PostgreSQL can be hosted cheaply (e.g., Railway, Supabase, or DigitalOcean Managed DB for ~$15/mo).
2.  **Best of Both Worlds**: You get enterprise-grade checkout/cart features from Medusa without rewriting your complex builder logic.
3.  **Flexible Flows**: Medusa supports custom line items, which is essential for printing projects where every price is unique.

---

## Workflow Implementation

### Flow A: "Upload First" (The Builder Flow)
*Use Case: Customer customizes their book, uploads files, and then pays.*

1.  **User Action**: User completes the "Guest Builder" or "Proofing" flow.
2.  **System Action**:
    *   Project data is saved to Firestore `projects/{projectId}`.
    *   Status is `Awaiting Payment`.
3.  **Integration**:
    *   User clicks **"Proceed to Checkout"** on the Review page.
    *   Frontend calls Medusa: `cart.createLineItem({ title: "Custom Project", amount: calculatedPrice, metadata: { firebaseProjectId: "123" } })`.
4.  **Checkout**: User pays in Medusa (Stripe/PayPal).
5.  **Sync**:
    *   Medusa triggers a Webhook: `order.placed`.
    *   Firebase Cloud Function receives webhook $\rightarrow$ Finds project `123` $\rightarrow$ Updates status to `In Production`.

### Flow B: "Buy First" (The E-commerce Flow)
*Use Case: Customer buys a "Convention Bundle" or "100 Books Deposit" to lock in a slot.*

1.  **User Action**: User browses `website/products/convention-bundle`.
2.  **Integration**:
    *   User clicks **"Add to Cart"**.
    *   Frontend adds a standard Medusa Product Variant.
3.  **Checkout**: User pays.
4.  **Sync**:
    *   Medusa triggers Webhook: `order.placed`.
    *   Firebase Cloud Function creates a **New Empty Project** in Firestore.
    *   User receives an email: "Click here to upload files for Order #456".

---

## Data Model Sync

| Entity | System of Record | Sync Strategy |
| :--- | :--- | :--- |
| **Products** | Medusa (Pricing/SKUs) | Medusa feeds Storefront. |
| **Customers** | Firebase Auth | We can link Medusa Customer ID to Firebase UID. |
| **Projects** | Firestore | Linked via Metadata in Medusa Orders. |
| **Orders** | Medusa | Medusa is the master list of "Sales". Firestore stores "Jobs". |

## Implementation Roadmap

1.  **Phase 1: Frontend Client (Current Step)**
    *   Mock the Store Context to validate the UI/UX.
    *   Implement "Add to Cart" and "Cart Drawer" visual elements.

2.  **Phase 2: Backend Setup**
    *   Deploy Medusa Server + Postgres (e.g., on Railway).
    *   Configure Stripe Provider.

3.  **Phase 3: Connection**
    *   Replace Mock Context with `medusa-react` / `@medusajs/js-sdk`.
    *   Seed Products in Medusa.

4.  **Phase 4: Webhooks**
    *   Write Firebase Function to listen for Medusa `order.placed` events.

## Addressing Concerns

*   **"Postgres is expensive"**: Managed Postgres on Railway starts at \$5/mo. Supabase has a generous free tier. It is significantly cheaper than Magento hosting.
*   **"Legacy Integration"**: By using Metadata fields in the Cart, we loosely couple the systems. The Legacy Builder doesn't need to know Medusa exists; only the Checkout button does.
