# MedTrack

Personal medication, care routine, weight, blood-pressure, and diet-adherence
tracker built with Next.js App Router, TypeScript, Tailwind CSS, lucide-react,
sonner, and date-fns.

## Development

```bash
npm run dev
```

## Cloud Sync

MedTrack keeps a localStorage fallback, but cross-device sync requires a shared
database. The app includes `/api/sync`, which stores the whole personal dataset
in Upstash Redis or Vercel KV through the REST API.

Health measurements use `/api/health-sync` and a separate Redis key. Records are
merged by immutable ID with deletion tombstones so an older medication client
cannot erase weight or blood-pressure history.

Set these environment variables on Vercel:

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Vercel KV's equivalent names also work:

```bash
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

Optional overrides:

```bash
MEDTRACK_SYNC_USERNAME=...
MEDTRACK_SYNC_PASSWORD=...
MEDTRACK_SYNC_KEY=medtrack:mehrdad:primary
MEDTRACK_HEALTH_SYNC_KEY=medtrack:mehrdad:health:v1
MEDTRACK_AUTH_CREDENTIAL_KEY=medtrack:mehrdad:auth:v1
MEDTRACK_SESSION_SECRET=...
```

Without the Redis/KV variables, the app remains local-only and shows a "Local
only" sync status in the sidebar.

Authentication uses a signed, 30-day, HttpOnly session cookie. Browser health
reminders are an additional channel only: they require permission and the app to
be open; persistent in-app alerts remain the source of truth.
