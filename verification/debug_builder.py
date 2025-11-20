
from playwright.sync_api import sync_playwright
import os
import sys

def verify_guest_upload_builder():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        page = browser.new_page()

        # Attach console listener
        page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"BROWSER ERROR: {exc}"))

        url = "http://localhost:8000/guest_upload.html?projectId=dummy123&guestToken=dummyToken"
        print(f"Navigating to {url}")
        page.goto(url)

        # Wait for a bit to gather logs
        page.wait_for_timeout(3000)

        browser.close()

if __name__ == "__main__":
    verify_guest_upload_builder()
