import os

async def fetch_slack_data(client):
    slack_data = {"mentions": 0, "unread_messages": 0, "latest_message": "No data"}
    try:
        slack_token = os.getenv("SLACK_BOT_TOKEN")
        slack_user_id = os.getenv("SLACK_USER_ID")
        if slack_token:
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
                        "unread_messages": len(matches),
                        "latest_message": matches[0].get("text")[:50] + "..." if matches else "No new mentions"
                    }
    except Exception as e:
        print(f"Slack API Error: {e}")
        
    return slack_data
