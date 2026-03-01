from fastapi import APIRouter
import os
import httpx
from datetime import date, timedelta
from typing import Dict, List, Any

import sys
import os
# Add parent directory to path to import hubstaff_token_manager
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

from services.hubstaff_auth import default_token_manager as token_manager

router = APIRouter(prefix="/api/hubstaff", tags=["hubstaff"])

# Initialize Manager 
# NOTE: In production, you might want to initialize this once in main.py and pass it, 
# but for simplicity here we instantiate cleanly or use a singleton pattern if we want.
# Given the simple structure, we'll instantiate it here.
# Ensure HUBSTAFF_PAT is set
pat = os.getenv("HUBSTAFF_PAT")

def format_time(seconds: int) -> str:
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    return f"{hours}:{minutes:02d}"

async def fetch_hubstaff_data(start_date: date, end_date: date):
    hubstaff_org_id = os.getenv("HUBSTAFF_ORG_ID")
    target_user_id = os.getenv("HUBSTAFF_USER_ID")

    if not token_manager:
        return {"error": "Hubstaff PAT missing"}

    if not hubstaff_org_id:
        return {"error": "Hubstaff Org ID missing"}

    url = f"https://api.hubstaff.com/v2/organizations/{hubstaff_org_id}/activities/daily"
    params = {
        "date[start]": start_date.isoformat(),
        "date[stop]": end_date.isoformat(),
        "filters[user]": target_user_id
    }

    async with httpx.AsyncClient() as client:
        try:
            # Get valid access token
            access_token = await token_manager.get_access_token()
            
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
                params=params
            )

            # Retry once on 401 (Refresh)
            if response.status_code == 401:
                print("Got 401 from Hubstaff. Refreshing token...")
                access_token = await token_manager.refresh_access_token()
                response = await client.get(
                    url,
                    headers={"Authorization": f"Bearer {access_token}"},
                    params=params
                )
            
            if response.status_code != 200:
                print(f"Hubstaff Error: {response.text}")
                return {"error": "Failed to fetch from Hubstaff"}

            data = response.json()
            return data.get('daily_activities', [])
        except Exception as e:
            print(f"Hubstaff Exception: {e}")
            return {"error": str(e)}

@router.get("/today")
async def get_hubstaff_today():
    today = date.today()
    daily_activities = await fetch_hubstaff_data(today, today)
    
    if isinstance(daily_activities, dict) and "error" in daily_activities:
        return daily_activities

    total_tracked = 0
    total_overall = 0
    
    if daily_activities:
        # Should be only one entry for today
        activity = daily_activities[0]
        total_tracked = activity.get('tracked', 0)
        total_overall = activity.get('overall', 0)

    avg_act = 0
    if total_tracked > 0:
        avg_act = total_overall / total_tracked
    
    return {
        "date": today.isoformat(),
        "time": format_time(total_tracked),
        "activity": f"{int(avg_act * 100)}%"
    }

@router.get("/weekly")
async def get_hubstaff_weekly():
    today = date.today()
    seven_days_ago = today - timedelta(days=7)
    
    # Fetch data up to today to ensure we cover the range, but we will filter today out
    daily_activities = await fetch_hubstaff_data(seven_days_ago, today)
    
    if isinstance(daily_activities, dict) and "error" in daily_activities:
        return daily_activities

    # Data structure to aggregate by date
    aggregated_data: Dict[str, Dict[str, Any]] = {}

    # Initialize last 7 days (excluding today)
    dates_list = [today - timedelta(days=i) for i in range(1, 8)] # Start from 1 (yesterday) to 7 days back? 
    # User said "Last 7 Days". Usually means [Today-6 ... Today].
    # But user wants to EXCLUDE today from the list.
    # So let's show [Today-7 ... Yesterday] OR [Today-6 ... Yesterday].
    # Let's Stick to the "Last 7 entries" logic but excluding today.
    # Originally it was [Today-6 ... Today]. 
    # If we exclude today, we have 6 days. Let's start from Yesterday and go back 6 more days to make it 7 days total?
    # Or just show the past 6 days? "Last 7 Days" usually implies a fixed window.
    # Let's show Yesterday back to Yesterday-6 (7 days total).
    
    dates_list = [today - timedelta(days=i) for i in range(1, 8)]
    
    for d in dates_list:
        d_str = d.isoformat()
        aggregated_data[d_str] = {"tracked": 0, "overall": 0}

    for activity in daily_activities:
        d_str = activity.get('date')
        if d_str in aggregated_data:
            aggregated_data[d_str]['tracked'] += activity.get('tracked', 0)
            aggregated_data[d_str]['overall'] += activity.get('overall', 0)

    weekly_stats = []
    
    # Sort dates descending (newest first) or as per list order
    for d in dates_list:
        d_str = d.isoformat()
        day_data = aggregated_data[d_str]
        
        total_tracked = day_data['tracked']
        total_overall = day_data['overall']
        
        avg_act = 0
        if total_tracked > 0:
            avg_act = total_overall / total_tracked
        
        weekly_stats.append({
            "date": d_str,
            "time": format_time(total_tracked),
            "activity": f"{int(avg_act * 100)}%"
        })

    return weekly_stats
