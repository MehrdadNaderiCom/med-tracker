# MedTrack

Personal medication and care routine tracker built with Next.js App Router,
TypeScript, Tailwind CSS, lucide-react, sonner, and date-fns.

## Development

```bash
npm run dev
```

## Cloud Sync

MedTrack keeps a localStorage fallback, but cross-device sync requires a shared
database. The app includes `/api/sync`, which stores the whole personal dataset
in Upstash Redis or Vercel KV through the REST API.

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
```

Without the Redis/KV variables, the app remains local-only and shows a "Local
only" sync status in the sidebar.
