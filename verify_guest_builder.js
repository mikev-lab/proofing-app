import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Mock the Firebase imports to avoid network errors and bypass auth
  await page.route('**/*.js', async (route) => {
      const url = route.request().url();

      // Intercept Firebase Imports
      if (url.includes('firebase-app.js') || url.includes('firebase-firestore.js') ||
          url.includes('firebase-auth.js') || url.includes('firebase-storage.js') ||
          url.includes('firebase-functions.js')) {

          await route.fulfill({
              status: 200,
              contentType: 'application/javascript',
              body: `
                  export const initializeApp = () => ({});
                  export const getFirestore = () => ({});
                  export const getAuth = () => ({});
                  export const getStorage = () => ({});
                  export const getFunctions = () => ({});
                  export const doc = () => ({});
                  export const getDoc = async () => ({
                      exists: () => true,
                      data: () => ({
                          projectName: 'Test Project',
                          projectType: 'single',
                          specs: { dimensions: { width: 5, height: 7, units: 'in' }, binding: 'loose' }
                      })
                  });
                  export const setDoc = async () => {};
                  export const updateDoc = async () => {};
                  export const onSnapshot = () => {};
                  export const signInWithCustomToken = async () => {};
                  export const ref = () => {};
                  export const uploadBytesResumable = async () => {};
                  export const getDownloadURL = async () => 'http://mock-url.com/file.pdf';
                  export const httpsCallable = () => async () => ({ data: { token: 'mock-token' } });
              `
          });
          return;
      }

      // Serve local files
      if (!url.startsWith('http')) {
          await route.continue();
          return;
      }

      // Mock PDF.js worker to avoid loading
      if (url.includes('pdf.worker.mjs')) {
          await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
          return;
      }

      await route.continue();
  });

  // Load the page (assuming server is running on 8000 or we use file://)
  // Using file:// might fail with modules.
  // But we can try injecting content directly or rely on the fact that we mock imports.
  // Actually, standard `file://` blocks imports.
  // We need to serve it.
  // Since we can't easily start a server in this script without blocking,
  // we'll rely on the environment's ability to `python3 -m http.server` which I can run in background.

  // Assuming server is running on port 8000
  try {
      await page.goto('http://localhost:8000/guest_upload.html?projectId=test&guestToken=test', { waitUntil: 'networkidle' });
  } catch (e) {
      console.log("Failed to load from localhost, trying file protocol with limited expectations...");
      // Fallback or fail
  }

  // 1. Test Blank Page Insertion
  // Click the "Blank" button (we need to find it, it was added to the insert bar)
  // The first insert bar is at index 0.

  // Wait for init
  await page.waitForTimeout(1000);

  // Find the "Blank" button in the first insert bar
  const blankBtn = page.locator('button[title="Insert Blank Page"]').first();
  if (await blankBtn.count() > 0) {
      console.log("Found Blank Page button.");
      await blankBtn.click();

      // Verify a card appeared
      await page.waitForSelector('.page-card');
      console.log("Card appeared.");

      // Check text "Drop File Here"
      const text = await page.locator('text="Drop File Here"').first();
      // It's drawn on canvas, so we can't select text!
      // But we can check if canvas exists.
      const canvas = page.locator('canvas').first();
      if (await canvas.isVisible()) {
          console.log("Canvas is visible.");
      }
  } else {
      console.log("Blank button not found (maybe init failed).");
  }

  // Take Screenshot
  await page.screenshot({ path: 'verification_guest_builder.png', fullPage: true });

  await browser.close();
})();
