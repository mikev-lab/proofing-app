# Deploying the New Website

Since this website is designed to replace the current legacy site eventually, it is built as a static export in `website/out`.

## Prerequisites

1.  Ensure you have the Firebase CLI installed: `npm install -g firebase-tools`
2.  Ensure you are logged in: `firebase login`

## How to Build

From the root directory:

```bash
npm run build:website
```

This will:
1.  Enter the `website/` directory.
2.  Install dependencies.
3.  Build the Next.js app to the `website/out` folder.

## How to Preview (Recommended)

To verify the site works on Firebase Hosting without affecting your live production site, deploy it to a preview channel:

```bash
npm run deploy:website:preview
```

This will create a temporary URL (e.g., `https://your-project--website-preview-randomhash.web.app`) where you can share and test the new site.

## How to Go Live

When you are ready to make this new website the main `public` face of your domain:

1.  **Backup** your current root files if necessary.
2.  **Update `firebase.json`**:
    Change the `hosting.public` field to point to the build output:

    ```json
    "hosting": {
      "public": "website/out",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**"
      ]
    }
    ```

3.  **Deploy**:
    ```bash
    firebase deploy --only hosting
    ```
