# Rehearse in the browser: build plan

Written 11 Oct for whoever builds this on the second laptop (a person or Claude Code). It's self-contained: read it top to bottom once, then work through **Build steps** in order. Everything here was decided with the user; don't reopen the decisions, build them.

Before you start, read the repo's `CLAUDE.md` (ground rules, git rules, gotchas) and `web/AGENTS.md` (Next.js 16 is not the Next.js you know: read `web/node_modules/next/dist/docs/` before writing Next.js code).

---

## 1. Why we're building this

**The web app is the full product; VR is the premium way to rehearse.** Today the web does everything except the rehearsal itself: meetings, brief, practice panel, report and the next run getting harder all work, but you can only *rehearse* in the Quest headset. So:

- Judges (investors) can't try the product on their own laptop.
- If the headset or the venue Wi-Fi fails on demo day, we have no demo.
- `docs/PLAN.md` even lists "browser rehearsal mode" as the first thing to cut. That's now reversed: it's a must-have.

**What we're building:** a 2D rehearsal page in the browser that does what the headset does. The same panel at the same table, your slides, the panel's voices, raised hands, questions, the chair's closing, then the same n8n debrief and report.

**Decisions already made (don't revisit):**
- **2D, not 3D.** Not a Unity WebGL build or Three.js: too risky with 4 days left, and VR should stay the "wow". 3D in the browser goes on the roadmap slide.
- **Not a Zoom-style video call.** It would feel like a different product. The browser shows **the same top-down table** used on the practice page and the dashboard (`RoomPlan`), with the same faces, colours and seats as VR.
- **n8n stays the brain.** The browser sends the exact same `POST /api/turn` requests the headset sends. **No n8n workflow changes.** The client only does turn-*taking* (when to send, waiting for a pause, dropping late reactions), which `PLAN.md` already allows ("Code only decides how turns are taken").
- **One contract, two clients.** The browser speaks the same JSON as the headset (`docs/CONTRACT.md`). The only contract change is small (section 5).

---

## 2. Before you start on this laptop

`docs/` is in git (since 11 Oct), so `git pull` brings this file, `CONTRACT.md` and `PLAN.md`. Commit doc changes like code, and pull before editing them: the main laptop edits them too.

Not in git, so copy it from the main laptop (AirDrop or a USB stick): **`web/.env.local`** (`DRYRUN_N8N_URL`, `DRYRUN_OWNER_EMAIL`, `DRYRUN_PRESENTER_NAME`). Never commit it.

Then:
```bash
cd web && npm install && npm run dev
```
- The web app needs macOS for audio: `web/src/lib/audio.ts` uses `afconvert` to turn n8n's MP3 voices into WAV. Without it, reactions arrive with no `audio_url`. Deck conversion needs `brew install ghostscript imagemagick` and `brew install --cask libreoffice`.
- **n8n executions are capped per month and shared with the main laptop.** Every `/prep`, `/turn` and `/debrief` call, and every debrief progress read, is an execution. Build and test with the stand-in turns (step 2) and do **at most 3 real runs** with n8n. Never poll n8n from a client.
- This laptop has **no Unity**. The Unity half of the contract change is listed in section 9 for the main laptop. Until it's built, **keep the headset app closed during a browser rehearsal** (an old headset build would also start on your voice).
- `web/.room.json` is the laptop's live room. Copy it before tests that change the room and put it back after (`CLAUDE.md`).

---

## 3. The flow, end to end

```
Home ─► Meeting brief ─► Practise (table, deck, pitch length)
                               │
               ┌───────────────┴────────────────┐
     [ Rehearse in the browser ]       [ Rehearse in VR ]
               │                                │
         n8n /prep (≈20 s, same for both)       │
               │                                │
   /s/<session>/rehearse (NEW)        /s/<session> dashboard (as today)
               │                                │
               └──────── End ─► n8n debrief ─► "Open the report" ─► "Run it again, harder"
```

1. **Practice page** (`/m/[id]/practise`, built). The single "Start the rehearsal" button becomes two:
   - **Rehearse in the browser.** Calls the existing brief action with `rehearse_in: "browser"`, then redirects to `/s/<session_id>/rehearse`.
   - **Rehearse in VR.** As today, with `rehearse_in: "vr"`, redirects to `/s/<session_id>`. Show the headset status next to it ("● headset ready" or "Headset not connected"). Keep it enabled even when the headset isn't connected (it may connect later).
   - Under both, as now: "n8n plans each slide, the panel's questions and voices. About 20 seconds."
2. **Rehearsal page** (`/s/[sessionId]/rehearse`, new). Described in section 4.
3. **End.** End button, the wrap-up, or the chair closing. The laptop sends the run to n8n's debrief (this already happens for any session end: `startDebrief()` in `web/src/lib/debrief.ts`). The page shows n8n's debrief steps, then **Open the report (63/100)**.
4. **Run it again.** Two buttons once the debrief is done:
   - **Run it again, harder**: re-briefs the same panel through `/prep`, which reads the last debrief and presses on the weak spots. This is the closed loop, the demo's best moment.
   - **Same panel again**: the existing `restart` (no n8n call).
5. **Dashboard** (`/s/[sessionId]`, built). For a browser rehearsal, its room panel shows the room plan **live** (who is speaking, who has a hand up) instead of the headset view. It also gets a link "Rehearse in the browser instead" while briefed.

---

## 4. The rehearsal page

Route: `web/src/app/s/[sessionId]/rehearse/page.tsx`. A server page, same pattern as `web/src/app/s/[sessionId]/page.tsx`: read `getRoom()`; if `room.session_id !== sessionId`, show "This rehearsal isn't in the room any more" with a link to the meeting. Otherwise render the client component `Rehearsal`.

It's one screen with no scrolling at ≥1024 px. Below `md`, show "Rehearse on a laptop or desktop; the mic and slides need the room." Visual style is the repo's briefing-file look (see `CLAUDE.md`, Web client conventions: Archivo, `font-display` for names and numbers, sentence-case labels, no `·`, tokens in `globals.css`, colour always paired with a role label, status colours always with an icon and a label).

```
┌───────────────────────────────────────────────────────────────────────┐
│ DryRun   Pitch to Acme      The pitch  02:14   🎙▁▃▅▂   [n8n ▸] [End] │
├─────────────────────────────────┬─────────────────────────────────────┤
│           THE TABLE             │  SLIDE 3 / 12                       │
│     (RoomPlan, same seats)      │  ┌───────────────────────────────┐  │
│                                 │  │                               │  │
│   (Rajiv)            (Priya)    │  │         slide image           │  │
│    CFO          ✋ CTO          │  │                               │  │
│  ┌───────────────────────────┐  │  └───────────────────────────────┘  │
│  │           table           │  │  On this slide 0:32 of 0:40         │
│  └───────────────────────────┘  │  Next ▸ [thumb] Pricing             │
│   (Anil)            (Meera)     │  Last time's talk track:            │
│  Procurement      ◉ Ops         │   "Lead with the 18% fuel saving…"  │
│                                 │  [ ← Back ]  [ Next → ]             │
│             ▲ You               │                                     │
├─────────────────────────────────┴─────────────────────────────────────┤
│ Meera (VP Operations): "How long does a rollout take for 40 sites?"   │
│ Priya has a question.                          n8n is reading slide 3…│
└───────────────────────────────────────────────────────────────────────┘
```

**Header:** DryRun (link home), "Pitch to {company}", the stage ("The opening", "The pitch", "Questions", "Closing", from `room.live.stage`) and the elapsed time (the `useElapsed` helper in `SessionControls.tsx`), a small mic meter, a toggle "Show n8n's thinking", and End.

**The table** (left): a new `RehearsalTable` built on `web/src/components/room/RoomPlan.tsx`, like `web/src/components/dashboard/RoomBoard.tsx` does. Each persona's `PersonaAvatar` (portraits from VR, `public/vr/*.jpg`) in their seat, with a name card.
- **Speaking:** a thick ring in their colour (`colorOf`) that scales with their voice's loudness (from an `AnalyserNode`), and the name card highlighted with the label "Speaking".
- **Hand up:** a hand icon badge (an inline SVG, not an emoji) plus the label "Hand up" on the card. Raised hands must be easy to see: that's the cue to pause.
- **Chair:** the persona with `chair: true` gets "Chair" on their card.
- In the middle of the table, before the start: "The panel is seated".

**Speaker view** (right): like the confidence monitor in VR.
- The current slide image (`room.deck.slides[room.slide].image_url`), aspect ratio kept, "3 / 12" under it.
- Time on this slide against `bundle.slides[i].target_seconds` ("0:32 of 0:40"; over target turns `warn`, with the icon and label "Over time").
- The next slide as a thumbnail with its `title`.
- `bundle.slides[i].notes`, labelled "Last time's talk track", only if not null.
- Back and Next buttons. Keyboard and presentation clicker: reuse the key handling from `web/src/components/room/DeckPanel.tsx` (Page Down, Page Up, arrows) and `POST /api/room/slide` with `by: "web"`.
- With no deck, show the slide's key points (`bundle.slides[i].key_points`) and the time instead, and the pitch end comes from time (section 6.5).
- **Rescue cue** (section 6.6) appears under the slide, never covering it.

**Bottom strip:**
- A caption of whoever is speaking: "Name (Role): text", the reaction's `text`, shown from when they start until 2 s after they stop.
- The prompt line: "Priya has a question." while a hand is up and you're still talking (same as VR's `Prompt`), or "n8n is reading slide 3…" while `room.live.thinking` is not empty.

**"Show n8n's thinking"** (off by default; on for judges): a right-hand drawer with the existing `AgentFeed` fed by `buildLiveFeed(room.live, room.bundle)` from `web/src/lib/feed.ts`. Exactly what the dashboard shows. Remember the toggle in `localStorage` (wrapped in try/catch).

**Before the start (`phase: "briefed"`):** a centred card over the table.
1. Title "The panel is seated." Body: "Use headphones so the panel's voices don't reach your mic. Introduce yourself when you begin: the chair will welcome you."
2. Button **"Allow the microphone"**. This click is the user gesture that creates and resumes the `AudioContext` (browsers block audio until one) and calls `getUserMedia`. If permission is denied, say how to allow it in the browser and offer **Start without the mic** (the panel can't hear you then; for a demo of the screen only).
3. Once the mic works: "Listening. Start speaking whenever you're ready." plus a **Start now** button. The session starts on the presenter's first speech (section 6.1), or the button.
4. Prefetch every `bundle.lines[].audio_url` at this point so welcomes and acknowledgements play instantly.

**After the end (`phase: "done"`):**
- The table shows "Session ended" in the middle.
- The right column becomes the debrief panel: `buildDebriefFeed(room.debrief)` steps (`feed.ts`) while `room.debrief.state === "running"`.
- Then **Open the report ({overall}/100)** (`/s/{run_id}/report`), **Run it again, harder** and **Same panel again**.
- `failed`: "Try the debrief again" (`POST /api/room/debrief`). `skipped`: show `room.debrief.error`. Reuse `SessionControls` logic where it fits.

**Leaving the page mid-run:** `beforeunload` warns. If the page is reloaded while `live`, offer **Resume** (needs a click for the mic again) or **End the session**.

---

## 5. Contract change (0.23): do this first

(Built as 0.21 on the branch; it became 0.23 when merged, since main had used 0.21 for the sample meeting and 0.22 for the panel suggestions.)

Rule from `CLAUDE.md`: **change `docs/CONTRACT.md` first, bump its version, then the code.** Mirror it in `web/src/lib/contract.ts` (its header comment says v0.18; set it to 0.23). Add a changelog line at the bottom of `CONTRACT.md`.

1. **Room gains `rehearse_in: "vr" | "browser"`.** Where the presenter rehearses this panel; `"vr"` by default (and for rooms saved before 0.23: add it to `EMPTY` in `web/src/lib/room.ts`).
   - Set when the panel is briefed (the practice page's two buttons).
   - Changeable with `PUT /api/room/settings` `{ "rehearse_in": "browser" }` while `briefed` or `done` (answer `409` while `live`).
   - **The headset, when it's `"browser"`:** keeps seating the panel and showing slides, but doesn't start the session on speech or A, doesn't record or take turns, and its monitor says "Rehearsing in the browser". The browser page, when it's `"vr"`, says "This panel is set up for the headset" with a button "Rehearse here instead" (which sets it to `"browser"`).
2. **`live.now?: { speaking: PersonaId | null; hands: PersonaId[] }`.** Who on the panel is speaking and who has a hand up right now, for the dashboard's live room plan. Set by **`POST /api/room/now`** with `{ "speaking": "p2" | null, "hands": ["p3"], "by": "web" | "headset" }`. It's only allowed while `live` (else `409`), answers `{ "ok": true }` and bumps `version`. The client sends it only when it changes (a few times a minute, not per frame). Cleared when the session ends. Optional for the headset.
3. **`POST /api/debrief` from the browser** sends `client: "web"` with its silences (`{ t, type: "silence", duration_s, rescue_level }`) before ending. No new fields; just note in the doc that the browser sends it too. In `web/src/lib/debrief.ts`, `startDebrief` currently sets `client: headset ? "vr" : "web"`. Change it to `client: telemetry?.client ?? (room.rehearse_in === "browser" ? "web" : "vr")`, and rename `keepHeadsetTelemetry` and its global to something client-neutral (`keepClientTelemetry`).
4. No change to `/turn`, `/prep`, `/debrief` (n8n side) or `/api/room/session` (`by: "web"` already exists).

---

## 6. How the browser rehearses (port of the VR client)

The headset's logic lives in the Unity project, which this laptop doesn't have, so the rules are copied here exactly. Port them faithfully: they were tuned in testing. Times are seconds. Keep every number as a named constant at the top of its file, with the same names as below, so they can be tuned in the venue.

### 6.1 Voice activity (port of `VoiceActivity.cs`)
- Mic: `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })`. Chrome's echo cancellation removes the panel's voices played by the same page; muting (below) covers the rest.
- Capture with an `AudioWorklet` (module in `web/public/rehearse/mic-worklet.js`, since worklets load from a URL) that posts Float32 chunks to the main thread. Resample to **16 kHz mono**. Try `new AudioContext({ sampleRate: 16000 })` first (Chrome supports it); if the browser refuses, use the device rate and downsample in the worklet (average each block of `rate / 16000` samples).
- Every `windowSeconds = 0.1` s, compute the RMS level of the last window, then:
  - `threshold = max(minimumLevel, background * loudnessRatio)`, with `loudnessRatio = 3` and `minimumLevel = 0.02`. Browser levels differ from the Quest's, so show the level and background on a hidden debug overlay (`?debug=1`) to tune them.
  - Level ≥ threshold for `speechHoldSeconds = 0.6`: **speaking** starts. Add the 0.6 s to the recorded speech, since it was speech too.
  - Level < threshold for `silenceHoldSeconds = 0.8`: speaking ends.
  - While not speaking, `background` follows the level: `background += (level - background) * (1 - exp(-backgroundAdaptRate * dt))`, with `backgroundAdaptRate = 0.3`.
  - The initial background is the first window's level.
- `quietFor`: seconds since speaking ended (0 while speaking).
- **Muted** while anyone on the panel speaks: nothing counts as speech, nothing is recorded, the background isn't learned, and `quietFor` keeps growing. Unmute `muteTailS = 0.4` after the voice ends.
- **Recording:** a buffer of samples since `beginRecording(preRollS)`, plus the seconds of speech in it. Keep a 10 s ring of recent audio so `preRollS = 1` can be prepended (the first word is otherwise cut). `takeRecording()` returns the samples and the speech seconds and starts a new buffer.
- **Start on speech:** while `phase === "briefed"` and the mic is ready, the first `speaking` start sends `POST /api/room/session { action: "start", by: "web" }`. If the laptop answers `409`, follow the room.

### 6.2 Turns (port of `TurnTaker.cs`)
Stages: `opening → pitch → questions → closing`. A turn is `POST /api/turn` with a `TurnRequest` (`web/src/lib/contract.ts`):
- `session_id`: `room.session_id`.
- `t`: seconds since `room.live.started_at`.
- `slide_index`: the slide the speech was on.
- `audio_wav_base64`: 16 kHz mono 16-bit PCM WAV.
- `asked_by`: only with an answer.

Constants:
```
turnTimeoutS 15, pitchEndTimeoutS 20, minSpeechS 1.5, preRollS 1, answerPauseS 1.2,
maxTurnS 90, defaultSlideS 60, minHandS 1.2, handTimeoutS 15, welcomeLateS 3,
muteTailS 0.4, gapS 0.4, questionsQuietEndS 25
```

When the session goes live: stage `opening`, mode `opening`, `slide = room.slide`, `slideSince = now`, `speechClock = 0` (seconds the presenter has spoken this run), `beginRecording(preRollS)`. Prefetched line audio is already loaded.

Every tick (run it every 100 ms or so, not in React render):
- **Opening.** When speech pauses (was speaking, now not) with more than 0.4 s recorded, or the slide changes, take the recording and send `opening` if it has more than 0.4 s of speech. Then go to `pitch` (mode `segment`, `slide = current`, `slideSince = now`).
- **Answering** (mode `answer` with `askedBy` set). The answer is done when not speaking, `quietFor ≥ answerPauseS` and recorded speech > 0.5. It's also cut off when the slide changes during the pitch, or when the recording is over `maxTurnS`. Then:
  - Take the recording and send `answer` with `asked_by` if speech > 0.5.
  - During the pitch, if speech > 0.5 or the slide moved, go back to mode `segment` with `askedBy = null`. During the questions, stay in `answer` mode until someone else asks.
  - If the slide moved: send the **held** audio (below) as a `segment` for the old slide if it has ≥ `minSpeechS` of speech, then set `slide = current`, `slideSince = now`.
- **Pitch, slide changed.** Take the recording plus the held audio, send `segment` for the old slide if speech ≥ `minSpeechS`, then `slide = current`, `slideSince = now`.
- **Pitch, mid-slide** *(0.25; replaced the "long slide" rule)*. Only when speech just paused and the presenter has said at least `after_s` seconds on this slide for an unused entry of `bundle.plan.interrupts` on it (or the recording is over `maxSegmentS`, 300 s): send what's recorded (with the held audio) as a `segment` with `mid_slide: true`, and mark those entries used. Time on the slide never decides it.
- **Time keeping** *(0.25)*. With `bundle.time`, during the pitch in mode `segment` with the panel idle and no wrap-up countdown: past `cut_at_s` (if not 0), queue the chair's `time_up` line, and when it has played, end the pitch with `pitch_end` and `time_up: true` (no line: end it at once, without the flag); past `nudge_at_s`, queue the chair's `time_nudge` line once. These lines play at the next pause like any reaction and are never dropped as late.
- **Held audio.** When a panel member starts speaking during the pitch in mode `segment`, move the recording so far into `held`. It's sent with the rest of that slide later, so a question doesn't split the slide's transcript.
- Before sending, **trim silence**: drop quiet stretches at both ends, keeping 0.5 s around the speech. Use 50 ms windows with threshold `max(minimumLevel * 0.5, background * 2)`. If nothing is above the threshold, send it untrimmed.
- **In flight.** Count requests in flight. A failed request, non-200 or timeout means nobody reacts (log it to the console with a `[Turns]` prefix). A `pitch_end` that fails ends the session. Responses that arrive after the run ended or restarted are ignored (keep a run counter).
- **Reply.** Queue each reaction in order. The voice is `reaction.audio_url`, or else the bundle line's `audio_url` when there's a `line_id`. `end_session: true` means stage `closing`, and end the session once the queue has played and nothing is in flight.

### 6.3 Playing reactions
- Fetch each voice when queued (`/api/audio/<id>.wav`, cached for good) and decode with `AudioContext.decodeAudioData`. Play through an `AnalyserNode` (its level drives the speaker's ring).
- **The queue, every tick:**
  - Drop the first reaction if its audio failed, or if it's **late**:
    - a reaction to the `opening` once the presenter has spoken more than `welcomeLateS` since it was sent (`speechClock - speechAtSend`);
    - a reaction to an `opening` or `segment` when the slide is now 2 or more past the one it was about;
    - a raised hand that has been up while the presenter talked more than `handTimeoutS` (speech seconds, not wall time).
  - If it has `raise_hand` and the hand isn't up yet, put the hand up (`hands` in `live.now`) and note the time and `speechClock`.
  - While the presenter is speaking and a hand is up, the prompt says "{First name} has a question." (use `role_short` when there's no name).
  - **Speak** only when the audio has loaded, the presenter isn't speaking, `gapS` has passed since the last voice, and a raised hand has been up at least `minHandS`.
- **Speaking:** mute the mic, play, set `speaking` in `live.now`, and show the caption. Lower the hand 0.6 s after they start. When the clip ends:
  - Unmute after `muteTailS` and clear `speaking`.
  - If it was a `question` or `follow_up`: mode `answer`, `askedBy = persona_id`, `beginRecording()` (no pre-roll).
- **A reaction with no audio** (voices off, or a voice that failed) still shows its caption for `max(2, words / 2.5)` seconds and counts as speaking. That's better than silence on a screen. (VR skips these.)
- **Quiet questions.** In `questions` or `closing`, if nothing is in flight, the presenter isn't speaking and nothing has happened for `questionsQuietEndS`, end the session.

### 6.4 Session end (any cause)
`POST /api/room/session { action: "end", by: "web" }`. Before that, send the browser's telemetry to `POST /api/debrief`: `{ session_id: room.session_id, client: "web", duration_s, events: [silences] }`. The laptop then starts n8n's debrief by itself. Stop the mic tracks, clear the queue, lower the hands and clear `live.now`.

### 6.5 Wrap-up on the last slide (port of `SessionController.WrapUp`)
- **At the pitch end:** on the deck's last slide; with no deck, after 80% of `bundle.pitch_seconds` (300 if missing). Only in `opening` or `pitch`.
- Once the presenter has spoken on the last slide and then been quiet `wrapUpSilence = 4` s, and the panel isn't busy (nothing playing, queued or in flight), count down `wrapUpCountdown = 3` s. Show it under the slide: "Wrapping up? Questions in 3… Keep talking to carry on."
- Talking, leaving the last slide or anything happening on the panel cancels it.
- At 0: send `pitch_end` (with the last slide's recording plus held audio), then stage `questions`, mode `answer`, `askedBy = null`.

### 6.6 Rescue cues (new; the headset doesn't have these yet)
The Round 1 deck's Rescue Agent. They run in the browser with no network call (`CLAUDE.md` ground rule 3: nothing blocks on the network while the presenter is frozen).
- During `pitch` only. Not while the panel is busy, a hand is up or the wrap-up is counting down. The silence clock is `quietFor`.
- `bundle.rescue_after_s` is `[calm, keyword, bridge]` seconds (for example `[3, 6, 10]`). Past each one, show that level's text from the current slide's `rescue`:
  1. `calm`, in muted ink
  2. `keyword`, larger
  3. `bridge`, "Try: …"
- They sit under the slide, with an icon and the label "Cue".
- Speaking hides them at once.
- Log each silence that reached level 1 or more as a telemetry event `{ t, type: "silence", duration_s, rescue_level }` for the debrief (section 6.4).

---

## 7. Files

New, in `web/src/`:
| File | What |
|---|---|
| `app/s/[sessionId]/rehearse/page.tsx` | Server page: checks the room, renders `Rehearsal` |
| `components/rehearse/Rehearsal.tsx` | The page shell: header, table, speaker view, bottom strip, start gate, end state |
| `components/rehearse/RehearsalTable.tsx` | `RoomPlan` with speaking rings, hand badges, chair label |
| `components/rehearse/SpeakerView.tsx` | Slide, counter, time on slide, next slide, notes, back and next, rescue cue, wrap-up countdown |
| `components/rehearse/StartGate.tsx` | "Allow the microphone" and the waiting card |
| `lib/rehearse/voice-activity.ts` | Section 6.1, pure (fed samples and a clock), no React |
| `lib/rehearse/mic.ts` | `getUserMedia`, worklet, resampling, ring buffer |
| `lib/rehearse/turn-taker.ts` | Sections 6.2–6.6 as one state machine with injected `send`, `play`, `now` (testable without a browser) |
| `lib/rehearse/wav.ts` | 16-bit PCM WAV encoding and silence trimming |
| `lib/rehearse/player.ts` | Fetch, decode, play with level, cache |
| `lib/rehearse/useRehearsal.ts` | Wires it to React and the room (`useRoom`), posts `live.now` changes |
| `app/api/room/now/route.ts` | `POST /api/room/now` (section 5) |
| `public/rehearse/mic-worklet.js` | The `AudioWorklet` processor |

Changed:
| File | Change |
|---|---|
| `lib/contract.ts` | 0.23 types: `Room.rehearse_in`, `LiveSession.now` |
| `lib/room.ts` | `rehearse_in` in `EMPTY`; `setNow()`; clear `now` on end and restart |
| `app/api/room/settings/route.ts` | Accept `rehearse_in` (not while `live`) |
| `app/m/actions.ts` | `briefPanelAction` takes `rehearseIn` and redirects to `/rehearse` or the dashboard; new `rebriefAction()` for "Run it again, harder" (same `getBrief()` input and `room.panel`, a new `/prep`) |
| `components/brief/Practice.tsx` | The two buttons (section 3) |
| `components/dashboard/RoomBoard.tsx`, `Dashboard.tsx` | Live speaking and hands from `room.live.now`; for `rehearse_in: "browser"`, show the room plan (not the headset view) when live, and a "Rehearse in the browser instead" link while briefed |
| `components/dashboard/SessionControls.tsx` | "Run it again, harder" next to "Run it again" |
| `lib/debrief.ts`, `app/api/debrief/route.ts` | Client-neutral telemetry (section 5.3) |
| `lib/turns.ts` | Stand-in turns for development (step 2) |
| `web/README.md` | The new page, stand-in turns, the fake mic for testing |

---

## 8. Build steps

Commit after each step once `npm run build` and `npm run lint` pass (one line, like a person would write it, no AI attribution, stage files by path; see `CLAUDE.md`, Git). Rough times in brackets.

1. **Contract 0.23** (1 h). `CONTRACT.md` with a changelog line, `contract.ts`, `room.ts`, settings route, `POST /api/room/now`. *Done when:* `curl -X PUT localhost:3000/api/room/settings -d '{"rehearse_in":"browser"}' -H 'Content-Type: application/json'` round-trips in `GET /api/room`.

2. **Stand-in turns** (1–2 h). Lets you build without spending n8n executions. With `DRYRUN_FAKE_TURNS=1` in `.env.local`, `takeTurn` in `web/src/lib/turns.ts` skips n8n (put the check before the `N8N_URL` check in `app/api/turn/route.ts`) and answers from the bundle after a 2 s delay, so the waiting is realistic:
   - `opening`: the chair's `welcome` line.
   - The first `segment` on a slide where someone has an objection: that person asks it (`kind: "question"`, `raise_hand: true`).
   - `answer`: an `acknowledge` line, or "Thanks, that helps." with no audio.
   - `pitch_end`: the chair's `open_floor` line, then one question from someone who `waits`.
   - The answer after that: the chair closes ("Thank you, we'll come back to you.") with `end_session: true`.
   - `transcript` is `"(stand-in)"`, `note` says it's a stand-in, and turns still go into `live.feed` so the dashboard feed works.
   - Without `DRYRUN_N8N_URL`, `/prep` already returns sample data (`web/src/lib/mock/prep.ts`; it has no voiced lines, so captions only).

3. **The choice on the practice page** (1–2 h). Two buttons, `rehearse_in`, redirects. The rehearsal page as a stub that shows the room.

4. **Rehearsal page layout** (half a day). Table, speaker view, header, bottom strip, start gate and end state, driven by the room alone (slides, phase, stage, feed). There's no mic yet: Start now and End work through `/api/room/session`.

5. **Mic and voice activity** (half a day). Worklet, 16 kHz, levels, speaking, mute, recording with pre-roll, the debug overlay, start on speech.

6. **Turns and playback** (1 day). `turn-taker.ts` and `player.ts` per sections 6.2–6.4, against stand-in turns. Hands, captions, `live.now`, held audio, late drops, answers, the quiet-questions end.

7. **Wrap-up and rescue cues** (2–3 h). Sections 6.5 and 6.6, and silences into the browser's telemetry.

8. **Dashboard live and "Run it again, harder"** (2–3 h). Section 7's dashboard changes and `rebriefAction`.

9. **Real runs with n8n** (2–3 h, at most 3 runs). Unset `DRYRUN_FAKE_TURNS`. One full run: introduce yourself, 3 slides, answer one question, go quiet on the last slide, answer the questions, then the closing, debrief and report. Then **Run it again, harder** once and check the panel presses on the weak spots. Write down latency per turn and anything off.

10. **Docs** (1 h). `docs/PLAN.md` (tick the tasks, add what you learned), `docs/ARCHITECTURE.md` (the browser as a second rehearsal client), `web/README.md`, and the root `README.md` only for what really works.

### Testing without talking every time
Chrome can play a WAV file as the mic:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir=/tmp/dryrun-chrome --use-fake-ui-for-media-stream \
  --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=/path/to/speech.wav \
  http://localhost:3000
```
Record a 20–30 s WAV of yourself pitching with pauses (QuickTime, export, `afconvert -f WAVE -d LEI16@16000 -c 1 in.m4a speech.wav`). It loops, which is fine for testing turns and the wrap-up. For logic, `turn-taker.ts` takes injected `now`, `send` and `play`, so a quick script with fake speech can exercise the rules without a browser.

---

## 9. For the main laptop (Unity), not this one

The headset half of 0.23. The main laptop's Claude has Unity access; listed here so nothing is missed.
- `RoomSync.Room` parses `rehearse_in`.
- When it's `"browser"`:
  - `SessionController` doesn't start on speech or A.
  - `TurnTaker.Begin` doesn't run (no recording or turns).
  - The monitor shows "Rehearsing in the browser".
  - Slides and seating carry on as usual.
- Optional: `TurnTaker` posts `POST /api/room/now` when someone starts or stops speaking or raises or lowers a hand, so the dashboard's live room plan also works for VR.
- Until this is built into a Quest build, keep the headset app closed during browser rehearsals.

---

## 10. Done means

- [ ] From a meeting's practice page, **Rehearse in the browser** gets to the rehearsal page with the panel seated, in under 30 s.
- [ ] Introduce yourself, and the chair welcomes you. Start pitching straight away, and nobody says anything.
- [ ] During the pitch, someone raises a hand, waits for your pause and asks a question grounded in the research. Your answer gets a verdict in the n8n feed.
- [ ] Going quiet on a slide shows the calm cue, then the keyword, then the bridge; speaking clears it.
- [ ] Quiet on the last slide: the countdown, the chair opens the floor, a question, your answer, the chair's closing, and the session ends by itself.
- [ ] The dashboard on another tab shows who is speaking and who has a hand up, live, and n8n's feed.
- [ ] The debrief steps show, then **Open the report** with the transcript per slide. **Run it again, harder** re-briefs and the panel presses on the weak spots.
- [ ] VR still works exactly as before when **Rehearse in VR** is chosen.
- [ ] `npm run build` and `npm run lint` pass, no keys committed, docs updated and pushed.

## 11. Out of scope (don't build)
- 3D in the browser (WebGL or Three.js): roadmap slide.
- Webcam or "who you faced" in the browser: `facing` stays `null` for web runs; the report already handles it.
- After the real meeting (WF4), people twins, the team view: parked in `PLAN.md`.
- Any n8n workflow change. If something seems to need one, stop and ask the user.
