import os
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

async def test_token():
    token = os.getenv("HUBSTAFF_ACCESS_TOKEN")
    if not token:
        print("No token found")
        return

    print(f"Testing token: {token[:10]}...")
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        # Test 1: User Profile (Simple verify)
        try:
            r = await client.get("https://api.hubstaff.com/v2/users/me", headers=headers)
            print(f"User Endpoint Status: {r.status_code}")
            print(f"User Response: {r.text}")
        except Exception as e:
            print(f"User Endpoint Error: {e}")

        # Test 2: Organizations
        try:
            r = await client.get("https://api.hubstaff.com/v2/organizations", headers=headers)
            print(f"Orgs Endpoint Status: {r.status_code}")
            print(f"Orgs Response: {r.text}")
        except Exception as e:
            print(f"Orgs Endpoint Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_token())
