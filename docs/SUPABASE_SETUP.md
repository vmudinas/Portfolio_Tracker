# Cloud sync with Supabase (free tier)

With a Supabase project connected, the site asks for an **email + password** login and saves your funds,
transactions, watchlists, alerts, settings and API keys to your account, so every device sees the same data.
Without it, the app keeps working in local-only mode (data in this browser, username + PIN lock).

Everything below is done once, in your browser. It takes about 10 minutes.

## 1. Create the project

1. Sign up / log in at [supabase.com](https://supabase.com) and click **New project** (Free plan).
2. Pick a name (e.g. `portfolio-tracker`), a region close to you, and a database password. Save the database
   password in your password manager — the app never needs it.

## 2. Create the table

1. In the project, open **SQL Editor → New query**.
2. Paste the contents of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**.

This creates one table, `portfolio_state`, with Row Level Security so each user can only read and write their
own row. Visitors who aren't signed in can't read anything.

## 3. Auth settings

1. **Authentication → URL Configuration**
   - Site URL: `https://vmudinas.github.io/Portfolio_Tracker/`
   - Redirect URLs: add `https://vmudinas.github.io/Portfolio_Tracker/` (and `http://localhost:5173/Portfolio_Tracker/`
     if you run the app locally).
2. **Authentication → Sign In / Providers → Email**: keep Email enabled and **Confirm Email** on.

## 4. Connect the site

1. **Project Settings → API Keys**: copy the **Project URL** and the **publishable** key (`sb_publishable_…`;
   older projects call it the `anon` key). Never use the `secret` / `service_role` key in the app.
2. In GitHub: **vmudinas/Portfolio_Tracker → Settings → Secrets and variables → Actions → Variables → New
   repository variable**, and add:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_PUBLISHABLE_KEY` = the publishable key
3. **Actions → Deploy to GitHub Pages → Run workflow** (or merge any PR) so the site is rebuilt with them.

The publishable key is designed to be public: your data is protected by your login and the table's Row Level
Security, not by hiding the key.

## 5. Create your account, then close sign-ups

1. Open the site → **Create an account** with your email and a password (8+ characters). Click the link in the
   confirmation email, then log in.
2. On first login, whatever is in that browser (your existing funds) is copied into your account.
3. Back in Supabase: **Authentication → Sign In / Providers → turn off "Allow new users to sign up"**
   (under the general user settings), so nobody else can create accounts on your project.

## Good to know

- **Free-tier pause**: Supabase pauses free projects after a week with no activity. If the site says it can't
  reach the server, open the Supabase dashboard and click **Restore project**.
- **Sign-out**: you're signed out after 15 minutes without activity or when you close the tab; signing out removes
  the data from that browser (it stays in your account).
- **Forgot password**: use **Forgot your password?** on the login page; the email link brings you back to choose a
  new one.
- **Backups** still work (Backup → Download) and are a good idea before big changes.
- **Local development**: put `VITE_SUPABASE_URL=…` and `VITE_SUPABASE_PUBLISHABLE_KEY=…` in `.env.local`
  (git-ignored) and run `npm run dev`.
