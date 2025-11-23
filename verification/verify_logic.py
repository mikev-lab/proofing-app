from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Load the test page
    page.goto("http://localhost:8000/verification/test_logic.html")

    # Run the test
    page.click("button")

    # Wait for output
    page.wait_for_selector("#output div")

    # Take screenshot
    page.screenshot(path="verification/logic_test_result.png")
    print("Screenshot saved: verification/logic_test_result.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
