from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    context = browser.new_context()
    page = context.new_page()

    # Go to the dashboard page
    page.goto("http://localhost:8000/dashboard.html")
    page.screenshot(path="jules-scratch/verification/dashboard.png")

    # Verify account page
    page.click('a[href="account.html"]')
    page.wait_for_url("http://localhost:8000/account.html")
    page.screenshot(path="jules-scratch/verification/account.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
