import os
from datetime import date
from services.hubstaff_auth import default_token_manager

async def fetch_dashboard_hubstaff_data(client):
    hubstaff_data = {"total_time": "--:--", "project": "Connect API", "status": "inactive"}
    try:
        hubstaff_org_id = os.getenv("HUBSTAFF_ORG_ID")
        hubstaff_user_id = os.getenv("HUBSTAFF_USER_ID")
        
        if hubstaff_org_id and default_token_manager:
            today_str = date.today().isoformat()
            
            try:
                access_token = await default_token_manager.get_access_token()
                url = f"https://api.hubstaff.com/v2/organizations/{hubstaff_org_id}/activities/daily"
                params = {
                    "date[start]": today_str,
                    "date[stop]": today_str,
                    "filters[user]": hubstaff_user_id
                }
                
                hs_response = await client.get(
                    url,
                    headers={"Authorization": f"Bearer {access_token}"},
                    params=params
                )
                
                if hs_response.status_code == 401:
                     access_token = await default_token_manager.refresh_access_token()
                     hs_response = await client.get(
                        url,
                        headers={"Authorization": f"Bearer {access_token}"},
                        params=params
                     )

            except Exception as e:
                print(f"Token Manager Error in main: {e}")
                hs_response = None
        else:
             hs_response = None
        
        if hs_response and hs_response.status_code == 200:
                data = hs_response.json()
                total_seconds = sum(item.get('tracked', 0) for item in data.get('daily_activities', []))
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                hubstaff_data = {
                    "total_time": f"{hours}h {minutes}m",
                    "project": "Logged Today",
                    "status": "active"
                }
    except Exception as e:
        print(f"Hubstaff API Error: {e}")
        
    return hubstaff_data
