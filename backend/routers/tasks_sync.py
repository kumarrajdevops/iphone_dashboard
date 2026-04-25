import base64
import os
import re
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

GITHUB_API_BASE = "https://api.github.com"
TODO_HEADER_RE = re.compile(r"^#\s*TODO\s*-*([0-9]{2}/[0-9]{2}/[0-9]{4})\s*$", re.IGNORECASE)
TABLE_ROW_RE = re.compile(r"^\|\s*(\[[xX ]\])\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$")
CARRY_FORWARD_REMARK = "working on other priority tasks as per requirement"


class UpdateTasksRequest(BaseModel):
    content: str = Field(..., description="Full Markdown content to store")
    message: str = Field(default="chore(tasks): update daily tasks log")


def _parse_date_key(date_str: str):
    day, month, year = date_str.split("/")
    return int(year), int(month), int(day)


def _normalize_task_key(task: str) -> str:
    return " ".join((task or "").strip().lower().split())


def _parse_sections(markdown: str):
    sections = []
    current = None
    for line in markdown.splitlines():
        header = TODO_HEADER_RE.match(line.strip())
        if header:
            if current:
                sections.append(current)
            current = {
                "date": header.group(1),
                "rows": [],
                "header": f"# TODO -----{header.group(1)}",
            }
            continue

        if current is None:
            continue

        row = TABLE_ROW_RE.match(line)
        if not row:
            continue

        done, task, status, remark = row.groups()
        if task.lower() == "task" or status == "---":
            continue
        current["rows"].append(
            {
                "done": done.lower() == "[x]",
                "task": task.strip(),
                "status": status.strip().lower(),
                "remark": remark.strip(),
            }
        )

    if current:
        sections.append(current)
    return sections


def _serialize_sections(sections):
    out = []
    for section in sections:
        out.append(section["header"])
        out.append("")
        out.append("| Done | Task | Status | Remark |")
        out.append("| --- | --- | --- | --- |")
        for row in section["rows"]:
            done = "[x]" if row["status"] == "completed" else "[ ]"
            out.append(
                f"| {done} | {row['task']} | {row['status']} | {(row['remark'] or '').strip()} |"
            )
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def _apply_task_rules(markdown: str) -> str:
    sections = _parse_sections(markdown)
    if not sections:
        return markdown

    # Always sync done checkbox with status.
    for section in sections:
        for row in section["rows"]:
            row["done"] = row["status"] == "completed"

    task_entries = {}
    for sidx, section in enumerate(sections):
        date_key = _parse_date_key(section["date"])
        for ridx, row in enumerate(section["rows"]):
            if row["status"] in {"leave", "weekoff"}:
                continue
            key = _normalize_task_key(row["task"])
            if not key:
                continue
            task_entries.setdefault(key, []).append(
                {
                    "sidx": sidx,
                    "ridx": ridx,
                    "date_key": date_key,
                    "date_str": section["date"],
                    "row": row,
                }
            )

    for entries in task_entries.values():
        completed = sorted(
            [e for e in entries if e["row"]["status"] == "completed"],
            key=lambda e: (e["date_key"], e["sidx"], e["ridx"]),
        )
        if completed:
            for entry in entries:
                if entry["row"]["status"] != "in-progress":
                    continue
                later = next((c for c in completed if c["date_key"] > entry["date_key"]), None)
                if not later:
                    continue
                note = f"carry forwarded to next day; completed on {later['date_str']}"
                remark = (entry["row"]["remark"] or "").strip()
                entry["row"]["status"] = "postponed"
                entry["row"]["done"] = False
                if not remark:
                    entry["row"]["remark"] = note
                elif note.lower() not in remark.lower():
                    entry["row"]["remark"] = f"{remark}; {note}"

        in_progress = sorted(
            [e for e in entries if e["row"]["status"] == "in-progress"],
            key=lambda e: (e["date_key"], e["sidx"], e["ridx"]),
        )
        if len(in_progress) > 1:
            latest = in_progress[-1]
            for entry in in_progress[:-1]:
                entry["row"]["status"] = "postponed"
                entry["row"]["done"] = False
                if not (entry["row"]["remark"] or "").strip():
                    entry["row"]["remark"] = CARRY_FORWARD_REMARK
            latest["row"]["done"] = False

    for section in sections:
        for row in section["rows"]:
            row["done"] = row["status"] == "completed"

    return _serialize_sections(sections)


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
    normalized_content = _apply_task_rules(body.content)
    config = _get_repo_config()
    use_local_mode = _tasks_sync_mode() == "local" or config is None

    if use_local_mode:
        local_path = _local_tasks_file()
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_text(normalized_content, encoding="utf-8")
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
            "content": base64.b64encode(normalized_content.encode("utf-8")).decode("utf-8"),
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
