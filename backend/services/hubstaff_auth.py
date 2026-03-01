import httpx
import time
import json
import os
import asyncio

TOKEN_URL = "https://account.hubstaff.com/access_tokens"

class HubstaffTokenManager:
    def __init__(self, pat, token_file="hubstaff_tokens.json"):
        self.pat = pat
        self.token_file = token_file
        self.tokens = self.load_tokens()
        self.lock = None # Initialized lazily to bind to correct event loop

    def _get_lock(self):
        if self.lock is None:
            self.lock = asyncio.Lock()
        return self.lock

    def load_tokens(self):
        if os.path.exists(self.token_file):
            try:
                with open(self.token_file, "r") as f:
                    return json.load(f)
            except json.JSONDecodeError:
                return None
        return None

    def save_tokens(self, tokens):
        with open(self.token_file, "w") as f:
            json.dump(tokens, f)
        self.tokens = tokens

    async def refresh_access_token(self):
        async with self._get_lock():
            # Re-check tokens after acquiring lock in case another task refreshed it
            disk_tokens = self.load_tokens()
            if disk_tokens:
                self.tokens = disk_tokens
                if self.tokens and "expires_at" in self.tokens and time.time() < self.tokens["expires_at"]:
                    return self.tokens["access_token"]
            
            refresh_token = (
                self.tokens["refresh_token"]
                if (self.tokens and "refresh_token" in self.tokens) else self.pat
            )

            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
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
                        if self.tokens and refresh_token != self.pat:
                           print(f"Refresh failed with stored token. Retrying with PAT. Status: {response.status_code}")
                           return await self._refresh_with_pat_locked(client)
                        
                        print(f"Token refresh failed: {response.text}")
                        raise Exception(f"Token refresh failed: {response.text}")

                    token_data = response.json()
                    token_data["expires_at"] = int(time.time()) + token_data.get("expires_in", 3600) - 60
                    self.save_tokens(token_data)
                    return token_data["access_token"]
                    
            except Exception as e:
                print(f"Exception during token refresh: {e}")
                raise

    async def _refresh_with_pat_locked(self, client):
        """Fallback to use PAT if stored refresh token is invalid. Assumes lock is held."""
        print("Attempting to exchange PAT for fresh tokens...")
        response = await client.post(
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

    async def get_access_token(self):
        # Quick check without lock
        disk_tokens = self.load_tokens()
        if disk_tokens:
            self.tokens = disk_tokens

        if not self.tokens:
            return await self.refresh_access_token()

        if "expires_at" not in self.tokens or time.time() >= self.tokens["expires_at"]:
            print("Token expired or expiry missing. Refreshing...")
            return await self.refresh_access_token()

        return self.tokens["access_token"]

from dotenv import load_dotenv
load_dotenv()
default_pat = os.getenv("HUBSTAFF_PAT")
default_token_manager = HubstaffTokenManager(default_pat) if default_pat else None

