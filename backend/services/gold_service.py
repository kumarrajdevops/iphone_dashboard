import re
import json

async def fetch_gold_data(client):
    gold_data = [] # List of dicts: {"label": "GOLD 24 KT", "price": "17320"}
    try:
        url = "https://api.lalithaajewellery.com/public/pricings/latest?state_id=2ce06e73-3310-4ea1-9c4d-fd707e4e5efd"
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json"
        }
        
        g_response = await client.get(url, headers=headers, timeout=15)
        if g_response.status_code == 200:
            data = g_response.json()
            prices = data.get("data", {}).get("prices", {})
            
            if "gold" in prices:
                # The Lalithaa API provides daily price which is usually for 22KT gold per gram.
                price_per_gram = prices["gold"]["price"]
                # Adding standard types usually displayed
                gold_data.append({
                    "label": "GOLD 22 KT (1g)",
                    "price": f"{price_per_gram:,.2f}" if isinstance(price_per_gram, (int, float)) else price_per_gram
                })
                # Sometimes 24K is also calculated (like 22k / 22 * 24 roughly or just display 22k if that's what we have)
                # We'll just display what the API gives us as 22 KT since Lalitha's base price is usually 22KT per gram.
                # Adding Silver as well since it's in the API and often useful
            
            if "silver" in prices:
                silver_price = prices["silver"]["price"]
                gold_data.append({
                    "label": "SILVER (1g)",
                    "price": f"{silver_price:,.2f}" if isinstance(silver_price, (int, float)) else silver_price
                })
                
            if "platinum" in prices:
                platinum_price = prices["platinum"]["price"]
                gold_data.append({
                    "label": "PLATINUM (1g)",
                    "price": f"{platinum_price:,.2f}" if isinstance(platinum_price, (int, float)) else platinum_price
                })
                
    except Exception as e:
        print(f"Gold API Error: {e}")
        
    return gold_data
