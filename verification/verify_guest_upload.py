
from playwright.sync_api import Page, expect, sync_playwright
import os

def verify_guest_upload_ui(page: Page):
    # Simulate parameters
    project_id = "test_project_123"
    guest_token = "abc_token_456"

    # Navigate to the page with params
    url = f"http://localhost:8000/guest_upload.html?projectId={project_id}&guestToken={guest_token}"
    print(f"Navigating to {url}")
    page.goto(url)

    # Mock the UI state since backend is unavailable
    mock_script = """
    setTimeout(() => {
        const loadingState = document.getElementById('loading-state');
        const uploadContainer = document.getElementById('upload-container');
        const bookletSection = document.getElementById('booklet-upload-section');
        const projectNameEl = document.getElementById('project-name');

        if(loadingState) loadingState.classList.add('hidden');
        if(uploadContainer) uploadContainer.classList.remove('hidden');
        if(bookletSection) bookletSection.classList.remove('hidden');
        if(projectNameEl) projectNameEl.textContent = "Mock Booklet Project";

    }, 1000);
    """

    page.evaluate(mock_script)

    # Wait for the UI to update
    page.wait_for_timeout(2000)

    # Assertions using specific text to avoid ambiguity
    expect(page.get_by_text("Upload Files")).to_be_visible()

    # More specific locators
    expect(page.get_by_text("Interior Pages (Multi-page PDF)")).to_be_visible()
    expect(page.get_by_text("Front Cover (Optional)")).to_be_visible()
    # Spine and Back Cover likely have "(Optional)" in their label too based on the HTML file content I read earlier
    expect(page.get_by_text("Spine (Optional)")).to_be_visible()
    expect(page.get_by_text("Back Cover (Optional)")).to_be_visible()

    # Take screenshot
    screenshot_path = "/home/jules/verification/guest_upload_booklet_fixed.png"
    page.screenshot(path=screenshot_path)
    print(f"Screenshot saved to {screenshot_path}")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_guest_upload_ui(page)
        finally:
            browser.close()
