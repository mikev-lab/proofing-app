from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # 1. Navigate to Guest Upload
    # We use a mock project ID to trigger the UI logic without needing real auth
    # This page relies on `projectId` being present.
    page.goto("http://localhost:8000/guest_upload.html?projectId=mock-project-id")

    # 2. Wait for Specs Modal
    # The "Specs Modal" appears if specs are missing. For a mock ID, `getDoc` fails or returns null,
    # but the error handling or default logic usually hides the loader and shows specs form if data is missing.
    # Let's wait for the "Save & Continue" button or the size preset dropdown.
    try:
        page.wait_for_selector("#spec-size-preset", timeout=5000)
        print("Specs Modal Loaded")

        # 3. Select "A4" Preset
        page.select_option("#spec-size-preset", "A4")
        print("Selected A4 Preset")

        # 4. Verify that selecting a preset does NOT disable the form (we just want to verify the selection works)
        # But importantly, we want to verify that submitting this form would send resolved dimensions.
        # We can't easily check the internal JS variable `dimensionsVal` without spying on the network or console.
        # However, we can verify the UI state.

        # Take screenshot of the modal with A4 selected
        page.screenshot(path="verification/guest_upload_a4.png")
        print("Screenshot saved: verification/guest_upload_a4.png")

    except Exception as e:
        print(f"Error verifying guest_upload: {e}")
        # Capture error state
        page.screenshot(path="verification/guest_upload_error.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
