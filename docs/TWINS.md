# Twins of the people you meet (working plan, proposed 12 Oct)

**Status: proposed, not approved.** Nothing here is built. Build only after the Quest build and one real run pass (PLAN.md, Mon 12 – Fri 16), and confirm with the team (Decisions, 10 and 11 Oct). Temporary: once built, fold it into `PLAN.md`, `CONTRACT.md` and `ARCHITECTURE.md` and delete this file.

## The idea in one line
For every real person you meet for work, n8n keeps a **twin**: what they actually raised, what you promised them, what they care about, each fact with its source. It is assembled from your emails, your real meetings, public professional sources and what you tell it. n8n connects what it is sure of by itself and asks you about the rest. The twin then sits in your practice panel, and after every real meeting n8n checks how well the rehearsal predicted what they asked.

Pitch line: **"Every real meeting makes the twin sharper."** The hit rate is the evidence: "The rehearsal predicted 3 of the 4 questions Rajiv actually asked."

## Rules (never break these)
1. **Only what really happened.** A twin learns from real sources: your emails with them, your notes after a real meeting, public professional pages and news, and what you type yourself. **Nothing from a practice run is ever written to a twin.** What a practice seat says is n8n's guess; scores, weak spots and homework are about you and stay in the sessions table. The only thing that crosses over is the hit rate (a number about how well we predicted), never the practice lines.
2. **No source, no fact.** Every fact keeps its source: an email (date, subject, a quote), a meeting note (date), a web page or article (title, link), or "you added this" (date). A fact the model can't quote isn't saved.
3. **Sure means the same email address.** n8n connects something by itself only when the identity is certain: the same email address (or one you linked to this twin before). Everything else is a **suggestion** you confirm or reject with one click: a name in someone else's email, "Rajiv Mehta, CFO" on the company's website, a news article, a second address. A rejected suggestion is remembered and never asked again.
4. **Facts and readings are kept apart.** *Known* is what a source says ("Asked for a pilot proposal, 3 Oct email"). *Reading* is n8n's interpretation ("Pushes on cost: 4 of 5 emails ask about price"), only with at least two pieces of evidence, always labelled as n8n's reading with its evidence count. Readings appear on the twin page and in the practice panel, **never in the brief or its email**, which stay facts only.
5. **Professional only, and yours to delete.** No personal life, no scraping of LinkedIn (against its terms; paste their profile text yourself if you want it in). Any fact can be deleted, and "Forget this person" removes the twin.

## Where it shows up
- **The meeting brief (`/m/[id]`):** each real attendee gets a "Twin" button with a small status ("New: building", "3 meetings, 18 facts", "2 suggestions to check"). For someone you've met before, the brief gains **"Since last time"**: what they raised and what you promised, with dates (facts only).
- **The practice table:** a real attendee's seat says "From their twin" and opens with what they actually raised before, labelled with its source ("from your meeting on 14 Oct").
- **People (`/people`):** everyone DryRun knows, last met, how full each twin is, suggestions waiting.
- **The twin page (`/people/[email]`):** below.
- **After a real meeting:** the meeting page asks "How did it go?" and you record the one-minute voice note (WF4, below).

## The twin page: watching a twin being made
This is the page judges remember. It should look like a briefing file being assembled live, in the app's paper-and-ink style, not a sci-fi hologram.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Rajiv Mehta         Kaveri Logistics, finance (from his signature, 3 Oct)    │
│ 3 real meetings   23 facts   2 to check     Predicted 3 of 4 last time ▲      │
├───────────────────────────────────────┬──────────────────────────────────────┤
│        ✉ 3 Oct ─────┐                 │ Known                                │
│   ✉ 21 Sep ───┐     │    ◎ 14 Oct     │  • Asked for a pilot proposal  ✉ 3 Oct│
│               ╲     │   ╱  meeting    │  • Wants Mumbai lane first     ◎ 14 Oct│
│                (  RAJIV  )            │  • Budget signed off by CEO    ✉ 21 Sep│
│               ╱  twin    ╲            │ n8n's reading (labelled)             │
│   🌐 kaveri.in/team ┄┄┄?   ✎ your note │  • Pushes on cost (4 of 5 emails)    │
│     "Rajiv Mehta, CFO"                │ You promised                          │
│     [ Same person ✓ ] [ Not him ✗ ]   │  • Case study by 18 Oct  ⚠ overdue   │
│                                       │ What he raised, meeting by meeting    │
│  ── connected   ┄┄ needs your OK      │ Prediction  ▁▃▆ 1/4  2/4  3/4         │
└───────────────────────────────────────┴──────────────────────────────────────┘
  [ Build again ]  [ Add a note ]  [ Link another email ]  [ Replay how it was built ]
```

- **Left, the evidence map:** the twin in the middle (their avatar and seat colour), each source around it as a small card with its icon (email, meeting, voice note, web page, news, your note). Solid ink line: connected. Dashed line with "?": a suggestion, with **Same person / Not them** on the card. A rejected card fades out with a strike.
- **Right, the dossier:** Known, n8n's reading, You promised (overdue ones flagged with an icon and a label), what they raised meeting by meeting, and the prediction hit rate over time. Hovering a fact lights up its source card and the line between them, so every claim can be traced.
- **Building it live:** "Build twin" streams n8n's steps like `/prep` does (one execution). Each step lands on the page as it happens: "Found 7 emails with rajiv@kaveri.in" (seven email cards slide in and connect), "Read your notes from 14 Oct", "kaveri.in/team lists a Rajiv Mehta, CFO: same person?" (a dashed card appears), "Pulled 23 facts, 2 to check". Facts type into the dossier as n8n extracts them. Lines draw in with a short stroke animation; reduced-motion users get them instantly.
- **Replay:** the page keeps the last build's steps, so "Replay how it was built" plays the whole animation again with **no n8n call**. That's the version to show judges.
- **How full the twin is,** stated honestly from counts, never a made-up intelligence percentage: "Thin: 2 emails, no meetings yet. In rehearsal this seat leans on their role." / "Solid: 3 meetings, 11 emails."
- **You can add to it:** a note ("prefers numbers on one page"), pasted text from their profile, notes from a meeting DryRun didn't see, another email address of theirs. Each becomes a source card marked "you added this".

## How n8n builds it

### Data: the **DryRun people** table (keyed by email)
| Column | What |
|---|---|
| `email` | the key; lower-cased |
| `aliases` | other addresses you linked |
| `name`, `company`, `role` | `role` with its source, only if a source states it |
| `facts` | JSON list: `{ id, kind: raised | promised | decision | preference | role | context, text, source: { type: email | meeting_note | web | news | manual, ref, date, quote?, url? }, status: connected | suggested | rejected, added }` |
| `readings` | JSON list: `{ text, evidence: [fact ids] }`, at least two each |
| `meetings` | the real meetings they were in (ids, dates) |
| `predictions` | per real meeting: `{ meeting_id, asked: n, predicted: n, matched: [...] }` |
| `build_log` | the last build's streamed steps, for Replay |
| `updated` | |

### Workflow **DryRun twin** (`POST /twin`, streamed)
1. Load the person's row (or start one) and their aliases.
2. **Your emails with them:** Gmail search `from:` / `to:` every address, the last 20 threads (deeper than the brief's prep). Connected: same address.
3. **Real meetings:** rows in the meetings table they attended, and facts from your voice notes (WF4). Connected.
4. **Mentions of them elsewhere:** their name in emails from *other* people ("loop in Rajiv from finance"), the company's team page, news with their full name and company. **Suggestions only.**
5. **Extract** (Gemini, Groq fallback): facts, each with a quote from its source; promises you made; readings with evidence ids. A step after the model drops any fact whose quote isn't in the source text and any reading with fewer than two pieces of evidence.
6. **Merge** with what's there: no duplicates, rejected stays rejected, your own notes are never overwritten.
7. Save, and stream every step to the page.

### Workflow **DryRun twin update** (`POST /twin/update`)
Confirm or reject suggestions, add a note, link an address, delete a fact, forget the person. The page **queues your clicks and sends them as one batch** ("Save", or when you leave the page), so a review costs one execution. Confirmed suggestions become connected facts.

### Prep reads the twins
- **Calendar prep** looks up each attendee's email in the people table. Someone known gets "Since last time" in the brief (raised and promised, with dates). A new address gets a twin started in the background.
- **Rehearsal prep** gives a real attendee's seat their twin: what they actually raised becomes objections (`source: twin`, with the date), their known preferences shape their manner. The practice panel's invented roles stay invented and labelled.

### After the real meeting (WF4, slim): the only way meetings reach a twin
1. The meeting page, after its end time: "How did it go?" Record a one-minute voice note (or paste notes).
2. Sarvam transcribes it (Indian English and Hinglish; the Sarvam mentor sees it used).
3. n8n works out, per person: what they raised, what you promised, what was decided, the next step.
4. **Hit rate:** compares what each person really raised with what their practice seat asked in your last rehearsal of this meeting. Saved as a prediction, never the practice lines.
5. Drafts your follow-up email; **Gmail send-and-wait** holds it until you approve it.
6. Updates each person's twin (connected facts, source "your notes, 14 Oct").

### Ask the twin (stretch, for the n8n mentor)
A box on the twin page: "What will Rajiv push on about pricing?" An n8n **AI Agent node** with tools (the people table, Gmail search, the meetings table) answers in a few lines with the facts it used. It's the "AI Agent with tools and memory" the n8n mentors look for. One execution and one model call per question. Only if everything else is done.

## Contract 0.27 (draft)
- `POST /twin` `{ email, name?, company? }`, streamed like `/prep`: steps `{ step, text, cards?: [...], facts?: [...] }`, then the twin.
- `POST /twin/update` `{ email, changes: [{ op: confirm | reject | note | alias | delete | forget, ... }] }`.
- `GET /twin?email=` and `GET /twins`, read through `readOnce` and cached on the laptop (`web/.twins/`), refreshed only after a build, an update or WF4, so viewing a twin costs nothing.
- `/meeting`: each attendee gains `twin: { facts, meetings, to_check, last_met } | null`; the brief gains `since_last_time: [{ email, raised: [...], promised: [...] }]`.
- `/prep` panel members gain `twin_email`; objections gain `source: "twin"` with a date.
- `POST /after-meeting` `{ meeting_id, audio_base64 | notes }`: what each person raised, the follow-up draft (sent after approval), the hit rate.

## Order and cost
| Step | What | About |
|---|---|---|
| 1 | People table, **DryRun twin** (streamed), merge rules | 4 h |
| 2 | Twin page: the evidence map, the dossier, live build, Replay; "Twin" buttons on the brief | 5 h |
| 3 | **DryRun twin update** (batched confirm, reject, note, alias, forget) | 1.5 h |
| 4 | Prep reads twins: "Since last time" on the brief, twin seats in the practice panel | 2 h |
| 5 | WF4: voice note, Sarvam, per-person facts, follow-up with approval | 4 h |
| 6 | Hit rate on the twin page | 1 h |
| 7 | Ask the twin (stretch) | 2 h |

About two days for 1–6. If time runs short, cut in this order: Ask the twin, the hit rate, then WF4's follow-up email (keep the voice note, which is what feeds the twins).

Executions: a build is one; a batch of confirmations is one; a voice note is one (the approval waits inside the same run); reading twins costs none after the first.

## The sample twin (offline, for testing and as the demo fallback)
Like the sample meeting: "Rajiv Mehta (sample)" for the RouteIQ pitch, with fixed facts, sources and a recorded build log in `web/src/lib/mock/`. Replay works without n8n or a model, so the page can be shown even if n8n is down. Clearly labelled sample.

## Demo
1. Before the event, on a real meeting of yours: open an attendee's twin, press "Build twin" and let the map assemble from your real emails; confirm one suggestion ("Same person"), reject one.
2. **At the event, the real meeting is Round 2.** Straight after the mentor session, record the voice note: n8n writes down what each mentor raised and what you promised, drafts the follow-up (you approve it on stage or before), and their twins update.
3. Round 3: their seats in the practice panel open with what they actually raised in Round 2. "You told us X; your twin pressed us on it." The hit rate shows how much of Round 2 our rehearsal predicted.
4. Check with the organisers first (twins of the mentors, from public professional sources only).

## Open questions
- Should a twin be per person across all your meetings (yes, keyed by email), or also per company? Start per person; the company view can come from the people table later.
- Do we show readings in the practice panel's persona drawer, or only on the twin page? Start with both, labelled.
- How much email history: 20 threads per person is a guess; check Gmail node speed.
