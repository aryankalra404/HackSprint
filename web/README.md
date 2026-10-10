# DryRun web client

Next.js 16 app: brief a rehearsal, rehearse in the browser, and read the debrief. It talks to the same n8n webhooks as the VR client ([../docs/CONTRACT.md](../docs/CONTRACT.md)).

## Run it
```bash
npm install
npm run dev
```
Open http://localhost:3000/s/demo/debrief for the sample debrief.

## Connecting to n8n
Set `DRYRUN_N8N_URL` (for example `https://<host>/webhook/dryrun`) in `.env.local`. Without it, the app serves the sample session in `src/lib/mock/session.ts`. Calls to n8n are made server-side, so the browser never needs CORS access to n8n.

## Layout
- `src/app/s/[sessionId]/debrief`: the Debrief screen
- `src/components/debrief`: its parts (verdict, the room, timeline, scores, eye contact, drill and actions)
- `src/lib/contract.ts`: contract types; `src/lib/timeline.ts`: turns telemetry into timeline data
