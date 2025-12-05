
from playwright.sync_api import sync_playwright

def verify_proof_page():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        try:
            # Navigate to the test page - Use directory path
            page.goto('http://localhost:8000/verify-proof/')

            # Wait for main canvas wrapper to appear
            # The canvas might not be immediately visible if loading, but the container should be
            page.wait_for_selector('main', timeout=10000)

            # Wait for text indicating loaded state or thumbnails
            # Since we used a mock PDF, it should render quickly.
            # Look for 'Interior' button or 'Page 1' text in toolbar
            page.wait_for_selector('button:has-text("Interior")', timeout=5000)

            # Wait a bit for layout to settle (rendering thumbnails)
            page.wait_for_timeout(3000)

            # Take screenshot
            page.screenshot(path='verification/proof_viewer.png')
            print('Screenshot saved to verification/proof_viewer.png')

        except Exception as e:
            print(f'Error: {e}')
            page.screenshot(path='verification/error.png')
        finally:
            browser.close()

if __name__ == '__main__':
    verify_proof_page()
