# Deploying Medusa Backend

This guide explains how to deploy the Medusa Server (Backend) required for the e-commerce features of this website.

We recommend **Railway** for the easiest setup (Database + Redis + Server in one click).

---

## Option 1: Railway (Recommended)

Railway automatically provisions the required PostgreSQL database and Redis instance.

### 1. Create the Project
1.  Go to [Railway.app](https://railway.app) and sign up/login.
2.  Click **New Project**.
3.  Choose **Deploy a Template**.
4.  Search for **Medusa** (look for the starter by MedusaJS or a verified community template).
5.  Click **Deploy**.

### 2. Configuration
Railway will take a few minutes to spin up three services:
*   `PostgreSQL` (Database)
*   `Redis` (Cache/Events)
*   `Medusa Server` (The Node.js backend)

Once the `Medusa Server` service is green (Active):
1.  Click on the **Medusa Server** card.
2.  Go to the **Settings** tab.
3.  Find **Domains** (or Networking).
4.  Copy the generated URL (e.g., `https://medusa-production-1234.up.railway.app`).

### 3. Connect the Frontend
1.  Open your local project.
2.  Navigate to the `website/` directory.
3.  Copy `.env.template` to `.env.local` (if you haven't already).
4.  Update the variable:
    ```bash
    NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://your-railway-url.up.railway.app
    ```
5.  Restart your local Next.js server (`npm run dev`).

The `StoreContext` will now connect to your live Railway backend instead of the mock!

### 4. Create an Admin User
To log into the Medusa Admin dashboard (hosted on the same URL):
1.  In Railway, click on the **Medusa Server**.
2.  Go to the **Connect** tab (or CLI).
3.  Run the command:
    ```bash
    medusa user -e admin@medusa-test.com -p supersecret
    ```
4.  Visit `https://your-railway-url.up.railway.app/app` to log in.

### 5. Connect the Storefront (API Key)
Medusa v2 requires a Publishable API Key for storefront access.

1.  Log in to your Medusa Admin.
2.  Go to **Settings** > **API Key Management**.
3.  Click **Create Publishable Key**.
    *   Title: "Web Storefront"
4.  Click **Publish** (usually in the header or context menu).
5.  Copy the key (starts with `pk_`).
6.  Update your `website/.env.local` file:
    ```bash
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_your_key_here
    ```
    *If deploying the website to Vercel/Netlify, add this as an Environment Variable there too.*

---

## Option 2: Google Cloud Run (Advanced)

If you strictly require Google Cloud hosting:

1.  **Cloud SQL**: Create a PostgreSQL 14+ instance.
2.  **Memorystore**: Create a Redis instance.
3.  **VPC Connector**: Create a Serverless VPC Access connector to allow Cloud Run to talk to SQL/Redis internal IPs.
4.  **Dockerize**: Build the Medusa backend image.
5.  **Deploy**: Deploy to Cloud Run with env vars:
    *   `DATABASE_URL`: Your Cloud SQL connection string.
    *   `REDIS_URL`: Your Memorystore IP.
    *   `NODE_ENV`: production

*Note: This path is significantly more complex and expensive (~$50+/mo).*
