
import asyncio
from playwright.async_api import async_playwright
import sys

async def main():
    port = sys.argv[1] if len(sys.argv) > 1 else '8000'
    base_url = f'http://localhost:{port}'

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Capture console messages
        page.on('console', lambda msg: print(f'CONSOLE: {msg.text}'))

        try:
            await page.goto(f'{base_url}/jules-scratch/test_imposition.html')

            await page.click('#impose-pdf-button')

            # Wait for the modal to be visible
            await page.wait_for_selector('#imposition-modal', state='visible')

            # Increased timeout for rendering PDF from external source
            await page.wait_for_timeout(5000)

            await page.screenshot(path='jules-scratch/imposition-isolated-preview.png')
            print(f'Screenshot saved to jules-scratch/imposition-isolated-preview.png')

        except Exception as e:
            print(f"An error occurred: {e}")
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
