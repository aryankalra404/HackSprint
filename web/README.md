# DryRun web client

Next.js 16 app: the meetings n8n prepares, their briefs, the practice panel, and the dashboard for the big screen during a VR session. It's also the hub the headset talks to. The contract with n8n and the headset is [../docs/CONTRACT.md](../docs/CONTRACT.md).

## Run it
```bash
npm install
npm run dev
```
Pages:
- http://localhost:3000/: your upcoming meetings (from n8n), with a "prepare for this meeting?" pop-up for the next one whose brief is ready
- http://localhost:3000/m/<id>: a meeting's brief (facts only). While n8n is still preparing it, the page shows each step live, with a link to the run in n8n
- http://localhost:3000/m/<id>/practise: the practice panel (the attendees plus practice roles), editable on a drawing of the table and live in the headset; your deck under it (upload, page through, replace); "Start the rehearsal" briefs the panel and opens the dashboard
- http://localhost:3000/new: add a meeting by hand; n8n prepares it in about 20 seconds
- http://localhost:3000/s/<session id>: the dashboard for the big screen. For the session in the room it starts, ends and restarts the rehearsal, shows the room plan while waiting and switches to the headset view when the session goes live
- http://localhost:3000/about: what DryRun is

Sample sessions (from `src/lib/mock/session.ts`):
- http://localhost:3000/s/demo-prep: dashboard, room briefed and waiting for the presenter
- http://localhost:3000/s/demo: dashboard after the session
- http://localhost:3000/s/demo/report: the full report (also what the report email links to)

**Real or sample:** meetings, briefs and progress come from n8n. The dashboard's bundle (slides, objections, rescue cues), its "What the agent did" feed and the report are sample data until n8n's `/prep` and `/debrief` exist (`prepSession` in `src/lib/api.ts` returns `src/lib/mock/prep.ts`, with objections taken from the practice panel).

## The headset
The laptop is the hub: the headset only talks to this app, never to n8n directly.

**Wi-Fi (no cable):** put the laptop and the Quest on the same network (a phone hotspot works; some venue Wi-Fi blocks devices from seeing each other). When the headset app starts, it broadcasts on UDP 47777 and this app answers with its address, so there's nothing to configure. The practice page shows "Live in the headset (Wi-Fi)".

**USB (fallback):** plug the Quest in and run:
```bash
npm run quest
```
It runs `adb reverse tcp:3000 tcp:3000` and, if [scrcpy](https://github.com/Genymobile/scrcpy) is installed (`brew install scrcpy`), mirrors the headset to a window for the big screen.
Over USB the headset reaches the app at `http://localhost:3000`. It uses USB whenever Wi-Fi isn't answering, and moves to Wi-Fi when it is. Either way it keeps `GET /api/room?since=<version>&client=headset` open and seats the panel as it's edited on the practice page; `/api/turn` and `/api/debrief` forward to n8n. The room is saved to `.room.json` (not committed). See Room API in `docs/CONTRACT.md`.

## The deck
Upload a PDF, PowerPoint (`.pptx`, `.ppt`) or Keynote file on the practice page. The laptop converts it to one JPEG per slide in `.decks/<id>/` (not committed) and serves them at `/api/deck/<id>/<n>.jpg`; the headset downloads them all. It needs Ghostscript and ImageMagick (`brew install ghostscript imagemagick`) and, for PowerPoint and Keynote, LibreOffice (`brew install --cask libreoffice`). A deck takes about 10 seconds. If a slide looks wrong (LibreOffice doesn't draw everything PowerPoint does, e.g. rotated text boxes), export the deck as a PDF and upload that.
Change slides from the practice page, the dashboard's header (a presentation clicker works there: Page Down, Page Up, arrows) or the headset's triggers; they all follow the room's `slide`.

## The headset view
The dashboard's room panel opens on **Headset view**: what the presenter sees in VR, live, for the big screen. The web app runs a relay for it on port 3001 (`src/lib/headset/relay.ts`, started with the server); the headset streams to it at the laptop address it already found, and only while a dashboard has the view open. Switch to **Room plan** to stop it. **Record a clip** saves what's on screen as a video.
- Open the dashboard at `http://localhost:3000`: the browser's video decoder (WebCodecs) only works on `localhost` or https, not on `http://192.168.x.x`.
- `curl localhost:3001/status` shows whether the headset is streaming and how many are watching.
- Only a Quest build streams (not the Unity editor). Over USB, `npm run quest` forwards port 3001 too.

## Connecting to n8n
Set `DRYRUN_N8N_URL=https://aryankalra.app.n8n.cloud/webhook/dryrun` and `DRYRUN_OWNER_EMAIL=<where briefs go>` in `.env.local`. Without `DRYRUN_N8N_URL`, the app serves sample meetings and sessions from `src/lib/mock/`. Calls to n8n are made server-side, so the browser never needs CORS access to n8n.

## Layout
- `src/app/page.tsx`: home (meetings); `src/app/m/[id]`: the brief and `practise/`; `src/app/m/actions.ts`: practise, brief the panel, retry a failed meeting; `src/app/new`: add a meeting
- `src/app/s/[sessionId]`: the dashboard, one screen for the big display while the presenter is in VR; `report/`: the full report after a session, prints cleanly to PDF
- `src/app/api/room`: the room the headset follows (`route.ts` long poll, `panel`, `settings`, `session`, `headset`, `deck`, `slide`); `src/app/api/deck`: slide images; `src/app/api/turn`, `api/debrief`: forward to n8n
- `src/components/meetings`: meeting list, status, live prep progress, the pop-up; `brief`: the practice table and panel editor; `room`: the boardroom drawing shared by practice and the dashboard; `dashboard`, `debrief`: their parts
- `src/lib/api.ts`: calls to n8n (server side); `room.ts`: the room store (saved to `.room.json`), session and slide changes; `deck.ts`: turns an upload into slide images; `useRoom.ts`: the browser's long poll on the room; `discovery.ts`: answers the headset's Wi-Fi broadcast (started in `src/instrumentation.ts`)
- `src/lib/headset`: the headset view: `relay.ts` (WebSocket relay, port 3001), `stream.ts` (WebCodecs decoder), `recording.ts` (clips); the viewer is `src/components/dashboard/HeadsetView.tsx`
- `src/lib/contract.ts`: contract types; `personas.ts`: seats, colours and the 11 faces (`public/vr/<avatar>.jpg`, rendered in Unity); `format.ts`: dates and clocks; `feed.ts`, `timeline.ts`: the dashboard's feed and timeline
