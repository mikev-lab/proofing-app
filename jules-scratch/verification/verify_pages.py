from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Verify register.html
    page.goto("http://localhost:8000/register.html")
    page.screenshot(path="jules-scratch/verification/register_page.png")

    # Verify account.html
    page.goto("http://localhost:8000/account.html")
    page.screenshot(path="jules-scratch/verification/account_page.png")

    # Verify admin_client_management.html
    page.goto("http://localhost:8000/admin_client_management.html")
    page.screenshot(path="jules-scratch/verification/admin_client_management_page.png")

    # Verify admin_edit_user.html (with a dummy user id)
    page.goto("http://localhost:8000/admin_edit_user.html?id=dummyuid")
    page.screenshot(path="jules-scratch/verification/admin_edit_user_page.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
