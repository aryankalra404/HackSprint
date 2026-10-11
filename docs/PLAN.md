# Plan

Event: Sat 17 – Sun 18 Oct 2026, MAHE Bengaluru. Prep window: Sat 10 – Fri 16 Oct.
Owners are TBD, so fill them in.

## Direction (proposed 10 Oct: confirm with the team)
**Pitch line:** "Meet your buyers before you meet your buyers." DryRun keeps a twin of every person you meet for work. n8n prepares you for each important meeting, you rehearse against the twins in VR or on the web, and after the real meeting n8n handles the follow-up and updates the twins, so they get more accurate every time.

**PS 22, Built with n8n (official text):** "Reimagine how repetitive, fragmented, and time consuming tasks are handled by combining AI with intelligent automation. Identify a real world process that involves repetitive human effort, information scattered across multiple sources, or frequent decision making. Design and build an AI powered automation system using n8n that can understand context, make intelligent decisions, and execute actions with minimal human intervention. The solution should go beyond simple task automation. Participants are encouraged to explore novel use cases, autonomous workflows, multi-step reasoning, and creative applications of AI to solve the problem."

**Why this direction:**
- **PS 22** asks for a real process with repetitive effort, scattered information and frequent decisions, handled by n8n with minimal human input and more than simple automation. The meeting lifecycle fits: prep before (calendar, email, the web) and follow-up after (notes, follow-up email, next step) are repetitive and scattered. Rehearsing is the one step a human must do, on purpose.
- **Who scores us:** the same assigned mentors score Round 2 and Round 3 (feedback in between, then eliminations), then the Top 10 pitch to the final judges. Mentors include n8n Community, Sarvam AI and Google; judges are investors and industry leaders.
- **Against the Round 1 deck** (`~/Downloads/HackSprint PPT Presentation_Git Push and Pray final.pptx`, "AI Rehearsal Orchestrator"): keep its vocabulary (Pre-flight, Live, Post-flight, Rescue Agent, closed loop) and present the changes as the idea evolving: a buying committee instead of a generic auditorium, and Pre-flight that starts by itself from the calendar.
- **Against the alternatives:** AI sales role-play (Second Nature, Hyperbound) and speech coaches (Yoodli) use generic personas. DryRun builds twins of the actual people, from your own inbox and calendar plus sourced research, and the twins learn from real meetings. The wedge is B2B sales teams.

**The stages:**
1. **Pre-flight (n8n, starts itself).** A calendar invite arrives, and n8n decides what it deserves (see triage below), researches, writes the brief, proposes the panel and emails you. When you upload the deck (PDF), n8n reads it slide by slide: key points, target time, which stakeholder objects to what on that slide (from the deck and the research), and three rescue cues (calm, keyword, bridge).
2. **Live (VR or web).** The panel sits in the boardroom with your slides on the TV. Stakeholders interrupt with grounded questions. The Rescue Agent runs on the device with the pre-generated cues.
3. **Post-flight (n8n).** Scores with timestamped evidence, report email, a drill on the calendar, weak spots saved for the next rehearsal.
4. **After the real meeting (n8n, new).** n8n asks "How did it go?" and you record a one-minute voice note, or it picks up a transcript. It extracts what each person raised and what you promised, drafts the follow-up email (you approve it before it's sent), books the next step and updates each person's twin.

**Memory lives per person, keyed by email,** not per meeting, so nobody has to mark meetings as one-off or recurring. An address n8n hasn't seen gets a new twin from research; a known address loads the existing twin. Each invite then gets one of three decisions from n8n:

| Situation | n8n's decision |
|---|---|
| New external people, important meeting | Full brief: research, panel, rehearsal |
| People you've met before | Catch-up brief: "Since last time: Priya asked about SAP; you promised a case study, not sent yet" |
| Internal or routine (weekly 1:1, standup) | Skip |

**Getting what happened in the real meeting:**
- **Default, always works:** a one-minute voice debrief, transcribed by Sarvam or Gemini. It also covers in-person meetings, which have no transcript, and avoids recording other people.
- **Automatic when available:** a Google Meet transcript (paid Workspace with transcripts on; it saves a Doc to Drive and attaches it to the event), or a webhook from a note-taker (Fireflies, Otter, Fathom, tl;dv).
- **Fallback:** paste notes on the meeting page.
- **For judges:** "If you already record meetings, DryRun picks up the transcript. If you don't, n8n asks for a one-minute voice note and does the rest."

**What each audience should see:**
- **n8n mentors:** four workflows, live executions, an AI Agent with tools, a data table as memory, send-and-wait approval, an error workflow, and a reason logged for every decision (including choosing to skip a meeting).
- **Sarvam mentor:** Indian stakeholders with Indian voices (Sarvam TTS), and Indian English and Hinglish transcribed properly (Sarvam STT).
- **Google mentors:** Gemini, Calendar, Gmail and Drive throughout.
- **Final judges:** a clear pain, a buyer, a moat (twins that compound per account) and one memorable moment: the closed loop.

**Rehearse against the people judging us** (public professional information only, labelled as practice; check with the organisers first):
- **Round 3:** feed the mentors' Round 2 feedback into DryRun as weak spots. "You told us X; your twin pressed us on it."
- **Final:** "We rehearsed this pitch against a panel built from your public profiles. Here's what your twin asked, and how our score moved."

**Dropped from the Round 1 deck, with a one-line answer for each:**
- **Venue twin from a stage photo:** buying-committee meetings happen in boardrooms, not halls.
- **Gemini Live and Cloud Run:** one backend to build and debug, and rescue now works offline on the headset.
- **BigQuery and Firebase:** history lives in n8n, where you can inspect it.
- **Windows build:** the web client does that job.

## The demo we're building toward (about 3 minutes, pitch set to 2)
Nothing in the meeting is scripted: n8n decides who speaks, what they say and when, from the meeting, the slides, the pitch length and what the presenter actually says. Below is what a run might look like.
1. **Pre-flight by itself.** A calendar invite with a real prospect arrives. On the n8n canvas, triage decides it's worth preparing; research, the brief and the panel appear, and the brief email lands. On the practice page, upload the deck and check the pitch length n8n suggested from the invite. "Start the rehearsal": n8n plans the questions and voices the panel.
2. **The opening.** Put on the Quest, with the headset view on the big screen. Introduce yourself; the chair welcomes you in their own words. (Start pitching straight away instead, and nobody says anything.)
3. **The pitch.** Two or three slides. Most slides get no reaction; once, someone raises a hand, waits for you to pause and asks a question grounded in the research. Answer it. The dashboard's live feed shows n8n's reading of every turn ("You gave a number for the savings, so Rajiv held his cost question").
4. **The questions and the close.** Go quiet on the last slide: the chair opens the floor, someone asks, you answer, and the chair closes the way this meeting would ("We'll take it to the ops team and get back to you").
5. **Off the headset.** The big screen shows n8n scoring live, then who's convinced around the table, then the report: what you said slide by slide with mistakes underlined and a better way to say each, and who you faced. The report email arrives and a drill appears on the calendar. "Run it again" and the panel pushes harder where you were weak, with your fixed talk track on the speaker view.

## Where we left off (11 Oct, evening)
- Built and live on n8n account `aryankalra47`: contract 0.20; prep, rehearsal prep (now reads the last debrief), turn, meetings API (with each meeting's rehearsals) and the new **DryRun debrief** (`XpVBWsXaB1UuPop8`) with the **DryRun sessions** table (`xzUZexBbX6bcX18F`).
- **The loop works end to end through the web app** (tested 11 Oct with spoken WAVs: 5 real turns, end, debrief in 16 s): ending a session sends the run to n8n, the dashboard shows n8n's debrief steps and "Open the report (35/100)", the report shows what was said slide by slide with n8n's marks, the meeting shows "Practised, rehearsed once, last 35/100" with every rehearsal and its report, and the next `/prep` presses on the weak spots (objections with `source: history`, difficulty up) with last time's talk track and drill.
- **VR turns are built** (`~/My project`, `TurnTaker`, `AvatarVoice`), editor-tested against a stand-in laptop, not yet on the Quest.
- Next, in order: (1) Quest build (the user runs `Tools > DryRun > Build And Run On Quest`) and one real rehearsal in the headset; (2) the speaker view in VR shows the slide's `notes` (last time's talk track) and the bundle's drill; (3) "hot slides": on a slide with objections, also send a segment at the first pause after about 15 s, so the hand goes up while that slide is on screen; (4) rescue cues on the monitor; (5) re-export the changed workflows to `n8n/wf*.json` (debrief has none yet).
- Known follow-ups: words per minute counts a question's time on that slide too; a drill on the calendar isn't done (a new event would trigger the calendar watch); the old test session `test-debrief-1` (meeting `test-debrief`) is in the sessions table; give rehearsal prep the meeting's real slot length.
- **The sample meeting** (contract 0.21): "RouteIQ pitch (sample)" on the home page runs a whole rehearsal in VR without speaking and without n8n (scripted on the laptop, recorded voices); editor-tested end to end, not yet on the Quest. Use it to check the headset, and as the fallback if n8n is down.
- Keep n8n executions low: a rehearsal costs about one per turn, one for the debrief and a few progress reads.

## This week
### Sat 10
- [x] Back up the Unity project: local Git in `~/My project` (11 Oct; no remote yet)
- [ ] Agree on `docs/CONTRACT.md` (now v0.18) with the team
- [ ] Agree on the new direction (see Direction) with the team
- [ ] Ask the organisers: the rule on pre-built work, the judging criteria and weights, and whether rehearsing against twins of the judges is OK
- [ ] Set up n8n with a public webhook URL; reach it from the Quest
- [ ] **Check the hackathon rules on pre-built work**
- [x] Web: Next.js app set up in `web/` with the visual style and sample session data
- [x] Web: full report (verdict, the room, timeline, scores with evidence, eye contact, drill) at `/s/demo/report`, printable to PDF
- [x] Web: one-screen dashboard for the big display (room map, agent feed, timeline strip), prep and debrief states, at `/s/demo-prep` and `/s/demo`
- [x] Headset view on the dashboard: relay in the web app (port 3001), viewer with clip recording, Unity `HeadsetView` set up on `DryRun/Room` (contract 0.11)
- [ ] Test the headset view on the Quest: build, open the dashboard at localhost, check the headset's frame rate while streaming

### Sun 11
- [x] n8n prep (`n8n/wf1-prep.json`): calendar or web trigger, triage, emails with attendees, research from Google News and the website (web search if the news is thin), brief and panel, DryRun meetings data table, brief email, live progress per step, failure branch (live on n8n Cloud; a run takes about 15–21 s)
- [x] n8n meetings API (`n8n/wf0-meetings-api.json`): `GET /meetings`, `GET /meeting`
- [x] Web: home page with upcoming meetings, the "prepare for this meeting?" pop-up, the brief page (with n8n's progress shown live while it prepares), practice table per meeting, add a meeting (tested against live n8n)
- [x] Contract 0.14: the room's `deck` (slide images served by the laptop) and `slide`; upload, slide change and image endpoints
- [x] Contract: the deck goes to `/prep` in the request body as slide text (n8n can't reach the laptop) (contract 0.18)
- [ ] n8n Pre-flight (`/prep`): moved to Mon 12 (Rehearsal prep)
- [x] VR: the deck on the TV and a speaker view on the confidence monitor (this slide, the next, the time); right trigger next, left trigger back; every slide cached on the headset (editor-tested)
- [x] VR: controller-free: hand tracking with the rig's tracked hands; a quick pinch changes slides (right hand next, left hand back); no session gesture with hands (speech starts it, the last slide or the dashboard ends it); controllers still work (contracts 0.16 and 0.17; compiles, pinches need a Quest build)
- [x] Eye height: a height bar on the practice page and dashboard moves the presenter's eyes in VR (`height_offset`, contract 0.16; tested in editor Play mode)
- [x] VR: hands dressed for the boardroom: lit skin (one material to match the presenter) and a suit sleeve with a shirt cuff that follows an estimated forearm, instead of the rig's grey hands (checked by editor snapshots)
- [ ] Quest: test the quick pinches (one pinch, one slide) (and that talking with your hands doesn't change slides), and how the dressed hands look and follow when tracked
- [ ] WF1 Panel (`/panel`): not needed for the demo, since meeting prep already proposes the panel; parked
- [x] Web: practice page (edit the panel on the table, confirm; the bundle is sample data until `/prep` exists)
- [x] Web: 9 seats with + on each (max 6), drag to move or swap, avatar picker so everyone has a face; room store and `GET /api/room` long poll on the laptop
- [x] Web: deck upload on the practice page (PDF, PowerPoint or Keynote, converted on the laptop), slide strip and back/next there and on the dashboard (which also takes a presentation clicker)
- [ ] Web: show `/prep`'s progress while it runs (it's slower now that it voices lines)
- [x] VR: follow `GET /api/room` and seat the panel live, tent cards in the person's colour; all 11 Rocketbox business avatars imported with portraits (tested in editor Play mode)
- [ ] VR: test live seating on the Quest (`npm run quest` or a shared hotspot, then edit on the practice page)
- [x] Session lifecycle: waiting → live → done → again; starts on the presenter's first words, A, or the dashboard; panel turns to the presenter (look-at, blinks); confidence monitor text; dashboard switches to the headset view when live (editor-tested)
- [x] Headset view on the dashboard (H.264 from the Quest via the relay on port 3001; only an Android build streams)
- [ ] Quest: test the headset view and check the app's frame rate while streaming
- [ ] Quest: test start-on-speech with the real mic, and tune `VoiceActivity` in the venue
- [x] Demo: `npm run quest` sets up `adb reverse` and mirrors the headset with scrcpy (install scrcpy: `brew install scrcpy`)

- [x] Session: start and end survive the laptop dropping out (retry, no stale room states); ends by itself when you go quiet on the last slide (editor-tested against a stand-in laptop)
- [x] Panel realism: calm idles only, attention held on the presenter, eased partial head turns, natural blinks (editor-tested)
- [x] Unity project under local Git; 16 GB disk free

### Sun 11 (late): the rehearsal becomes a meeting
- [x] Contract 0.18 and the web types: pitch length, the deck's slide text to `/prep`, n8n's question plan, the chair, voiced lines, turn moments (opening, segment, answer, pitch end), audio served by the laptop, the transcript per slide with marks, who you faced

### Mon 12
- [ ] Quest build of what's there (live seating, voice start, headset view and its frame rate): everything below depends on it
- [x] Web: pitch length on the practice page (n8n's suggestion, editable); slide text extracted when the deck is converted (Ghostscript); `/prep` request per 0.18; the web calls n8n's `/prep` and fills in the slide images
- [x] n8n prep: suggest the pitch length from the invite (`proposal.pitch`); meetings prepared before this have none (the practice page starts at 5)
- [x] n8n Rehearsal prep (`/prep`, `8uXBbDqskDlv8YBC`): key points, target times and rescue cues per slide; objections, manner and chair per person; the question plan; lines as text (10–20 s a run). Still to come: voices for the lines, talk tracks from earlier debriefs
- [x] Voices: Sarvam `bulbul:v3` (credential "Sarvam"), one voice per person; transcription with Groq Whisper
- [x] VR: mic recorder (16 kHz WAV per moment: opening, per slide, answer, pitch end, with a 1 s pre-roll and silence trimmed), muted while the panel speaks (editor-tested)

### Tue 13
- [x] n8n Turn (`/turn`, `DMvVTOcJ9GwDSMFn`): Groq Whisper (hinted with names), Groq decides who reacts and why (Gemini fallback), Sarvam voices new lines; tested with recorded speech: welcome only after an introduction, a raised hand on a vague claim, a follow-up on a dodged answer (2–4 s, about 6 s with a new voice)
- [x] Web (laptop): `/api/turn` adds the context (bundle, turns, pending questions), compresses speech to AAC and n8n's MP3 voices to WAV (afconvert), saves audio (`/api/audio`), keeps `live.stage` and `live.feed`
- [x] VR: play voices with lip sync from loudness; raised hand (posed in code, there's no clip; no lean yet); wait for the presenter's pause; drop late reactions; hand down after 15 s; the speaker holds eye contact, the others look at them (editor-tested against a stand-in laptop, 11 Oct)
- [x] VR: the opening and the welcome (editor-tested)

### Wed 14
- [x] VR: the questions after the pitch (`pitch_end` replaces ending on the last slide) and the chair's closing (`end_session`); 25 s of quiet in the questions ends it (editor-tested against a stand-in)
- [ ] VR and n8n: a real run of the questions and the closing against n8n from the headset (the web path is tested)
- [x] n8n Debrief (`/debrief`, `XpVBWsXaB1UuPop8`): Code-node metrics and fillers per slide, judgement with evidence and marks on the transcript, stances, talk track for next time; the **DryRun sessions** data table with progress; report email, weak spots, meeting marked practised (calendar drill not done)
- [x] Web: the laptop debriefs each run (its own session id), shows n8n's steps and "Open the report" on the dashboard, keeps the session for the report; the report's "What you said, slide by slide"; rehearsals on the home list and meeting page (contract 0.20)
- [x] n8n rehearsal prep reads the last debrief: weak spots as objections with difficulty up, last talk track per slide, the drill
- [x] Web: the dashboard's feed live: each turn with n8n's reading, who reacted and why, answer verdicts, "Reading slide 3…" while n8n works (`live.thinking`, contract 0.19), the stage in its header; prep steps from the real bundle instead of sample steps (tested with two real turns, about 4 s each)
- [ ] Web: the dashboard's room plan live (who has a hand up, who's speaking), then n8n's debrief steps, who's convinced and the report from real data; the report's transcript per slide with underlined marks
- [ ] VR: rescue cues on the monitor (timings from the bundle); who you faced and time turned to the slides; telemetry to `/api/debrief`

### Mon 12 – Wed 14 (second laptop): rehearse in the browser
- [x] Build it from `docs/WEB_REHEARSAL.md` (11 Oct): contract 0.23, stand-in turns (`DRYRUN_FAKE_TURNS`), the practice page's two buttons, the page, mic and voice activity, turns and voices, wrap-up, rescue cues, the dashboard's live room plan for browser runs, "Run it again, harder". Tested in Chrome with a spoken WAV as the mic against stand-in turns: a whole meeting (welcome, a segment per slide, the wrap-up countdown, pitch end, a raised hand and question, the answer, the chair's closing, telemetry, the debrief panel), reload and resume, both "run it again" buttons, and the dashboard in a second tab. Not yet with n8n or with voiced lines (the sample bundle has none).
- [ ] 3 real runs with n8n at most (`WEB_REHEARSAL.md` step 9): latency per turn, the debrief and report, then "Run it again, harder" once
- [ ] VR side of 0.23 on the main laptop: the headset stays idle when `rehearse_in` is `browser`

### Thu 15
- [ ] Full end-to-end runs × 5 on the Quest, on venue-like Wi-Fi and a hotspot; tune latency and speech detection
- [ ] Closed loop: run 2 visibly adapts (harder where weak, the new talk track on the speaker view, the score moves)
- [ ] Pitch deck: problem, demo, market, why n8n, roadmap (WF4 and twins); tell it as the Round 1 deck evolving
- [ ] Build a practice panel of the mentors and judges from public profiles (if the organisers agree)
- [ ] Record a backup demo video

### Fri 16
- [ ] Buffer and bug fixes only, no new features
- [ ] Rehearse the final pitch, in DryRun

### Parked (roadmap slide unless time is left)
- [ ] n8n: a **DryRun people** data table keyed by email (twins)
- [ ] n8n prep triage: full brief, catch-up brief or skip, using the people table
- [ ] WF4 After the meeting: voice note, follow-up email with approval, next step, update the twins
- [ ] Web: "Met 3 times" on attendees, "Since last time" on repeat briefs, record a voice note

### At the event (17–18 Oct)
- [ ] Round 2: write down every mentor suggestion
- [ ] Between rounds: act on the suggestions you can, and feed the mentors' feedback into DryRun as weak spots
- [ ] Round 3: show what changed since Round 2, and rehearse against the mentor panel
- [ ] Final: open with the judge-panel rehearsal result

### If we fall behind, cut in this order
(Browser rehearsal is no longer on this list: since 11 Oct it's a must-have, see Decisions.)
2. Who you faced
3. Follow-up questions (one question per person, nothing after)
4. Sarvam (use Gemini TTS)
5. Different people asking after the pitch (the chair asks)

## Decisions
| Date | Decision | Status |
|---|---|---|
| 11 Oct | The proposed panel seats only the real attendees from outside your organisation (role blank when the invite doesn't say, so the presenter fills it in); n8n's practice roles become ranked one-tap suggestions with a name and face. Only a meeting with no known attendee gets two practice roles seated. Tested with a real run (Swiggy: 1 seated, 3 suggested) | Accepted |
| 10 Oct | Reposition from generic presentation rehearsal to high-stakes pitches in front of an AI buying committee | Proposed: confirm with team |
| 10 Oct | Drop Cloud Run and Gemini Live; webhook-only with rescue on the device | Proposed |
| 10 Oct | Drop the venue twin from a stage photo; use the built boardroom | Proposed |
| 10 Oct | Google Sheets for session history instead of BigQuery | Proposed |
| 10 Oct | Unity project stays outside this repo for now; its CLAUDE.md is canonical for VR details | Accepted |
| 10 Oct | The panel isn't fixed: n8n proposes 4–6 people from the email, deck and research (with a reason each), the presenter edits before briefing. Up to 6 seats. Contract 0.4 | Accepted |
| 10 Oct | Product shape for PS 22: the web app is the full product (n8n spots important meetings in Google Calendar, decides which to prepare, researches them from email and the web, writes a brief, proposes the panel, emails the presenter; the presenter practises in the browser or in VR; n8n follows up). VR is the premium rehearsal mode. n8n Cloud (trial) with Gemini; meetings stored in an n8n data table; workflows built and deployed through n8n's MCP server. Contract 0.8 | Accepted |
| 10 Oct | The dashboard shows the headset's view live, built into the web app from the headset-stream kit (hardware H.264 on the Quest, WebSocket relay on the laptop's port 3001, WebCodecs in the browser), instead of scrcpy or Meta casting in a separate window. Full VR, so no passthrough camera; mono 1280×720 at 30 fps, encoded only while watched. Meta casting (oculus.com/casting) is the fallback if the headset's frame rate drops while streaming. Contract 0.11 | Accepted |
| 10 Oct | The headset finds the laptop over Wi-Fi (UDP broadcast, the web app answers with its address), with USB `adb reverse` as the fallback; no cable needed when both share a network. Contract 0.6 | Accepted |
| 10 Oct | One headset, so the laptop is the hub: the headset reaches the web app at `localhost:3000` via `adb reverse` (USB or wireless adb) and only talks to the laptop, which forwards to n8n. One room, no join code; the headset long-polls `GET /api/room` and seats the panel live as it's edited. All 9 chairs are seats, max 6 people, placed anywhere. Contract 0.5 | Accepted |
| 10 Oct | n8n reports its own progress: after each stage the prep workflow saves the step list (decide, emails, research, brief, panel, email) with details and sources to the meeting's row, and the brief page shows it live (polls every 2 s) with a link to the run in n8n. An Error Trigger workflow branch marks the meeting failed with a plain reason, and the web app offers Try again. Contract 0.12 | Accepted |
| 10 Oct | DryRun keeps a twin of each person, keyed by email, that learns from real meetings. A fourth stage, "After the real meeting" (WF4), drafts the follow-up email (approved before sending), books the next step and updates the twins. Pitch: "Meet your buyers before you meet your buyers" | Proposed: confirm with team |
| 10 Oct | n8n decides per invite between a full brief, a catch-up brief and skipping, so the user never marks meetings as one-off or recurring | Proposed |
| 10 Oct | The real meeting comes in by voice note by default (works in person, no recording of others); Meet transcripts and note-taker webhooks are picked up when available | Proposed |
| 10 Oct | Decks can be PDF, PowerPoint or Keynote. The laptop converts them (LibreOffice to PDF, Ghostscript to one JPEG per slide, at most 1920 px) and serves the images to the headset, which caches every slide so changing slides never waits on the network. Keynote scripting was tried first and hung on import dialogs. A deck belongs to its meeting: seating another meeting's panel clears it. Contract 0.14 | Accepted |
| 10 Oct | Try Sarvam for persona voices and transcription (Indian voices, Hinglish); Google TTS as the fallback | Proposed |
| 10 Oct | Demo: rehearse against twins of the mentors and judges built from public profiles, feeding Round 2 feedback in as weak spots | Proposed: check with organisers |
| 10 Oct | Research reads Google News RSS and the company's website, then Gemini summarises only those sources (each news item keeps its publisher and link). Gemini's Google Search grounding is refused on the free tier. Model is `gemini-3-flash-preview` (gemini-2.5-flash's free tier is 20 requests a day) | Accepted |
| 10 Oct | When Google News has fewer than 3 stories on the company, n8n also asks Gemini with Google Search (gap-filler, not the main research: the news-and-website path is visible step by step in n8n and keeps exact source links). Search is refused on the free tier (429), so it's skipped there and the progress says so; it works once billing is on | Accepted |
| 11 Oct | n8n still decides which meetings to prepare, but nothing is hidden: skipped meetings are saved with the reason and listed on the home page with "Prepare anyway" (prepared like a meeting added by hand, and its reason then says so). Preparing every meeting was rejected: noise, cost, and PS 22 asks for decisions. Contract 0.15 | Accepted |
| 11 Oct | Every Gemini step in prep falls back to Groq (`openai/gpt-oss-120b`, free) on error; tested by breaking Gemini on purpose (run 489 went through Groq end to end). Gemini stays primary: it reads PDFs and images and searches the web. Next: Gemini through Vertex AI on the team's Google Cloud credits (project `trio-507114`, waiting on billing being linked) | Accepted |
| 11 Oct | Controller-free by default: hand tracking with Meta's thumb microgestures (swipe for slides, double tap for the session), controllers kept as the fallback. Pinch was rejected: presenters pinch and wave while talking, so it would change slides by accident. Tracked hands only, no arms: full-body tracking costs rigging time, may not run on the Quest 3S, and glitchy arms look worse than none. Eye height is set from the web (`height_offset`) instead of in VR, so nobody has to fiddle while wearing the headset. Contract 0.16 | Accepted; the gestures replaced 11 Oct (below) |
| 11 Oct | Hands use the plain pinch instead of thumb microgestures: the microgestures recognised nothing on the Quest and were hard to learn. A quick pinch (under 0.5 s) with the right hand is next, with the left hand back; a longer pinch does nothing. No session gesture with hands: a held pinch was tried and dropped the same day, since a presenter could end their pitch by accident; speech starts the session, the last slide or the dashboard ends it. A let-go counts only once the fingers stay apart 0.12 s, and slides change at most every 0.4 s, after one pinch changed two slides on the Quest. Reverses the rejection of pinch above: the risk of slides changing while the presenter talks with their hands is cut by counting only quick pinches, and is tested on the Quest. Contract 0.17 (wording only, no JSON change) | Accepted |
| 11 Oct | The tracked hands look like the presenter's own: lit skin and a short suit sleeve with a shirt cuff, still no arms. Meta's default hands are grey and see-through with a glowing outline, which reads as UI, not as you, in a photoreal room. A sleeve that fades out within 15 cm hides the hand mesh's open wrist and suggests a suit without guessing the elbow; it follows an estimated forearm, capped at 35° from the hand, so bending the wrist doesn't swing it. A skin-tone choice on the web was left out: one material to change is enough for the demo | Accepted |
| 11 Oct | The rehearsal is a meeting, and nothing in it is scripted. n8n decides from the meeting, the slides, the pitch length and what was said: whether to welcome the presenter (only if they introduce themselves), how many questions and when (its `plan`, with a reason, revised turn by turn), who interrupts and who waits (`manner`), who chairs, and how the chair closes. Code only decides how turns are taken: wait for a pause, stop listening while the panel speaks, drop late lines. A fixed question count per pitch length was rejected: it isn't a product. Contract 0.18 | Accepted |
| 11 Oct | The pitch length is set per rehearsal on the practice page, starting from n8n's suggestion from the invite (a 30-minute call is about 10 minutes of pitch) | Accepted |
| 11 Oct | Turn-based, about 4–6 s a reaction, covered by sending each slide when it ends (the hand goes up on the next slide), waiting for the presenter's pause, and lines voiced ahead of time in `/prep` (welcome, opening the floor, acknowledgements). The laptop sends the session's context with each turn, so n8n keeps no state and stays fast. Voices come back as WAV and the laptop serves them | Accepted |
| 11 Oct | Every word is transcribed per slide. The report shows it with marks (fillers and pace counted by a Code node; missed key points, unsupported claims, wrong facts about the prospect, dodged answers and what landed judged by the model) and a better way to say each; the debrief writes a talk track per slide that the next run shows on the speaker view | Accepted |
| 11 Oct | "Who you faced" replaces "eye contact": the Quest 3S has no eye tracking, so it's head direction. It counts towards stances, and adds time turned to the slides behind you and the longest stretch someone was ignored | Accepted |
| 11 Oct | Park WF4 (after the real meeting) and the people twins for the roadmap slide: five days fit the rehearsal loop, which is the demo | Proposed: confirm with team |
| 11 Oct | Transcription with Groq Whisper (credential exists, fast); voices from Sarvam if we get a key (Indian voices, for the Sarvam mentor), else Gemini TTS | Proposed |
| 11 Oct | The web app is the full product, so you can rehearse in the browser too: a 2D page (`/s/<id>/rehearse`) with the same table, faces and seats as VR, your slides as a speaker view, the panel's voices, raised hands, captions and rescue cues, sending the same `/turn` requests as the headset (no n8n change). The practice page offers "Rehearse in the browser" or "Rehearse in VR" (`rehearse_in`, contract 0.23). 3D in the browser (Unity WebGL, Three.js) and a Zoom-style call were rejected: 3D is too risky this week and would take the wow from VR; a video call would feel like a different product. Built on the second laptop from `docs/WEB_REHEARSAL.md` | Accepted |
| 10 Oct | The dashboard follows the session: room plan while waiting, headset view while live (so the Quest only encodes during a rehearsal), a click overrides it until the next phase. "Run it again" (dashboard, or A in the headset) restarts with the same panel instead of re-briefing. Contract 0.13 | Accepted |
| 11 Oct | A sample meeting ("RouteIQ pitch (sample)", Kaveri Freight, made up) is always on the home page: its brief, panel, slides and recorded voices are files in the repo, and its rehearsal is scripted on the laptop (`web/src/lib/mock/sample.ts`) with the headset standing in for the presenter (contract 0.21, room `scripted`). It's the one place the panel's reactions are fixed in code, on purpose: to show the whole VR loop without speaking and without spending n8n executions, and as a fallback if n8n or the network is down. Its runs aren't debriefed | Accepted |

| 11 Oct | The browser's voice activity learns the background only from quiet windows (below the threshold), not from every window while not speaking as the plan describes for `VoiceActivity.cs`. Tested with recorded speech, learning during the 0.6 s onset hold raised the threshold above normal speech within a few sentences, so everything after the opening went unheard. The cost: a lasting jump in room noise above 3× the background now counts as speech until it stops. Compare with the headset's `VoiceActivity.cs` on the main laptop and keep the two the same | Proposed: check on the main laptop |

## Risks
- **The Unity project only has local Git** (since 11 Oct), so a dead disk would still lose it. Copy it to an external drive or a private remote before the event. Disk: 16 GB free after clearing an old copy's cache.
- **Pre-built work:** some 24-hour hackathons require code to be written at the event. Confirm the rule. If it applies, frame the week as design and prototyping and keep the history honest.
- **Venue network:** only the laptop needs the internet (for n8n). The headset finds the laptop over Wi-Fi first, and venue Wi-Fi often blocks devices from reaching each other, so put both on a phone hotspot or use USB (`npm run quest`). Keep the backup video ready.
- **Twins of real people:** judges may ask about privacy. Answers: it reads only the user's own inbox and calendar, the brief states only sourced facts, invented roles exist only in the practice panel and are labelled, and the default real-meeting input is the user's own voice note, not a recording of others.
- **Scope:** WF4 and people memory add about a day. If the week slips, follow the cut order above; Pre-flight, Rescue, WF2 and Post-flight come first.
- **Sarvam isn't tested yet:** we haven't checked for an n8n node or the API limits. Use the HTTP Request node, and keep Google TTS ready as the fallback.
- **Webhook latency:** turns take a few seconds. Use the raise-hand and thinking animation to cover the wait, and keep prompts short.
- **Judges can't all wear the headset.** The dashboard's headset view shows the presenter's view on the big screen (Meta casting as the fallback), and the web client lets anyone try it.
- **The headset view costs GPU on the Quest 3S** (a second render at 30 fps) and adds a Java plugin to the build. Check the headset's app frame rate on the dashboard while streaming; if it drops, close the view and cast instead. If the first build after adding the plugin fails on Gradle, clear the Gradle cache (see the kit's troubleshooting).
- **Gemini free-tier quota ran out on 11 Oct** (20 requests a day on `gemini-3-flash`, used up by testing): everything ran on Groq until it reset. Rehearsal prep adds one Gemini call per rehearsal, and `/turn` will add one per turn, so the free tier can't carry a demo day.
- **Gemini free-tier quota:** each prep run makes about 4 Gemini calls, and free-tier limits are per model per day. Groq now takes over when Gemini fails, but its free tier is 8,000 tokens a minute, so back-to-back runs can still fail. Before the demo, move Gemini to Vertex AI on the team's credits (link `trio-507114` to the billing account), and do one test run on the morning of 17 Oct.
- **n8n executions:** every read of the meetings API is an n8n execution (calendar polls that find nothing are free). A test meeting stuck in `researching` kept the home page re-reading it every 2 s, about 700 executions on 10–11 Oct for 10 prep runs. Fixed 11 Oct: pages only re-read runs started in the last 5 minutes, every 3 s, and stop after 3 minutes. Check the plan's monthly allowance under Usage in n8n.
