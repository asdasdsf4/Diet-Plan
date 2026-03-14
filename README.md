# Diet Plan Dashboard 🥗

A personalized daily meal planner with AI-powered recipe info, built with **FastAPI + Jinja2 + HTMX**.

## Features

- **User Profiles** — Just enter your name, no password needed
- **Device Auto-Login** — Your profile is remembered per device
- **Daily Meal Plans** — See today's meals, check off what you've prepared
- **AI Recipe Info** — Click any dish to get AI-generated recipe, nutrition, and cooking instructions
- **Weekly History** — Track which meals you prepared and missed
- **Admin Panel** — Upload meal plans via CSV/XLSX, manage AI models, track user activity
- **Mobile-First** — Optimized for mobile (users) and desktop (admin)

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the app
uvicorn main:app --reload --port 8000
```

Visit: http://localhost:8000

## Admin Access

- **URL:** /admin/login
- **Username:** admin
- **Password:** admin123

⚠️ Change the default password after first login!

## Environment Variables

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Your Groq API key for AI features |
| `OPENROUTER_API_KEY` | Your OpenRouter API key (free models available) |
| `MONGO_URI` | MongoDB connection string (required in production) |
| `DB_NAME` | MongoDB database name (default: `dietplan`) |
| `GEMINI_API_KEY` | Gemini API key for Gemini model support |
| `APP_URL` | Public app URL used by OpenRouter headers |

## Deploy to Render

### Option A: Blueprint (recommended)

1. Push this repo to GitHub.
2. In Render, click **New +** → **Blueprint** and select the repository.
3. Render will detect `render.yaml` and prefill build/start commands.
4. Set secrets in Render Dashboard:
   - `MONGO_URI` (required, use MongoDB Atlas connection string)
   - `GROQ_API_KEY` / `OPENROUTER_API_KEY` / `GEMINI_API_KEY` (optional, based on provider)
   - `APP_URL` (optional, set to your Render service URL)
5. Deploy.

### Option B: Manual Web Service

If you do not use Blueprint, create a **Web Service** with:

- **Runtime:** Python
- **Build Command:** `./build.sh`
- **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

Then configure the same environment variables listed above.

### Local command parity

The commands Render runs are equivalent to:

```bash
./build.sh
uvicorn main:app --host 0.0.0.0 --port $PORT
```

## Meal Plan Upload

1. Login to admin panel
2. Download CSV template
3. Fill in your meals
4. Upload the file

### CSV Format

```csv
plan_date,meal_type,dish_name,description,calories,protein_g,carbs_g,fat_g,fiber_g
2026-02-22,breakfast,Oatmeal with Berries,Warm oatmeal,350,12,55,8,6
```

**Valid meal_type values:** breakfast, morning_snack, lunch, afternoon_snack, dinner, evening_snack


## Deploy on Deno Deploy

This repository now includes a Deno Deploy-compatible backend in `server.ts`.

### What changed for Deno compatibility

- Runtime moved to Deno + Hono (`server.ts`)
- MongoDB access uses Atlas Data API over HTTPS (works on edge runtime)
- Static files continue to be served from `static/`

### Required environment variables (Deno Deploy)

| Variable | Description |
|---|---|
| `MONGODB_DATA_API_URL` | Atlas Data API base URL (example: `https://data.mongodb-api.com/app/<app-id>/endpoint/data/v1`) |
| `MONGODB_DATA_API_KEY` | Atlas Data API key |
| `MONGODB_DATA_SOURCE` | Atlas cluster name (default: `Cluster0`) |
| `DB_NAME` | MongoDB database name (default: `dietplan`) |

### Deno local run

```bash
deno task start
```

### Deno Deploy settings

- **Entrypoint:** `server.ts`
- **Install/Build Command:** *(none required)*
- **Environment variables:** set the four variables above

> Note: the original Python FastAPI implementation is still present in this repo for reference, but Deno Deploy should use `server.ts`.
