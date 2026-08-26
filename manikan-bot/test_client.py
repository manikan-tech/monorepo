import httpx
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://127.0.0.1:8004/test",
            data={
                "garment_image_url": "https://api.telegram.org/file/abc",
                "category": "shirt",
            },
            files={
                "human_image": ("person.jpg", b"fake", "image/jpeg"),
            },
        )
        print("Status:", response.status_code)
        print("Response:", response.text)

asyncio.run(test())
