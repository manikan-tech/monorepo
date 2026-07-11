import os
from gradio_client import Client
from dotenv import load_dotenv

load_dotenv()
HF_TOKEN = os.getenv("HF_TOKEN")

print("Initializing client for yisol/IDM-VTON...")
client = Client("yisol/IDM-VTON", token=HF_TOKEN)
print("Viewing API:")
client.view_api()
