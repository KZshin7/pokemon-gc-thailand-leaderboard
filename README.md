# Pokémon Champions Global Challenge — Thailand

A bilingual (English/Thai) community leaderboard for Thailand-region players. When Supabase is configured, the database is the shared source of truth, Google sign-in is required to create or edit an entry, and evidence photos are kept in private storage. Without configuration, the published site remains usable as a clearly labeled, browser-local demo; demo entries do not sync.

## Run locally

```sh
npm ci
npm start
```

Use Node.js 22 or newer.

To use the shared backend locally, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in an untracked `.env.local` before starting Vite. These are the Supabase project URL and public anon/publishable key; never put a service-role key in browser configuration. Without both valid values the app deliberately uses demo mode. Local OAuth also requires `http://127.0.0.1:5173/**` in Supabase Auth's redirect allow list.

## Configure Supabase

1. Create a Supabase project. In **Project Settings → API**, copy the Project URL and anon/publishable key for the build configuration. Do not use or expose the `service_role` key.
2. In **Authentication → Providers → Google**, enable Google and enter the OAuth client ID and client secret from a Google Cloud OAuth web application. In Google Cloud, add the Supabase callback URI (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI and the Supabase project origin as an authorized JavaScript origin.
3. In **Authentication → URL Configuration**, set the production site URL to `https://kzshin7.github.io/pokemon-gc-thailand-leaderboard/` (or your Pages URL) and allow that exact URL plus `http://127.0.0.1:5173/**` for local development. OAuth returns to the page that initiated sign-in.
4. Apply `supabase/migrations/202609280001_leaderboard.sql` in **SQL Editor** (or with the Supabase CLI). It is safe to re-run. It creates the constrained leaderboard table, owner/reviewer RLS policies, private `leaderboard-evidence` bucket and storage policies, review RPCs, and Realtime publication membership. Do not loosen the policies or make the bucket public.
5. Confirm the bucket is private with a 1 MB limit and JPEG-only MIME type. The script applies these settings and restricts object paths to each authenticated user's UUID folder. Evidence can be read only by its owner or a reviewer; signed URLs are short-lived and are never put in public records.
6. For review access, have the reviewer sign in once with Google. In **Authentication → Users**, edit that user’s **app metadata** to include `"role": "leaderboard_reviewer"` (not user metadata). Have them sign out and back in/refresh their session. Reviewers then see buttons to mark pending entries verified or not verified, and can view their private evidence. Only the guarded database RPC can change verification state. Remove the app-metadata role to revoke review access.

Public visitors can read only player name, rating, evidence-presence, verification status, and timestamps. The owner UUID, evidence path, reviewer identity, and all Auth data are not selectable from the public table. Google email is handled only by Supabase Auth and is never copied into leaderboard rows or displayed. Account owners can edit only their own entry; database RLS enforces this independently of the UI. Changing an entry resets its status to pending. Each Google account is limited to one entry.

## Publish with GitHub Pages

In repository **Settings → Secrets and variables → Actions**, add:

- `VITE_SUPABASE_URL` as a repository variable (or secret).
- `VITE_SUPABASE_ANON_KEY` as a repository secret (or variable).

Both values are optional during setup. The Pages workflow builds/tests the app and passes configured values only when present. If either is missing or invalid, it publishes the explicit demo mode instead of a broken page. Add the correct Google OAuth redirect URL and Supabase Auth redirect allowlist before enabling production sign-in. To rebuild after changing credentials or redirects, run the workflow again or push a commit to `main`. Choose **Pages → Build and deployment → Source → GitHub Actions** to enable Pages. The configured project URL and anon key are public client configuration, not secrets; the service-role key must never be added to Actions variables, secrets, or the app.

The expected Pages URL is <https://kzshin7.github.io/pokemon-gc-thailand-leaderboard/>. No Supabase project is provisioned by this repository; shared syncing is active only after the project is configured and a successful configured build is deployed.

## Protections and residual risks

The database validates names and ratings, derives evidence-presence and timestamps, prevents client changes to review fields, and enforces owner-only updates with RLS. Storage enforces private access, JPEG-only uploads, and a 1 MB cap; the browser additionally accepts only JPEG/PNG/WebP source images up to 10 MB and resizes them to JPEG before upload. Supabase Auth's provider limits plus one row per account provide basic abuse controls.

This static client cannot enforce per-IP rate limits or prevent determined users from creating multiple Google accounts. Public leaderboard names/ratings are visible to everyone, and ratings/evidence remain user-submitted until a reviewer verifies them. A signed evidence link is a short-lived bearer URL (60 seconds), so authorized viewers should not share it. Configure Supabase Auth security/rate limits, protect reviewer accounts, and monitor project usage. Demo mode is intentionally local-only and is not shared or secure; its `localStorage` is not used as the authority when Supabase is configured.

## Tests

```sh
npm test
npm run build
```

Tests cover local demo behavior, validation, translations, production build configuration, safe public-field selection, and SQL policy/migration safeguards.
