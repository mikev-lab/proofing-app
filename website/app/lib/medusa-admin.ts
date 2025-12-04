import Medusa from "@medusajs/medusa-js";

// Re-exporting the standard client for now, but in a real app
// this file might handle Admin Session Management (Cookies/JWT).
// The Storefront client handles "Cart" and "Products".
// The Admin client handles "Orders" and "Config".

const MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

export const medusaAdmin = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  maxRetries: 3,
  // apiKey: "api_token_here" // If using API token instead of session cookie
});

/**
 * Helper to check if we can reach the admin API.
 * Uses a safe public endpoint or assumes based on config.
 */
export async function checkAdminConnection() {
    try {
        // Ping health or info
        const res = await fetch(`${MEDUSA_BACKEND_URL}/health`);
        return res.ok;
    } catch (e) {
        return false;
    }
}
