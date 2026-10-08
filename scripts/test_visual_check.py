import os
import time
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Adeeb\.gemini\antigravity-ide\brain\359c4fab-04a7-445f-9ae3-1a0f06ed28a6"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        print("Navigating to login...")
        page.goto("http://localhost:3000/admin/login")
        page.wait_for_load_state("networkidle")

        # Check if login form is present
        if page.locator("#login-email").is_visible():
            print("Logging in...")
            page.fill("#login-email", "admin@gmail.com")
            page.fill("#login-password", "Admin@000")
            page.click("#login-submit")
            page.wait_for_url("**/admin**", timeout=10000)
            page.wait_for_load_state("networkidle")
            time.sleep(1)

        # 1. Check Admins Page & Modal
        print("Checking Admins page and modal...")
        page.goto("http://localhost:3000/admin/admins")
        page.wait_for_load_state("networkidle")
        time.sleep(1)

        # Click Add Admin button
        page.click("#btn-add-admin")
        page.wait_for_selector(".modal", state="visible")
        time.sleep(0.5)

        # Fill dummy info to check autofill/input styling
        page.fill("#new-admin-name", "Hamdan Al Maktoum")
        page.fill("#new-admin-email", "hamdan@lovosis.com")
        page.fill("#new-admin-password", "Admin@12345")

        admin_modal_shot = os.path.join(ARTIFACT_DIR, "admin_modal_repaired.png")
        page.screenshot(path=admin_modal_shot)
        print(f"Captured admin modal screenshot: {admin_modal_shot}")

        # Close modal
        page.click("button:has-text('Cancel')")
        time.sleep(0.5)

        # 2. Check Dashboard
        print("Checking Dashboard empty state...")
        page.goto("http://localhost:3000/admin")
        page.wait_for_load_state("networkidle")
        time.sleep(1.5)
        dash_shot = os.path.join(ARTIFACT_DIR, "dashboard_clean_state.png")
        page.screenshot(path=dash_shot)
        print(f"Captured dashboard screenshot: {dash_shot}")

        # 3. Check Cameras
        print("Checking Cameras empty state...")
        page.goto("http://localhost:3000/admin/cameras")
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        cam_shot = os.path.join(ARTIFACT_DIR, "cameras_clean_state.png")
        page.screenshot(path=cam_shot)
        print(f"Captured cameras screenshot: {cam_shot}")

        # 4. Check History
        print("Checking History empty state...")
        page.goto("http://localhost:3000/admin/history")
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        hist_shot = os.path.join(ARTIFACT_DIR, "history_clean_state.png")
        page.screenshot(path=hist_shot)
        print(f"Captured history screenshot: {hist_shot}")

        browser.close()
        print("All visual checks completed successfully!")

if __name__ == "__main__":
    run()
