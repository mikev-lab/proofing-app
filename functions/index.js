// IMPORTANT: This function requires a custom execution environment with Ghostscript installed.
// The standard Cloud Functions environment does not include it by default.
// You can create a custom environment using a Dockerfile with a Gen 2 function.
// Example Dockerfile command: RUN apt-get update && apt-get install -y ghostscript

// Gen 2 Imports:
const functions = require('firebase-functions'); // v1 SDK for auth trigger
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { onCall, HttpsError } = require('firebase-functions/v2/https'); // <-- Import for callable function
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const crypto = require('crypto'); // <-- Import for token generation
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth();

// Your existing imports
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child-process-promise');

admin.initializeApp();
const storage = new Storage();
const db = admin.firestore();

// --- MEDUSA PROXY FUNCTIONS ---

const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "https://backend-production-7690.up.railway.app";
const MEDUSA_API_TOKEN = process.env.MEDUSA_API_TOKEN;

exports.medusa_getAdminStats = onCall({ region: 'us-central1' }, async (request) => {
    // 1. Auth Check (Admins Only)
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin role required.');
    }

    // 2. Token Check
    if (!MEDUSA_API_TOKEN) {
        throw new HttpsError('failed-precondition', 'MEDUSA_API_TOKEN missing in server configuration.');
    }

    try {
        const axios = require('axios');
        const res = await axios.get(`${MEDUSA_BACKEND_URL}/admin/orders?limit=5&offset=0&expand=customer,items,payments`, {
            headers: {
                'Authorization': `Bearer ${MEDUSA_API_TOKEN}`,
                'x-medusa-access-token': MEDUSA_API_TOKEN
            }
        });

        const orders = res.data.orders || [];
        const totalRevenue = orders.reduce((acc, order) => acc + order.total, 0);

        const recentOrders = orders.map((o) => ({
            id: o.display_id,
            customer: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() || o.email : 'Guest',
            status: o.payment_status,
            total: `$${(o.total / 100).toFixed(2)}`
        }));

        return {
            revenue: `$${(totalRevenue / 100).toFixed(2)}`,
            pendingCount: res.data.count || orders.length,
            recentOrders,
            isConnected: true
        };

    } catch (error) {
        logger.error('Medusa Stats Proxy Failed:', error.message);
        throw new HttpsError('internal', `Medusa API Failed: ${error.message}`);
    }
});

exports.medusa_getCustomerOrders = onCall({ region: 'us-central1' }, async (request) => {
    // 1. Auth Check (Any Logged In User)
    if (!request.auth || !request.auth.token || !request.auth.token.email) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const userEmail = request.auth.token.email;

    // 2. Token Check
    if (!MEDUSA_API_TOKEN) {
        throw new HttpsError('failed-precondition', 'System configuration error (Missing API Token).');
    }

    try {
        const axios = require('axios');
        // Use Admin API to search by email (securely, as we are the server)
        const res = await axios.get(`${MEDUSA_BACKEND_URL}/admin/orders?q=${encodeURIComponent(userEmail)}&limit=50&expand=items,payments`, {
            headers: {
                'Authorization': `Bearer ${MEDUSA_API_TOKEN}`,
                'x-medusa-access-token': MEDUSA_API_TOKEN
            }
        });

        const allOrders = res.data.orders || [];
        
        // Strict Filter: Ensure email matches exactly (API 'q' is a fuzzy search)
        const myOrders = allOrders.filter((o) => o.email.toLowerCase() === userEmail.toLowerCase());

        return { orders: myOrders };

    } catch (error) {
        logger.error(`Medusa Customer Order Proxy Failed for ${userEmail}:`, error.message);
        throw new HttpsError('internal', 'Failed to load orders.');
    }
});
