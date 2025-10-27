from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    context = browser.new_context()
    page = context.new_page()

    page.goto("http://localhost:8000/jules-scratch/verification/test_page.html")
    page.wait_for_selector("#imposition-thumbnail-list canvas")
    page.screenshot(path="jules-scratch/verification/imposition_modal.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
