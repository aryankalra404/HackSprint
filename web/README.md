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

## The headset
The laptop is the hub: the headset only talks to this app, never to n8n directly. Connect the Quest by USB (or wireless adb) and run:
```bash
npm run quest
```
It runs `adb reverse tcp:3000 tcp:3000` and, if [scrcpy](https://github.com/Genymobile/scrcpy) is installed (`brew install scrcpy`), mirrors the headset to a window for the big screen.
The headset then reaches the app at `http://localhost:3000`. It keeps `GET /api/room?since=<version>&client=headset` open and seats the panel as it's edited on the Brief screen; `/api/turn` and `/api/debrief` forward to n8n. The room is saved to `.room.json` (not committed). See Room API in `docs/CONTRACT.md`.

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
