# Orchard Goals portal

The portal uses Supabase Auth and Postgres. The Orchard project has the database migration applied. The public Vercel deployment serves the portal at `/portal/` and routes its API calls through a Vercel Function.

Configure these variables in the Vercel project’s Production environment.

```dotenv
SUPABASE_URL=https://sdundibebtmowdqmvqun.supabase.co
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Keep the Supabase secret key in the server environment. The deployment uses the private setup code in `.env.orchard-setup` unless an explicit `ORCHARD_SETUP_CODE` is configured in Vercel. Rotate the setup code when sharing access with a new group.

Open the hosted portal and expand **Set up a parent account**. Sign-ins use email and password. A parent can create one separate child sign-in under **Habits**. The parent sets up habits and can view progress. The child signs in separately to mark days complete.
