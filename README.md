# Office Dashboard

A clean, responsive web dashboard optimized for iPhone Kiosk Mode (Guided Access).
Displays Hubstaff stats, Google Calendar meetings, Slack mentions, and build status.

## Architecture

- **Backend**: Python (FastAPI) - Aggregates data from various APIs.
- **Frontend**: React + Vite - Displays data in a Bento Grid layout.

## Setup

### Backend

1. Navigate to `backend/`:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create `.env` file based on `.env`:
   ```bash
   cp .env .env.local
   # Add your API tokens
   ```
5. Run the server:
   ```bash
   python main.py
   # Server runs on http://localhost:8000
   ```

### Frontend

1. Navigate to `frontend/`:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run development server:
   ```bash
   npm run dev
   # App runs on http://localhost:5173
   ```

## Deployment (Vercel)

The easiest way to deploy is using Vercel.
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the root directory.
3. Configure the build settings for frontend (`frontend`) and backend (Serverless Function).

## iPhone Kiosk Mode

1. Open the deployed URL in Safari on iPhone.
2. Go to **Settings > Accessibility > Guided Access** and turn it ON.
3. Triple-click the side button to start Guided Access.
