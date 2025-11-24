from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto("http://localhost:8000/guest_upload.html?id=mock-project-id")
        time.sleep(2)

        page.evaluate("document.getElementById('specs-modal').classList.remove('hidden')")

        # Debug: Check if element exists
        exists = page.evaluate("!!document.getElementById('spec-reading-direction')")
        print(f"Element exists: {exists}")

        # Click Loose Sheets
        page.click("#label-loose")
        time.sleep(1)

        # Check class list of parent
        classes = page.evaluate("document.getElementById('spec-reading-direction').parentElement.className")
        print(f"Parent classes after click: {classes}")

        page.screenshot(path="verification/rtl_hidden_debug.png")

        browser.close()

if __name__ == "__main__":
    run()
