from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    page.goto("http://localhost:8000/admin.html")

    # Wait for the loading spinner to be hidden
    page.wait_for_selector("#loading-spinner", state="hidden")

    # Now wait for the empty state to be visible
    page.wait_for_selector("#empty-state", state="visible")

    page.screenshot(path="jules-scratch/verification/admin_dashboard.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
