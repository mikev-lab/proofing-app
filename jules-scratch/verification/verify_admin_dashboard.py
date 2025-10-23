
import re
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    try:
        page.goto("http://localhost:8000/admin.html")
        page.wait_for_selector("#projects-table-container", timeout=60000)
        page.screenshot(path="jules-scratch/verification/admin_dashboard.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
