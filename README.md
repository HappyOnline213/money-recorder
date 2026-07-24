# Money Recorder

Personal money recorder. Weekly allowance cycle (Sunday start), monthly counters with caps, two accounts (Allowance + Savings), bill splitting with friends, weekly/monthly reports with pie charts, full history, and Excel export. Data lives in Supabase and syncs between phone and desktop. Installable as a PWA.

**v0.3.1 — Phase 3**

## Setup, from zero to running

### 1. Supabase (once)

1. Create a project at supabase.com — region Southeast Asia (Singapore).
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, press **Run**. You should see "Success. No rows returned".
3. Go to **Authentication → Providers → Email** and check it is enabled (it is by default). Optional but recommended for a personal app: turn **off** "Confirm email" so sign-up works instantly.
4. Go to **Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Run it locally (once, to test)

Needs Node.js 18+.

```
cp .env.example .env        # then edit .env and paste your URL + anon key
npm install
npm run dev
```

Open the printed localhost URL, create your account (email + password), and everything should work.

### 3. Push to GitHub

```
git init
git add .
git commit -m "Money Recorder v0.3.1"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/money-recorder.git
git push -u origin main
```

The `.env` file is gitignored on purpose — your keys never go to GitHub.

### 4. Deploy on Vercel

1. vercel.com → **Add New → Project** → import the `money-recorder` repo.
2. Framework preset: **Vite** (auto-detected).
3. Under **Environment Variables**, add both:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Deploy. You get a `something.vercel.app` URL.

### 5. Install on your phone

Open the Vercel URL in your phone browser → browser menu → **Add to Home Screen**. It installs with the app icon and opens full-screen. Same URL on desktop, same account, same data.

## Notes

- The anon key is designed to be public — your data is protected by row-level security in the database, not by hiding the key.
- Supabase free tier pauses the project after ~1 week of no API activity; open the dashboard and click restore if that happens.
- Export (Setup tab) produces one .xlsx with Transactions, Bills, and Money Flows sheets, each with Week and Month columns for filtering in Excel.
- Balances, debts, and counts are all derived from the stored events, so deleting an entry self-corrects everything.
