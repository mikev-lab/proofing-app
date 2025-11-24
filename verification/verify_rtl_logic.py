from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto("http://localhost:8000/guest_upload.html?id=mock-project-id")
        time.sleep(2)

        # 1. Show Modal
        page.evaluate("document.getElementById('specs-modal').classList.remove('hidden')")

        # 2. Default State (Saddle Stitch or None selected) - Reading Direction Should be Visible
        # Force select Perfect Bound to be sure
        page.click("#label-perfectBound")
        time.sleep(0.5)
        page.screenshot(path="verification/rtl_visible.png")

        # 3. Select Loose Sheets - Reading Direction Should be HIDDEN
        page.click("#label-loose")
        time.sleep(0.5)
        page.screenshot(path="verification/rtl_hidden.png")

        browser.close()

if __name__ == "__main__":
    run()
