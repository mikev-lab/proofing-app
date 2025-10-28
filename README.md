# MCE Printing Proofing Application

This is a web-based proofing tool for a printing business, built with static HTML, JavaScript, and Firebase.

## Local Development Setup

### 1. Prerequisites

-   [Node.js](httpss://nodejs.org/) (which includes npm)
-   [Firebase CLI](httpss://firebase.google.com/docs/cli#install-cli-mac-linux)

### 2. Clone the Repository

```bash
git clone <repository-url>
cd <repository-directory>
```

### 3. Install Dependencies

Install the project dependencies using npm:

```bash
npm install
```

This will install the Firebase tools and other necessary packages.

### 4. Firebase Configuration

This project uses a local, untracked file for Firebase configuration to keep API keys and project details secure.

1.  **Create the configuration file:**
    In the `js/` directory, create a new file named `firebase-config.js`.

2.  **Add your Firebase config:**
    Open `js/firebase-config.js` and add the following content, replacing the placeholder values with your actual Firebase project configuration. You can find this configuration in your Firebase project settings.

    ```javascript
    // js/firebase-config.js

    // TODO: Replace with your project's actual Firebase configuration
    export const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_AUTH_DOMAIN",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_STORAGE_BUCKET",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID"
    };
    ```

    **Important:** This file is listed in `.gitignore` and should never be committed to the repository.

### 5. Running the Firebase Emulators

The project is configured to work with the Firebase Emulator Suite for local development.

1.  **Start the emulators:**
    Run the following command from the root of the project:

    ```bash
    firebase emulators:start
    ```

2.  **Access the application:**
    Once the emulators are running, you can access the application by opening the `index.html` file in your browser. For the best experience, use a local web server to avoid potential CORS issues with ES modules.

    ```bash
    # For example, using Python's built-in server
    python3 -m http.server 8000
    ```
    Then, navigate to `http://localhost:8000` in your browser.
