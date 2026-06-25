# VanStock — Complete Setup Guide
## For complete beginners — no coding experience needed

---

## What you're setting up

You're building a real web app with:
- A **website** (Next.js) that runs on your computer during development, then goes live on the internet
- A **database** (Supabase) that lives in the cloud and stores all your stock data
- **Hosting** (Vercel) that puts your app on the internet for free

Total time: about 45–60 minutes.

---

## STEP 1 — Install the tools you need

### 1a. Install Node.js
Node.js is the engine that runs your app.

1. Go to **https://nodejs.org**
2. Click the big green "LTS" download button
3. Open the downloaded file and click through the installer
4. To check it worked: open **Terminal** (Mac) or **Command Prompt** (Windows) and type:
   ```
   node --version
   ```
   You should see something like `v20.11.0`

### 1b. Install VS Code (code editor — optional but recommended)
1. Go to **https://code.visualstudio.com**
2. Download and install it
3. This is where you'll view and edit your code files

---

## STEP 2 — Set up Supabase (your database)

Supabase is free for small teams and stores all your data.

### 2a. Create a Supabase account
1. Go to **https://supabase.com**
2. Click "Start your project" → sign up with GitHub or email
3. Click "New project"
4. Fill in:
   - **Name**: VanStock
   - **Database password**: choose a strong password and save it somewhere safe
   - **Region**: pick the one closest to you (Australia → Southeast Asia)
5. Click "Create new project" — it takes about 2 minutes to set up

### 2b. Create your database tables
1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase-schema.sql` from your project folder
4. Copy the entire contents and paste it into the SQL editor
5. Click the green **"Run"** button
6. You should see "Success. No rows returned" — this means all your tables were created

### 2c. Copy your API keys
1. In Supabase, click **"Project Settings"** (gear icon, bottom left)
2. Click **"API"**
3. You'll need three values — keep this page open for Step 4

---

## STEP 3 — Put the project files on your computer

### 3a. Create the project folder
Open Terminal (Mac) or Command Prompt (Windows) and run these commands one at a time:

```bash
# Go to your Desktop (or wherever you want the project)
cd Desktop

# Create the project folder — you'll copy the files into this
mkdir vanstock
cd vanstock
```

### 3b. Copy all the project files
Copy all the files you received into the `vanstock` folder, keeping the same folder structure:

```
vanstock/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── login/page.tsx
│   ├── dashboard/page.tsx
│   ├── stock/page.tsx
│   ├── transfer/page.tsx
│   ├── logs/page.tsx
│   └── admin/page.tsx
├── components/
│   ├── Sidebar.tsx
│   ├── AdjustStockModal.tsx
│   ├── TransferForm.tsx
│   ├── AddProductModal.tsx
│   └── RemoveProductButton.tsx
├── lib/
│   ├── supabase.ts
│   └── actions.ts
├── types/
│   └── index.ts
├── supabase-schema.sql
├── package.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
└── .env.local        ← you'll fill this in next
```

---

## STEP 4 — Add your Supabase keys

1. Open the file called `.env.local` in a text editor (Notepad on Windows, TextEdit on Mac)
2. Go back to your Supabase API settings page
3. Replace the placeholder values:

```
NEXT_PUBLIC_SUPABASE_URL=        ← paste your "Project URL" here
NEXT_PUBLIC_SUPABASE_ANON_KEY=   ← paste your "anon / public" key here
SUPABASE_SERVICE_ROLE_KEY=       ← paste your "service_role" key here
```

4. Save the file

> ⚠️ Never share this file with anyone or put it on GitHub. The service role key has full access to your database.

---

## STEP 5 — Install dependencies and run the app

In Terminal, make sure you're in the `vanstock` folder, then run:

```bash
# Install all the packages the app needs (takes 1–2 minutes)
npm install

# Start the app
npm run dev
```

You should see:
```
▲ Next.js 14.2.5
- Local: http://localhost:3000
✓ Ready
```

Open your browser and go to **http://localhost:3000** — your app is running!

---

## STEP 6 — Create your first users in Supabase

### 6a. Create users in Supabase Auth
1. In Supabase, go to **"Authentication"** → **"Users"**
2. Click **"Add user"** → **"Create new user"**
3. Enter an email and password for each team member
4. Repeat for all your technicians and managers

### 6b. Create their profiles in the database
After creating auth users, go to **SQL Editor** and run this for each user
(replace the values with real ones):

```sql
-- Run this once for your company (only needed once)
-- Skip this if you ran the seed data in Step 2b
INSERT INTO companies (id, name) VALUES
  ('YOUR-COMPANY-ID', 'Your Company Name')
ON CONFLICT DO NOTHING;

-- Run this for EACH user you created
-- Get the user's ID from Authentication → Users → click the user → copy "User UID"
INSERT INTO profiles (id, company_id, van_id, full_name, role) VALUES
  (
    'PASTE-USER-ID-HERE',                          -- from Supabase Auth
    'YOUR-COMPANY-ID',                             -- your company ID
    '10000000-0000-0000-0000-000000000001',        -- assign a van (from vans table)
    'James Miller',                                -- their name
    'technician'                                   -- 'technician', 'manager', or 'admin'
  );
```

---

## STEP 7 — Deploy to the internet (go live)

When you're ready to share the app with your team:

### 7a. Put your code on GitHub
1. Go to **https://github.com** and create a free account
2. Create a new repository called "vanstock"
3. Follow GitHub's instructions to upload your project folder

> Make sure `.env.local` is in your `.gitignore` file so your keys aren't uploaded!

Add this to a file called `.gitignore` in your project root:
```
.env.local
node_modules/
.next/
```

### 7b. Deploy on Vercel
1. Go to **https://vercel.com** and sign up with your GitHub account
2. Click **"Add New Project"**
3. Select your `vanstock` repository
4. Under **"Environment Variables"**, add your three Supabase keys
   (same as in Step 4)
5. Click **"Deploy"**

Vercel gives you a free URL like `vanstock-abc123.vercel.app`. Share this with your team!

---

## Troubleshooting

**"Module not found" error**
→ Run `npm install` again in the project folder

**"Invalid API key" from Supabase**
→ Check your `.env.local` file — make sure there are no spaces around the `=` sign

**Page shows but data doesn't load**
→ Check that you ran the SQL schema in Step 2b. Go to Supabase → Table Editor and confirm the tables exist.

**"Not logged in" error**
→ Make sure you've created users in Supabase Auth (Step 6a) AND inserted their profiles (Step 6b)

---

## Need help?

If you get stuck at any step, copy the exact error message you see and share it — every error has a fix.
