# Fixing Medusa Backend Deployment on Railway

If your Medusa backend deployment is failing with an error related to `admin/index.html`, it is because the backend is trying to serve the Admin UI but it hasn't been built.

## The Cause
Medusa (by default) tries to serve the Admin dashboard from the same URL as the API. This requires a build step to generate the HTML/CSS files.

## The Fix

You need to update the **Build Command** in your Railway service settings.

### Option A: Enable Admin Build (Recommended)
This will fix the error and give you the fully functional Medusa Admin at `your-app.up.railway.app/app`.

1.  Open your **Railway Project**.
2.  Click on the **Medusa Server** service.
3.  Go to **Settings** > **Build**.
4.  Change the **Build Command** to:
    ```bash
    npm install && npm run build
    ```
    *Correction:* If your logs show "Frontend build completed successfully" during `npm run build`, do **not** add `&& npx medusa-admin build`. Modern Medusa templates build the admin automatically. The extra command causes a "could not determine executable" error.
5.  Redeploy.

### Option B: Disable Admin Serving
If you only want to use the **Custom Unified Admin** we built in this project (`/admin`) and don't need the native Medusa Admin, you can disable it to save resources.

1.  In your Medusa Backend code (`medusa-config.js`):
    ```javascript
    // ...
    const plugins = [
      // ...
      {
        resolve: "@medusajs/admin",
        options: {
          serve: false, // <--- Set this to false
          autoRebuild: false,
        },
      },
    ];
    ```
2.  Push/Redeploy to Railway.

## Accessing the Admin
*   **Official Admin:** `https://your-railway-url.up.railway.app/app` (If Option A)
*   **Custom Unified Admin:** `https://your-firebase-site.web.app/admin` (Connects to the API)
