# Architecture

Status: 10 Oct 2026. Each workflow below is marked **built** or **planned**. It changes the original submission (see "Changes from the submitted deck" below).

## Components

```
 Browser (meetings, brief,  ──┐
  practice, dashboard, report)│
                              ▼                                    ┌── Gemini (triage, research, brief, panel; later turns and scoring)
              Laptop: Next.js web app ── HTTPS webhooks ─────────► │  n8n   ├── Google News RSS + company website (research)
              • the one room (panel,      docs/CONTRACT.md         │ Cloud  ├── Data tables: DryRun meetings, sessions, people (twins)
                deck, bundle, live state)                                │        ├── Gmail + Google Calendar (trigger, brief email, actions)
              • forwards headset calls                             └────────┴── TTS for persona voices (planned: Sarvam or Google)
                              ▲
 VR client (Quest) ───────────┘  Wi-Fi (found by UDP broadcast), or USB via adb reverse as the fallback
 (boardroom, avatars, mic, gaze, rescue)
```

There is one headset, so the laptop running the web app is the hub. It holds the room (who sits where, the briefed bundle, live session data) and forwards the headset's calls to n8n. The headset keeps a long poll open on `GET /api/room`, so edits on the web seat avatars in VR within about 100 ms, and it never needs the internet itself. n8n still makes every decision; the laptop only holds state and relays.

**The headset view.** The dashboard shows what the presenter sees, live. The headset renders a second, mono 16:9 camera at its eye, encodes it as H.264 on the Quest's hardware encoder and sends it over a WebSocket to a relay in the web app (port 3001, its own connection so video never delays the room's long poll). The browser decodes it with WebCodecs. The headset only renders and encodes while the dashboard's headset view is open. Adapted from the headset-stream kit; see Headset view in `CONTRACT.md`.

**The deck.** The presenter uploads a PDF, PowerPoint or Keynote file on the practice page. The laptop converts it (LibreOffice to PDF, Ghostscript to one JPEG per slide) and serves the images itself, so the headset never needs the internet. The headset downloads every slide when the deck arrives, shows the current one on the TV behind the presenter and a speaker view (this slide, the next, the time) on the confidence monitor they face. The right trigger, the web and a clicker on the dashboard change slides; the room keeps them in step. n8n doesn't read the deck yet: that's `/prep`.

**Two rehearsal clients.** The presenter rehearses in the headset or in the browser (`/s/<id>/rehearse`), chosen on the practice page and kept in the room's `rehearse_in` (contract 0.23). The browser page is a 2D port of the headset's client: the same table and faces, the slides as a speaker view, the mic with on-device voice activity, the same `POST /api/turn` requests and the same rules for taking turns (`web/src/lib/rehearse/`), the panel's voices, raised hands and captions, rescue cues and the wrap-up. It tells the room who is speaking and who has a hand up (`POST /api/room/now`), so the dashboard's room plan follows a browser run live. n8n doesn't know or care which client sent a turn. When the room is set to the browser, the headset keeps showing the room but doesn't take turns (to build on the main laptop).

**The session.** The room's `phase` goes briefed (waiting) → live → done, and back to briefed to go again. The headset changes it (the presenter's first words, or A and B with controllers, to start, end and go again; hands have no session gesture) and so can the dashboard; both send `POST /api/room/session`, and the room on the laptop has the final say. The dashboard shows the room plan while waiting and the headset view while live.

The latency-sensitive parts stay on the device:
- **Silence detection and rescue cues run on the device**, using cues pre-generated in the prep bundle.
- **Stakeholder questions are turn-based.** They take a few seconds over a webhook, and the avatar's raise-hand and "thinking" animation covers the wait.

## Meeting prep (built): **DryRun prep** and **DryRun meetings API**
Built from `n8n/build/build.py`; IDs and how to change them in `n8n/README.md`.
1. **Trigger:** a new Google Calendar event, or `POST /webhook/dryrun/add-meeting` from the web app.
2. **Decide:** Gemini triages the event (worth preparing? the company, its domain, the kind of meeting, and why). Internal events are saved as `skipped` with that reason, so the web app can list them and offer "Prepare anyway" (which goes through `/add-meeting`, always prepared).
3. **Research**, saving progress to the meeting's row after each stage:
   - recent Gmail threads with the attendees;
   - Google News RSS for the company (up to 15 dated stories with publisher and link) and the company's homepage text;
   - if there are fewer than 3 stories, Gemini with Google Search (needs billing on the key; skipped on the free tier);
   - Gemini summarises only those sources.
4. **Brief and panel:** Gemini writes the brief (real attendees only, role only if stated, likely questions with who's likely to ask, risks, dated news) and ranked practice roles (invented, labelled people who usually sway a decision like this). A Code node seats the real attendees from outside your organisation (roles left blank when unknown) and offers the practice roles as one-tap suggestions, each with a name and a face; only a meeting with no known attendee gets two practice roles seated (contract 0.22).
5. **Save and email:** the row in the **DryRun meetings** data table becomes `ready`, and Gmail sends the factual brief.
Each Gemini step (decide, research, brief) has a Groq fallback on its error output: the same prompt to `gpt-oss-120b`, read by the same next step. Web search is Gemini-only.
6. **If anything fails:** an Error Trigger finds the meeting by run id and marks the step it was on as failed, with a plain reason.

The meetings API serves `GET /meetings` and `GET /meeting?id=` from the data table. The web app polls it, so the brief page shows each step as n8n finishes it.

## The rehearsal as a meeting (planned, contract 0.18)
Nothing in the conversation is fixed in code. n8n decides who speaks, what they say and when; the headset only decides how turns are taken (wait for the presenter's pause, stop listening while the panel speaks, drop lines that arrive too late). The laptop keeps the session's state and sends it with every turn, so n8n holds none between turns and each call stays fast.

```
opening ──► pitch (a segment per slide) ──► pitch_end ──► questions (answers) ──► closing ──► debrief
 welcome?     hand up? who, what, why        chair opens the floor                  end_session
```

## Workflow 1: Rehearsal prep (built, 11 Oct; with voices, and the last debrief's weak spots and talk tracks) (`POST /dryrun/prep`)
Sent when the presenter starts the rehearsal from the practice page. Input: the meeting id, the confirmed panel, the pitch length (n8n's suggestion from the invite unless changed, or no time limit) and each slide's text (extracted by the laptop when the deck is converted).
1. **Load the meeting:** its brief and research from the DryRun meetings table, and weak spots and talk tracks from earlier rehearsals in the DryRun sessions table.
2. **Plan the slides:** key points, a target time per slide adding up to the pitch length (with no limit, n8n's estimate of a natural pace, only a guide), rescue cues (calm, keyword, bridge).
3. **Brief the panel:** priorities and objections tied to slides and research for each person, whether they interrupt or wait, who chairs, and a voice that fits their avatar. Weak spots raise difficulty on those topics.
4. **Plan the questions:** how many during and after the pitch, with a reason, from the length, the kind of meeting and the panel, and where each interruption would come (`plan.interrupts`: who, which slide, after how much speech), the only points where the client sends a slide before the presenter moves on. With a pitch length, also how the chair keeps time (`time`): when they say time is nearly up, and whether this kind of meeting stops the pitch for questions, and when.
5. **Voice lines ahead of time:** the chair's welcome and opening of the floor (and with a limit, the time nudge and the stop for questions, which the client plays itself), a few acknowledgements per person and the chair's way-back-in question per slide, written for this meeting, so common reactions never wait on TTS. *(0.26)* Plus generic lines that say nothing about the meeting (fillers, park, move on, hand back, the chair's "Thank you" and "Take your time"), voiced once per voice: the laptop says which it already has (`cached_voices`) and caches the rest. It also reads what the presenter offers and wants (`goal`), the last run's owed questions (asked again early) and n8n's deck review (the same pushback points).
6. **Return the bundle;** the laptop saves the audio and puts the bundle in the room for the headset.
The webhook streams its answer (contract 0.24): after loading, planning (or Groq standing in for Gemini) and voicing, a Respond to Webhook node sends a progress chunk with n8n's own summary, then the bundle. The practice page shows those steps live, with a link to the execution, in the same single execution.

## Workflow 2: Turn (built; the headset side is editor-tested) (`POST /dryrun/turn`)
The headset sends what the presenter said at four moments: the `opening` (their first words), each slide's `segment` (whole when they move on; mid-slide only at a planned interruption point), an `answer`, and `pitch_end` (quiet on the last slide, or the chair stopping the pitch for time). The laptop adds the bundle, the turns so far and questions left unasked.
1. Transcribe (Groq Whisper, hinted with the question being answered and the asker's name; the laptop raises the quiet Quest mic first).
2. **Decide** with the plan, the time left, the persona briefs and everything said so far: welcome or not; whether anyone reacts, who and why (most slides get nothing, and a question already answered by the pitch is dropped); open the floor; or close the meeting the way this kind of meeting ends.
3. **Hold it to the rules (0.26),** in an expression node after the model: every question is a thread (asked, at most one follow-up, then answered, parked or dodged, never asked again or near-duplicated); no floor opened mid-pitch and no closing before the pitch ends; no interruption on the title slide or after a few words; "I'm not sure" is parked; after a question during the pitch, the asker hands back; after the pitch someone always speaks next (an open thread, an unasked objection, or the chair's closing). Park, move-on and hand-back use the cached generic lines.
4. Write the lines, then voice them (or pick a line voiced in prep).
5. Return the transcript, a one-line `note` on the turn for the dashboard's feed, the reactions with their reasons, a verdict on an answer, the threads it changed, and `end_session` after the closing.
No Code nodes on this path: on n8n Cloud the first Code node of a run waited about 1.7 s for its runner, so the logic runs in Set node expressions (12 Oct). The model itself takes about 0.8 s and Whisper 0.3 s; Sarvam voicing a new line is the rest. Meanwhile the client plays the asker's filler.

## Workflow 3: Debrief (built, 11 Oct) (`POST /dryrun/debrief`, workflow **DryRun debrief**)
Input: every turn with its transcript and n8n's note, and the slide changes the laptop saw (plus what only the headset knows, once it sends it: silences and rescues, who the presenter faced). Each run of a panel is its own session (`<bundle session>-<start time>`). Progress and the result go to the **DryRun sessions** data table after each step; the laptop reads `GET /session` every few seconds while it waits, and n8n answers with the whole session when done (about 15–30 s).
1. **Fixed-formula metrics in a Code node**, so the numbers are reproducible: per slide time against target (pitch time only: questions asked during it are taken out), words per minute and filler words; each question paired with its answer; pacing against the plan. *(0.26)* It also lists the system's own trouble for the model to discount (mis-heard transcripts, the panel cutting in early, failed turns), skips scoring a run under about 45 s or 60 words, and collects the questions the presenter couldn't answer with the meeting brief's research.
2. **Judgement with evidence** (Gemini, Groq as the fallback). Per slide: key points covered and missed, and marks quoted exactly from the transcript (hedges, unsupported claims, wrong facts, what landed) with a better way to say each; a quote that isn't in the transcript is dropped. Clarity, evidence, objection handling and structure scored with quotes; each person's stance with the moment that decided it; a talk track per slide; the drill and weak spots.
3. **Act without being asked:** draft an answer, with sources, to every question the presenter couldn't answer (the report's "Questions you owe them", leading the email, and asked again next time), email the report, mark the meeting practised, and keep the weak spots and talk tracks for the next prep (Workflow 1 reads them: the person who would press on a weak spot gets an objection on it and one more difficulty, and each slide gets last time's talk track). Not yet: a drill on the calendar (a new event would trigger the calendar watch).
4. The dashboard shows each step as it's saved, then the score and "Open the report"; the meeting page lists every rehearsal with its report; the home page shows "Rehearsed 2 times, last 74/100".

## Deck research (built 12 Oct as a deck review, then claim checks, now who else does this; an AI Agent since 14 Oct; contract 0.31, 0.32) (`POST /dryrun/deck-research`, workflow **DryRun deck research**)
Sent by the laptop in the background when a deck is uploaded for a meeting. A deck is mostly about the presenter's own product, which no outside source has written about, so n8n doesn't check its claims; it finds what a well-read panel would know: who else already does this. It is DryRun's one n8n **AI Agent** ("Who else does this?", Gemini as its model with Groq as the fallback model, both on our own keys): its one tool, **Search Google News**, calls the workflow **DryRun news search**, which runs one Google News search and returns up to 8 headlines, each with a short id. The agent decides each search itself, reads what comes back and searches again with other words, broader ones or a competitor's name when the headlines are off (at most 3 searches, so at most 4 model calls), then names the companies, products, programmes or labs the headlines show doing the same (`same`) or nearly the same (`near`) thing, usually 0 to 2, each citing headline ids. "Hold to the sources" (a Code node) reads the agent's steps and keeps only findings that cite a headline the tool really returned, drops any named after its publisher, and repeats. Tested 14 Oct on a RouteIQ logistics deck (execution 256, 36 s): 4 searches of its own choosing, including known competitors by name; 3 findings with headlines kept, and one dropped because it was the article's own publisher. Before 14 Oct this was a fixed chain: plan the searches, run them, gather, judge. Saved on the meeting (`deck_research`). Rehearsal prep gives each to the panel member who would care most, as a `research` objection that names them; the debrief numbers their sources so a suggested answer can cite them. Nothing is shown on a page; the dashboard's agent feed names who was found. The laptop keeps a copy (`web/.deck-research/`) to skip a deck it has already researched.

## Twins of the people you meet (built 12 Oct, contract 0.27): **DryRun twin**, **DryRun twin update**
One **twin** per real person, keyed by email, in the **DryRun people** data table. Plan and rules: `docs/TWINS.md`.
1. **Build** (`POST /twin`, streamed like `/prep`, one execution and at most one model call): open the row or start one; the presenter's emails from or to every address of theirs (connected: the same address); the real meetings they were invited to (dates for the timeline, never facts); their full name in other people's emails, Google News and their company's own pages (suggestions only). DryRun's own brief and report emails are left out. Gemini (Groq if it fails) pulls facts, each with a quote, and up to three readings; a Code node then holds them to the rules (the quote must be in the source, a promise only from the presenter's own emails or notes, a reading needs two connected facts, the role only from a connected source) and merges (no duplicates, rejected stays rejected). Each step streams with the sources and facts it added; the steps are kept as the build log for Replay.
2. **Update** (`POST /twin/update`, no model): the twin page's queued clicks in one batch: confirm or reject a suggestion with its facts, a note, another address, delete a fact, forget the person.
3. **Read**: the meetings API serves `GET /twin` and `GET /twins`, and `GET /meeting` joins each attendee's twin (counts) and "Since last time" (connected facts only, never readings). The laptop keeps a copy of every twin it has seen (`web/.twins/`), so the twin page and the people list cost nothing to view.
4. **Rehearsal prep** reads the twins of panel members with a `twin_email` (filled in by the laptop from the brief's attendees): what they actually raised becomes objections with `source: "twin"`, the date and the source; their preferences shape their manner.
The twin page is a dossier: a halftone portrait that fills in with what's known, how well DryRun knows them and how well rehearsal predicted them, the facts grouped for preparing (what they care about, what they've raised, what you owe them, who they are, n8n's reading), each opening to its quote and source, and how n8n built it; one renderer plays the live build and the saved one (Replay, no n8n call). The sample twin (Rajiv Menon of the sample meeting) lives in `web/src/lib/mock/twin.ts` and never reaches n8n.

## Workflow 4: After the real meeting (twins step 5, built 12 Oct, contract 0.28): **DryRun after the meeting**
Once a meeting has started, its page asks "How did it go?" (home lists meetings until 12 hours after they start). The presenter records a voice note in the browser (16 kHz mono, the rehearsal's mic code, up to 4 minutes) and/or types notes.
1. **The laptop** (`POST /api/after-meeting`) cuts the recording into pieces of at most 28 s, each ending at the quietest moment of its last 6 s so no word is split, compresses each to AAC and sends them with the notes and the owner's address to `POST /after-meeting`. One execution.
2. **Take in what happened.** Sarvam (`saaras:v4`, language detected, the attendees' names and the company as key terms) transcribes each piece; if any piece fails, all go to Groq Whisper. Typed notes are added after the transcript.
3. **Extract per person** (Gemini, Groq if it fails): what each attendee raised, what the presenter promised, what was decided, the next step, each with a word-for-word quote. A Code node keeps only attendees from the invite (by email) and only quoted items.
4. **Hit rate:** what each person really raised against what their practice seat asked in the last debriefed rehearsal of this meeting (by `twin_email` or name). Only the counts and the matched real facts are kept, never the practice lines.
5. **Act:**
   - update each attendee's twin in **DryRun people** (or start one): the notes as a connected `meeting_note` source, the facts, the meeting and the prediction
   - save `after` on the meeting and mark it `done`; answer the laptop, which marks its copies of those twins stale so each is read again once
   - draft the follow-up and email it to the presenter with Send it / Don't send (Gmail send-and-wait, in the same execution, up to 2 days); send it to the attendees only on "Send it", and save the answer on the meeting
The meeting page then shows "How it went": per person, the hit rate, the follow-up's status and the transcript. The twin page shows the hit rate per real meeting (the "predicted" number, a list of what was and wasn't predicted, and the score on the timeline's meeting diamond).
Not built: booking the next step on the calendar, Google Meet transcripts or note-taker webhooks as the input, and an email nudging the presenter after the meeting. Notes sent twice for the same meeting used to keep the first note's facts; the fix in "Hold to the rules" is built but not deployed yet (12 Oct).

The people table holds the twins (above): the brief shows "Since last time" and the next rehearsal seats each known attendee from their twin. Not built: prep's triage choosing a catch-up brief instead of full research for a known attendee.

## Changes from the submitted deck
| Submitted idea | v1 | Why |
|---|---|---|
| Generic audience in a "venue twin" built from a stage photo | Named buying committee in a built boardroom, briefed with prospect research | Stronger use case and pitch, more n8n reasoning, and the VR scene already exists |
| Cloud Run gateway + Gemini Live streaming | Webhooks only; rescue on the device | One backend to build and debug; n8n stays central |
| BigQuery + Firebase dashboard | n8n data tables + web debrief page | Faster to build, and judges can inspect it in n8n |
| No follow-up actions | Email, calendar drill, adaptive next session | PS 22 asks for systems that act with minimal human input |
| Upload a deck by hand to start | Pre-flight starts by itself from a calendar invite (built) | Removes the repetitive prep work, which is the heart of PS 22 |
| The loop closes only across rehearsals | Twins of real people, built from real sources (12 Oct); learning from real meetings is WF4 (built 12 Oct, with the hit rate) | The real meeting is what matters, and memory per account is a moat investors understand |
| Windows desktop build | Web client | Anyone can try it without a headset |
