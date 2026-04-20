import base64
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

GITHUB_API_BASE = "https://api.github.com"


class UpdateTasksRequest(BaseModel):
    content: str = Field(..., description="Full Markdown content to store")
    message: str = Field(default="chore(tasks): update daily tasks log")


def _tasks_sync_mode() -> str:
    return os.getenv("TASKS_SYNC_MODE", "github").strip().lower()


def _local_tasks_file() -> Path:
    configured_path = os.getenv("LOCAL_TASKS_FILE_PATH", "local_daily_tasks_log.md")
    backend_root = Path(__file__).resolve().parent.parent
    return (backend_root / configured_path).resolve()


def _get_repo_config() -> dict:
    owner = os.getenv("GITHUB_REPO_OWNER")
    repo = os.getenv("GITHUB_REPO_NAME")
    token = os.getenv("GITHUB_TOKEN")
    if not owner or not repo or not token:
        return None

    return {
        "owner": owner,
        "repo": repo,
        "token": token,
        "path": os.getenv("GITHUB_TASKS_FILE_PATH", "daily_tasks_log.md"),
        "branch": os.getenv("GITHUB_TARGET_BRANCH", "main"),
    }


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


@router.get("/file")
async def get_tasks_file():
    config = _get_repo_config()
    use_local_mode = _tasks_sync_mode() == "local" or config is None

    if use_local_mode:
        local_path = _local_tasks_file()
        if local_path.exists():
            content = local_path.read_text(encoding="utf-8")
        else:
            content = ""
        return {
            "content": content,
            "sha": None,
            "path": str(local_path),
            "branch": "local",
            "mode": "local",
        }

    url = (
        f"{GITHUB_API_BASE}/repos/{config['owner']}/{config['repo']}/contents/"
        f"{config['path']}"
    )
    params = {"ref": config["branch"]}

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(url, headers=_headers(config["token"]), params=params)

    if response.status_code == 404:
        return {"content": "", "sha": None, "path": config["path"], "branch": config["branch"]}
    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"GitHub read failed: {response.text}",
        )

    payload = response.json()
    encoded = payload.get("content", "").replace("\n", "")
    decoded_content = base64.b64decode(encoded).decode("utf-8") if encoded else ""

    return {
        "content": decoded_content,
        "sha": payload.get("sha"),
        "path": config["path"],
        "branch": config["branch"],
        "mode": "github",
    }


@router.put("/file")
async def update_tasks_file(body: UpdateTasksRequest):
    config = _get_repo_config()
    use_local_mode = _tasks_sync_mode() == "local" or config is None

    if use_local_mode:
        local_path = _local_tasks_file()
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_text(body.content, encoding="utf-8")
        return {
            "ok": True,
            "path": str(local_path),
            "branch": "local",
            "mode": "local",
            "commit_sha": None,
            "commit_url": None,
        }

    url = (
        f"{GITHUB_API_BASE}/repos/{config['owner']}/{config['repo']}/contents/"
        f"{config['path']}"
    )
    params = {"ref": config["branch"]}

    async with httpx.AsyncClient(timeout=20.0) as client:
        existing_response = await client.get(url, headers=_headers(config["token"]), params=params)

        sha = None
        if existing_response.status_code == 200:
            sha = existing_response.json().get("sha")
        elif existing_response.status_code != 404:
            raise HTTPException(
                status_code=existing_response.status_code,
                detail=f"GitHub pre-read failed: {existing_response.text}",
            )

        put_payload = {
            "message": body.message,
            "content": base64.b64encode(body.content.encode("utf-8")).decode("utf-8"),
            "branch": config["branch"],
        }
        if sha:
            put_payload["sha"] = sha

        put_response = await client.put(url, headers=_headers(config["token"]), json=put_payload)

    if put_response.status_code >= 400:
        raise HTTPException(
            status_code=put_response.status_code,
            detail=f"GitHub write failed: {put_response.text}",
        )

    result = put_response.json()
    commit = result.get("commit", {})
    return {
        "ok": True,
        "path": config["path"],
        "branch": config["branch"],
        "mode": "github",
        "commit_sha": commit.get("sha"),
        "commit_url": commit.get("html_url"),
    }
