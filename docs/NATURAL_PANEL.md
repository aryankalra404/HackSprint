# A panel that feels real (working plan, delete when built)

Temporary. When everything below is built, fold the decisions into `PLAN.md` (decisions log), `CONTRACT.md` (0.26) and `ARCHITECTURE.md`, then delete this file.

## Why
First real headset test with n8n (11 Oct, 2:36 long, 1-minute pitch, 2 people: Sneha, Head of Procurement, interrupts; Dr. Anirudh Sharma, Chief Research Scientist, chairs). From the room's `live.feed`:

| t | Presenter (as Whisper heard it) | Panel |
|---|---|---|
| 0:19 | slide 1's title only | The chair **opened the floor mid-pitch**, then Sneha asked how they'd verify open-source code has no foreign backdoors |
| 0:50 | "Nearest True Tax Limit plus a Tested Recovery" (garbled) | Sneha: follow-up, same question |
| 1:12 | "I'm not sure" | Sneha: **another** follow-up, same question |
| 1:47 | (the chair stopped the pitch for time) | Sneha asks it **a fourth time** |
| 2:11 | "I'm not sure" | **Fifth** time, then the chair closes |

n8n's turn workflow took 5.7–6.0 s per turn (executions 121–125). The headset adds about 2.3 s before it counts an answer as finished, plus about 1 s of upload: **8–9 s of silence after every answer**, and nothing happens when the presenter goes quiet.

Root causes:
1. **Nothing tracks a question's life.** "One follow-up per question" is only a line in the prompt; n8n doesn't know a question was answered, parked or dodged, so it keeps the one open question alive.
2. **No rule enforcement after the model.** `open_floor` is allowed on a `segment`; a question can fire on a slide where the presenter has only read the title.
3. **Every reply waits on the slow path:** Whisper, then `gpt-oss-120b`, then Sarvam voicing a new line, in series.
4. **Nothing fills a gap,** neither n8n thinking nor the presenter freezing.
5. **Transcription of answers is weak:** Whisper's hint list has the company, slide titles and names, but not the question being answered.

## The idea in one line
The panel runs the meeting like real people: every question has a life (asked, followed up once, then answered, parked or dodged), nobody waits in silence (instant reactions and pre-planned replies, with the live model for anything unexpected), the panel catches you when you freeze, and **whatever you couldn't answer becomes homework**: n8n drafts a researched answer, emails it, and asks it again, harder, next run.

n8n stays the brain: it plans the threads, the lines, the branches and the rescue in `/prep`, decides every live turn in `/turn`, and writes the homework in the debrief. Clients only decide *when* something plays (ground rules 1 and 3).

## 0. Know your side (the meeting, not just the company)
Today the calendar prep knows the invite, your emails with the attendees, the news and their website, so the brief is about **them**. Rehearsal prep adds your deck's text when you press Rehearse. What n8n never learns is **your side**: what you're pitching and what you want from the meeting. So the brief's hardest questions are generic, and the panel can press on the wrong thing. Researching early and tailoring late is the right shape; these fill the gap.

### 0a. Your goal, in one line, with n8n's guess
- **One-time profile:** what you offer, in one or two lines ("RouteIQ: route optimisation for logistics fleets"), set once on the web and sent with every prep.
- **Per meeting:** what you want from it ("a paid 3-month pilot approved"). n8n **infers it** in the calendar prep from the invite and your emails with the attendees, and shows its guess in the "prepare for this meeting?" pop-up and on the brief: "n8n thinks you want: a paid pilot of RouteIQ". One click to confirm, or edit it.
- **Where it's used:**
  - The brief's hardest questions and risks become about *your* ask.
  - Rehearsal prep aims objections at the ask.
  - The chair's closing fits it ("We'll take the pilot proposal to the committee").
  - The debrief judges whether you made the ask clearly.
- If you change it, the brief isn't rebuilt (that costs an execution); the next rehearsal prep uses the new goal.

### 0b. When the deck arrives, n8n reviews it against the research
- A new step when the deck is uploaded (a small workflow, **DryRun deck review**, one execution per upload): your slides' claims against what n8n found about the company and its people.
- Output, added to the brief as **"Where your deck will get pushback"**, 3 to 5 items, each with:
  - the slide;
  - your claim ("30% lower fuel cost");
  - what they know or care about, with the source ("their FY25 report says fuel cost already fell 18%");
  - who will push ("Rajiv, finance");
  - a suggested fix to the slide or the answer.
- Facts only from the sources, as the brief's rules already require. Never invent facts about the presenter's own product.
- Rehearsal prep reads the review, so the panel's objections match what the brief warned about (today they're made separately and hidden in the bundle).
- Also shown on the practice page under the deck, so you see it before you rehearse.

### 0c. n8n finds the deck itself
- In the calendar prep, n8n looks for a PDF, PowerPoint or Keynote attached to the invite, or in the latest email thread with the attendees, and attaches it to the meeting.
- The practice page then shows "Deck found in Rajiv's email (RouteIQ_Delhivery.pdf): use it?". Upload stays as the fallback.
- The laptop still converts it (n8n can't reach the laptop's files, so n8n passes the file's Drive or Gmail link and the laptop downloads it, or n8n sends the file itself).

### 0d. Reading charts (paused for now)
Slide images to Gemini so a chart's numbers can be challenged; today a slide that's mostly a chart is just "Slide 4". Paused: it costs Gemini's free quota and prep time. Revisit after the demo path works.

## 1. Question threads (fixes the repetition)
Every question n8n asks is a **thread**:

```
asked ──► follow_up (at most one) ──► answered | parked | dodged      (closed: never asked again)
```

- **Statuses:** `open`, `followed_up`, `answered` (verdict resolved), `parked` (presenter said they don't know or will come back; the asker accepts it), `dodged` (no real answer after the follow-up; the asker moves on, visibly unconvinced).
- **State is kept by the laptop,** like `pending` today, so n8n stays stateless: the laptop sends `context.threads` with each turn and updates it from n8n's reply.
- **n8n enforces it in a Code node after the model, not just in the prompt:**
  - A reaction that asks a closed thread again is dropped.
  - A second follow-up on a thread becomes a close: `parked` if the presenter said they didn't know, otherwise `dodged`.
  - `open_floor` only on `pitch_end`; `closing` only after the pitch.
  - During the pitch, a question only if the segment has real content (at least about 12 words), at a planned interruption point, or when what was said directly contradicts an objection or the research.
  - After the pitch, the next question is an open or pending thread first, then a new topic. Never a closed one, and never a near-duplicate (n8n compares with the closed questions' text).
- **"I don't know" handling,** decided by n8n from the transcript: the asker parks it with a line like "That's fine, send it to us after." (during the pitch, followed by a hand-back: "Please, go on.").
- **After a mid-pitch question is answered, the asker or the chair hands back** ("Thanks, carry on."), so the pitch resumes naturally.

## 2. No dead air
Latency budget after the presenter stops answering:

| Step | Now | Target |
|---|---|---|
| End of answer detected (gap bridge 0.35 s + silence hold 0.8 s + `answerPauseS` 1.2 s) | ~2.35 s | ~1.6 s (`answerPauseS` 0.5 s) |
| Something audible from the panel | never | **~0.3 s after the answer is sent** (filler, below) |
| n8n turn | 5.7–6.0 s | **~2 s** on the fast path (planned line), ~5 s on the live path |

### 2a. Fillers: instant, saved, reused
- Short content-free sounds per voice: "Mm.", "Mm-hm.", "Right…", "Okay.", "Hm, okay.", "I see." About 6 per voice.
- **Voiced once per voice and kept on the laptop** (`web/.voices/<voice>/<n>.wav`, keyed by voice and text). They don't depend on the meeting, so every later rehearsal reuses them. Real voice products do the same: canned fillers, live replies.
- **Made by n8n:** `/prep` gets `cached_fillers: ["priya", "rahul"]` (voices the laptop already has) and voices fillers only for new voices. Zero extra executions; fewer Sarvam calls and faster prep after the first run.
- **The client plays one** (not the same one twice in a row) from the person who asked, as soon as it sends an `answer`, with a small nod or a look at their notes. It's never played if n8n's reply arrives within ~0.4 s. This is a timing decision, so it belongs to the client; n8n still decides what's said.
- Also on `pitch_end`: the chair's "Thank you." filler while n8n decides who asks first.

### 2b. Planned replies with a fast path
In `/prep`, for each **planned** question (one per `plan.interrupts` entry and each likely question after the pitch), n8n writes and voices:
- the question itself (`ask`),
- one follow-up for a vague answer (`follow_up`),
- per person, once: a park line (`park`, "That's fine, send it over after.") and a move-on line (`move_on`, "Okay, let's leave that there."),
- per person: the existing acknowledgements, and a hand-back (`hand_back`, "Thanks, go on.").

Live, `/turn` takes the **fast path** when the moment matches a planned question:
1. Whisper (with the question in its hint list, below).
2. A small fast model (Groq `llama-3.1-8b-instant` or `gpt-oss-20b`, low reasoning) classifies the answer as resolved, partial, unknown or off-topic. Is a planned line still right? If so, it returns that `line_id`.
3. No Sarvam call: the line is already voiced.

It falls back to the **live path** (`gpt-oss-120b` writes a new line from the presenter's exact words, Sarvam voices it) when:
- the answer raises something unplanned (a new number, a counter-question, a claim to challenge);
- the small model says no planned line fits;
- the moment isn't a planned question at all (most segments, new questions after the pitch, the closing).

**The rule that keeps it live:** a planned line is only used if it genuinely fits what was said. n8n's `note` says which path it took and why, so the dashboard shows "used the prepared follow-up" or "wrote a new question because you mentioned 40% savings".

### 2c. Faster, better transcription
- Whisper's hint list (`prompt`) gains the question being answered and the asker's name, so answers come back as words, not "Nearest True Tax Limit".
- Normalise the speech's volume on the laptop before compressing (the Quest mic is quiet: background ~0.0001, speech peaks ~0.06). Check whether `compressSpeech` uses ffmpeg; if so, add a loudness filter.
- Try `whisper-large-v3` against `-turbo` on 3 recorded answers (more accurate, a little slower on Groq). Keep whichever is right more often.

## 3. The panel catches you when you freeze (the Rescue Agent, voiced)
Today the cues only show as text on the web speaker view (VR monitor cues aren't built). Make the room react, all prepared in `/prep`, played with no network (ground rule 3):

| Silence during the pitch (n8n's `rescue_after_s`) | What happens |
|---|---|
| ~3 s | The monitor or speaker view shows the calm cue (as now); the panel waits, someone looks at their notes |
| ~6 s | The keyword cue on the monitor; the chair says "Take your time." (pre-voiced `rescue_soft`) |
| ~10 s | Someone asks a **way-back-in question** written from that slide's key point ("Maybe walk us through the pilot numbers?"), pre-voiced per slide (`rescue_question`). It's a real question: the answer goes to n8n as an `answer` and gets a verdict |

Telemetry already logs silences with their rescue level; the debrief and report show "froze for 11 s on slide 3, the panel asked about the pilot and you recovered".

## 4. Homework: what you couldn't answer (the useful part)
In the debrief workflow, for every thread that ended `parked` or `dodged` (and every `partial` answer):
- n8n drafts a **model answer** (3–5 sentences, in the presenter's voice) from the deck's slide text, the brief's research on the company (news and website, with sources) and what the presenter actually said, marking what they'd need to confirm themselves (never invents facts about their own product).
- The report gets a **"Questions you owe them"** section: the question, who asked, what you said, the suggested answer and its sources.
- The debrief email leads with it: "3 questions you couldn't answer for Delhivery, with suggested answers."
- The next `/prep` turns them into `history` objections (already built), and asks those exact questions early.

This is what makes it a product: a stumble in rehearsal becomes an answer you know in the real meeting.

## 5. Small fixes from the same run
- The chair opened the floor at 0:19 on a `segment` (enforcement, section 1).
- A question fired on a slide-title-only segment (enforcement, section 1).
- The chair stopped the pitch at 1:47 instead of about 1:15: time keeping waits for the presenter to be in pitch mode, but they were answering a question. That's expected, but the stop then had an empty transcript. Acceptable; note it in the debrief.
- Demo setting: a 1-minute pitch leaves no room for any of this. Use 2–3 minutes with 3–4 slides.

## Contract 0.26 (draft)
- Know your side:
  - The web keeps a profile `{ offer: string }`, sent as `presenter.offer` with `/add-meeting` and `/prep`.
  - The meeting gains `goal: { text, source: "n8n" | "presenter" }`, inferred by the calendar prep; the web can set it with a new `POST /meeting-goal`, which only saves it (no new brief).
  - `/prep` takes `goal`.
  - New `POST /deck-review` (laptop to n8n) with the meeting id and slide text, answered with `{ items: [{ slide_index, claim, pushback, source: { title, url }, persona_hint, fix }] }` and saved on the meeting; `/meeting` returns it as `deck_review`.
  - The meeting gains `found_deck: { name, from, link } | null`.
- Bundle `lines[].kind` gains `filler` (shared per voice, `audio_url` under `/api/voices/...`), `park`, `move_on`, `hand_back`, `rescue_soft`, `rescue_question` (with `slide_index`), `ask` and `follow_up` (with `thread_id`).
- Bundle gains `threads_planned: [{ id, persona_id, slide_index | null, text, ask_line_id, follow_up_line_id }]`.
- `/prep` request gains `cached_fillers: string[]`.
- `/turn` context gains `threads: [{ id, persona_id, text, status, follow_ups, planned: bool }]`, kept by the laptop (replaces `pending`, which stays for one version for old clients).
- `/turn` response gains `threads: [{ id, status }]` (changes to apply), `path: "planned" | "live"`, and each reaction gains `thread_id`.
- Telemetry gains `{ type: "filler", t, persona_id }` and `{ type: "rescue", t, level, line_id }` events, for the report.
- Debrief result gains `owed: [{ thread_id, persona_id, question, said, suggested, sources: [{ title, url }] }]`.

## Who builds what

| Part | n8n | Laptop (web) | Browser rehearsal | Headset (Unity) |
|---|---|---|---|---|
| 0a. Your goal | calendar prep infers it; brief, rehearsal prep and debrief use it | profile page, goal on the pop-up and brief (confirm or edit) | — | — |
| 0b. Deck review | new **DryRun deck review** workflow; rehearsal prep reads it | call it on upload, show it on the brief and practice page | — | — |
| 0c. Deck found | calendar prep looks in the invite and the email thread | offer it on the practice page, download and convert | — | — |
| 1. Threads | prompt + enforcement Code node in **DryRun turn** | keep `threads` in the room, send in context | — | — |
| 2a. Fillers | voice missing fillers in **rehearsal prep** | cache per voice, serve, tell `/prep` what it has | play on `answer` / `pitch_end` | same in `TurnTaker` |
| 2b. Planned replies | prep writes and voices branches; turn fast path (small model) | nothing new (lines already resolved) | — | — |
| 2c. Transcription | Whisper hint list | volume normalise | — | — |
| 3. Voiced rescue | prep writes `rescue_soft` and `rescue_question` | — | play at levels 2 and 3 | monitor cues + play (VR cues not built yet) |
| 4. Homework | **DryRun debrief**: owed answers, email | report section | debrief panel link | — |

## Order (each step usable on its own)
1. **Threads and enforcement** (n8n turn workflow, laptop context). Fixes the repetition and the mid-pitch floor opening. About 1.5 h.
2. **Park, hand-back and move-on lines, and fillers** (prep voices them, both clients play fillers). Removes most of the felt silence. About 2 h.
3. **Transcription:** hint list and volume. About 30 min.
4. **Planned replies and the fast path.** About 2–3 h. Measure: target ~2 s per turn on the fast path.
5. **Voiced rescue** (both clients, plus VR monitor cues). About 2 h.
6. **Homework** (debrief, report, email). About 2 h.
7. **Your goal** (0a): profile, n8n's guess and confirm, used by the brief, rehearsal prep and debrief. About 2 h. Can go first if the demo meeting needs a sharper panel.
8. **Deck review** (0b): the new workflow, the brief and practice page sections, rehearsal prep reading it. About 2–3 h. Strong demo moment: upload the deck, and n8n says where it will get pushback, with sources.
9. **Deck found** (0c). About 2 h; Gmail and Calendar attachments need testing with a real invite.
- Paused: reading charts (0d).

## Testing (keep executions low)
- Each step first against stand-in turns (`DRYRUN_FAKE_TURNS=1`) and n8n Code nodes run locally on recorded `live.feed` data, like 0.25.
- Then one real run per two steps, 2-minute pitch, 3 slides, with a script that says "I'm not sure" once, answers one question well and freezes once for 12 s. Check: no question asked twice, a park line after "I'm not sure", a filler within half a second of every answer, a rescue question on the freeze, and n8n's turn time from executions.
- About 8–10 executions a run; budget 4 runs for all of this.

## Demo (what this buys)
0. Before rehearsing: the brief says what n8n thinks you want ("a paid pilot"); you upload the deck and n8n flags "slide 3's 30% savings will get pushback from finance: their FY25 report says fuel cost already fell 18%".
1. You pitch; Sneha raises a hand at the planned point and asks about open-source backdoors.
2. You say "I'm not sure." Sneha: "That's fine, send it to us after. Please, go on."
3. You freeze on slide 3. The chair: "Take your time." Then: "Maybe walk us through the pilot numbers?" You recover.
4. Questions after the pitch: each one different, follow-ups only when you're vague, an "mm, okay" the moment you finish.
5. The run ends; an n8n email arrives: "2 questions you owe Delhivery, with suggested answers and sources."
6. Run it again: they open with exactly those questions, and you nail them. The score moves.
7. Throughout: the n8n canvas lights up node by node, and the dashboard's feed says "used the prepared follow-up" or "wrote a new question because…".

## Open questions
- Fast model choice: `llama-3.1-8b-instant` (fastest) vs `gpt-oss-20b` (better judgement). Test both on 5 recorded answers.
- How many planned questions per run before prep gets slow (each one is 2 voiced lines)? Probably cap at 6.
- Should fillers be the asker's or whoever the presenter is facing (VR has head direction)? Start with the asker.
