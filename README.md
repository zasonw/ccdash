# Task Board

Folder → Project → Task → Labels. Plain HTML/CSS/JS, Supabase backend, deploys to GitHub Pages.

## 1. Supabase setup

1. Create a project at supabase.com.
2. SQL Editor → paste `schema.sql` → Run.
3. Authentication → Providers → enable **Email**. (Optionally turn off "Confirm email" in dev.)
4. Project Settings → API → copy the **Project URL** and **anon public key**.

## 2. Add credentials

Open `app.js` and replace the top two constants:

```js
const SUPABASE_URL = "https://YOURPROJECT.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGci...";
```

## 3. Run locally

Just open `index.html` in a browser, or:

```
npx serve .
```

## 4. Deploy to GitHub Pages

1. Push this folder to a GitHub repo.
2. Repo → Settings → Pages → Source: **Deploy from a branch** → branch `main`, folder `/ (root)`.
3. Visit the Pages URL.
4. In Supabase → Authentication → URL Configuration, add your Pages URL to the allowed redirect/site URLs.

## Hierarchy

- **Folder** — life/work area (Work, Church, Personal)
- **Project** — a goal inside a folder
- **Task** — an action item inside a project
- **Label** — flexible tag attached to tasks (UI, Urgent, Quick Win)

A task belongs to one project and can have many labels.

## Responsive

- Desktop ≥ 980px: three columns (folders / projects / tasks).
- Tablet 720–980px: two columns.
- Mobile < 720px: single column with a top bar; tap ☰ to slide in folders, tap a folder or project to drill in.
