# Webhook contract

**Version 0.35, DRAFT. Agree on this with the whole team before anyone builds against it.**
Any change here bumps the version and gets a line in the changelog at the bottom. The VR and web clients send identical JSON. Fields marked *(VR)* are optional and omitted by the web client.

There is one headset and one room. The laptop running the web app is the hub:
- **n8n** (`https://<n8n-host>/webhook/dryrun`) is the brain. Only the laptop's web server calls it.
- **The headset** talks only to the laptop, over Wi-Fi when they share a network, with USB as the fallback (see Finding the laptop). The laptop forwards `/api/turn` and `/api/debrief` to n8n, adding the session's context (what was said so far, the bundle) so n8n keeps no state between turns; see each endpoint.
- **The room** (who sits where, the briefed bundle, live session data) lives on the laptop; see Room API at the end.
All bodies are JSON. Times `t` are seconds since the session started (float). The headset uploads 16 kHz mono WAV, base64-encoded; the laptop compresses it to AAC (m4a) before forwarding it to n8n (`audio_base64` with `audio_format`). Voices n8n generates come back to the laptop as base64 MP3 (`audio_base64`); the laptop saves them as WAV and gives the headset a path on itself (`/api/audio/<id>.wav`), the same way it serves slides. The headset only ever sends and plays WAV.

## Meetings and briefs
n8n watches the presenter's Google Calendar. For each new event, it decides whether the meeting is worth preparing for; if so it researches it, writes a brief, proposes the panel and emails the presenter. Meetings are stored in the n8n data table **DryRun meetings** (one row per meeting, keyed by `meeting_id`).

### GET `/meetings`
Upcoming meetings n8n has picked up, soonest first. The web app's home page and its "prepare for this meeting?" pop-up read this.
```json
{
  "meetings": [
    {
      "id": "string",
      "title": "RouteIQ pitch",
      "start": "2026-10-16T15:00:00+05:30",
      "company": "Kaveri Freight",
      "attendees": [{ "name": "Priya Nair", "email": "priya@kaverifreight.in" }],
      "status": "researching | ready | practised | done | failed | skipped",
      "why": "string",
      "progress": [
        { "id": "decide | emails | research | brief | panel | email", "label": "Research", "state": "pending | running | done | error", "detail": "Read 15 recent news stories about Delhivery and their website", "sources": [{ "title": "zeebiz.com", "url": "https://zeebiz.com" }] }
      ],
      "started_at": "2026-10-10T17:20:01.000Z",
      "run": { "workflow_id": "string", "execution_id": "string" },
      "practice": { "sessions": 2, "last": { "session_id": "string", "at": "2026-10-12T18:02:00.000Z", "overall": 74, "headline": "string" } }
    }
  ]
}
```
Field notes:
- `progress` is where n8n is in preparing the meeting, saved by the workflow after each stage with real details (emails read, news stories found, questions written). The web app shows it live; `run` links to that n8n execution. If a run fails, the step it was on gets `state: "error"` with a plain reason, and `status` becomes `failed`.
- Research reads Google News headlines and the company's website; the model doesn't search the web itself, so every news item has a source link.
- `after` *(0.28)*: what happened in the real meeting, from the presenter's voice note or notes (see `POST /after-meeting`); `null` before. A meeting with one is `done`.
- `practice` *(0.20)*: the rehearsals of this meeting that have been debriefed (from the DryRun sessions table), with the latest; `null` before the first. A meeting that has one is `practised`.
- `id` is the calendar event id. `why` is n8n's reason for its decision: for a prepared meeting, who is coming and what is at stake; for a skipped one, why it isn't worth preparing (e.g. "Internal weekly sync, no one from outside").
- `skipped`: n8n decided the meeting isn't worth preparing. It's still listed, with no brief and empty `progress`, so the presenter can see every decision and overrule it: "Prepare anyway" sends it to `POST /add-meeting` with the same `id`, and meetings added that way are always prepared.

### GET `/meeting?id=`
One meeting with its brief and proposed panel.
```json
{
  "meeting": {},
  "brief": {
    "summary": "string",
    "company": { "what_they_do": "string", "recent_news": [{ "text": "string", "date": "string", "url": "string" }] },
    "attendees": [{ "name": "string", "email": "string", "role": "string", "likely_focus": "string" }],
    "questions": [{ "question": "string", "asked_by": "string", "why": "string", "suggested_answer": "string" }],
    "risks": ["string"],
    "sources": [{ "title": "string", "url": "string" }]
  },
  "proposal": {},
  "sessions": [{ "session_id": "string", "at": "2026-10-12T18:02:00.000Z", "status": "debriefing | done | failed", "overall": 74, "headline": "string" }]
}
```
Field notes:
- `meeting` is as in `/meetings`; `proposal` is a `/panel` response, so the web app can seat and edit it.
- `sessions` *(0.20)*: this meeting's rehearsals, newest first, from the DryRun sessions table; each links to its report (`/s/<session_id>/report`).
- **The brief states only facts** (it's emailed to the presenter): `attendees` are only people named in the invite or emails, `role` only if stated there (else empty), `recent_news` only from the cited `sources`, and a question's `asked_by` is a real attendee or empty.
- **The practice panel starts with the real people** *(0.22)*: `proposal.members` are the attendees from outside the presenter's organisation (`source: "email"`; colleagues on the same email domain are left out, unless it's a public mail domain), with `role` only if the invite or emails state it, else `""` for the presenter to fill in. Only when no real attendee is known are the top two practice roles seated instead (`source: "typical"`).
- **Practice roles are suggestions** *(0.22)*: `proposal.suggestions` are hypothetical people to rehearse against, most influential first, each a whole person (`display_name` invented, `role`, `role_short`, `gender`, `avatar`, `why`, `will_push_on`), so adding one seats a ready person. Meetings prepared before 0.22 have suggestions with only `role`, `role_short` and `why`. Only the web app shows these, labelled as practice.
- `brief` is `null` while `status` is `researching`.
- `proposal.pitch` *(0.18)* is n8n's suggested pitch length, `{ "minutes": 10, "why": "30-minute call: about 10 minutes of pitch, the rest discussion" }`, from the invite's length and the kind of meeting. The presenter can change it on the practice page. May be missing on meetings prepared before 0.18 (the web app then asks).
- `proposal.goal` *(0.26)*: n8n's guess at what the presenter wants from this meeting, `{ "text": "a paid 3-month pilot of RouteIQ approved", "why": "Rajiv's last email asks for a pilot proposal" }`, inferred from the invite and the emails (and what the presenter offers, for a meeting added from the web). The brief's hardest questions and risks are about that ask. The web app shows it on the brief as "n8n thinks you want: …" to confirm or edit; the presenter's version is kept on the laptop and sent with `/prep` (it doesn't rebuild the brief). Missing on meetings prepared before 0.26.
- *(0.27)* Each of `meeting.attendees` gains `twin`: `{ "facts": 18, "meetings": 3, "to_check": 2, "last_met": "2026-10-14" | null }` from the **DryRun people** table, or `null` when DryRun has no twin of that address (see Twins). `brief.since_last_time` *(0.27)*: for each attendee with a twin, what they raised and what the presenter promised, newest first, facts only (connected, with the date and source): `[{ "email": "string", "name": "string", "raised": [{ "text": "string", "date": "2026-10-03", "source": "email of 3 Oct: Pilot proposal" }], "promised": [same] }]`; empty when nobody is known. Both are joined in when the meeting is read, so a twin built after the brief shows up without preparing the meeting again. n8n's readings never appear here.

## Twins of the people you meet *(0.27)*
For every real person the presenter meets for work, n8n keeps a **twin** in the **DryRun people** data table (one row per person, keyed by their lower-cased email): what they actually raised, what the presenter promised them, what they care about, each fact with its source. The rules, enforced in n8n:
1. **Only what really happened.** A twin learns from the presenter's emails with that person, public professional pages and news, notes after a real meeting and what the presenter types. **Nothing from a practice run is ever written to a twin.**
2. **No source, no fact.** Every fact quotes its source; a fact whose quote isn't in the source text is dropped by a step after the model.
3. **Connected only on the same email address** (or an address the presenter linked to this twin). Everything else (their name in someone else's email, a team page, a news article) is a **suggestion** the presenter confirms or rejects. A rejected source is remembered and never suggested again.
4. **Facts and readings are kept apart.** A reading is n8n's interpretation with at least two pieces of evidence, labelled as n8n's; readings appear on the twin page and in the practice panel, never in the brief or its email.
5. **Professional only, and the presenter's to delete**: any fact can be deleted, and "forget" removes the twin.

### The twin
```json
{
  "email": "rajiv.menon@kaverifreight.in",
  "aliases": ["rajiv@kaveri.in"],
  "name": "Rajiv Menon",
  "company": "Kaveri Freight",
  "role": { "text": "CFO", "source_id": "s3" },
  "sources": [
    { "id": "s3", "type": "email | meeting_note | web | news | manual", "title": "Pilot proposal", "date": "2026-10-03", "url": "string",
      "from": "rajiv.menon@kaverifreight.in", "status": "connected | suggested | rejected", "why": "string", "key": "string" }
  ],
  "facts": [
    { "id": "f1", "kind": "raised | promised | decision | preference | role | context", "text": "Asked for a pilot proposal on one lane",
      "source_id": "s3", "quote": "could you send a pilot proposal for the Delhi–Mumbai lane", "status": "connected | suggested | rejected", "added": "2026-10-12T10:00:00.000Z" }
  ],
  "readings": [{ "id": "r1", "text": "Pushes on cost", "evidence": ["f1", "f4"] }],
  "meetings": [{ "id": "string", "title": "string", "date": "2026-10-14" }],
  "predictions": [{ "meeting_id": "string", "date": "2026-10-14", "asked": 4, "predicted": 3, "matched": ["f21", "f22", "f24"] }],
  "build_log": [{ "step": "emails", "text": "Found 7 emails with rajiv.menon@kaverifreight.in", "t": 1200, "adds": { "sources": ["s1", "s2"], "facts": [], "readings": [] } }],
  "updated": "2026-10-12T10:00:00.000Z",
  "sample": false
}
```
Field notes:
- `sources` are the cards on the twin page's evidence map. `status` follows rule 3: `connected` only for an email from or to the twin's address or an alias, a `manual` note, or a source the presenter confirmed; `suggested` for anything found by name; `rejected` stays in the list (faded on the page) so the same source is never suggested again (`key`: the message id or the URL). `why` says why a suggestion might be them ("kaveri.in/team lists a Rajiv Menon, CFO").
- `facts` take their source's status: confirming a suggested source connects its facts; rejecting it rejects them. `promised` is something the presenter promised this person. Only connected facts reach the brief (`since_last_time`) and the practice panel.
- `role` is set only when a connected source states it.
- `meetings` are the real meetings they were in (from the DryRun meetings table, by attendee email). `predictions` *(0.28, WF4)*: per real meeting, how many of the things they really raised (`asked`) the practice seat's questions in the last rehearsal of that meeting had asked (`predicted`), and which of their facts those were (`matched`, fact ids). Only for someone who had a practice seat in that rehearsal. Nothing the practice seat said is kept: only the number and the real facts it matched.
- `build_log` is the last build's steps with the time each arrived (`t`, ms from the start) and the ids of the sources, facts and readings it added, so the page can replay the build with no n8n call. The twin page plays one list of steps whether it comes live from the stream, from `build_log` (Replay) or from its timeline (rewinding to a date shows only facts whose source is dated on or before it).
- `sources[].url` for an email is its Gmail link (`https://mail.google.com/mail/u/0/#all/<message id>`), so the page can open it.
- `sample` is `true` only for the sample twin (Rajiv Menon of Kaveri Freight, made up), which lives on the laptop and never reaches n8n.

### POST `/twin` (streamed)
Builds or refreshes a twin. One execution and one model call.
```json
{ "email": "rajiv.menon@kaverifreight.in", "name": "Rajiv Menon", "company": "Kaveri Freight", "domain": "kaverifreight.in" }
```
`name`, `company` and `domain` are optional (from the meeting the presenter came from). n8n loads the row (or starts one), reads up to 20 of the presenter's emails from or to every address (connected), the real meetings they were in, their name in other emails, the company's team page and news with their full name and company (suggestions), then extracts facts with quotes and readings with evidence, drops what fails the rules, merges with what's there (no duplicates, rejected stays rejected, the presenter's own notes are never overwritten) and saves.

The answer streams like `/prep`'s (n8n's `{ type, content }` objects). Each `item` is a step, `{ "step": { "step": "load" | "emails" | "meetings" | "mentions" | "fallback" | "extract" | "save", "text": "Found 7 emails with rajiv.menon@kaverifreight.in", "adds": { "sources": [source], "facts": [fact], "readings": [reading] } } }` (the first also has `execution_id` and `workflow_id`), then last `{ "twin": twin }`. `adds` holds what that step added, whole, so the page can draw it as it arrives; the laptop stamps each step's `t` as it arrives.

### POST `/twin/update`
The presenter's changes, queued on the twin page and sent as one batch (one execution, no model call). Answers with the twin, or `{ "forgotten": true }`.
```json
{ "email": "string", "changes": [
  { "op": "confirm", "source_id": "s5" },
  { "op": "reject", "source_id": "s6" },
  { "op": "note", "text": "Prefers the numbers on one page", "kind": "preference" },
  { "op": "alias", "email": "rajiv@kaveri.in" },
  { "op": "delete", "fact_id": "f4" },
  { "op": "forget" }
] }
```
- `note` adds a `manual` source ("you added this") and, if it's short (under 300 characters), one connected fact of that `kind` (default `context`). Longer pasted text (their profile, notes from a meeting DryRun didn't see) is kept as a source and its facts are extracted, with quotes, on the next build.
- `alias` links another address: connected from then on, searched on the next build.
- `delete` removes a fact for good; `forget` deletes the row.

### POST `/after-meeting` *(0.28)*
After a real meeting, the presenter says (or types) how it went, on the meeting page. One execution: n8n works out what each person raised, what the presenter promised and what was decided, updates their twins, scores how well the last rehearsal predicted it, drafts the follow-up email and asks the presenter to approve it before anything is sent.
```json
{ "meeting_id": "string", "owner_email": "string", "notes": "string", "audio": [{ "base64": "string", "format": "m4a | wav" }] }
```
- `audio`: the voice note, cut by the laptop into pieces under 30 seconds (Sarvam's speech-to-text takes short clips), in order. Either `audio` or `notes` (pasted text), or both.
- n8n transcribes each piece with Sarvam (`saaras:v4`, language detected, so Indian English and Hinglish work, with the attendees' names and the company as key terms); if any piece fails, all of them go to Groq Whisper instead.
- The people are the meeting's attendees from the invite: a fact goes to a twin only for someone on it (by email), with a quote from the notes. The notes become a `meeting_note` source on each of their twins (connected: the presenter's own account of a real meeting with them), and the meeting is added to their `meetings`.
- The hit rate compares what each person really raised with the questions their practice seat asked in the last debriefed rehearsal of this meeting (matched by `twin_email` or name). Practice lines are only compared, never kept.
- The follow-up goes to the attendees only after the presenter approves it: n8n emails the draft to the owner with Approve and Decline (Gmail send-and-wait, in the same execution, waiting up to 2 days), then sends it or not.

Response (as soon as the meeting row is saved, before the approval):
```json
{
  "after": {
    "at": "2026-10-14T18:00:00.000Z",
    "source": "voice | notes",
    "transcript": "string",
    "heard": "Sarvam | Sarvam and Whisper | ",
    "people": [{ "email": "string", "name": "string", "raised": [{ "text": "string", "quote": "string" }], "promised": [], "decided": [], "next_step": "string" }],
    "predictions": [{ "email": "string", "name": "string", "asked": 4, "predicted": 3, "practice_asked": 5 }],
    "followup": { "to": ["string"], "subject": "string", "body": "string", "status": "waiting | draft | sent | declined | failed | none", "answered_at": "string" },
    "run": { "workflow_id": "string", "execution_id": "string" }
  }
}
```
The meeting's row keeps it (the DryRun meetings table's `after`), `status` becomes `done`, and `GET /meeting` returns it as `meeting.after`; `followup.status` changes to `sent` or `declined` when the presenter answers (`failed` if they approved it and Gmail couldn't send it; `none` when there was nothing to send: no draft, no attendees or no owner address), with `answered_at`. A draft that still has a `[fill in: …]` gap is `draft`: it is kept on the meeting for the presenter to finish and send themselves, and never offered for one-click sending. `heard` says who transcribed the voice note (empty for typed notes).

### GET `/twin?email=` and GET `/twins`
Read the DryRun people table: one twin (`{ "twin": twin | null }`, any alias works) or everyone (`{ "twins": [{ "email", "name", "company", "role", "facts", "meetings", "to_check", "last_met", "updated" }] }`). The laptop keeps a copy of every twin it has seen (`web/.twins/`), updated from `/twin` and `/twin/update` answers, so viewing a twin or the people list costs no execution; it reads these only when it has no copy, through `readOnce`.


## Seats, avatars and colours
Every chair at the boardroom table is a seat: 9 in all. The panel is 1 to 6 people, one per seat, anywhere at the table.

| Seat | Where (VR world x, z) |
|---|---|
| 0 | Head of the table, facing the presenter (-4.53, -1.50) |
| 1, 2, 3, 4 | Wall side, from the head towards the presenter (-5.40; z -2.75, -3.80, -4.90, -6.02) |
| 5, 6, 7, 8 | Window side, from the head towards the presenter (-3.67; z -2.75, -3.80, -4.90, -6.02) |

`avatar` is one of the 11 Rocketbox business models: `business_female_01` to `business_female_04` and `business_male_01` to `business_male_07`. Each person has a different avatar; n8n picks one to fit `gender`, and the presenter can swap it.

`color` is 0 to 5, different for each person, so a person keeps their colour (on the web and on the VR nameplate) wherever they sit. Palette: 0 `#2a78d6`, 1 `#eb6834`, 2 `#c2378a`, 3 `#1baf7a`, 4 `#4a3aa7`, 5 `#008300`.

## POST `/panel`
Sent by the web client after the deck is uploaded. n8n reads the deck, the meeting email and its research, and proposes who will be in the room. The presenter edits the proposal before `/prep`.
```json
{
  "presenter": { "name": "string", "email": "string" },
  "deck": {
    "pdf_url": "string",
    "slide_image_urls": ["string"]
  },
  "prospect": {
    "company": "string",
    "website": "string",
    "context": "string"
  }
}
```
Field notes:
- `slide_image_urls`: rendered by the web client, one per slide, in order.
- `prospect.context`: a pasted meeting email or notes; optional, but it's where real attendees come from.

Response:
```json
{
  "draft_id": "string",
  "members": [
    {
      "id": "p1",
      "seat": 0,
      "color": 0,
      "role": "Chief Financial Officer",
      "role_short": "CFO",
      "display_name": "Rajiv Menon",
      "gender": "male | female",
      "avatar": "business_male_01",
      "why": "string",
      "source": "email | research | deck | typical"
    }
  ],
  "suggestions": [{ "role": "Head of IT Security", "role_short": "CISO", "why": "string" }]
}
```
Field notes:
- 4 to 6 `members`. The laptop puts them straight into the room, so the headset seats them while the presenter is still editing. `why` is shown to the presenter, e.g. "cc'd on the meeting email" or "deals this size go through central procurement".
- `source: email` means a real attendee named in `prospect.context`; their real name and title are used.
- `suggestions` are ranked roles not seated yet, offered when the presenter clicks an empty seat.

## POST `/deck-research` *(0.31, 0.32; 0.30 checked the deck's claims; was `/deck-review`, 0.26)*
Sent by the laptop when the presenter uploads a deck for a meeting (once per upload, in the background after the slides are converted). A deck is mostly about the presenter's own product, which no outside source has written about; what a well-read panel knows is the competition. So an n8n AI Agent reads the deck and searches Google News for who else already does what it pitches (*0.32:* it decides each search itself, reads the headlines and searches again when they're off, at most 3 searches), and keeps only the companies, products, programmes or labs the headlines show doing the same or nearly the same thing. The panel asks how the pitch is different from them, by name (`/prep`). Nothing about it is shown on a page; the dashboard's agent feed names them. It never checks the presenter's own claims or advises on the slides.
```json
{ "meeting_id": "string", "deck": { "name": "RouteIQ.pdf", "slides": [{ "index": 0, "text": "string" }] }, "presenter": { "offer": "string" }, "goal": "string" }
```
Response:
```json
{
  "about": "Route optimisation for mid-size fleets, pitched for a paid pilot.",
  "searched": [{ "query": "AI route optimisation logistics", "slide_index": 2, "found": 64 }],
  "others": [
    {
      "name": "string (who does the work, as the headline names them)",
      "what": "string (what the headline says they do)",
      "close": "same | near",
      "slide_index": 2,
      "question": "They already optimise routes for fleets like ours. What does yours do that theirs doesn't?",
      "sources": [{ "title": "string", "url": "string", "publisher": "Economic Times", "date": "2025-08-14" }]
    }
  ],
  "at": "2026-10-12T10:00:00Z"
}
```
Field notes:
- `searched`: each Google News search the agent ran (at most 3 since 0.32; six before), on the slide where a panel would bring the competition up, with how many headlines it returned.
- `others`: at most 4, those doing the same thing (`same`) first; usually 0 to 2, and an empty list is a normal answer. `near`: the same technology on the same kind of machine or user, or the same problem for the same user solved another way. Left out: the wider field, trend pieces and opinion, companies only investing or seeking partners, hobby projects, and the same technology in an unrelated field. `name` is who does the work, never the publisher: a Code node drops any whose name is its source's publisher, any citing no headline the agent's search tool returned (by the headline's id, 0.32), and repeats. `what` says only what the headline says. `question` is how a panel would put it; it is practice, never shown as a fact.
- n8n saves it on the meeting (the DryRun meetings table's `deck_research`). The next `/prep` gives each to the panel member who would care most, as a `research` objection on its slide; `/debrief` numbers their sources after the brief's, so a suggested answer in `owed` can cite them. The laptop keeps a copy per meeting (`web/.deck-research/`, never committed) to skip a deck it has already researched (the slides' text, hashed) and to name them in the agent feed. Reading it costs no execution.

## POST `/prep`
Sent by the laptop when the presenter confirms the panel ("Start the rehearsal"). n8n briefs the panel for this pitch: what each person cares about and will push on, how they behave, how the questions are spread over the time, and the lines it can voice ahead of time.
```json
{
  "draft_id": "string",
  "presenter": { "name": "string", "email": "string", "offer": "string" },
  "goal": { "text": "string", "source": "n8n | presenter" },
  "pitch_minutes": 5,
  "deck": {
    "name": "RouteIQ pitch.pptx",
    "slides": [{ "index": 0, "text": "string" }]
  },
  "prospect": { "company": "string", "website": "string", "context": "string" },
  "panel": [
    {
      "id": "p1",
      "seat": 0,
      "color": 0,
      "role": "Chief Financial Officer",
      "role_short": "CFO",
      "display_name": "Rajiv Menon",
      "gender": "male",
      "avatar": "business_male_01",
      "difficulty": 2
    }
  ]
}
```
Field notes:
- `draft_id` is the meeting's id, so n8n can find its brief, research and earlier rehearsals.
- `pitch_minutes` is how long the presenter means to pitch, set on the practice page (n8n's `proposal.pitch` suggestion unless changed). The questions come on top of it. `null` *(0.25)*: no time limit; n8n paces the slides at a natural speed and nobody keeps time.
- `deck` is `null` without a deck. Otherwise the laptop sends the text of each slide (extracted when the deck is converted), since n8n can't reach the laptop's files. Slide images stay on the laptop.
- `panel` is the proposal after the presenter's edits: moved, renamed, re-roled, re-faced, removed or added people. Everyone has a `seat`, `color` and `avatar`. Added people have an id from the client (`p7`, `p8`, …), no `gender`, and may have an empty `display_name`; n8n names them to fit their avatar.
- `difficulty` is 1 to 3, set per person by the presenter (default 2).
- `twin_email` *(0.27)*: a real attendee's address, when the panel member is someone DryRun may have a twin of (the laptop fills it in from the brief's attendees). n8n reads their twin from the DryRun people table: what they actually raised becomes objections (`source: "twin"`), their known preferences shape their manner and priorities, and the bundle's persona carries `twin_email` back. Practice roles never have one.
- `voices` (optional, default `true`): `false` leaves the `lines` without audio, for testing without spending TTS credits (the laptop sends it when `DRYRUN_VOICES=off`).
- `presenter.offer` *(0.26)*: what the presenter offers, in a line or two ("RouteIQ: route optimisation for logistics fleets"), set once on the web app (kept on the laptop); also sent with `/add-meeting`. `goal` *(0.26)*: what they want from this meeting, n8n's guess (`proposal.goal`) or their own; `null` if neither. n8n aims the objections at the ask, the chair's closing fits it, and the bundle carries both (`bundle.goal`, `bundle.offer`) so `/turn` and `/debrief` judge against them (did they make the ask clearly?).
- `cached_voices` *(0.26)*: every line the laptop already has voiced, by voice and text (`{ "priya": ["Mm-hm.", "Welcome, Aryan."] }`). n8n voices a line only when its voice and text aren't there, so the generic lines cost nothing after a voice's first rehearsal, and "Run it again" only voices the lines whose words changed. The laptop fills in `audio_url` for the rest from its copy.

The answer is streamed *(0.24)*, so the practice page can show what n8n is doing (one execution, as before). n8n sends JSON objects one after another, each `{ "type": "begin" | "item" | "end" | "error", "content": … }` (n8n's streaming format); each `item`'s `content` is one of these, as a JSON string or an object:
- after each stage, a progress chunk: `{ "progress": { "id": "gather" | "fallback" | "plan" | "voices", "detail": "string" } }`. The `gather` chunk (the first) also has `execution_id` and `workflow_id`, so the page can link to the run in n8n. `fallback` comes only when Gemini fails and Groq plans instead. `detail` is n8n's own summary (e.g. "7 objections, Priya chairs, 2 questions during the pitch and 3 after").
- last, the bundle below.
A progress chunk that fails never stops the run. The laptop also accepts the bundle as a plain JSON answer (before 0.24). It keeps the progress for the page (`GET /api/prep/progress?run=<id>`, laptop only, not in the room): its own steps (reading the deck, saving the voices) around n8n's.

Response (the last chunk):
```json
{
  "session_id": "string",
  "prospect": { "company": "string" },
  "pitch_seconds": 300,
  "time": { "limit_s": 300, "nudge_at_s": 300, "cut_at_s": 375, "why": "string" },
  "plan": {
    "during_pitch": 2,
    "after_pitch": 2,
    "why": "string",
    "interrupts": [{ "persona_id": "p3", "slide_index": 2, "after_s": 15, "about": "string" }]
  },
  "rescue_after_s": [3, 6, 10],
  "slides": [
    {
      "index": 0,
      "title": "string",
      "image_url": "string",
      "key_points": ["string"],
      "target_seconds": 60,
      "rescue": { "calm": "string", "keyword": "string", "bridge": "string" },
      "notes": "string | null"
    }
  ],
  "personas": [
    {
      "id": "p1",
      "seat": 0,
      "color": 0,
      "role": "Chief Financial Officer",
      "role_short": "CFO",
      "display_name": "string",
      "avatar": "business_male_01",
      "priorities": ["string"],
      "objections": [{ "slide_index": 2, "text": "string", "source": "deck|research|history|twin", "date": "2026-10-03", "from": "email of 3 Oct: Pilot proposal" }],
      "twin_email": "string",
      "difficulty": 1,
      "manner": "interrupts | waits",
      "chair": true,
      "voice": "string"
    }
  ],
  "lines": [
    { "id": "l1", "persona_id": "p1", "kind": "welcome | open_floor | acknowledge | time_nudge | time_up | rescue_question", "text": "string", "audio_base64": "string", "slide_index": 2 },
    { "id": "g-p1-3", "persona_id": "p1", "kind": "filler | thanks | park | move_on | hand_back | rescue_soft", "text": "Mm-hm.", "generic": true, "voice": "priya", "audio_base64": "string" }
  ],
  "drill": null
}
```
Field notes:
- `personas` are the confirmed panel. Every other field that names a person (`asked_by`, `persona_id`, `focus_persona`, the keys of `gaze_dwell_s`) uses `persona.id`.
- **Nothing here is fixed in code; n8n decides it for this meeting.** `plan` is how many questions n8n means to ask during the pitch and after it, with its reason, from the pitch length, the kind of meeting, the slides, each person's objections and difficulty, and weak spots from earlier rehearsals. `/turn` can change its mind as the pitch goes (time left, what's been covered).
- `pitch_seconds` is the pitch length; with no limit *(0.25)*, n8n's estimate of a natural length for this deck (the slides' `target_seconds` still add up to it).
- `time` *(0.25)*: how the chair keeps time, decided by n8n for this kind of meeting; `null` with no time limit (nobody keeps time, and the slides' times are only a guide). `nudge_at_s`: seconds into the session when the chair says time is nearly up (the `time_nudge` line). `cut_at_s`: when the chair stops the pitch and moves to the questions (the `time_up` line, then `pitch_end`); `0` when this chair lets the presenter finish. The client plays both at the presenter's next pause, from the lines voiced ahead of time, with nothing sent to n8n; only during the pitch, never while someone on the panel speaks, has a hand up or a turn is on its way, and never during the wrap-up countdown. *(0.35)* Both are measured on the pitch clock, which stops while a question during the pitch is asked and answered (from the question until the asker hands back), so interruptions don't eat the presenter's time. On the last slide there is no nudge and no `time_up` line: at the cut, the client ends the pitch at the presenter's next pause with a plain `pitch_end` (the chair opens the floor), since they are finishing anyway.
- `plan.interrupts` *(0.25)*: where n8n means to give someone the chance to interrupt mid-slide (*0.35*: about 2 for a pitch of 2 to 4 minutes when someone interrupts, on different slides between the title and the last, usually 5 to 20 s into the slide): `persona_id` (whose `manner` is `interrupts`), `slide_index` (0 without a deck), `after_s` (seconds of the presenter's speech on that slide before the hand could go up; without a deck, speech since the pitch began) and `about` (a few words). Nothing about time decides when the client sends a slide: it sends each slide whole when the presenter moves on, and mid-slide only at the next pause after an interruption point is reached (see `/turn`, `segment`). n8n still decides at that moment whether the hand goes up.
- `manner`: `interrupts` raises a hand during the pitch; `waits` keeps it for the questions. From the role and `difficulty`.
- `chair` is true for exactly one person, who welcomes the presenter, opens the floor and closes the meeting (usually the most senior person, at the head of the table).
- `voice` is the TTS voice for that person, chosen to fit their avatar.
- `slides` follow the deck (empty without one); `target_seconds` add up to `pitch_seconds`. `image_url` is left empty by n8n and filled in by the laptop with its path for that slide. `notes` is the talk track from the last debrief of this meeting (what to say, with the last run's mistakes fixed), shown on the confidence monitor's speaker view; `null` on a first rehearsal.
- *(0.20)* For a meeting rehearsed before, n8n reads its last debrief: each slide's `notes` is that run's talk track, a person whose topic is among its `weak_spots` gets an objection on it (`source: "history"`) and one more `difficulty` (at most 3), and `drill` is that run's drill.
- `rescue_after_s`: seconds of silence before the calm, keyword and bridge cues. n8n can shorten or lengthen them for a presenter who froze or didn't last time. *(0.26)* The room reacts too, from lines voiced ahead of time with nothing sent to n8n: at the second level the chair says `rescue_soft` ("Take your time."), and at the third the chair asks that slide's `rescue_question`. It's a real question: what the presenter says next goes to n8n as an `answer` with the chair's `asked_by`.
- *(0.26)* `generic` lines say nothing about the meeting, so they sound the same in any of them and are voiced once per voice: each person's `filler` sounds ("Mm-hm.", "Right."), `park`, `move_on` and `hand_back` lines, and the chair's `thanks` and `rescue_soft` ("Take your time."). n8n leaves `audio_base64` out of the ones in `cached_voices`; the laptop keeps each one's audio by its voice and text, and fills in `audio_url` from what it has. The client plays the asker's `filler` itself as soon as it sends an `answer` (a different one from last time), and the chair's `thanks` when it sends `pitch_end`, so the panel answers at once while n8n decides; one that hasn't started 1.5 s after the answer is dropped. `/turn` uses the `park`, `move_on` and `hand_back` lines for those reactions. `rescue_question` (one per slide, `slide_index`, by the chair) is written for this meeting from the slide's key point, to bring a presenter who froze back in (see `rescue_after_s`).
- `lines` are short lines voiced ahead of time, written for this meeting and this presenter (e.g. the chair's welcome, opening the floor, a few acknowledgements per person), so the common reactions play without waiting for a voice. With a time limit *(0.25)*, the chair also has a `time_nudge` and, when `time.cut_at_s` is set, a `time_up` line, which the client plays itself (above). The laptop saves each `audio_base64` as WAV and puts `audio_url` (`/api/audio/<id>.wav`) in its place in the room's bundle.
- *(0.27)* An objection with `source: "twin"` is something that real person actually raised, from a connected fact of their twin, with the source's `date` and `from` (a short label), so the practice table can say "From their twin" and "from your email of 3 Oct". Readings can shape a twin seat's `manner` and `priorities` but never become objections. `twin_email` is echoed from the request.
- `difficulty` is an integer from 1 to 3; weak spots from earlier sessions can raise it.
- `drill` holds a drill from an earlier session if one exists.

## POST `/turn`
Sent each time the presenter has said something the panel might react to. The headset posts it to the laptop's `/api/turn`; the laptop adds the session's context and forwards it to n8n, which decides every reaction: who speaks, what they say and why. n8n keeps no state between turns.

Headset to laptop:
```json
{
  "session_id": "string",
  "mode": "opening | segment | answer | pitch_end",
  "slide_index": 2,
  "t": 143.2,
  "audio_wav_base64": "string",
  "asked_by": "p1",
  "mid_slide": false,
  "time_up": false,
  "pause": false,
  "floor_opened": false,
  "replaces_t": 177.5
}
```
Field notes:
- `opening`: the presenter's first words, up to their first pause. n8n decides whether that was an introduction or a greeting that deserves a welcome, or the pitch itself (then nobody says anything).
- `segment`: what they said on one slide, sent when they change slide, however long they spent on it *(0.25)*. Also sent mid-slide, with `mid_slide: true`, at the next pause once the presenter has said `after_s` seconds on a slide that has an entry in the bundle's `plan.interrupts` (once per entry), so that person can raise a hand in time. A slide recorded for over 5 minutes is also sent at the next pause (only so each upload stays small). Before 0.25 a slide past its `target_seconds` was sent at every pause.
- `answer`: their answer to a question; `asked_by` is who asked (only sent with `answer`).
- `replaces_t` *(0.34)*: an answer that carries on the previous one. The presenter paused to think, the client sent what they had said, and they carried on before any of the panel's reactions to it began (a filler doesn't count). The client drops that turn's reactions, and sends the whole answer again (the earlier audio, then the rest) with `replaces_t` set to the earlier turn's `t`. The laptop removes that turn from `live.feed` (so its threads changes are undone) and never logs it if n8n answers it late; n8n judges the whole answer. Only with `answer`.
- `pause: true` *(0.34)*: a `segment` sent at a pause near the end of the pitch (the last slide, no deck, or past 60% of the pitch length), so n8n can hear the presenter say they've finished ("that's all from me", "happy to take questions") on any slide. Its audio is everything said on the slide so far, copied, not taken: the slide is still sent whole when the presenter moves on. Once per pause, with at least a second of new speech since the last one. n8n checks the words for a finish without the model; *(0.35)* on the last slide, words that don't settle it go to the model, which only decides whether the presenter finished (about 1.5 s more). If it hears one, the reply has `pitch_over: true` and the chair's `open_floor` line (voiced ahead of time), and the client plays it and sends `pitch_end` with `floor_opened: true`; otherwise no reactions, and the laptop doesn't log it in `live.feed` (the slide's segment will carry the words).
- `floor_opened: true` *(0.34)*: on `pitch_end`, the chair has already opened the floor (after a `pause` reply with `pitch_over`), so n8n goes straight to the first question, as after `time_up`.
- `pitch_end`: what they said on the last slide, once they go quiet there. This moves the session to the questions (before 0.18 the session ended there). `time_up: true` *(0.25)*: the chair stopped the pitch for time with the `time_up` line, so n8n doesn't open the floor again and goes straight to the first question. The laptop keeps `time_up` on the turn in `live.feed`.

Laptop to n8n: the same, except the audio is compressed (`audio_wav_base64` becomes `audio_base64` with `"audio_format": "m4a"`, or `"wav"` if compressing failed), plus `context`:
```json
{
  "context": {
    "bundle": {},
    "elapsed_s": 143.2,
    "turns": [
      {
        "mode": "segment",
        "slide_index": 1,
        "t": 80.1,
        "transcript": "string",
        "reactions": [{ "persona_id": "p1", "kind": "question", "text": "string", "thread_id": "q1" }],
        "answer_verdict": null,
        "threads": []
      }
    ],
    "threads": [{ "id": "q1", "persona_id": "p3", "text": "string", "slide_index": 2, "status": "open | followed_up | answered | parked | dodged", "follow_ups": 0, "planned": false }],
    "pending": [{ "persona_id": "p3", "text": "string", "slide_index": 2 }]
  }
}
```
- `bundle` is the `/prep` response without audio. `turns` are this run's earlier turns, oldest first (the room's `live.feed`).
- `threads` *(0.26)*: every question asked so far, with its life: `open` (asked, or a hand that went down unasked), `followed_up` (one follow-up asked), then closed for good: `answered`, `parked` (the presenter said they don't know or will come back, and the asker accepted it) or `dodged` (no real answer after the follow-up). The laptop keeps them from n8n's replies (each turn in `live.feed` carries its `threads` changes) and sends them back, so n8n stays stateless. n8n never asks a closed thread again, nor anything close to it, and asks at most one follow-up per thread. An `answer` answers `asked_by`'s latest open thread.
- `pending` are questions nobody has answered yet: the laptop counts a question as pending until an `answer` with that person's `asked_by` arrives, so a hand that went down because the presenter talked on stays pending, and n8n can bring it back in the questions ("Earlier I wanted to ask…"). Kept for one version after 0.26 for older workflows; `threads` replaces it.

Response, n8n to laptop:
```json
{
  "transcript": "string",
  "note": "string",
  "reactions": [
    {
      "persona_id": "p1",
      "kind": "welcome | question | follow_up | acknowledge | park | move_on | hand_back | open_floor | closing",
      "text": "string",
      "line_id": "string",
      "audio_base64": "string",
      "raise_hand": true,
      "reason": "string",
      "thread_id": "q1"
    }
  ],
  "answer_verdict": "resolved | partial | dodged | null",
  "threads": [{ "id": "q1", "persona_id": "p3", "text": "string", "slide_index": 2, "status": "parked", "follow_ups": 1, "planned": false }],
  "end_session": false,
  "pitch_over": false
}
```
Field notes:
- `pitch_over` *(0.34)*: only on a `pause` segment: n8n heard the presenter finish the pitch. The client moves to the questions (see `pause`).
- `transcript` is what the presenter said in this turn. The laptop keeps it per slide for the debrief.
- `note` is n8n's one-line reading of the turn, also when nobody reacts (e.g. "You put a number on the savings, so Rajiv held his cost question"). The dashboard's live feed shows it.
- `reactions` is empty when nobody reacts, which is most turns. Several play in order (the chair opens the floor, then hands over to whoever asks first).
- `line_id` names one of the bundle's `lines`, played instead of new audio (then `audio_base64` is absent). Otherwise `audio_base64` is the line voiced now with the persona's `voice`.
- `raise_hand`: the person raises a hand and waits for the presenter to pause before speaking (a question during the pitch). Otherwise they speak at the presenter's next pause.
- `reason` explains why n8n chose this person and line. It's shown in the debrief and the live feed.
- `answer_verdict` is only set when `mode` is `answer`.
- `threads` *(0.26)*: the threads this turn opened or changed, whole; the laptop replaces each by `id`. `thread_id` on a reaction names the thread it belongs to (a question's own thread, or the one being answered for a follow-up, park, move-on or hand-back).
- *(0.26)* When n8n's rules would drop any question anyway (a `segment` on the title slide, with too few words, or with nobody on the panel who interrupts), the turn skips the model: no reactions, and a `note` saying why. *(0.35)* The same for a `segment` on the deck's last slide: questions there wait for the floor.
- *(0.35)* A `segment` can get one brief `acknowledge` instead of a question when a point landed (a line voiced in prep, or a few new words such as "Isolation forest, good choice."): never with a question, never mid-slide, never on two slides running. It plays at the presenter's next pause, like any reaction. At a planned interruption point the panelist asks unless the presenter already answered it.
- `park`, `move_on`, `hand_back` *(0.26)*: the asker accepts "I don't know" ("That's fine, send it to us after."), lets a dodged question go ("Okay, let's leave that there."), or hands back to the pitch after a question during it ("Thanks, please go on."). Played like any other reaction.
- n8n holds its own reactions to the rules after the model *(0.26)*, in a Code node: `open_floor` only on `pitch_end`, `closing` only after the pitch; *(0.34)* `hand_back` only during the pitch and never in a reply that asks something; an answer with no open thread of `asked_by`'s gets no follow-up, park or move-on, and no new question while someone else's question still waits for its answer; during the pitch a question only from someone whose `manner` is `interrupts`, and only when the presenter said enough on the slide (about 12 words, fewer at an interruption point); after a question during the pitch is closed, the asker hands back; after the pitch, if the model's next question was dropped, the next open thread or an unasked objection is asked instead, or the chair closes.
- `end_session`: the reactions end with the chair's closing; the headset ends the session (`POST /api/room/session` `end`) once they finish playing.

Laptop to headset: the same, with each `audio_base64` saved on the laptop as WAV and replaced by `audio_url`, and each `line_id` resolved to that line's `audio_url`. The laptop also adds the turn to the room's live feed.

How turns are taken (the headset's rules; what is said is always n8n's):
- It stops recording while anyone on the panel speaks, so their voices aren't heard as the presenter.
- It drops reactions that arrive too late: a welcome once the presenter has carried on pitching, a reaction to a slide once they are two slides on. *(0.34)* A question or follow-up decided before another question was asked (one turn's reply landing after the next one's) is dropped too: one question waits for its answer at a time.
- An answer ends at a pause of about 1.6 s; if the presenter carries on before the panel reacts, the answer is sent again whole (`replaces_t`, above), so a pause to think doesn't cut them off.
- A raised hand waits for the presenter's pause. *(0.34)* If they talk on for 6 s of speech with the hand up, that person cuts in at their next breath, as people do. It goes down after 15 s if it still can't; the question stays in `pending` (above).
- *(0.34)* The chair's spoken rescue ("Take your time", then the way-back-in question) comes at most once per slide and not within 30 s of the last one, never while a turn is on its way; the monitor's cues still show.
- If `/api/turn` fails or takes longer than 15 s, nobody reacts and the pitch goes on. If a `pitch_end` fails, the session ends as it did before 0.18.

## POST `/debrief`
Sent when the session ends. The headset posts what only it knows to the laptop's `/api/debrief` (before it ends the session); the laptop adds the turns it logged and the slide changes it saw, and forwards everything to n8n.

Headset (or browser) to laptop:
```json
{
  "session_id": "string",
  "client": "vr | web",
  "duration_s": 512.4,
  "events": [
    { "t": 12.0, "type": "slide", "slide_index": 1 },
    { "t": 80.5, "type": "silence", "duration_s": 6.2, "rescue_level": 2 }
  ],
  "gaze_dwell_s": { "p1": 120.4, "p2": 88.0, "p3": 15.2, "p4": 40.1, "p5": 9.8 },
  "facing_slides_s": 38.5
}
```
Laptop to n8n: the same, plus `bundle` (without audio), `meeting_id` (the meeting the panel was briefed for, the `/prep` `draft_id`), `owner_email` (where the report goes) and `presenter`, and `events` gains the turns (`/turn` requests and responses as they happened, with transcripts and n8n's `note`) *(0.20)* and the slide changes the laptop saw, from `{ "t": 0, "type": "slide", "slide_index": 0 }` at the start:
```json
{ "t": 143.2, "type": "turn", "mode": "segment", "slide_index": 2, "transcript": "string", "note": "string", "reactions": [], "answer_verdict": null }
```
The laptop sends it as soon as the session ends, whoever ended it, with the headset's telemetry if it arrived first (so the headset posts `/api/debrief` before it ends the session; it sends none yet). `session_id` is the run's id (the room's `debrief.run_id`). Without a briefed panel or any turns there's nothing to debrief and nothing is sent.
Field notes:
- `rescue_level` is 1 for calm, 2 for keyword and 3 for bridge.
- *(0.26)* Events also include `{ "t", "type": "rescue", "level": 2 | 3, "line_id" }` (the chair spoke during a freeze: "Take your time" or the way-back-in question) from the rehearsing client, and `{ "t", "type": "turn_failed", "mode" }` from the laptop (a turn n8n didn't answer).
- *(0.23)* The browser rehearsal page sends this too, with `client: "web"` and its silences (`{ t, type: "silence", duration_s, rescue_level }`), before it ends the session. It has no `gaze_dwell_s` or `facing_slides_s`.
- `gaze_dwell_s` *(VR)*: seconds the presenter's head faced each person. The Quest 3S has no eye tracking, so this is head direction, shown as "Who you faced", never as eye contact. `facing_slides_s` *(VR)*: seconds they spent turned to the TV behind them.

n8n works through the debrief, saving its progress and the result to the **DryRun sessions** data table after each step (read with `GET /session`), and answers when it's done (about 20–40 s) with the whole session record, the same as `GET /session` *(0.20: before, it answered at once with `{ "accepted": true }`)*. *(0.26)* The answer is streamed like `/prep`'s: n8n's `{ type, content }` objects, each `item` a progress chunk `{ "debrief_status": { "done": false, "steps": [] } }` after each step, then the session record last. The laptop shows the steps as they arrive (before 0.26 it read `GET /session` every few seconds, which still works with a workflow that doesn't stream), and keeps the finished record, so a report opened later costs no n8n call. n8n also emails the report, marks the meeting `practised`, and keeps the weak spots and each slide's `notes` for that meeting's next `/prep`. The headset's `/api/debrief` is answered at once by the laptop with `{ "accepted": true }`. The result (`debrief`):
```json
{
  "headline": "string",
  "overall": 74,
  "previous_overall": 65,
  "stakeholders": [
    {
      "persona_id": "p1",
      "stance": "backs | undecided | opposes",
      "reason": "string",
      "deciding_moment": { "t": 151.0, "slide_index": 2, "quote": "string" }
    }
  ],
  "metrics": [
    {
      "name": "objection_handling",
      "score": 61,
      "explanation": "string",
      "evidence": [{ "t": 143.2, "slide_index": 2, "quote": "string" }]
    }
  ],
  "slides": [
    {
      "index": 2,
      "transcript": "string",
      "seconds": 100,
      "target_seconds": 45,
      "words_per_minute": 182,
      "covered": ["string"],
      "missed": ["string"],
      "marks": [
        { "quote": "string", "kind": "filler | hedge | unsupported | wrong_fact | dodged | landed", "note": "string", "better": "string" }
      ],
      "notes": "string"
    }
  ],
  "facing": {
    "slides_s": 38.5,
    "longest_gap": { "persona_id": "p3", "seconds": 90, "from_slide": 2, "to_slide": 4 }
  },
  "drill": { "title": "string", "focus_persona": "p1", "slides": [2, 4], "minutes": 3 },
  "weak_spots": ["string"],
  "owed": [
    {
      "thread_id": "q2",
      "persona_id": "p1",
      "question": "string",
      "said": "string",
      "status": "parked | dodged | partial",
      "suggested": "string",
      "confirm": "string",
      "sources": [{ "title": "string", "url": "string" }]
    }
  ],
  "trouble": [{ "t": 19.2, "kind": "garbled | cut_short | turn_failed", "note": "string" }],
  "pitch": { "seconds": 92, "words": 210, "scored": true },
  "actions_taken": ["report_emailed", "drill_scheduled", "weak_spots_saved", "answers_drafted"]
}
```
Field notes:
- `previous_overall` is `null` on a first session. `deciding_moment` may be `null`.
- `slides` is the transcript slide by slide, for the report. `seconds`, `words_per_minute` and filler marks are counted by a Code node (the same input always gives the same numbers); `covered`, `missed` (the slide's key points) and the other marks are the model's judgement. Each mark's `quote` is copied exactly from `transcript`, so the report can underline it; `better` is a way to say it instead (empty for `landed`). `notes` is the talk track for next time, which the next `/prep` returns as the slide's `notes`.
- `metrics` *(0.20)*: `Clarity`, `Evidence`, `Objection handling` and `Structure` are the model's, with quotes as evidence; `Pacing` is counted from the time on each slide against its target. `overall` is their average. `name` is shown as is.
- `weak_spots` *(0.20)*: what to press on next time, in a few words each; the next `/prep` for the meeting raises those topics.
- *(0.26)* **A fair report.** `seconds` and `words_per_minute` count only the presenter's pitch: each exchange during the pitch (from the question to the end of its answer) is taken out of the slide it happened on. `pitch` is the pitch time and words counted that way. Under about 45 s of pitch or 60 words, `scored` is `false`: `overall` and every metric's `score` are `null`, the headline says so ("Too short to score: 0:19 of pitch. Try a 2-minute run."), and the talk tracks and weak spots are still given. `trouble` lists what went wrong on the system's side, found by a Code node and given to the model to discount, never to judge: a transcript that looks mis-heard (`garbled`: short and sharing no words with the slide, the question or the deck), the panel cutting the pitch short (`cut_short`: a question or the floor opened before the presenter said about 30 words) and turns that failed (`turn_failed`, from the laptop). The model never marks a quote from a garbled transcript, at most one `landed` mark per slide, and only for a specific claim, number or answer.
- `owed` *(0.26)*: the questions the presenter couldn't answer (threads `parked` or `dodged`, and answers judged `partial`), each with what they said, a suggested answer in their voice (3 to 5 sentences) drafted from the deck, the research in the brief and their own words, what they must `confirm` themselves (n8n never invents facts about their product), and the brief's sources it used. The report shows them as "Questions you owe them", the email leads with them, and the next `/prep` asks them again, early (as `history` objections).
- `facing` *(VR)* is `null` without `gaze_dwell_s`. A person's share of the presenter's attention can count towards their stance, and the `reason` then says so.

## GET `/status?session_id=`
The web client polls this while Prep runs, to show the agent's progress.
```json
{
  "done": false,
  "steps": [
    {
      "id": "research",
      "label": "Researching Kaveri Freight",
      "state": "pending | running | done | error",
      "detail": "6 sources",
      "sources": [{ "title": "string", "url": "string" }]
    }
  ]
}
```

## GET `/session?session_id=`
Everything the web dashboard and report need for one session, from the **DryRun sessions** data table.
```json
{
  "bundle": {},
  "status": {},
  "telemetry": {},
  "debrief_status": {},
  "debrief": {},
  "history": [{ "session_id": "string", "at": "2026-10-10T19:12:00+05:30", "overall": 65 }]
}
```
Field notes:
- `bundle` is the `/prep` response (without audio), `status` is the `GET /status` response, `telemetry` is the `/debrief` request and `debrief` is the `/debrief` result.
- `debrief_status` has the same shape as `status`: n8n's steps through the debrief (e.g. "Read the transcript", "Scored 4 answers", "Emailed the report", "Put a drill on your calendar"), saved after each one. The dashboard polls it once the session ends and shows the steps until `debrief` arrives.
- `telemetry`, `debrief_status` and `debrief` are `null` until the session has been rehearsed.
- `history` lists this presenter's earlier sessions for the same meeting, oldest first.
- Answers `404` for a session n8n doesn't have *(0.20)*.

## Finding the laptop
The headset tries, in order, until one answers:
1. **Wi-Fi:** it broadcasts the UDP message `DRYRUN?` to port 47777 on the local network. The web app answers the sender with `DRYRUN <port>` (e.g. `DRYRUN 3000`), and the headset uses `http://<laptop's address>:<port>`. Needs the laptop and headset on the same network, one that lets devices reach each other (a phone hotspot does).
2. **USB:** `http://localhost:3000`, which reaches the laptop through `adb reverse tcp:3000 tcp:3000` (`npm run quest` sets it up).
It keeps looking for Wi-Fi while on USB, and switches over when Wi-Fi answers.

## Room API (laptop)
Served by the web app on the laptop. There is one room; no ids or codes.

### GET `/api/room?since=<version>`
Long poll: answers as soon as the room's `version` is greater than `since`, or after 25 s with the unchanged room. The headset keeps one of these open at all times, so a change on the web reaches it in about 100 ms. Omit `since` to get the room straight away. The headset adds `client=headset&via=wifi|usb`, which shows it as connected, and how, on the practice page.
```json
{
  "version": 12,
  "phase": "empty | drafting | briefed | live | done",
  "prospect": { "company": "string" },
  "panel": [
    { "id": "p1", "seat": 0, "color": 0, "role": "string", "role_short": "string", "display_name": "string", "avatar": "business_male_01" }
  ],
  "bundle": {},
  "session_id": "string",
  "name_cards": false,
  "live": {
    "started_at": "2026-10-16T15:02:10.000Z",
    "started_by": "headset | web",
    "ended_at": null,
    "ended_by": null,
    "stage": "opening | pitch | questions | closing",
    "now": { "speaking": "p2", "hands": ["p3"] },
    "thinking": [{ "id": "string", "mode": "opening | segment | answer | pitch_end", "slide_index": 2, "t": 143.2, "asked_by": "p1" }],
    "feed": [{ "t": 80.1, "mode": "segment", "slide_index": 1, "transcript": "string", "note": "string", "reactions": [{ "persona_id": "p1", "kind": "question", "text": "string", "raise_hand": true, "reason": "string" }] }]
  },
  "deck": {
    "id": "d1760112345-ab12",
    "name": "RouteIQ pitch.pptx",
    "slides": [{ "index": 0, "image_url": "/api/deck/d1760112345-ab12/1.jpg", "width": 1920, "height": 1080 }]
  },
  "slide": 0,
  "height_offset": 0,
  "pitch_minutes": 5,
  "rehearse_in": "vr | browser",
  "debrief": { "run_id": "string", "state": "running | done | failed | skipped", "steps": [], "error": null, "overall": 63, "headline": "string" }
}
```
Field notes:
- `panel` is who sits where, always. The headset seats exactly these people (fading avatars in, out, or to their new chair) in every phase, including while the presenter is still editing (`drafting`).
- `bundle` is the `/prep` response once the panel is briefed, otherwise `null`. The headset loads slides and rescue cues from it.
- `session_id` is the session being briefed or rehearsed, `null` before that.
- `phase`: `briefed` means the panel is seated and waiting for the presenter; `live` from the moment the session starts; `done` once it ends.
- `live` is `null` until a session starts. It is cleared when a new panel is briefed or the session is restarted.
- `live.thinking` *(0.19)* is each turn the laptop has sent to n8n and is still waiting on (usually none or one), so the dashboard can show n8n at work during the few seconds a turn takes. The laptop adds one when a turn arrives and removes it when n8n answers or fails; `asked_by` only with an answer.
- `live.now` *(0.23)*: who on the panel is speaking and who has a hand up right now, for the dashboard's live room plan. Set by the rehearsing client with `POST /api/room/now`; missing until it first does, and cleared when the session ends.
- `live.stage` and `live.feed` *(0.18)* are kept by the laptop from the turns it forwards: `opening` until the first `segment`, `pitch` until a `pitch_end`, then `questions`, and `closing` once a reaction is the chair's closing. `feed` is every turn so far with n8n's `note` and reasons, for the dashboard; it has no audio.
- `bundle.lines[].audio_url` and every `audio_url` the headset gets are paths on the laptop (`GET /api/audio/<id>.wav`).
- `name_cards`: whether the headset shows a tent card (name, role, colour) on the table in front of each person. Off unless switched on from the web.
- `deck` is the presenter's slides, `null` until one is uploaded. The laptop turns the upload into one JPEG per slide (at most 1920 px on the long side) and serves them itself: `image_url` is a path on the laptop, so the headset prefixes the laptop address it already uses. A new deck gets a new `id`, so a headset can keep images it already has for an `id`. Seating a different meeting's panel clears it.
- `slide` is the slide on screen, from 0. It goes back to 0 when a session starts or restarts, and when a deck is uploaded.
- `debrief` *(0.20)*: the debrief of the run that just ended, `null` until a session ends (and again once one starts or restarts). `run_id` is that run's session id for `/debrief`, `GET /session` and the report (`/s/<run_id>/report`): the bundle's `session_id` plus the run's start time, so each run of the same panel gets its own report. `steps` are n8n's `debrief_status.steps` as the laptop last read them. `skipped` when there was nothing to debrief (no turns), `failed` with `error` when n8n failed. `overall` and `headline` are the debrief's, once `done`. `POST /api/room/debrief` (web) tries a failed debrief again.
- `rehearse_in` *(0.23)*: where the presenter rehearses this panel, `"vr"` (the headset, the default, and for rooms saved before 0.23) or `"browser"` (the web app's rehearsal page, `/s/<session_id>/rehearse`). Set when the panel is briefed. **When it's `"browser"`, the headset** keeps seating the panel and showing slides, but doesn't start the session on speech or A, doesn't record or take turns, and its monitor says "Rehearsing in the browser". The browser page, when it's `"vr"`, offers "Rehearse here instead", which sets it to `"browser"`.
- `pitch_minutes` *(0.18)*: how long the presenter means to pitch, sent to `/prep`. Set on the practice page; it starts at n8n's suggestion (`proposal.pitch.minutes`), or 5 without one. `null` *(0.25)*: no time limit.
- `height_offset` raises (or, if negative, lowers) the presenter's eyes in VR, in metres from -0.5 to 0.5, to the centimetre; 0 unless moved on the web. It's for when the headset's floor is off. The headset eases to it and keeps it after teleporting.
- When the deck is converted, the laptop also extracts each slide's text, which it sends to `/prep` (not in the room).

### PUT `/api/room/panel`
Web only: saves the presenter's edits while drafting. Body: `{ "panel": [...] }` (the same items as `/prep`'s `panel`). Bumps `version`.

### PUT `/api/room/settings`
Web only. Body: `{ "name_cards": true, "height_offset": 0.12, "pitch_minutes": 5, "rehearse_in": "browser" }`, any of them. `pitch_minutes` is a whole number from 1 to 60, or `null` for no time limit *(0.25)*, allowed only before the panel is briefed. `rehearse_in` *(0.23)* is `"vr"` or `"browser"`, allowed while `briefed` or `done` (`409` otherwise). `height_offset` is clamped to -0.5 to 0.5 and rounded to the centimetre; the web sends it several times a second while its height bar is dragged. Answers with the room, or `400` with `{ "error": "string" }`. Bumps `version`.

### POST `/api/room/deck`
Web only: uploads the presenter's deck. Body: `multipart/form-data` with one `file`: a PDF, PowerPoint (`.pptx`, `.ppt`) or Keynote (`.key`) file, up to 100 MB. The laptop converts it (PowerPoint and Keynote through LibreOffice, then every format through Ghostscript), which takes a few seconds, and answers with the room. Errors answer `400` (wrong type, empty, unreadable) or `500` (conversion failed) with `{ "error": "string" }`. Bumps `version`.

### DELETE `/api/room/deck`
Web only: removes the deck (`deck` becomes `null`). Answers with the room. Bumps `version`.

### GET `/api/deck/<id>/<n>.jpg`
One slide image, `n` from 1. Never changes for a given `id`, so it can be cached.

### POST `/api/room/slide`
Changes the slide on screen. Sent by the headset (with hands, a quick pinch, right hand next, left hand back; with controllers, right trigger next, left trigger back) or the web (the practice page and the dashboard).
```json
{ "index": 3, "by": "headset | web" }
```
- `index` is clamped to the deck. Allowed in every phase; answers `409` with `{ "error": "string", "room": {} }` when there's no deck.
- The answer is the room. Bumps `version`. The headset shows the new slide at once, before the laptop answers.

### POST `/api/room/session`
Starts, ends or restarts the rehearsal. Sent by the headset (when the presenter starts speaking, or A and B with controllers, to start, end and go again) or by the web dashboard's Start, End and Run it again buttons.
```json
{ "action": "start | end | restart", "by": "headset | web" }
```
- `start` is allowed in `briefed` and moves to `live` (back to the first slide); `end` is allowed in `live` and moves to `done`; `restart` is allowed in `done` and moves back to `briefed` with the same panel, clearing `live`. Anything else answers `409` with `{ "error": "string", "room": {} }`, so a second "start" (e.g. the headset and the web at once) changes nothing.
- The answer is the room. Bumps `version`.

### POST `/api/room/now` *(0.23)*
Who on the panel is speaking and who has a hand up, from the client that's rehearsing (the browser; optional for the headset). Sent only when it changes (a few times a minute, not per frame).
```json
{ "speaking": "p2", "hands": ["p3"], "by": "web | headset" }
```
- `speaking` is a persona id or `null`; `hands` lists persona ids (empty when no hand is up). Ids not on the panel answer `400`.
- Allowed only while `live`; otherwise `409` with `{ "error": "string" }`.
- Answers `{ "ok": true }` and sets `live.now`. Bumps `version`.

### Headset view (`ws://<laptop>:3001/view`)
What the presenter sees, live on the dashboard. The web app runs a WebSocket relay on its own port, **3001** (`web/src/lib/headset/relay.ts`), so a megabyte or two of video a second never queues ahead of the room's long poll. The headset connects to the laptop address it already uses (above), with port 3001; over USB, `npm run quest` also runs `adb reverse tcp:3001 tcp:3001`.
- Connect with `/view?role=headset|viewer&session=room`. There is one headset, so the session is always `room`.
- **Binary messages** (headset → relay → viewers, passed on byte for byte): byte 0 is `1` (the format), byte 1 has bit 0 set on a keyframe, bytes 2–5 are the capture time in ms (uint32 big-endian), and the rest is one H.264 access unit, Annex B. Every keyframe carries its SPS and PPS, so a viewer can start at any keyframe.
- **Text messages** (JSON). Relay → headset: `{"type":"start"}` when someone starts watching, `{"type":"stop"}` when the last viewer leaves (the headset only renders and encodes in between), and `{"type":"keyframe"}`. Relay → viewer: `{"type":"state","headset":true|false}`. Headset → relay: `{"type":"stats","appFps":72,"takenFps":30,"sentFps":30,"skippedReadback":0,"skippedEncoder":0,"encodeMs":1.2}` once a second, which viewers get as is (numbers and booleans only). Viewer → relay: `{"type":"keyframe"}`. Either end: `{"type":"join","session":"<id>"}`.
- One headset per session (the newest connection wins). A viewer that falls behind skips to the next keyframe instead of getting a backlog.
- `GET http://<laptop>:3001/status` answers `[{ "session": "room", "headset": true, "viewers": 1 }]`.
- The browser decodes with WebCodecs, which needs a secure page: open the dashboard at `localhost` (or https).

### POST `/api/turn` and `/api/debrief`
The headset's side of `/turn` and `/debrief` (above). The laptop adds the context, forwards to n8n, saves any audio and answers with `audio_url`s. `/api/turn` keeps the turn in `live.feed`; `/api/debrief` answers `{ "accepted": true }` and the debrief then follows `GET /session`.

### GET `/api/audio/<id>.wav`
A voice line n8n generated (a `/prep` line or a `/turn` reaction), saved by the laptop. Never changes for a given `id`, so it can be cached.

## Open questions
- Voices are Sarvam's (`bulbul:v3`, `en-IN`, 22,050 Hz 16-bit mono WAV); `voice` is a Sarvam speaker name. A fallback when Sarvam fails or its credits run out (Gemini TTS) isn't decided.
- `/panel` isn't built: the practice panel comes from meeting prep (`proposal`). If it is built, its `deck` should be the same as `/prep`'s (slide text, not URLs).

## Changelog
- 0.1 (10 Oct): first draft.
- 0.2 (10 Oct): `/debrief` response gains `headline`, `previous_overall` and `stakeholders`; `turn` events gain `mode` and `asked_by`; slides gain `title`; the bundle echoes `prospect.company`; new `GET /status` and `GET /session`.
- 0.3 (10 Oct): `GET /session` includes `status`; `telemetry` and `debrief` are `null` before a rehearsal.
- 0.4 (10 Oct): the panel is no longer five fixed roles. New `POST /panel` proposes 4 to 6 people (with `why`) and suggestions; `/prep` takes the edited panel. Personas gain `seat`, `role`, `role_short` and `avatar`, and ids are per-panel (`p1`, …). New Seats and avatars section.
- 0.5 (10 Oct): one headset, one room, the laptop is the hub. No join code (`join_code` and `GET /bundle` removed): the headset reaches the laptop at `localhost:3000/api` via `adb reverse` and follows `GET /api/room`. All 9 chairs are seats (0 to 8), up to 6 people placed anywhere; people gain `color` (0 to 5); the avatar pool is the 11 Rocketbox business models. Fixed the window and wall sides in the seat table.
- 0.6 (10 Oct): the headset finds the laptop over Wi-Fi (UDP `DRYRUN?` broadcast on port 47777, answered with `DRYRUN <port>`), with USB (`adb reverse`) as the fallback; the room poll gains `via=wifi|usb`.
- 0.7 (10 Oct): the head seat moved to the chair's real centre (-4.53, -1.50); the room gains `name_cards` (off by default) and `PUT /api/room/settings`.
- 0.8 (10 Oct): meetings and briefs. n8n watches Google Calendar, decides which meetings to prepare, researches them, writes a brief and proposes the panel; new `GET /meetings` and `GET /meeting`.
- 0.9 (10 Oct): the brief only states facts: `brief.people` becomes `brief.attendees` (real attendees only, role only if stated); hypothetical roles live only in the practice panel (`proposal.members` with `source: "typical"`). `/add-meeting` takes an optional `id`.
- 0.10 (10 Oct): the session lifecycle. `phase` goes `briefed` (waiting) → `live` → `done`; the room gains `live` (who started and ended it, and when); new `POST /api/room/session` to start and end it, from the headset or the web.
- 0.11 (10 Oct): the headset view. A WebSocket relay on the laptop's port 3001 (`/view`) carries the headset's H.264 view to the dashboard, and the headset encodes only while someone watches.
- 0.12 (10 Oct): meetings report live progress (`progress`, `started_at`, `run`) and can be `failed`. Research reads Google News and the company website instead of the model's own web search.
- 0.13 (10 Oct): `POST /api/room/session` gains `restart` (`done` → `briefed`, same panel), so the presenter can go again without re-briefing.
- 0.14 (10 Oct): the deck. The room gains `deck` (slide images converted and served by the laptop) and `slide` (the slide on screen); new `POST`/`DELETE /api/room/deck`, `GET /api/deck/<id>/<n>.jpg` and `POST /api/room/slide`.
- 0.15 (11 Oct): meetings n8n decides not to prepare are kept with `status: "skipped"` and the reason in `why`, so the presenter can prepare them anyway (`POST /add-meeting` with the same `id`).
- 0.16 (11 Oct): the room gains `height_offset` (the presenter's eye height in VR, set from the web), and `PUT /api/room/settings` takes it. The headset works without controllers: thumb microgestures change slides and start, end and restart the session.
- 0.17 (11 Oct): no JSON change. With hands, the headset changes slides on a quick pinch (right hand next, left hand back) instead of thumb swipes; hands have no session gesture (the double thumb tap is gone).
- 0.18 (11 Oct): the rehearsal becomes a meeting. Nothing about the conversation is fixed in code: `/prep` takes `pitch_minutes` and the deck's slide text, and returns n8n's `plan` (how many questions, when), each person's `manner`, the `chair`, rescue timings, the last run's `notes` per slide and `lines` voiced ahead of time. `/turn` gains the modes `opening` and `pitch_end` (`slide_end` becomes `segment`), the laptop adds `context` (bundle, turns, pending questions), and the response has `reactions` (several, with `raise_hand` and `line_id`), `note` and `end_session`. Voices come back as WAV and the laptop serves them (`GET /api/audio/<id>.wav`). `/debrief` is answered at once and followed through `GET /session` (`debrief_status`); its result gains `slides` (the transcript per slide with marks and a talk track) and `facing`; `gaze_dwell_s` is head direction ("Who you faced"), and `facing_slides_s` is new. The room gains `pitch_minutes`, `live.stage` and `live.feed`; `/meeting`'s proposal gains `pitch`.
- 0.19 (11 Oct): the room's `live.thinking`, the turns waiting on n8n, for the dashboard's live feed.
- 0.20 (11 Oct): debriefs. `/debrief` from the laptop gains `meeting_id`, `owner_email`, `presenter`, the turns' `note` and the slide changes the laptop saw; n8n answers when done with the session record (it saves progress on the way, read through `GET /session`), and the result gains `weak_spots` and fixed metric names. `/meetings` gains `practice`, `/meeting` gains `sessions`, the room gains `debrief` (each run of a panel is its own session), and `/prep` uses the meeting's last debrief (talk track, weak spots, drill). `GET /session` answers `404` for an unknown session.
- 0.21 (11 Oct): the room's `scripted`, for the sample meeting: a whole rehearsal without speaking and without n8n, the headset standing in for the presenter and the laptop answering turns from a script.
- 0.22 (11 Oct): the proposed panel seats only the real attendees from outside the presenter's organisation (roles left empty when unknown); practice roles become ranked suggestions, each a whole person with a name and a face. Only a meeting with no known attendee gets two practice roles seated.
- 0.23 (11 Oct): rehearse in the browser. The room gains `rehearse_in` (`"vr"` or `"browser"`, set when briefed and with `PUT /api/room/settings`; the headset doesn't take turns when it's `"browser"`) and `live.now` (who is speaking and who has a hand up, set with the new `POST /api/room/now`). The browser sends `/api/debrief` with `client: "web"` and its silences.
- 0.24 (11 Oct): `/prep` streams its answer: a progress chunk after each stage (gathered, planned, voiced, and Groq standing in for Gemini), with the n8n execution on the first, then the bundle. The practice page has one "Rehearse" button that asks where (this laptop or the headset) and shows those steps live.
- 0.25 (11 Oct): time no longer decides when the panel hears the presenter. A slide is sent whole when they move on, and mid-slide only at the interruption points n8n plans (`plan.interrupts`; `/turn` gains `mid_slide`). The pitch length can be `null` (no time limit). With a limit, n8n decides how the chair keeps time (`time`: nudge, and maybe stop the pitch for questions) and voices the chair's `time_nudge` and `time_up` lines, which the client plays itself; `pitch_end` gains `time_up`.
- 0.26 (12 Oct): a panel that feels real. `/turn` keeps every question's life in `threads` (in the context and in the response, with `thread_id` on reactions): at most one follow-up, then answered, parked or dodged, never asked again. Reactions gain `park`, `move_on` and `hand_back`. n8n enforces the rules after the model in a Code node. Generic lines (`generic`, `voice`; fillers, park, move-on, hand-back, the chair's thanks and "Take your time") are voiced once per voice and cached by the laptop (`/prep` takes `cached_voices`); the client plays a filler the moment it sends an answer. Lines gain `rescue_question` per slide; at a freeze the chair says "Take your time", then asks it. The debrief is fair: slide time counts only the pitch, `trouble` lists the system's mistakes for the model to discount, a run too short to judge isn't scored (`pitch.scored`, `overall` and scores `null`), and `owed` drafts an answer, with sources, to each question the presenter couldn't answer. Know your side: the meeting prep guesses the presenter's goal (`proposal.goal`), the presenter can set what they offer (`presenter.offer`, also on `/add-meeting`) and confirm the goal, and `/prep` takes both (`goal`); the bundle carries them for `/turn` and `/debrief`. The next `/prep` asks the last run's owed questions again, early. New `POST /deck-review`: n8n checks an uploaded deck against the brief's research and says where it will get pushback, with sources; the next `/prep` reads it. The debrief streams its progress; the turn skips the model where no question is possible; every voiced line is cached by voice and text.
- 0.27 (12 Oct): twins of the people you meet. New **DryRun people** data table (keyed by email) and `POST /twin` (streamed: each step with the sources, facts and readings it added, then the twin), `POST /twin/update` (a batch of confirm, reject, note, alias, delete, forget), `GET /twin` and `GET /twins`. A twin learns only from real sources, connects only on the same email address and suggests the rest. `/meeting` attendees gain `twin` (counts) and the brief gains `since_last_time` (facts only). `/prep` panel members gain `twin_email`; objections gain `source: "twin"` with `date` and `from`.
- 0.28 (12 Oct): after the real meeting (twins step 5, WF4). New `POST /after-meeting` (a voice note in pieces under 30 s, or notes): Sarvam transcribes it, n8n works out per attendee what they raised, what was promised and decided, writes it to their twins (a `meeting_note` source), scores the last rehearsal's predictions (`predictions` on the twin: asked, predicted, matched fact ids) and drafts the follow-up, sent to the attendees only after the presenter approves it (Gmail send-and-wait). Meetings gain `after`.
- 0.29 (12 Oct): `followup.status` gains `draft`, for a follow-up that still has a `[fill in: …]` gap. n8n no longer asks to send those: one click on "Send it" would have emailed the attendees the gaps.
- 0.30 (12 Oct): the deck is researched, not reviewed. `POST /deck-review` becomes `POST /deck-research`: n8n picks the deck's claims worth checking, searches the news for each in the deck's own words, and answers with `findings` (backed, challenged or unproven, with sources) instead of pushback and a fix for the slides. Saved as `deck_research` on the meeting; `/prep` turns findings into objections, and `/debrief` gains `checks`: what was said against each finding.
- 0.31 (12 Oct): the deck research looks for who else already does what the deck pitches, instead of checking the deck's claims (a deck is mostly about the presenter's own product, which the news can't speak to). `findings` becomes `others` (name, what, `same` or `near`, slide, question, sources). `/prep` gives each to the panel as a `research` objection that names them; `/debrief` drops `checks` and numbers their sources for `owed`. Nothing of it is shown on a page any more: the brief's "Checked from your deck", the practice page's line and the report's "Your claims against the research" are gone; the dashboard's agent feed names who was found.
- 0.32 (14 Oct): wording only, no JSON change. `/deck-research` is an n8n AI Agent with a Search Google News tool: it decides what to search, reads the headlines and searches again when they're off (at most 3 searches, was a fixed plan of up to six). Its findings are kept only if they cite a headline the tool returned.
- 0.33 (14 Oct): the sample meeting is gone, and with it the room's `scripted`. Every rehearsal is decided by n8n; the headset no longer stands in for the presenter. A room saved with `scripted` set starts empty.
- 0.34 (17 Oct): a meeting that flows. `/turn` gains `replaces_t` (an answer the presenter carried on after a pause is sent again whole, and the laptop drops the turn it replaces), `pause` segments near the end of the pitch (n8n checks the words for a finish and answers `pitch_over` with the chair opening the floor) and `floor_opened` on `pitch_end`. n8n's rules: `hand_back` only during the pitch and never with a question, no follow-up on a closed thread, no new question while another waits for its answer. The clients drop a question decided before another was asked, let a hand that's been ignored for 6 s of speech cut in, and the chair's spoken rescue comes at most once per slide. The last slide's wrap-up waits 3 s and counts down 2 (was 4 and 3).
- 0.35 (17 Oct): a livelier panel that knows when you've finished. Prep plans about 2 questions during a 2 to 4 minute pitch, never on the title or last slide, earlier in the slide; at a planned point the panelist asks unless it was answered; a slide can get a brief `acknowledge`. The last slide gets no question during the pitch, no nudge and no `time_up` (at the cut, a plain `pitch_end`); the pitch clock stops during questions asked in the pitch. More finish phrases ("that was it for my pitch"), and on the last slide the model decides when the words don't. No JSON change.
