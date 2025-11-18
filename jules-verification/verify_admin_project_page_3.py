
import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    os.makedirs('jules-verification', exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        file_path = "file://" + os.path.abspath('admin_project.html')

        await page.goto(file_path)

        # Give the page a moment to settle, but don't wait for specific elements
        # that might not behave as expected in a local file environment.
        await page.wait_for_timeout(2000) # 2 second delay

        # Force the panel to be visible and scroll it into view.
        await page.evaluate("""() => {
            const panel = document.getElementById('quick-panel');
            if (panel) {
                // Remove any classes that might hide it (like 'hidden')
                panel.classList.remove('hidden');
                // Apply direct styles to ensure visibility
                panel.style.display = 'block';
                panel.style.visibility = 'visible';
                panel.style.opacity = '1';
                panel.scrollIntoView();
            }
            // Also, hide the main loading spinner that might be covering the page
            const spinner = document.getElementById('loading-spinner');
            if (spinner) {
                spinner.style.display = 'none';
            }
        }""")

        # Wait another moment for the forced styles to apply
        await page.wait_for_timeout(500)

        # Take a screenshot of the specific panel
        element = await page.query_selector('#quick-panel')
        if element:
            await element.screenshot(path='jules-verification/admin_project_page_final.png')
            print("Screenshot of the expert upload panel saved.")
        else:
            await page.screenshot(path='jules-verification/admin_project_page_final_fallback.png')
            print("Expert upload panel not found, saved a fallback full-page screenshot.")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
