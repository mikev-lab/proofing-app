
import asyncio
from playwright.async_api import async_playwright
import sys
import json

async def main():
    port = sys.argv[1] if len(sys.argv) > 1 else '8000'
    base_url = f'http://localhost:{port}'

    # This firebaseConfig would normally come from a secure source,
    # but is mocked here for the test environment.
    firebase_config = {
        "apiKey": "test-api-key",
        "authDomain": "proofing-application.firebaseapp.com",
        "projectId": "proofing-application",
        "storageBucket": "proofing-application.appspot.com",
        "messagingSenderId": "test-sender-id",
        "appId": "test-app-id"
    }

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        try:
            # Set a cookie with the Firebase config
            await page.context.add_cookies([{
                'name': 'firebaseConfig',
                'value': json.dumps(firebase_config),
                'url': base_url
            }])

            # Login
            await page.goto(f'{base_url}/index.html')
            await page.fill('input[name="email"]', 'test_admin@mceprinting.com')
            await page.fill('input[name="password"]', '123456')
            await page.click('button[type="submit"]')
            await page.wait_for_url(f'{base_url}/admin.html')

            # Go to project page
            project_id = 'OrJNtwmfjRJ3lPoqK7jx'
            await page.goto(f'{base_url}/admin_project.html?id={project_id}')

            # Open imposition modal
            await page.wait_for_selector('#impose-pdf-button', state='visible', timeout=10000)
            await page.click('#impose-pdf-button')

            # Wait for preview to render
            await page.wait_for_selector('#imposition-preview-canvas', state='visible')
            await page.wait_for_timeout(5000) # Wait for rendering

            await page.screenshot(path='jules-scratch/imposition-final-preview.png')
            print('Screenshot saved to jules-scratch/imposition-final-preview.png')

        except Exception as e:
            print(f"An error occurred: {e}")
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
