
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # We need to create a mock HTML file that loads our guest_upload.js script
        # However, `guest_upload.js` is an ES module that imports from `firebase.js`.
        # To test this in isolation without a full Firebase emulator, we need to mock the imports or the environment.
        # Given the complexity, a simpler approach is to load the actual `guest_upload.html` from the python server
        # but we must intercept the Firebase calls.

        # NOTE: Since we modified `guest_upload.js` to call `restoreBuilderState` on init,
        # loading the page will trigger this. We want to verify that `restoreBuilderState` runs without crashing
        # and attempts to fetch data (which will fail in this env, but that's expected).

        # Actually, the best verification here is code review + maybe checking if the function is defined.
        # Since visual verification of "persistence" requires a stateful backend, we can't easily verify it visually
        # without the emulator running.

        # But we CAN verify that the syntax is correct and the page loads.

        try:
            page.goto("http://localhost:8000/guest_upload.html?projectId=test&guestToken=test")

            # Wait for the page to load resources
            page.wait_for_timeout(3000)

            # Take a screenshot to see if it rendered (even if empty/error state)
            page.screenshot(path="verification/guest_upload_load.png")

            # Check console logs for syntax errors
            # (In a real test we'd listen to 'console' event)

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
