from playwright.sync_api import sync_playwright, Page, expect
import time
import os

# Ensure the output directory exists
os.makedirs("jules-scratch/verification", exist_ok=True)

def verify_imposition_ui(page: Page):
    # Navigate to the admin project page.
    # Since we are static, we need to mock or setup the environment.
    # But for simple UI visibility check of the dropdown, we might get away with loading the HTML directly
    # IF the JS doesn't crash on Firebase init.

    # Using python http server is safer.
    page.goto("http://localhost:8000/admin_project.html")

    # Mock the login/auth part if necessary, or just check if the UI loads.
    # The imposition modal is hidden by default. We need to trigger it.

    # Wait for the "Impose PDF" button to be visible.
    # It might be hidden if project data isn't loaded (auth required).
    # We might need to inject some mock project data to make the UI behave.

    # Let's inject a script to mock the UI state since we can't easily auth in headless mode against a live firebase instance easily here.
    page.evaluate("""
        const modal = document.getElementById('imposition-modal');
        if (modal) modal.classList.remove('hidden');

        // Populate dropdown if empty (normally populated by JS)
        const impTypeSelect = document.getElementById('imposition-type');
        if (impTypeSelect && impTypeSelect.options.length === 0) {
            const opts = [
                { value: 'stack', label: 'Stack' },
                { value: 'booklet', label: 'Booklet' }
            ];
            opts.forEach(opt => {
                const el = document.createElement('option');
                el.value = opt.value;
                el.innerText = opt.label;
                impTypeSelect.add(el);
            });
        }
    """)

    # Take a screenshot of initial state (Stack mode - toggle should be hidden)
    page.screenshot(path="jules-scratch/verification/1_initial_stack.png")

    # Select Booklet Mode
    page.select_option("#imposition-type", "booklet")

    # We need to manually trigger the 'change' event because select_option might not trigger the JS listener
    # if the listener was attached using `addEventListener`. Playwright usually does, but let's be safe.
    page.evaluate("""
        const event = new Event('change');
        document.getElementById('imposition-form').dispatchEvent(event);
    """)

    # Wait a bit for UI update
    time.sleep(0.5)

    # Take screenshot (Toggle should be visible)
    page.screenshot(path="jules-scratch/verification/2_booklet_mode.png")

    # Select Stack Mode again
    page.select_option("#imposition-type", "stack")
    page.evaluate("""
        const event = new Event('change');
        document.getElementById('imposition-form').dispatchEvent(event);
    """)
    time.sleep(0.5)

    # Take screenshot (Toggle should be hidden)
    page.screenshot(path="jules-scratch/verification/3_stack_mode_again.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_imposition_ui(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
