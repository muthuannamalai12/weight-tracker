# ⚖️ Weight Tracker — Self-Hosting Guide

A full-featured weight tracking web app with cross-device sync via Supabase, hosted free on Vercel.

---

## What you'll need (all free)

| Service | Purpose | Cost |
|---------|---------|------|
| [Supabase](https://supabase.com) | Database + Authentication | Free tier |
| [Vercel](https://vercel.com) | Hosting | Free tier |
| [GitHub](https://github.com) | Code storage (Vercel deploys from here) | Free |

---

## STEP 1 — Set up Supabase (your database)

### 1.1 Create a Supabase account
1. Go to https://supabase.com and click **Start your project**
2. Sign up with GitHub, Google, or email

### 1.2 Create a new project
1. Click **New project**
2. Choose your organization (or create one)
3. Fill in:
   - **Project name:** `weight-tracker` (or anything you like)
   - **Database password:** Choose a strong password (save it somewhere)
   - **Region:** Pick the one closest to you
4. Click **Create new project**
5. Wait ~2 minutes for the project to spin up

### 1.3 Run the database setup
1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `supabase-setup.sql` from this project
4. Copy the entire contents and paste it into the SQL editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see "Success. No rows returned" — that means it worked

### 1.4 Get your API keys
1. In the left sidebar, click **Project Settings** (gear icon at bottom)
2. Click **API**
3. You need two values — copy them somewhere:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting with `eyJ...`

### 1.5 Enable email authentication
1. In the left sidebar, click **Authentication**
2. Click **Providers**
3. Make sure **Email** is enabled (it is by default)
4. Optional: Turn off "Confirm email" if you don't want to verify emails
   - Go to **Authentication > Email Templates > Confirm signup**
   - Or in **Authentication > Settings**, disable "Enable email confirmations"

---

## STEP 2 — Add your Supabase keys to the app

1. Open the file `app.js` in a text editor
2. Find these two lines near the top:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

3. Replace `YOUR_SUPABASE_URL` with your Project URL from Step 1.4
4. Replace `YOUR_SUPABASE_ANON_KEY` with your anon public key from Step 1.4

Example after editing:
```javascript
const SUPABASE_URL = 'https://abcdefgh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## STEP 3 — Upload to GitHub

### 3.1 Create a GitHub account
- Go to https://github.com and sign up (if you don't have one)

### 3.2 Create a new repository
1. Click the **+** icon (top right) → **New repository**
2. Name it `weight-tracker`
3. Keep it **Public** (required for free Vercel hosting) or Private (needs Vercel paid plan)
4. Click **Create repository**

### 3.3 Upload your files
**Option A — GitHub website (easiest):**
1. On your new repo page, click **uploading an existing file**
2. Drag and drop these 4 files:
   - `index.html`
   - `app.js`
   - `vercel.json`
   - `supabase-setup.sql` (optional, just for reference)
3. Click **Commit changes**

**Option B — Git command line:**
```bash
cd weight-tracker
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/weight-tracker.git
git push -u origin main
```

---

## STEP 4 — Deploy to Vercel

### 4.1 Create a Vercel account
1. Go to https://vercel.com
2. Click **Sign Up** — sign up with GitHub (easiest)

### 4.2 Import your project
1. On the Vercel dashboard, click **Add New → Project**
2. Find your `weight-tracker` GitHub repository and click **Import**
3. Leave all settings as default
4. Click **Deploy**
5. Wait ~30 seconds

### 4.3 Get your URL
- Vercel gives you a free URL like `https://weight-tracker-abc123.vercel.app`
- You can also add a custom domain in Vercel settings if you have one

---

## STEP 5 — Final check: Allow your domain in Supabase

1. Go back to your Supabase dashboard
2. Click **Authentication** in the left sidebar
3. Click **URL Configuration**
4. Under **Site URL**, enter your Vercel URL: `https://weight-tracker-abc123.vercel.app`
5. Under **Redirect URLs**, click **Add URL** and add: `https://weight-tracker-abc123.vercel.app`
6. Click **Save**

---

## Your app is live!

Open your Vercel URL. You should see the sign-in screen.

---

## How to use the app

### Creating an account
1. Click **Create account** tab
2. Enter your email and a password (min 6 characters)
3. Click **Create account**
4. If email confirmation is on, check your email and click the link
5. Sign in with your credentials

### Logging weight
1. You're on the **Log** tab by default
2. The date defaults to today — change it if logging past data
3. Enter your weight in the current unit (kg or lbs)
4. Add an optional note (e.g. "After workout", "Morning fast")
5. Click **Save entry**
6. Your entry appears in the **Recent entries** list on the right

### Switching between kg and lbs
- Use the **kg / lbs** toggle in the top right
- All numbers and charts update instantly
- Your preference is saved to your account

### Viewing trends
- **Weekly tab** — See this week's daily weights + last 8 weeks averages. Use ← → to go back/forward
- **Monthly tab** — See this month's daily weights + 12-month rolling averages
- **Yearly tab** — See monthly averages for any year + all-time trend line

### Understanding the metric cards
- **Latest** — Your most recent entry, with change vs the entry before
- **Week avg** — This week's average vs last week
- **Month avg** — This month's average vs last month
- **Year avg** — This year's average vs last year
- **Total change** — Change from your very first entry to latest

Arrows mean:
- ↑ red = weight went up
- ↓ green = weight went down (good, if that's your goal!)

### BMI & Goal tab
1. Enter your **height in cm** — your BMI calculates automatically
2. Set a **goal weight** and click **Save goal** to track progress
3. The progress bar shows how far you've come from your starting weight

### Deleting entries
- In the **Log** tab, click **×** next to any entry to delete it
- You'll be asked to confirm

---

## Updating the app in future

If you edit `app.js` or `index.html` and push to GitHub, Vercel automatically redeploys within ~30 seconds.

---

## Troubleshooting

**"Failed to fetch" or blank screen after sign in**
→ Double-check your `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `app.js`

**Can't sign up / sign in**
→ Check Supabase Authentication > Settings — make sure Email provider is enabled

**Data not saving**
→ Make sure you ran the SQL setup script in Step 1.3 — open Supabase > Table Editor to confirm the tables exist

**Vercel shows 404**
→ Make sure `index.html` is at the root of your GitHub repository, not inside a folder

---

## Project file structure

```
weight-tracker/
├── index.html          ← The entire app UI
├── app.js              ← All logic, charts, Supabase integration
├── vercel.json         ← Vercel deployment config
├── supabase-setup.sql  ← Database schema (run once in Supabase)
└── README.md           ← This guide
```
