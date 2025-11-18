
import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    # Create the verification directory if it doesn't exist
    os.makedirs('jules-verification', exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Construct the file path to the local HTML file
        # The path needs to be relative to where the script is run from (repo root)
        file_path = "file://" + os.path.abspath('admin_project.html')

        await page.goto(file_path)

        # Crucial Wait: Wait for the "quick-panel" to be present in the DOM.
        # This panel contains the "Upload Cover" button.
        # We'll also wait for the initial loading throbber to disappear.
        await page.wait_for_selector('#rendering-throbber', state='hidden', timeout=10000)
        await page.wait_for_selector('#quick-panel', state='visible', timeout=10000)

        # Inject JavaScript to ensure the panel is visible for the screenshot,
        # bypassing any logic that might hide it by default in a test environment.
        await page.evaluate("""() => {
            const panel = document.getElementById('quick-panel');
            if (panel) {
                panel.style.display = 'block';
                panel.scrollIntoView();
            }
        }""")

        # Take a screenshot of the specific panel
        element = await page.query_selector('#quick-panel')
        if element:
            await element.screenshot(path='jules-verification/admin_project_page_final.png')
            print("Screenshot of the expert upload panel saved.")
        else:
            # Fallback to full page if panel not found
            await page.screenshot(path='jules-verification/admin_project_page_final_fallback.png')
            print("Expert upload panel not found, saved a fallback full-page screenshot.")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
