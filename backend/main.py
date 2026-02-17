from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import asyncio
import httpx
from datetime import datetime, date
import uvicorn
from routers import hubstaff
from hubstaff_token_manager import HubstaffTokenManager

load_dotenv()

app = FastAPI()

# Initialize Manager
pat = os.getenv("HUBSTAFF_PAT")
token_manager = HubstaffTokenManager(pat) if pat else None

app.include_router(hubstaff.router)

# CORS configuration
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://iphone-dashboard-frontend.onrender.com",
    "*", 
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False, # Set to True only if not using wildcard or if specific origins match
    allow_methods=["*"],
    allow_headers=["*"],
)



# ... existing imports ...

@app.get("/api/dashboard")
async def get_dashboard_data():
    async with httpx.AsyncClient() as client:
        # 1. Hubstaff Data
        hubstaff_data = {"total_time": "--:--", "project": "Connect API", "status": "inactive"}
        try:
            hubstaff_org_id = os.getenv("HUBSTAFF_ORG_ID")
            hubstaff_user_id = os.getenv("HUBSTAFF_USER_ID")
            
            if hubstaff_org_id and token_manager:
                today_str = date.today().isoformat()
                
                try:
                    access_token = token_manager.get_access_token()
                    
                    # URL compatible with what works in routers/hubstaff.py
                    # Using date[stop] instead of date[end] and adding filters[user]
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
                         access_token = token_manager.refresh_access_token()
                         hs_response = await client.get(
                            url,
                            headers={"Authorization": f"Bearer {access_token}"},
                            params=params
                         )

                except Exception as e:
                    print(f"Token Manager Error in main: {e}")
                    hs_response = None # Handle gracefully
            else:
                 # Fallback/Error if no token manager (shouldn't happen if env is set)
                 hs_response = None
            
            if hs_response and hs_response.status_code == 200:
                    data = hs_response.json()
                    # Simplified logic to sum time from response
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

        # 2. Slack Data
        slack_data = {"mentions": 0, "unread_messages": 0, "latest_message": "No data"}
        try:
            slack_token = os.getenv("SLACK_BOT_TOKEN")
            slack_user_id = os.getenv("SLACK_USER_ID")
            if slack_token:
                # Get history or search for mentions
                # This requires 'channels:history' or 'search:read' scopes
                # Simplified: fetching from a specific channel or using search.messages
                # search.messages is powerful for "mentions of me"
                slack_response = await client.get(
                    "https://slack.com/api/search.messages",
                    headers={"Authorization": f"Bearer {slack_token}"},
                    params={"query": f"<@{slack_user_id}>", "count": 5}
                )
                if slack_response.status_code == 200:
                    data = slack_response.json()
                    if data.get("ok"):
                        matches = data.get("messages", {}).get("matches", [])
                        slack_data = {
                            "mentions": data.get("messages", {}).get("total", 0),
                            "unread_messages": len(matches), # Approximation
                            "latest_message": matches[0].get("text")[:50] + "..." if matches else "No new mentions"
                        }
        except Exception as e:
            print(f"Slack API Error: {e}")

        # 3. Google Calendar Data
        calendar_data = {"next_meeting": "--:--", "title": "No upcoming events", "platform": ""}
        try:
            cal_key = os.getenv("GOOGLE_CALENDAR_API_KEY")
            cal_id = os.getenv("GOOGLE_CALENDAR_ID", "primary")
            if cal_key:

                now_iso = datetime.utcnow().isoformat() + "Z"
                cal_response = await client.get(
                    f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events",
                    params={
                        "key": cal_key,
                        "timeMin": now_iso,
                        "maxResults": 1,
                        "singleEvents": "true",
                        "orderBy": "startTime"
                    }
                )
                if cal_response.status_code == 200:
                    items = cal_response.json().get("items", [])
                    if items:
                        event = items[0]
                        start = event.get("start", {}).get("dateTime", event.get("start", {}).get("date"))
                        # Basic formatting, assuming ISO string
                        time_str = start.split("T")[1][:5] if "T" in start else "All Day"
                        
                        platform = "Google Meet" if "video" in event.get("htmlLink", "") else "Meeting"
                        
                        calendar_data = {
                            "next_meeting": time_str,
                            "title": event.get("summary", "Busy"),
                            "platform": platform
                        }
        except Exception as e:
            print(f"Calendar API Error: {e}")

        # 4. Build Status (Mock for now, or could link to Github Actions / Jenkins)
        build_data = {
            "status": "Passed", 
            "project": "iOS App", 
            "last_run": "10 mins ago"
        }

        # 5. Weather Data (Open-Meteo)
        weather_data = {"temp": "--", "location": "Hyd", "condition": "Unknown"}
        try:
            # Hyderabad coordinates
            weather_url = "https://api.open-meteo.com/v1/forecast?latitude=17.3850&longitude=78.4867&current=temperature_2m"
            w_response = await client.get(weather_url)
            if w_response.status_code == 200:
                w_data = w_response.json()
                current_temp = w_data.get("current", {}).get("temperature_2m")
                weather_data = {
                    "temp": int(round(current_temp)) if current_temp is not None else "--",
                    "location": "Hyd",
                    "condition": "Live" 
                }
        except Exception as e:
            print(f"Weather API Error: {e}")

        return {
            "hubstaff": hubstaff_data,
            "slack": slack_data,
            "calendar": calendar_data,
            "build": build_data,
            "weather": weather_data
        }

@app.get("/")
async def root():
    return {"message": "Office Dashboard API is running"}

if __name__ == "__main__":

    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
