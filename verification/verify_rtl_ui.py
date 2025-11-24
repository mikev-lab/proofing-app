from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the guest upload page with a mock project ID
        # We'll use a mock project ID to test the UI rendering
        page.goto("http://localhost:8000/guest_upload.html?id=mock-project-id")

        # Wait for the page to load (spinner to disappear)
        # Since we don't have a real backend, it might show an error or stay loading.
        # But we can inspect the static HTML elements we added.

        # Give it a moment for any initial JS to run
        time.sleep(2)

        # Click the "Edit Project Specs" button (if visible) or look for the modal directly
        # In the mock state, the specs modal might be visible if specs are missing.

        # Let's force the specs modal to be visible via JS if it's not
        page.evaluate("document.getElementById('specs-modal').classList.remove('hidden')")

        # Take a screenshot of the Specs Modal showing the Reading Direction dropdown
        page.screenshot(path="verification/rtl_dropdown_check.png")

        # Now let's try to select RTL and verify visually
        page.select_option("#spec-reading-direction", "rtl")

        # Take another screenshot
        page.screenshot(path="verification/rtl_selected.png")

        browser.close()

if __name__ == "__main__":
    run()
