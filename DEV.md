# Development / Run instructions

Quick steps to run this project locally and configure Supabase credentials.

1. Install dependencies

```bash
npm install
```

2. Environment

- Copy `.env.example` to `.env` at project root and fill values. Example variables used by the app:
  - `VITE_SUPABASE_URL` — Supabase project URL (client-side)
  - `VITE_SUPABASE_ANON_KEY` — Supabase anon public key (client-side)
  - `SUPABASE_URL` — Supabase project URL (server-side, same as VITE_SUPABASE_URL)
  - `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-only, keep secret)
  - `DATABASE_URL` — optional DB connection string

Note: `.env` is in `.gitignore` — do not commit secrets. For production, store `SUPABASE_SERVICE_ROLE_KEY` in secure host secrets and never expose it to the browser.

3. Run in development

```bash
npm run dev
```

4. Build for production

```bash
npm run build
npm run preview
```

5. Testing Supabase persistence

- Log in via the app `Auth` screen and save Supabase URL/key to localStorage (the app uses them to talk to your Supabase instance in dev).
- Ensure your Supabase DB has the schema from `supabase_schema.sql` (tables: `clients`, `duty_payments`, `assessments`, `audit_logs`, `staff_users`, `system_settings`).

6. Troubleshooting

- If data does not persist, confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct and RLS policies allow the operations (or use the service role key on server-side actions).
- Check browser console for network errors.

If you'd like, I can add a small `.github/workflows` CI step to build on PRs or commit these changes for you.
