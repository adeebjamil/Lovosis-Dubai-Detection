import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto("http://localhost:3000/admin/login")
    if page.locator("#login-email").is_visible():
        page.fill("#login-email", "admin@gmail.com")
        page.fill("#login-password", "Admin@000")
        page.click("#login-submit")
        page.wait_for_url("**/admin**", timeout=10000)
    page.goto("http://localhost:3000/admin/live")
    time.sleep(4)
    page.screenshot(path=r"C:\Users\Adeeb\.gemini\antigravity-ide\brain\359c4fab-04a7-445f-9ae3-1a0f06ed28a6\live_view_check.png")
    browser.close()
    print("Captured live view screenshot successfully!")
