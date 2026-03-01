async def fetch_weather_data(client):
    weather_data = {"temp": "--", "location": "Hyd", "condition": "Unknown"}
    try:
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
        
    return weather_data
