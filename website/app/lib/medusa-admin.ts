import Medusa from "@medusajs/js-sdk";

const MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

// Admin SDK instance
// In a real app, this might need separate auth handling (cookies/token)
export const medusaAdmin = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  auth: {
      type: "session", // v2 uses session auth by default
  }
});
