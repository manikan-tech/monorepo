import subprocess
import time
import sys
import os
import requests

# Test data setup
SERVER_URL = "http://127.0.0.1:8003"
UPLOAD_ENDPOINT = f"{SERVER_URL}/api/vton/2d"

def run_tests():
    print("=== Virtual Try-On Backend Service Verification ===")

    # 1. Start the FastAPI server using uvicorn
    print("Starting FastAPI Try-On Service locally on port 8003...")
    env = os.environ.copy()
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8003"],
        env=env
    )

    # Wait for server to spin up
    print("Waiting for server to become responsive...")
    max_retries = 25
    is_up = False
    for i in range(max_retries):
        try:
            response = requests.get(SERVER_URL, timeout=2)
            if response.status_code == 200:
                is_up = True
                break
        except requests.exceptions.RequestException:
            pass
        time.sleep(1)

    if not is_up:
        print("[✘] Server failed to start or did not become responsive on port 8003")
        server_process.terminate()
        sys.exit(1)

    try:
        # 2. Test Root Endpoint
        print("Testing root endpoint '/'...")
        try:
            response = requests.get(SERVER_URL, timeout=5)
            print(f"Status Code: {response.status_code}")
            print(f"Response Body: {response.json()}")
            assert response.status_code == 200
            assert response.json()["service"] == "tryon-service"
            print("[\u2714] Root endpoint verification PASSED!")
        except Exception as e:
            print(f"[\u2718] Root endpoint verification FAILED: {e}")
            raise

        # 3. Test CORS Headers
        print("\nTesting CORS headers...")
        try:
            response = requests.options(UPLOAD_ENDPOINT, headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type"
            }, timeout=5)
            print(f"Option response headers: {response.headers}")
            assert "access-control-allow-origin" in response.headers
            print("[\u2714] CORS headers verification PASSED!")
        except Exception as e:
            print(f"[\u2718] CORS headers verification FAILED: {e}")
            raise

        # 4. Test API category validation
        print("\nTesting endpoint parameter validation (Invalid Category)...")
        # Dummy file to send
        dummy_file_path = "dummy_person.jpg"
        with open(dummy_file_path, "wb") as f:
            f.write(b"fake image data")

        try:
            with open(dummy_file_path, "rb") as human_img:
                files = {"human_image": ("dummy_person.jpg", human_img, "image/jpeg")}
                data = {
                    "garment_image_url": "https://example.com/dress.jpg",
                    "category": "invalid_category",  # Invalid value
                    "description": "Red dress"
                }
                response = requests.post(UPLOAD_ENDPOINT, files=files, data=data, timeout=5)
            print(f"Status Code for invalid category: {response.status_code}")
            print(f"Response: {response.json()}")
            assert response.status_code == 400
            assert "Invalid category" in response.json()["detail"]
            print("[\u2714] Category validation checks PASSED!")
        except Exception as e:
            print(f"[\u2718] Category validation checks FAILED: {e}")
            raise
        finally:
            if os.path.exists(dummy_file_path):
                os.remove(dummy_file_path)

        print("\n=== Validation Complete: All local unit/integration checks PASSED! ===")

    finally:
        print("\nTerminating background server process...")
        server_process.terminate()
        try:
            server_process.wait(timeout=5)
            print("Server process exited clean.")
        except subprocess.TimeoutExpired:
            server_process.kill()
            print("Forced termination of server.")

if __name__ == "__main__":
    run_tests()
