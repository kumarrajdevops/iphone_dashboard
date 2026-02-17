import requests
import time
import json
import os

TOKEN_URL = "https://account.hubstaff.com/access_tokens"

class HubstaffTokenManager:
    def __init__(self, pat, token_file="hubstaff_tokens.json"):
        self.pat = pat
        self.token_file = token_file
        self.tokens = self.load_tokens()

    # Load tokens from file
    def load_tokens(self):
        if os.path.exists(self.token_file):
            try:
                with open(self.token_file, "r") as f:
                    return json.load(f)
            except json.JSONDecodeError:
                return None
        return None

    # Save tokens to file
    def save_tokens(self, tokens):
        with open(self.token_file, "w") as f:
            json.dump(tokens, f)
        self.tokens = tokens

    # Exchange PAT or refresh token for access_token
    def refresh_access_token(self):
        # Use existing refresh token if available, otherwise use PAT (first time)
        refresh_token = (
            self.tokens["refresh_token"]
            if (self.tokens and "refresh_token" in self.tokens) else self.pat
        )

        try:
            response = requests.post(
                TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            )

            if response.status_code != 200:
                # If refresh fails with existing token, try fallback to PAT if different
                if self.tokens and refresh_token != self.pat:
                   print(f"Refresh failed with stored token. Retrying with PAT. Status: {response.status_code}")
                   return self._refresh_with_pat()
                
                print(f"Token refresh failed: {response.text}")
                raise Exception(f"Token refresh failed: {response.text}")

            token_data = response.json()
            
            # Calculate expiry (expires_in is usually 86400 seconds / 24h)
            # Subtract 60s buffer
            token_data["expires_at"] = int(time.time()) + token_data.get("expires_in", 3600) - 60

            self.save_tokens(token_data)
            return token_data["access_token"]
            
        except Exception as e:
            print(f"Exception during token refresh: {e}")
            raise

    def _refresh_with_pat(self):
        """Fallback to use PAT if stored refresh token is invalid"""
        print("Attempting to exchange PAT for fresh tokens...")
        response = requests.post(
            TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": self.pat
            },
            headers={
                "Content-Type": "application/x-www-form-urlencoded"
            }
        )
        
        if response.status_code != 200:
             raise Exception(f"PAT exchange failed: {response.text}")
             
        token_data = response.json()
        token_data["expires_at"] = int(time.time()) + token_data.get("expires_in", 3600) - 60
        self.save_tokens(token_data)
        return token_data["access_token"]

    # Get valid access token (auto refresh if needed)
    def get_access_token(self):
        if not self.tokens:
            return self.refresh_access_token()

        if "expires_at" not in self.tokens or time.time() >= self.tokens["expires_at"]:
            print("Token expired or expiry missing. Refreshing...")
            return self.refresh_access_token()

        return self.tokens["access_token"]
