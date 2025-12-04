import Medusa from "@medusajs/medusa-js";

// Check if we are in a browser or server (Next.js SSR)
const isBrowser = typeof window !== "undefined";

const MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

// Create client
export const medusaClient = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  maxRetries: 3,
  publishableApiKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
});

export const isMedusaConfigured = () => {
    // Basic check if the URL is set to something other than empty
    return !!process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL;
};
