# jules-scratch/verification/verify_homepage.py
from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Navigate to the home page
        page.goto("http://localhost:4321/")

        # 2. Wait for the hero section to be visible to ensure the page has loaded
        hero_header = page.get_by_role("heading", name="Exceptional Printing for Every Story")
        expect(hero_header).to_be_visible()

        # 3. Take a full-page screenshot
        page.screenshot(path="jules-scratch/verification/homepage.png", full_page=True)

        print("✅ Screenshot captured successfully.")
        browser.close()

if __name__ == "__main__":
    run_verification()
