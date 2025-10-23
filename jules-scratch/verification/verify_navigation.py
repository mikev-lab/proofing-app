from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Navigate to admin page
    page.goto("http://localhost:8000/admin.html")

    # Screenshot admin page
    page.screenshot(path="jules-scratch/verification/admin_sidebar.png")

    # Navigate to client dashboard
    page.goto("http://localhost:8000/dashboard.html")

    # Screenshot dashboard page
    page.screenshot(path="jules-scratch/verification/dashboard_header.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
