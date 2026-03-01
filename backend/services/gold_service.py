import re
import json

async def fetch_gold_data(client):
    gold_data = [] # List of dicts: {"label": "GOLD 24 KT", "price": "17320"}
    try:
        url = "https://www.grtjewels.com/jewellery/gold-jewellery.html"
        headers = {"User-Agent": "Mozilla/5.0"}
        
        g_response = await client.get(url, headers=headers, timeout=15)
        if g_response.status_code == 200:
            html = g_response.text
            scripts = re.findall(r"self\.__next_f\.push\(\[.*?\]\)", html, re.DOTALL)
            
            gold_rates = None
            for block in scripts:
                match = re.search(r'\\"gold_rate\\":(\[.*?\])', block)
                if match:
                    json_string = (
                        match.group(1)
                        .replace('\\"', '"')
                        .replace('\\\\', '\\')
                    )
                    gold_rates = json.loads(json_string)
                    break
            
            if gold_rates:
                for item in gold_rates:
                    label = f"{item['type']} {item['purity']}" if item.get("purity") else item["type"]
                    if label in ["GOLD 18 KT", "GOLD 14 KT"]:
                        continue
                    gold_data.append({
                        "label": label,
                        "price": item["amount"]
                    })
    except Exception as e:
        print(f"Gold API Error: {e}")
        
    return gold_data
