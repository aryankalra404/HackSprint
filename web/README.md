# DryRun web client

Next.js 16 app: the meetings n8n prepares, their briefs, the practice panel, a rehearsal page to rehearse in the browser, and the dashboard for the big screen. It's also the hub the headset talks to. The contract with n8n and the headset is [../docs/CONTRACT.md](../docs/CONTRACT.md).

## Run it
```bash
npm install
npm run dev
```
Pages:
- http://localhost:3000/: your upcoming meetings (from n8n), with a "prepare for this meeting?" pop-up for the next one whose brief is ready, and the meetings n8n skipped (with its reason and "Prepare anyway")
- http://localhost:3000/m/<id>: a meeting's brief (facts only). While n8n is still preparing it, the page shows each step live, with a link to the run in n8n
- http://localhost:3000/m/<id>/practise: the practice panel (the attendees plus practice roles), editable on a drawing of the table and live in the headset; your deck under it (upload, page through, replace); the pitch length (n8n's suggestion for the meeting, if it gave one); **Rehearse in the browser** briefs the panel and opens the rehearsal page, **Rehearse in VR** briefs it and opens the dashboard
- http://localhost:3000/new: add a meeting by hand; n8n prepares it in about 20 seconds
- http://localhost:3000/s/<session id>/rehearse: rehearse in the browser (below)
- http://localhost:3000/s/<session id>: the dashboard for the big screen. For the session in the room it starts, ends and restarts the rehearsal, shows the room plan while waiting and switches to the headset view when the session goes live (for a browser rehearsal, the room plan stays, showing who is speaking and who has a hand up)
- http://localhost:3000/about: what DryRun is

Sample sessions (from `src/lib/mock/session.ts`):
- http://localhost:3000/s/demo-prep: dashboard, room briefed and waiting for the presenter
- http://localhost:3000/s/demo: dashboard after the session
- http://localhost:3000/s/demo/report: the full report (also what the report email links to)

**Real or sample:** meetings, briefs and progress come from n8n. The dashboard's bundle (slides, objections, rescue cues), its "What the agent did" feed and the report are sample data until n8n's `/prep` and `/debrief` exist (`prepSession` in `src/lib/api.ts` returns `src/lib/mock/prep.ts`, with objections taken from the practice panel).

## Rehearse in the browser
`/s/<session id>/rehearse` does what the headset does, in 2D: the same table, faces and seats, your slides as a speaker view (time on the slide against n8n's target, the next slide, last time's talk track), the panel's voices with a ring on whoever speaks, raised hands, captions, the Rescue Agent's cues when you go quiet, the wrap-up on the last slide and the chair's closing, then n8n's debrief and "Run it again, harder". It sends the same `POST /api/turn` requests as the headset; n8n is unchanged. Use headphones, so the panel's voices don't reach the mic.
- **How turns are taken** is a port of the headset's `VoiceActivity.cs` and `TurnTaker.cs`: `src/lib/rehearse/voice-activity.ts` (when you're speaking, from the mic level), `turn-taker.ts` (when to send what you said, when someone may speak, which reactions are too late, the wrap-up and rescue cues). Every timing is a named constant at the top of those files, to tune in the venue. One difference from the headset: the mic's background level only learns from quiet moments (see `docs/PLAN.md`, Decisions).
- **`?debug=1`** on the page shows the mic's level, background and threshold, to tune them.
- **Stand-in turns:** with `DRYRUN_FAKE_TURNS=1` in `.env.local`, `/api/turn` answers from the bundle after 2 s instead of calling n8n (the chair welcomes you, someone asks their objection on a slide, the chair opens the floor, one question, the closing), so you can build and test without spending n8n executions. Without `DRYRUN_N8N_URL` the bundle is sample data with no voiced lines, so the panel speaks in captions only.
- **A file as the mic:** Chrome can play a WAV as the microphone, so you don't have to talk every time. Record 20–30 s of pitching with pauses (16 kHz mono WAV), then start Chrome with
  ```bash
  chrome --user-data-dir=/tmp/dryrun-chrome --use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=/path/to/speech.wav http://localhost:3000
  ```
  (on a Mac, `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`). It loops, which is fine for the turns and the wrap-up.
- If the page is reloaded mid-run it offers **Resume** (a click for the mic again) or **End the session**.

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
Upload a PDF, PowerPoint (`.pptx`, `.ppt`) or Keynote file on the practice page. The laptop converts it to one JPEG per slide in `.decks/<id>/` (not committed), with each slide's text next to it for n8n's `/prep`, and serves them at `/api/deck/<id>/<n>.jpg`; the headset downloads them all. It needs Ghostscript and ImageMagick (`brew install ghostscript imagemagick`) and, for PowerPoint and Keynote, LibreOffice (`brew install --cask libreoffice`). A deck takes about 10 seconds. If a slide looks wrong (LibreOffice doesn't draw everything PowerPoint does, e.g. rotated text boxes), export the deck as a PDF and upload that.
Change slides from the practice page, the dashboard's header (a presentation clicker works there: Page Down, Page Up, arrows) or the headset (a quick pinch with hands: right hand next, left hand back; the triggers with controllers); they all follow the room's `slide`.

**Height in VR**, in the header of the practice page and the dashboard, opens a vertical bar that raises or lowers the presenter's eyes in the headset (up to 50 cm either way), for when the room feels too tall or too short.

## The headset view
The dashboard's room panel opens on **Headset view**: what the presenter sees in VR, live, for the big screen. The web app runs a relay for it on port 3001 (`src/lib/headset/relay.ts`, started with the server); the headset streams to it at the laptop address it already found, and only while a dashboard has the view open. Switch to **Room plan** to stop it. **Record a clip** saves what's on screen as a video.
- Open the dashboard at `http://localhost:3000`: the browser's video decoder (WebCodecs) only works on `localhost` or https, not on `http://192.168.x.x`.
- `curl localhost:3001/status` shows whether the headset is streaming and how many are watching.
- Only a Quest build streams (not the Unity editor). Over USB, `npm run quest` forwards port 3001 too.

## Connecting to n8n
Set `DRYRUN_N8N_URL=https://aryankalra47.app.n8n.cloud/webhook/dryrun` and `DRYRUN_OWNER_EMAIL=<where briefs go>` in `.env.local`, and `DRYRUN_PRESENTER_NAME=<your name>` so the panel can greet you by name. Without `DRYRUN_N8N_URL`, the app serves sample meetings and sessions from `src/lib/mock/`. Calls to n8n are made server-side, so the browser never needs CORS access to n8n.

## Layout
- `src/app/page.tsx`: home (meetings); `src/app/m/[id]`: the brief and `practise/`; `src/app/m/actions.ts`: practise, brief the panel, retry a failed meeting; `src/app/new`: add a meeting
- `src/app/s/[sessionId]`: the dashboard, one screen for the big display while the presenter is in VR; `rehearse/`: rehearse in the browser; `report/`: the full report after a session, prints cleanly to PDF
- `src/app/api/room`: the room the headset follows (`route.ts` long poll, `panel`, `settings`, `session`, `headset`, `deck`, `slide`, `now`); `src/app/api/deck`: slide images; `src/app/api/turn`, `api/debrief`: forward to n8n
- `src/components/meetings`: meeting list, status, live prep progress, the pop-up; `brief`: the practice table and panel editor; `room`: the boardroom drawing shared by practice and the dashboard; `rehearse`: the browser rehearsal page; `dashboard`, `debrief`: their parts
- `src/lib/api.ts`: calls to n8n (server side); `room.ts`: the room store (saved to `.room.json`), session and slide changes; `deck.ts`: turns an upload into slide images; `useRoom.ts`: the browser's long poll on the room; `discovery.ts`: answers the headset's Wi-Fi broadcast (started in `src/instrumentation.ts`)
- `src/lib/rehearse`: the browser rehearsal: the mic (`mic.ts`, with the AudioWorklet in `public/rehearse/mic-worklet.js`), voice activity, the turn-taker, the panel's voices (`player.ts`), WAV encoding, and `useRehearsal.ts`, which wires them to the room
- `src/lib/headset`: the headset view: `relay.ts` (WebSocket relay, port 3001), `stream.ts` (WebCodecs decoder), `recording.ts` (clips); the viewer is `src/components/dashboard/HeadsetView.tsx`
- `src/lib/contract.ts`: contract types; `personas.ts`: seats, colours and the 11 faces (`public/vr/<avatar>.jpg`, rendered in Unity); `format.ts`: dates and clocks; `feed.ts`, `timeline.ts`: the dashboard's feed and timeline
