# Orchard Goals portal

The portal uses Supabase Auth and Postgres. The Orchard project has the database migration applied. The public Vercel deployment serves the portal at `/portal/` and routes its API calls through a Vercel Function.

Configure these variables in the Vercel project’s Production environment.

```dotenv
SUPABASE_URL=https://sdundibebtmowdqmvqun.supabase.co
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Keep the Supabase secret key in the server environment. Enable email confirmation in Supabase Auth, allow `https://orchard-iota-blue.vercel.app/portal/` as an Auth redirect, and configure production SMTP to deliver verification emails to families outside the Supabase project team.

Open the hosted portal and choose **Create a parent account**. After confirming their email, parents sign in and can create one separate child sign-in under **Habits**. The parent sets up habits and can view progress. The child signs in separately to mark days complete.
