# MCE Printing Proofing Portal

This project is a web-based proofing tool for a printing business, built with static HTML, JavaScript, and Tailwind CSS. It uses Firebase for authentication, Firestore for the database, Cloud Storage for file hosting, and Cloud Functions for backend logic.

## Local Development Setup

### 1. Prerequisites

- **Node.js (LTS version):** Required for `npm` and the Firebase CLI.
- **Firebase CLI:** Install or update to the latest version:
  ```bash
  npm install -g firebase-tools
  ```
- **System Dependencies for Preflight Checks:**
  The preflight Cloud Function (`functions/preflight`) requires several command-line tools for PDF analysis. On Debian-based systems (like Ubuntu), install them with:
  ```bash
  sudo apt-get update && sudo apt-get install -y ghostscript poppler-utils libimage-exiftool-perl
  ```
  *(Note: The preflight function uses a custom Docker runtime when deployed, but for local emulation, these dependencies must be installed on the host machine.)*

### 2. Firebase Project Setup

1.  **Log in to Firebase:**
    ```bash
    firebase login
    ```
2.  **Initialize Firebase in your project directory (if not already done):**
    This project is already configured. If you need to link it to a different Firebase project, use:
    ```bash
    firebase use --add
    ```
    And select your desired Firebase project.

### 3. Install Dependencies

This project uses a root `package.json` and separate `package.json` files for each Cloud Function codebase. All must be installed.

1.  **Root Dependencies:**
    ```bash
    npm install
    ```
2.  **Default Cloud Functions:**
    ```bash
    cd functions/default
    npm install
    cd ../..
    ```
3.  **Preflight Cloud Functions:**
    ```bash
    cd functions/preflight
    npm install
    cd ../..
    ```

### 4. Running the Firebase Emulator Suite

The local emulators allow you to run the entire backend (Auth, Firestore, Storage, Functions) on your local machine.

1.  **Start the Emulators:**
    Use the direct path to the binary to avoid potential `npx` path issues:
    ```bash
    ./node_modules/.bin/firebase emulators:start
    ```
2.  **Accessing the Emulator UI:**
    The Emulator UI will be available at [http://localhost:4000](http://localhost:4000). This is the best way to view your local Firestore database, Storage contents, and Function logs.

### 5. Running the Frontend

The frontend is composed of static HTML files.

1.  **Start a Local Web Server:**
    Because the application uses ES modules, you must serve the files from a web server to avoid CORS errors. A simple Python server works well. Run this in the root of the repository:
    ```bash
    python3 -m http.server 8000
    ```
2.  **Access the Application:**
    -   **Login Page:** [http://localhost:8000/index.html](http://localhost:8000/index.html)
    -   **Admin Login:** `test_admin@mceprinting.com` / `123456`
    -   **Client Login:** `testcompany@test.com` / `123456`

**Important Note on Local Frontend Testing:**
The application is configured to use Firebase Hosting's reserved URLs (`/__/firebase/init.js`) to initialize Firebase securely. This script **will not work** with a local web server like `python -m http.server`, resulting in a 404 error in the browser console. This is expected behavior. The core application logic can still be tested locally, but full end-to-end authentication flows require deployment to a Firebase Hosting environment.

## Deployment

To deploy the application to your Firebase project, run the following command from the root of the repository:

```bash
firebase deploy
```

This single command will:
1.  Deploy all Cloud Functions from the `functions/default` and `functions/preflight` directories.
2.  Deploy the static frontend files (HTML, JS, CSS) to Firebase Hosting.
3.  Apply the Firestore security rules defined in `firestore.rules`.
4.  Apply the Cloud Storage security rules defined in `storage.rules`.
