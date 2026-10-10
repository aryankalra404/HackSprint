# DryRun web client

Next.js 16 app: brief a rehearsal, rehearse in the browser, and read the debrief. It talks to the same n8n webhooks as the VR client ([../docs/CONTRACT.md](../docs/CONTRACT.md)).

## Run it
```bash
npm install
npm run dev
```
Sample sessions:
- http://localhost:3000/new: brief a rehearsal; n8n proposes the panel and you edit it on the table (the sample proposal is served without n8n)
- http://localhost:3000/s/demo-prep: dashboard, room briefed and waiting for the presenter
- http://localhost:3000/s/demo: dashboard after the session
- http://localhost:3000/s/demo/report: the full report (also what the report email links to)

## Connecting to n8n
Set `DRYRUN_N8N_URL` (for example `https://<host>/webhook/dryrun`) in `.env.local`. Without it, the app serves the sample session in `src/lib/mock/session.ts`. Calls to n8n are made server-side, so the browser never needs CORS access to n8n.

## Layout
- `src/app/new`: the Brief screen (meeting details → proposed panel → edit → brief); `actions.ts` calls n8n `/panel` and `/prep`
- `src/components/room/RoomPlan.tsx`: the overhead boardroom drawing shared by the Brief screen and the dashboard
- `src/app/s/[sessionId]`: the dashboard, one screen for the big display while the presenter is in VR (room map, agent feed, timeline strip)
- `src/app/s/[sessionId]/report`: the full report after a session; prints cleanly to PDF
- `src/components/dashboard`, `src/components/debrief`: their parts
- `src/lib/feed.ts`: turns a session into the agent feed
- `src/lib/contract.ts`: contract types; `src/lib/timeline.ts`: turns telemetry into timeline data
