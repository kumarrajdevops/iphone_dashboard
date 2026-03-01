import os
import asyncio
import httpx
from datetime import date
from dotenv import load_dotenv
from hubstaff_token_manager import HubstaffTokenManager

load_dotenv()

async def test():
    pat = os.getenv("HUBSTAFF_PAT")
    print(f"PAT from env length: {len(pat) if pat else 0}")
    tm = HubstaffTokenManager(pat)
    try:
        at = tm.get_access_token()
        print(f"Access token retrieved: {at[:15]}...")
        
        org = os.getenv("HUBSTAFF_ORG_ID")
        user = os.getenv("HUBSTAFF_USER_ID")
        today = date.today().isoformat()
        
        url = f"https://api.hubstaff.com/v2/organizations/{org}/activities/daily"
        
        async with httpx.AsyncClient() as client:
            res = await client.get(
                url, 
                headers={"Authorization": f"Bearer {at}"},
                params={"date[start]": today, "date[stop]": today, "filters[user]": user}
            )
            print(f"Status: {res.status_code}")
            print(f"Response: {res.text}")
            
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test())
