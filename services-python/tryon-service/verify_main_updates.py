import requests

def test_health():
    print("Testing /health ...")
    r = requests.get("http://127.0.0.1:8003/health")
    assert r.status_code == 200
    print("Health response:", r.json())

def test_invalid_category():
    print("Testing invalid category 'upper_body' ...")
    files = {
        'human_image': ('dummy.png', b'dummy_content', 'image/png')
    }
    data = {
        'garment_image_url': 'https://dummy.com/test.png',
        'category': 'upper_body' # should be rejected since 'upper_body' is invalid (only 'blouse', 'shirt', etc. allowed now)
    }
    r = requests.post("http://127.0.0.1:8003/api/vton/2d", files=files, data=data)
    assert r.status_code == 400
    print("Invalid category response:", r.json())

def test_valid_category_format():
    print("Testing valid category format (should pass parser, then fail on dummy files download or prediction) ...")
    files = {
        'human_image': ('dummy.png', b'dummy_content', 'image/png')
    }
    data = {
        'garment_image_url': 'https://dummy.com/test.png',
        'category': 'blouse' # blouse is valid and maps to 'upper_body'
    }
    r = requests.post("http://127.0.0.1:8003/api/vton/2d", files=files, data=data)
    print("Valid category HTTP code:", r.status_code)
    print("Valid category response detail:", r.text[:200])

if __name__ == "__main__":
    test_health()
    test_invalid_category()
    test_valid_category_format()
