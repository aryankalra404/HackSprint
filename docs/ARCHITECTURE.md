# Architecture

Status: 10 Oct 2026. Each workflow below is marked **built** or **planned**. It changes the original submission (see "Changes from the submitted deck" below).

## Components

```
 Browser (meetings, brief,  ──┐
  practice, dashboard, report)│
                              ▼                                    ┌── Gemini (triage, research, brief, panel; later turns and scoring)
              Laptop: Next.js web app ── HTTPS webhooks ─────────► │  n8n   ├── Google News RSS + company website (research)
              • the one room (panel,      docs/CONTRACT.md         │ Cloud  ├── Data table: DryRun meetings (later: people, sessions)
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
Sent when the presenter starts the rehearsal from the practice page. Input: the meeting id, the confirmed panel, the pitch length (n8n's suggestion from the invite unless changed) and each slide's text (extracted by the laptop when the deck is converted).
1. **Load the meeting:** its brief and research from the DryRun meetings table, and weak spots and talk tracks from earlier rehearsals in the DryRun sessions table.
2. **Plan the slides:** key points, a target time per slide adding up to the pitch length, rescue cues (calm, keyword, bridge).
3. **Brief the panel:** priorities and objections tied to slides and research for each person, whether they interrupt or wait, who chairs, and a voice that fits their avatar. Weak spots raise difficulty on those topics.
4. **Plan the questions:** how many during and after the pitch, with a reason, from the length, the kind of meeting and the panel.
5. **Voice lines ahead of time:** the chair's welcome and opening of the floor and a few acknowledgements per person, written for this meeting, so common reactions never wait on TTS.
6. **Return the bundle;** the laptop saves the audio and puts the bundle in the room for the headset.
The webhook streams its answer (contract 0.24): after loading, planning (or Groq standing in for Gemini) and voicing, a Respond to Webhook node sends a progress chunk with n8n's own summary, then the bundle. The practice page shows those steps live, with a link to the execution, in the same single execution.

## Workflow 2: Turn (built; the headset side is editor-tested) (`POST /dryrun/turn`)
The headset sends what the presenter said at four moments: the `opening` (their first words), each slide's `segment`, an `answer`, and `pitch_end` (quiet on the last slide). The laptop adds the bundle, the turns so far and questions left unasked.
1. Transcribe (Groq Whisper).
2. **Decide** with the plan, the time left, the persona briefs and everything said so far: welcome or not; whether anyone reacts, who and why (most slides get nothing, and a question already answered by the pitch is dropped); open the floor; or close the meeting the way this kind of meeting ends.
3. Write the lines, then voice them (or pick a line voiced in prep).
4. Return the transcript, a one-line `note` on the turn for the dashboard's feed, the reactions with their reasons, a verdict on an answer, and `end_session` after the closing.

## Workflow 3: Debrief (built, 11 Oct) (`POST /dryrun/debrief`, workflow **DryRun debrief**)
Input: every turn with its transcript and n8n's note, and the slide changes the laptop saw (plus what only the headset knows, once it sends it: silences and rescues, who the presenter faced). Each run of a panel is its own session (`<bundle session>-<start time>`). Progress and the result go to the **DryRun sessions** data table after each step; the laptop reads `GET /session` every few seconds while it waits, and n8n answers with the whole session when done (about 15–30 s).
1. **Fixed-formula metrics in a Code node**, so the numbers are reproducible: per slide time against target, words per minute and filler words; each question paired with its answer; pacing against the plan.
2. **Judgement with evidence** (Gemini, Groq as the fallback). Per slide: key points covered and missed, and marks quoted exactly from the transcript (hedges, unsupported claims, wrong facts, what landed) with a better way to say each; a quote that isn't in the transcript is dropped. Clarity, evidence, objection handling and structure scored with quotes; each person's stance with the moment that decided it; a talk track per slide; the drill and weak spots.
3. **Act without being asked:** email the report, mark the meeting practised, and keep the weak spots and talk tracks for the next prep (Workflow 1 reads them: the person who would press on a weak spot gets an objection on it and one more difficulty, and each slide gets last time's talk track). Not yet: a drill on the calendar (a new event would trigger the calendar watch).
4. The dashboard shows each step as it's saved, then the score and "Open the report"; the meeting page lists every rehearsal with its report; the home page shows "Rehearsed 2 times, last 74/100".

## Workflow 4: After the real meeting (parked for the roadmap, see PLAN.md Decisions)
Triggered when a prepared meeting's end time has passed. n8n asks the presenter "How did it go?" by email, with a link to the meeting page.
1. **Take in what happened.** By default, a one-minute voice note recorded on the meeting page and transcribed (Sarvam or Gemini). When available, a Google Meet transcript (a Doc in Drive, attached to the calendar event) or a note-taker webhook (Fireflies, Otter, Fathom, tl;dv) is used instead.
2. **Extract per person:** what each attendee raised, objected to or asked for, and what the presenter promised.
3. **Act:**
   - draft the follow-up email that answers the open points, and send it only after the presenter approves it (Gmail send-and-wait)
   - book the next step on the calendar
   - update each attendee's twin in the **DryRun people** data table (keyed by email)
   - mark the meeting `done`

The people table also feeds Prep's triage. For a known attendee, n8n writes a catch-up brief ("since last time") instead of full research, and that person's twin opens the next rehearsal with what they actually raised.

## Changes from the submitted deck
| Submitted idea | v1 | Why |
|---|---|---|
| Generic audience in a "venue twin" built from a stage photo | Named buying committee in a built boardroom, briefed with prospect research | Stronger use case and pitch, more n8n reasoning, and the VR scene already exists |
| Cloud Run gateway + Gemini Live streaming | Webhooks only; rescue on the device | One backend to build and debug; n8n stays central |
| BigQuery + Firebase dashboard | n8n data tables + web debrief page | Faster to build, and judges can inspect it in n8n |
| No follow-up actions | Email, calendar drill, adaptive next session | PS 22 asks for systems that act with minimal human input |
| Upload a deck by hand to start | Pre-flight starts by itself from a calendar invite (built) | Removes the repetitive prep work, which is the heart of PS 22 |
| The loop closes only across rehearsals | Twins of real people learn from real meetings (WF4, proposed) | The real meeting is what matters, and memory per account is a moat investors understand |
| Windows desktop build | Web client | Anyone can try it without a headset |
