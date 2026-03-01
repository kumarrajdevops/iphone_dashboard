from fastapi import APIRouter
import httpx
import os

from services.hubstaff_service import fetch_dashboard_hubstaff_data
from services.slack_service import fetch_slack_data
from services.gold_service import fetch_gold_data
from services.weather_service import fetch_weather_data

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("")
async def get_dashboard_data():
    async with httpx.AsyncClient() as client:
        # Fetch all data concurrently or sequentially
        hubstaff_data = await fetch_dashboard_hubstaff_data(client)
        slack_data = await fetch_slack_data(client)
        gold_data = await fetch_gold_data(client)
        weather_data = await fetch_weather_data(client)
        
        # Build Status (Mock for now)
        build_data = {
            "status": "Passed", 
            "project": "iOS App", 
            "last_run": "10 mins ago"
        }

        return {
            "hubstaff": hubstaff_data,
            "slack": slack_data,
            "gold": gold_data,
            "build": build_data,
            "weather": weather_data
        }
