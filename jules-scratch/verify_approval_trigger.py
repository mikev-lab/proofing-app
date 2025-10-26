
import asyncio
from playwright.async_api import async_playwright
import sys
import json
import time

# This script will now also need to interact with Firestore,
# but we will do it via the UI and check the result via the UI indirectly.

async def main():
    port = sys.argv[1] if len(sys.argv) > 1 else '8000'
    base_url = f'http://localhost:{port}'

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        try:
            # Login
            await page.goto(f'{base_url}/index.html')
            await page.fill('input[name="email"]', 'test_admin@mceprinting.com')
            await page.fill('input[name="password"]', '123456')
            await page.click('button[type="submit"]')
            await page.wait_for_url(f'{base_url}/admin.html')
            print("Logged in successfully.")

            # Go to project page
            project_id = 'OrJNtwmfjRJ3lPoqK7jx'
            await page.goto(f'{base_url}/admin_project.html?id={project_id}')
            print(f"Navigated to project page: {project_id}")

            # Wait for project data to load by checking for a known element
            await page.wait_for_selector('#project-name-header:has-text("Project Details")', state='detached')
            print("Project data loaded.")

            # Click the approve button
            await page.click('#approve-button')
            print("Clicked 'Mark as Approved' button.")

            # Accept the confirmation dialog
            page.on('dialog', lambda dialog: dialog.accept())
            print("Accepted confirmation dialog.")

            # Wait a few seconds for the function to trigger and update the DB
            print("Waiting for automatic imposition to complete...")
            await page.wait_for_timeout(10000)

            # Reload the page to see the results
            await page.reload()
            await page.wait_for_selector('#project-name-header:has-text("Project Details")', state='detached')

            print("Page reloaded. Checking for imposition results...")

            # This is an indirect check. We'll look for a UI element that
            # would change if an imposition record was added.
            # For now, we'll just take a screenshot of the whole page.
            # A more robust check would be to query firestore directly.

            screenshot_path = 'jules-scratch/approval-verification.png'
            await page.screenshot(path=screenshot_path)
            print(f"Screenshot taken. Please check '{screenshot_path}' to see if the project status or details have changed, indicating the function ran.")


        except Exception as e:
            print(f"An error occurred: {e}")
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
