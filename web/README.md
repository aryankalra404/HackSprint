# DryRun web client

Next.js 16 app: brief a rehearsal, rehearse in the browser, and read the debrief. It talks to the same n8n webhooks as the VR client ([../docs/CONTRACT.md](../docs/CONTRACT.md)).

## Run it
```bash
npm install
npm run dev
```
Pages:
- http://localhost:3000/: your meetings (from n8n), with a pop-up for the next one whose brief is ready
- http://localhost:3000/m/<id>: a meeting's brief; "Set up the practice panel" seats it in the room (and the headset)
- http://localhost:3000/new: add a meeting by hand; n8n researches it and the brief page fills in about a minute later
- http://localhost:3000/about: what DryRun is

Sample sessions:
- http://localhost:3000/s/demo-prep: dashboard, room briefed and waiting for the presenter
- http://localhost:3000/s/demo: dashboard after the session
- http://localhost:3000/s/demo/report: the full report (also what the report email links to)

## The headset
The laptop is the hub: the headset only talks to this app, never to n8n directly.

**Wi-Fi (no cable):** put the laptop and the Quest on the same network (a phone hotspot works; some venue Wi-Fi blocks devices from seeing each other). When the headset app starts, it broadcasts on UDP 47777 and this app answers with its address, so there's nothing to configure. The Brief screen shows "Live in the headset (Wi-Fi)".

**USB (fallback):** plug the Quest in and run:
```bash
npm run quest
```
It runs `adb reverse tcp:3000 tcp:3000` and, if [scrcpy](https://github.com/Genymobile/scrcpy) is installed (`brew install scrcpy`), mirrors the headset to a window for the big screen.
Over USB the headset reaches the app at `http://localhost:3000`. It uses USB whenever Wi-Fi isn't answering, and moves to Wi-Fi when it is. Either way it keeps `GET /api/room?since=<version>&client=headset` open and seats the panel as it's edited on the Brief screen; `/api/turn` and `/api/debrief` forward to n8n. The room is saved to `.room.json` (not committed). See Room API in `docs/CONTRACT.md`.

## The headset view
The dashboard's room panel opens on **Headset view**: what the presenter sees in VR, live, for the big screen. The web app runs a relay for it on port 3001 (`src/lib/headset/relay.ts`, started with the server); the headset streams to it at the laptop address it already found, and only while a dashboard has the view open. Switch to **Room plan** to stop it. **Record a clip** saves what's on screen as a video.
- Open the dashboard at `http://localhost:3000`: the browser's video decoder (WebCodecs) only works on `localhost` or https, not on `http://192.168.x.x`.
- `curl localhost:3001/status` shows whether the headset is streaming and how many are watching.
- Only a Quest build streams (not the Unity editor). Over USB, `npm run quest` forwards port 3001 too.

## Connecting to n8n
Set `DRYRUN_N8N_URL=https://aryankalra.app.n8n.cloud/webhook/dryrun` and `DRYRUN_OWNER_EMAIL=<where briefs go>` in `.env.local`. Without it, the app serves the sample session in `src/lib/mock/session.ts`. Calls to n8n are made server-side, so the browser never needs CORS access to n8n.

## Layout
- `src/app/new`: the Brief screen (meeting details → proposed panel → edit → brief); `actions.ts` calls n8n `/panel` and `/prep`
- `src/components/room/RoomPlan.tsx`: the overhead boardroom drawing shared by the Brief screen and the dashboard
- `src/app/s/[sessionId]`: the dashboard, one screen for the big display while the presenter is in VR (room map, agent feed, timeline strip)
- `src/app/s/[sessionId]/report`: the full report after a session; prints cleanly to PDF
- `src/components/dashboard`, `src/components/debrief`: their parts
- `src/lib/headset`: the headset view: `relay.ts` (WebSocket relay, port 3001), `stream.ts` (WebCodecs decoder), `recording.ts` (clips); the viewer is `src/components/dashboard/HeadsetView.tsx`
- `src/lib/feed.ts`: turns a session into the agent feed
- `src/lib/contract.ts`: contract types; `src/lib/timeline.ts`: turns telemetry into timeline data
