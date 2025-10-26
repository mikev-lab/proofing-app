
import asyncio
import requests
import json
import time
from playwright.async_api import async_playwright

FIRESTORE_EMULATOR_HOST = "http://localhost:8080"
PROJECT_ID = "proofing-application"
TEST_PROJECT_DOC_ID = "OrJNtwmfjRJ3lPoqK7jx"
FIRESTORE_URL = f"{FIRESTORE_EMULATOR_HOST}/v1/projects/{PROJECT_ID}/databases/(default)/documents/projects/{TEST_PROJECT_DOC_ID}"

def get_project_data():
    """Fetches project data from the Firestore emulator."""
    try:
        response = requests.get(FIRESTORE_URL)
        response.raise_for_status()
        data = response.json()
        # The REST API nests fields under a 'fields' key. We simplify this.
        return {key: value.get('stringValue', value.get('arrayValue', {}).get('values', [])) for key, value in data.get('fields', {}).items()}
    except requests.exceptions.RequestException as e:
        print(f"Error fetching project data: {e}")
        return None

async def main_playwright():
    """Runs the Playwright part to approve the project."""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        try:
            await page.goto('http://localhost:8000/index.html')
            await page.fill('input[name="email"]', 'test_admin@mceprinting.com')
            await page.fill('input[name="password"]', '123456')
            await page.click('button[type="submit"]')
            await page.wait_for_url('http://localhost:8000/admin.html')
            print("Playwright: Logged in.")

            await page.goto(f'http://localhost:8000/admin_project.html?id={TEST_PROJECT_DOC_ID}')
            print("Playwright: Navigated to project page.")

            # Wait for page to be ready before clicking
            await page.wait_for_selector('#approve-button', state='visible')

            # The confirmation dialog needs to be handled
            page.on("dialog", lambda dialog: dialog.accept())

            await page.click('#approve-button')
            print("Playwright: Clicked 'Mark as Approved'.")

            # Give function time to execute
            await asyncio.sleep(10)

        except Exception as e:
            print(f"Playwright Error: {e}")
        finally:
            await browser.close()

async def main():
    # 1. Check initial state
    print("--- Checking initial state ---")
    initial_data = get_project_data()
    if not initial_data:
        print("Could not fetch initial data. Aborting.")
        return

    initial_impositions = initial_data.get('impositions', [])
    print(f"Initial Status: {initial_data.get('status', 'N/A')}")
    print(f"Initial Imposition Count: {len(initial_impositions)}")

    # Reset status if already approved, for re-runnability
    if initial_data.get('status') == 'Approved':
        print("Project is already approved. Resetting to 'pending' for test.")
        requests.patch(
            FIRESTORE_URL,
            json={"fields": {"status": {"stringValue": "pending"}}}
        )
        time.sleep(1) # Give it a moment

    # 2. Run Playwright to trigger the change
    print("\n--- Triggering approval via UI ---")
    await main_playwright()

    # 3. Check final state
    print("\n--- Checking final state ---")
    final_data = get_project_data()
    if not final_data:
        print("Could not fetch final data. Verification failed.")
        return

    final_status = final_data.get('status', 'N/A')
    final_impositions = final_data.get('impositions', [])

    print(f"Final Status: {final_status}")
    print(f"Final Imposition Count: {len(final_impositions)}")

    # 4. Verify the results
    print("\n--- Verification Results ---")
    if final_status == 'Approved':
        print("✅ SUCCESS: Project status was updated to 'Approved'.")
    else:
        print(f"❌ FAILURE: Project status was '{final_status}', expected 'Approved'.")

    if len(final_impositions) > len(initial_impositions):
        print("✅ SUCCESS: An imposition record was added to the project.")
    else:
        print("❌ FAILURE: No new imposition record was found.")

if __name__ == '__main__':
    asyncio.run(main())
