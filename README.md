# Office Dashboard

A clean, responsive web dashboard optimized for iPhone Kiosk Mode (Guided Access).
Displays Hubstaff stats, Google Calendar meetings, Slack mentions, and build status.

## Architecture

- **Backend**: Python (FastAPI) - Aggregates data from various APIs.
- **Frontend**: React + Vite - Displays data in a Bento Grid layout.

## 🚀 Deployment (Render)

This project is configured for deployment on [Render](https://render.com).

### Prerequisites
1.  Fork/Clone this repository to your GitHub.
2.  Create a [Render](https://render.com) account.

### Deploy using Blueprint (Recommended)
1.  Go to **Render Dashboard > Blueprints**.
2.  Click **New Blueprint Instance**.
3.  Connect your repository.
4.  Render will automatically detect `render.yaml` and create:
    - `dashboard-backend` (Python Web Service)
    - `dashboard-frontend` (Static Site)

### Environment Variables
You must set these in the **Backend Service** settings on Render:

| Variable | Description |
| :--- | :--- |
| `HUBSTAFF_PAT` | **Required.** Your Hubble Personal Access Token (Refresh Token). |
| `HUBSTAFF_ORG_ID` | **Required.** ID of your Hubstaff Organization. |
| `HUBSTAFF_USER_ID` | **Required.** ID of the user to track. |
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token (`xoxb-...`). |
| `GOOGLE_CALENDAR_API_KEY` | Google Cloud API Key with Calendar access. |
| `GITHUB_TOKEN` | **Required for tasks sync.** GitHub PAT with contents write access. |
| `GITHUB_REPO_OWNER` | **Required for tasks sync.** GitHub user/org owning blog repo. |
| `GITHUB_REPO_NAME` | **Required for tasks sync.** Blog repo name (e.g., `kumarrajdevops.github.io`). |
| `GITHUB_TASKS_FILE_PATH` | Optional. Defaults to `daily_tasks_log.md` in blog repo root. |
| `GITHUB_TARGET_BRANCH` | Optional. Defaults to `main`. |
| `TASKS_SYNC_MODE` | Optional. `local` (default in local `.env`) or `github`. |
| `LOCAL_TASKS_FILE_PATH` | Optional. Local markdown file path used when `TASKS_SYNC_MODE=local`. |

> **Note:** The Frontend service typically doesn't need env vars for this setup, as it uses the backend URL provided by `VITE_API_URL` (handled automatically if using Blueprint or manual linking).

---

## 🛠 Local Setup

### Backend

1.  Navigate to `backend/`:
    ```bash
    cd backend
    ```
2.  Create and activate a virtual environment:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Configure `.env`:
    ```bash
    cp .env .env.local
    # Edit .env and add your HUBSTAFF_PAT, etc.
    ```
5.  Run the server:
    ```bash
    python main.py
    # Server runs on http://localhost:8000
    ```
    *Note: The first run with a new PAT will create a `hubstaff_tokens.json` file to cache credentials.*

### Frontend

1.  Navigate to `frontend/`:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Run development server:
    ```bash
    npm run dev
    # App runs on http://localhost:5173
    ```

## 📱 iPhone Kiosk Mode

1.  Open the deployed URL (e.g., `https://your-app.onrender.com`) in Safari on iPhone.
2.  **Add to Home Screen** to run in full screen.
3.  Go to **Settings > Accessibility > Guided Access** and turn it ON.
4.  Open the app and Triple-click the side button to start Guided Access (locks the device to the app).

---

## Daily Tasks Sync API

The backend now exposes endpoints to sync Markdown task content into your blog repo:

- `GET /api/tasks/file` - Reads current tasks Markdown from GitHub.
- `PUT /api/tasks/file` - Writes full tasks Markdown and creates a commit.

For local testing without GitHub credentials, use:

- `TASKS_SYNC_MODE=local`
- `LOCAL_TASKS_FILE_PATH=../../kumarrajdevops.github.io/daily_tasks_log.md`

In this mode, `GET/PUT /api/tasks/file` reads/writes a local markdown file in `backend/`.

Example request body for update:

```json
{
  "content": "# TODO -----20/4/26\n\n1. [ ] Update docs\n2. [x] Deploy fix",
  "message": "chore(tasks): update daily log"
}
```

This is designed for a Render-hosted UI to edit tasks and publish to `https://kumarrajdevops.github.io/Daily_Tasks/` via GitHub Actions rebuilds.
