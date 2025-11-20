
from playwright.sync_api import sync_playwright
import os
import shutil
import time

def verify_guest_upload_builder():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        page = browser.new_page()

        url = "http://localhost:8000/guest_upload.html?projectId=dummy123&guestToken=dummyToken"
        print(f"Navigating to {url}")
        page.goto(url)

        # Wait for module to load
        page.wait_for_function("() => window.appReady === true", timeout=5000)

        # Mock Init Logic
        mock_init_script = """
        // Mock global vars if needed
        window.projectSpecs = {
            dimensions: { width: 8.5, height: 11, units: 'in' },
            binding: 'saddleStitch',
            pageCount: 0
        };

        // Reveal UI
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('upload-container').classList.remove('hidden');
        document.getElementById('booklet-upload-section').classList.remove('hidden');

        // Render
        if (window.renderBookViewer) {
            window.renderBookViewer();
        } else {
            console.error("renderBookViewer not found");
        }
        """

        page.evaluate(mock_init_script)

        # Take screenshot of Empty Builder
        page.screenshot(path="verification/builder_empty.png")
        print("Captured empty builder state")

        # Mock File Upload logic
        # We can interact with the 'Add File' button which triggers the hidden input
        # Then use set_input_files on that hidden input.

        # Create dummy PDF
        with open("verification/dummy.pdf", "wb") as f:
            f.write(b"%PDF-1.4\n%...")

        # The hidden input id is 'hidden-interior-input'
        page.set_input_files("#hidden-interior-input", "verification/dummy.pdf")

        # Wait for processing (the event listener is async)
        page.wait_for_timeout(2000)

        # Take screenshot of Populated Builder
        page.screenshot(path="verification/builder_populated.png")
        print("Captured populated builder state")

        browser.close()

if __name__ == "__main__":
    verify_guest_upload_builder()
