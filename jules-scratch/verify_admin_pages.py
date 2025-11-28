
import asyncio
from playwright.async_api import async_playwright

async def verify_pages():
    pages_to_check = [
        "http://localhost:8000/admin_new_project.html",
        "http://localhost:8000/admin_edit_user.html",
        "http://localhost:8000/admin_estimator.html",
        "http://localhost:8000/proof.html",
        "http://localhost:8000/admin_project.html"
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        for url in pages_to_check:
            print(f"Checking {url}...")
            page = await browser.new_page()
            errors = []
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda exc: errors.append(str(exc)))

            try:
                await page.goto(url, timeout=5000)
                await page.wait_for_timeout(1000) # Wait for scripts
            except Exception as e:
                print(f"  Navigation/Wait issue: {e}")

            if errors:
                print(f"  FAILED: Errors found on {url}:")
                for e in errors:
                    print(f"    - {e}")
            else:
                print(f"  PASSED: No console errors on {url}")

            await page.close()

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_pages())
