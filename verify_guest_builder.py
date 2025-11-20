from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
    context = browser.new_context()
    page = context.new_page()

    # Intercept Firebase imports to mock them
    def handle_route(route):
        url = route.request.url
        if 'firebase' in url:
            route.fulfill(
                status=200,
                content_type='application/javascript',
                body="""
                    export const initializeApp = () => ({});
                    export const getFirestore = () => ({});
                    export const getAuth = () => ({});
                    export const getStorage = () => ({});
                    export const getFunctions = () => ({});
                    export const doc = () => ({});
                    export const getDoc = async () => ({
                        exists: () => true,
                        data: () => ({
                            projectName: 'Test Project',
                            projectType: 'single',
                            specs: { dimensions: { width: 5, height: 7, units: 'in' }, binding: 'loose' }
                        })
                    });
                    export const setDoc = async () => {};
                    export const updateDoc = async () => {};
                    export const onSnapshot = () => {};
                    export const signInWithCustomToken = async () => {};
                    export const ref = () => {};
                    export const uploadBytesResumable = async () => {};
                    export const getDownloadURL = async () => 'http://mock-url.com/file.pdf';
                    export const httpsCallable = () => async () => ({ data: { token: 'mock-token' } });
                """
            )
        elif 'pdf.worker.mjs' in url:
             route.fulfill(status=200, content_type='application/javascript', body='')
        else:
            route.continue_()

    page.route('**/*.js', handle_route)

    try:
        page.goto('http://localhost:8000/guest_upload.html?projectId=test&guestToken=test', wait_until='networkidle')
        print("Page loaded.")
    except Exception as e:
        print(f"Error loading page: {e}")

    # Wait for init
    page.wait_for_timeout(2000)

    # 1. Test Blank Page Insertion
    # Find the "Blank" button
    blank_btn = page.locator('button[title="Insert Blank Page"]').first

    if blank_btn.count() > 0:
        print("Found Blank Page button. Clicking...")
        blank_btn.click()

        # Verify a card appeared
        try:
            page.wait_for_selector('.page-card', timeout=2000)
            print("Page card appeared.")
        except:
            print("Page card did not appear.")
    else:
        print("Blank button not found.")

    # Take Screenshot
    page.screenshot(path='verification_guest_builder.png', full_page=True)
    print("Screenshot saved.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
