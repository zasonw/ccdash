# Task Board

Folder -> Project -> Task -> Labels. Plain HTML/CSS/JS, Supabase backend, deploys to GitHub Pages.

## 1. Supabase setup

1. Use the Supabase project `yrlqptrccpgflqalivqb`.
2. SQL Editor -> paste `schema.sql` -> Run.
3. Authentication -> Providers -> enable **Email**. Optionally turn off "Confirm email" while developing.
4. Project Settings -> API -> copy the **Project URL** and **anon/publishable key**.

## 2. Add credentials

Open `app.js` and update the Supabase key near the top:

```js
const SUPABASE_URL = "https://yrlqptrccpgflqalivqb.supabase.co";
const SUPABASE_ANON_KEY = "paste the anon/publishable key here";
```

The app blocks sign-in with a setup message if the key is missing or belongs to a different Supabase project.

## 3. Link Supabase CLI

The repo has been initialized with `supabase init`. To link it locally, authenticate the CLI with a Supabase personal access token from Account -> Access Tokens:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_your_personal_access_token"
bunx supabase link --project-ref yrlqptrccpgflqalivqb
bunx supabase projects api-keys --project-ref yrlqptrccpgflqalivqb
```

## 4. Run locally

Just open `index.html` in a browser, or:

```powershell
npx serve .
```

## 5. Deploy to GitHub Pages

1. Push this folder to a GitHub repo.
2. Repo -> Settings -> Pages -> Source: **Deploy from a branch** -> branch `main`, folder `/ (root)`.
3. Visit the Pages URL.
4. In Supabase -> Authentication -> URL Configuration, add your Pages URL to the allowed redirect/site URLs.

## Hierarchy

- **Folder** - life/work area such as Work, Church, or Personal.
- **Project** - a goal inside a folder.
- **Task** - an action item inside a project.
- **Label** - flexible tag attached to tasks, such as UI, Urgent, or Quick Win.

A task belongs to one project and can have many labels.

## Style

The interface uses a cozy focused workspace theme with dark and light modes, accent color controls, compact 8px radii, crisp panels, task cards, and responsive mobile drawers. Most visual customization lives in `styles.css`.

## Features

- Projects can each have their own adjustable color.
- Tasks support workflow stages, percentage progress, due dates, labels, notes, and comments.
- Project progress is calculated from task percentages, while completed task counts remain visible in context.

## Responsive

- Desktop >= 980px: three columns for folders, projects, and tasks.
- Tablet 720-980px: two columns.
- Mobile < 720px: single column with a top bar; tap the menu button to slide in folders, tap a folder or project to drill in.
