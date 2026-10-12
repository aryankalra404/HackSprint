# Twins of the people you meet (working plan, proposed 12 Oct)

**Status: approved 12 Oct; steps 1–4 built the same day (contract 0.27).** Built: the **DryRun people** table, **DryRun twin** (streamed build), **DryRun twin update** (batched changes), the twin page (`/people/[email]`) and the people list (`/people`) with the sample twin, the brief's Twin buttons and "Since last time", and twin seats in the practice panel and rehearsal prep. **Steps 5 and 6 built 12 Oct (contract 0.28):** **DryRun after the meeting** (WF4) with "How did it go?" on the meeting page, and the hit rate on the meeting page and the twin page. Not built: step 7 (Ask the twin). Temporary: once all of it is built, fold it into `PLAN.md`, `CONTRACT.md` and `ARCHITECTURE.md` and delete this file.

**How the build differs from the plan below (12 Oct):**
- **"Since last time" and twin counts are joined when the meeting is read** (the meetings API reads the people table on `GET /meeting`), not written by calendar prep. A twin built after the brief shows up at once, and prep didn't need changing. So the brief *email* doesn't carry "Since last time" yet, and **calendar prep doesn't start twins of new addresses by itself**: every prep run would then cost an extra execution and model call per new attendee. The brief offers "Twin: New, build it from your emails" instead. Ask before adding either.
- **DryRun's own emails are never a source.** The first real build found the brief emails ("Your brief for … is ready") and rehearsal reports in the inbox naming the attendee; a report is about a practice run (rule 1). Both Gmail searches exclude those subjects and the Code nodes drop them again.
- **Suggestions are decided in the leaf's card and in the file**, not with buttons on every tab: on the tree they crowded the leaves. A suggested source shows "?" on its tab.
- **The tree's layout is hand-rolled** (four fixed branches, at most 8 leaves each, the rest counted "in the file"), not `d3-hierarchy`: no new dependency.
- **WF4 (12 Oct):** the meeting page asks "How did it go?" once the meeting has started; n8n doesn't email a nudge. The laptop cuts the voice note into pieces under 30 s for Sarvam. The hit rate compares with the last *debriefed* rehearsal of that meeting, by `twin_email` or name, and the twin keeps `matched` fact ids, so the twin page can list what was and wasn't predicted. The follow-up's approval is a Gmail send-and-wait email to the presenter (Send it / Don't send); nothing is sent from the web app. A twin can be started by WF4 (an attendee with no twin yet), from the notes alone. Not done: booking the next step on the calendar. Notes sent twice for the same meeting used to keep the first note's facts (fixed in `build.py` 12 Oct, not deployed yet).
- **Readings shape a twin seat's manner and priorities but never become objections**; an objection is `source: "twin"` only when it names a connected fact of that person's twin (checked in n8n after the model).

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

## The twin page: a portrait drawn from evidence
This is the page judges remember. The idea: **the person is literally drawn by what n8n finds.** Their portrait is printed as a halftone (newspaper dots), and every fact n8n connects adds dots, so a new contact is a faint sketch and someone you've met three times is a full portrait. Around it, a tree grows from the person out to every fact and, at the edge, every source. It should look like a well-made printed briefing file, drawn in ink: the app's paper-and-ink style, not a sci-fi hologram.

### Layout (desktop)
```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  People / Rajiv Mehta                                    [Tree | List]  [Print file]│
├──────────────────────────────────────────────────┬─────────────────────────────────┤
│   ✉ 21 Sep          ✉ 3 Oct        ◎ 14 Oct      │ RAJIV MEHTA  (wide Archivo)     │
│      ╲                 │              ╱          │ Finance, Kaveri Logistics ¹     │
│   Wants Mumbai lane ── │ ── Asked for a pilot    │                                 │
│        first           │      proposal           │  3        23       2      3/4   │
│            ╲   WHAT HE RAISED   ╱               │ meetings facts  to check predicted│
│   WHO HE IS ── ░▒▓ halftone ▓▒░ ── HE CARES ABOUT│                                 │
│   Finance ¹    ▒▓ portrait ▓▒     Cost ⁴        │ Known                           │
│                ░▒▓▓▓▓▓▓▓▒░                     │  Asked for a pilot proposal ²   │
│            ╱  YOU PROMISED  ╲                  │  Budget signed off by CEO ³     │
│   Case study by 18 Oct ⚠   ┄┄ "Rajiv Mehta,     │ n8n's reading                   │
│      (overdue)                CFO" kaveri.in ?  │  Pushes on cost, 4 emails ⁴     │
│                              [Same ✓] [Not ✗]   │ You promised                    │
│                                                 │  ⚠ Case study, due 18 Oct       │
│  14:02:11  Reading 7 emails with rajiv@kaveri.in│ ─────────────                   │
│                                                 │ ¹ Signature, email of 3 Oct     │
│                                                 │ ² "Could you send a pilot…" 3 Oct│
├──────────────────────────────────────────────────┴─────────────────────────────────┤
│  Sep ─────●──────────●───────────●──────────────◆ 14 Oct ───────────── today ▸     │
│        email      email       email          meeting (3/4 predicted)    ▲ drag     │
└────────────────────────────────────────────────────────────────────────────────────┘
  [ Build again ]  [ Add a note ]  [ Link another email ]  [ Replay how it was built ]
```

### The pieces
- **The halftone portrait (centre).** The avatar this person sits as in VR (`web/public/vr/*.jpg`), drawn on a canvas as halftone dots in their seat colour. How many dots are filled in follows how much is known, counted honestly: a twin with 2 emails is a light sketch, one with 3 meetings and 11 emails is a full portrait. Under it, their name on a tent card like the one in the VR room. No percentage, no "intelligence score".
- **The tree (around the portrait).** Four branches in ink hairlines: **Who they are**, **What they care about**, **What they raised**, **What you promised**. Each fact is a leaf: a tick and a short label. From each leaf a hairline runs out to its **source** on the outer ring: a small file tab with a glyph and a date ("✉ 3 Oct", "◎ 14 Oct meeting", "kaveri.in", "✎ your note"). Reading inward is how the twin was built; reading outward is where each fact came from.
  - **n8n's readings** sit where two or more leaves' lines meet, as a small open circle labelled "n8n's reading: pushes on cost (4 emails)". A reading never appears without its leaves.
  - **Suggestions** are dashed lines to a grey leaf, with **Same person ✓ / Not them ✗** right on the leaf. Confirm and the line inks in and the leaf darkens. Reject and it fades out with a strike.
  - An overdue promise has the warning icon and the word "overdue" (never colour alone).
- **The file (right).** Typeset like a printed briefing: the name in the wide cut, the role with its source, four big numbers (meetings, facts, to check, predicted), then Known, n8n's reading and You promised. **Every fact carries a footnote number,** and the sources are listed under it like a well-sourced article, with the quote and the date. Hovering a footnote lights up its leaf and its line in the tree, and hovering a leaf lights up its footnote.
- **The timeline (bottom).** A date ruler with a tick for every email and a diamond for every real meeting, with that meeting's hit rate ("3/4 predicted"). **Drag the playhead back** and the tree and the portrait rewind to what the twin knew on that day; drag forward and you see it fill in meeting by meeting. That's the "it gets sharper" claim shown, not told.
- **The build (live or replayed).** One line at the bottom of the tree, set like a teleprinter with a timestamp, shows n8n's real streamed steps: "14:02:11 Reading 7 emails with rajiv@kaveri.in". Each step does something visible: source tabs drop onto the outer ring, then lines draw inward (the stroke draws in over about 400 ms), leaves appear when their line arrives, the branch grows, and dots fill into the portrait. A full replay takes about 10 s. **Replay** plays the last build's saved steps without calling n8n.

### Useful, not only pretty
- **Click a leaf:** a small card with the quote, the source, the date and "Open the email" (Gmail link) or the meeting.
- **"Since last time"** toggle: leaves added since your last real meeting with them are drawn in full ink, the rest greyed. It's the same "Since last time" the brief shows.
- **Filter by source:** emails, meetings, web, your notes.
- **List view:** the same twin as a plain file (the right column, full width), for reading, for screen readers and for small screens.
- **Print file:** a one-page PDF of the file and the tree to take into the real meeting.

### What keeps it from looking AI-made
- **Never:** gradients, glows, glass, purple-blue palettes, sparkle or brain icons, "AI-powered" badges, shimmering placeholders, a chat-style typing cursor, particles, emoji.
- **Always:** ink on paper, hairlines, one typeface (Archivo, wide cut for the name and the numbers), sentence-case labels, tabular numbers. Colour appears once, the person's seat colour on the portrait's dots and their tent card, plus status colours only with an icon and a label.
- **Copy is concrete and dated:** "From your email of 3 Oct", "n8n found 7 emails", "Rajiv's website lists a Rajiv Mehta, CFO. Same person?". Never "AI insights" or "Analyzing persona…".
- **Motion means something:** a line draws because a fact was connected, and dots fill because something was learned. Nothing moves when nothing happened. With reduced motion, everything shows at once.
- **Honest empty states:** "Nothing yet: no emails with this address, no meetings. Add a note or build after your first meeting."

### Small screens
The file comes first, with footnotes. The portrait sits on top (smaller) and the tree opens on a tap as a full-screen view. The timeline stays as a swipeable ruler.

### How to build it
- SVG for the tree (`d3-hierarchy`'s tree layout in a radial projection; it's small, ≤ 40 leaves), canvas for the halftone (sample the portrait's brightness on a grid and draw dots sized by darkness, in a stable order so the same twin always draws the same way), and CSS for the motion (`stroke-dashoffset` for lines). No animation library.
- The page plays a list of steps (`{ t, step, adds: { sources, facts, readings } }`), the same list whether it comes live from n8n's stream, from the saved build log (Replay) or from the timeline (rewind is replaying up to a date). One renderer, three uses.
- Build it against the sample twin first, so the whole look can be tuned without n8n.

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
| 1 | People table, **DryRun twin** (streamed), merge rules (built 12 Oct) | 4 h |
| 2 | Twin page: halftone portrait, the tree, the footnoted file, the timeline, live build and Replay, list view; "Twin" buttons on the brief (built 12 Oct) | 6–7 h |
| 3 | **DryRun twin update** (batched confirm, reject, note, alias, forget) (built 12 Oct) | 1.5 h |
| 4 | Prep reads twins: "Since last time" on the brief, twin seats in the practice panel (built 12 Oct; see the differences above) | 2 h |
| 5 | WF4: voice note, Sarvam, per-person facts, follow-up with approval | 4 h |
| 6 | Hit rate on the twin page | 1 h |
| 7 | Ask the twin (stretch) | 2 h |

About two and a half days for 1–6. If time runs short, cut in this order: Ask the twin, the hit rate, then WF4's follow-up email (keep the voice note, which is what feeds the twins).

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
