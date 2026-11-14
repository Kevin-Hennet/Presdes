from dotenv import load_dotenv
import os

load_dotenv()

gemini_key = os.getenv("GEMINI_API_KEY")
mongodb_uri = os.getenv("MONGODB_URI")

print("Gemini configured:", bool(gemini_key))
print("MongoDB configured:", bool(mongodb_uri))