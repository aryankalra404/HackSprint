"""Prompts and JSON schemas for the DryRun workflows (the model is GEMINI_MODEL in build.py)."""

import json

TRIAGE_PROMPT = """You decide which calendar events are worth preparing a rehearsal for. The presenter is the attendee marked "self".
Prepare for high-stakes conversations with people outside the presenter's organisation where they must persuade or perform:
sales pitches and demos, investor pitches, interviews, client reviews, partnership talks. Skip internal syncs, standups,
1:1s with colleagues, personal events and anything with no external attendee.
"why" is one specific sentence for the presenter. If it is worth preparing: who is coming and what is at stake. If not: why it
isn't worth preparing (e.g. "Internal weekly sync, no one from outside"); the presenter sees it and can prepare it anyway.

Event:
"""

TRIAGE_SCHEMA = {"type": "object", "properties": {
    "prepare": {"type": "boolean"},
    "why": {"type": "string"},
    "company": {"type": "string", "description": "The external organisation, or empty"},
    "company_domain": {"type": "string", "description": "Their email or web domain, or empty"},
    "kind": {"type": "string", "enum": ["sales_pitch", "investor_pitch", "interview", "client_review", "partnership", "internal", "personal", "other"]}},
    "required": ["prepare", "why", "company", "company_domain", "kind"]}

RESEARCH_PROMPT = """Someone is about to meet {company}: a {kind} titled "{title}". Summarise what they should know, using ONLY the sources below.
In under 200 words: what the company does and its scale (from its website), then the 3 to 5 developments from the news that the
people in the meeting will most likely have on their minds (results, costs, leadership, strategy, problems), each with its date.
Do not add anything that is not in these sources. If the sources say little, say so. Plain text.

Recent news headlines (date, publisher, headline):
{news}

From their website:
{website}

From a web search (only when the news had little; facts as reported, with dates):
{web}"""

# Only used when Google News has little on the company (small or private companies); needs a Gemini key with billing
WEB_PROMPT = """Search the web for recent, verifiable facts about {company} ({domain}) that someone going into a {kind} with them should know:
what they do and their scale, funding, results, leadership changes, launches, partnerships and problems in the last 12 months.
List up to 8 facts, one per line, each with its date and the publication or site that reported it.
Only include facts you found in search results. If you found little, say so. Plain text."""

BRIEF_PROMPT = """You prepare a presenter for a high-stakes meeting. Write their brief, which they will rely on, so it must be accurate.

Meeting:
{meeting}

Recent emails with them:
{emails}

Research on the company (from the news, their website and a web search):
{research}

Rules:
- attendees: ONLY people named in the meeting invite or the emails above, with their real names. Never add anyone else.
  role: only if the invite or emails state it (e.g. "Rajiv from finance" -> "Finance"); otherwise an empty string. Never guess a title.
  likely_focus: what they will most likely care about or push on in this meeting, based only on the emails and research.
- practice_panel: 3 to 5 people the presenter could add to a rehearsal, playing the roles that usually influence a decision like this at a
  company like this (e.g. CTO, procurement) and who are not already among the attendees, most influential first. Give them invented,
  realistic Indian names. Never use the names of real people found in the research. These are clearly hypothetical and are never presented
  as attendees: the presenter rehearses against the real attendees and adds these if they want.
- goal: what the presenter most likely wants from this meeting, in one short line (e.g. "a paid 3-month pilot of RouteIQ approved"),
  inferred only from the invite, the emails and what they offer if the meeting says so; why: one sentence on what it is based on
  (e.g. "Rajiv's last email asks for a pilot proposal"). If nothing shows it, your best reading of the invite, and say so in why.
- questions: the 5 hardest questions likely to come up about that goal (what would stop them saying yes to it). asked_by: the name of the attendee most likely to ask it, or "" if it is not
  clearly one of them. Never attribute a question to a practice_panel person. Include why it is likely and a short suggested answer.
- risks: what could lose this meeting (stop the goal), in short phrases, grounded in the emails and research.
- recent_news: only facts stated in the research above, each with its date. Do not add facts that are not in the research.
- pitch: how many minutes the presenter should plan to pitch in this meeting (whole minutes, 1 to 60), leaving the rest of the slot for
  discussion, from the meeting's length in minutes (if known) and the kind of meeting; why: one sentence, e.g. "30-minute call: about
  10 minutes of pitch, the rest for their questions".
Answer in JSON."""

ATTENDEE = {"type": "object", "properties": {
    "name": {"type": "string"}, "email": {"type": "string"},
    "role": {"type": "string", "description": "Only if stated in the invite or emails, else empty"},
    "gender": {"type": "string", "enum": ["male", "female"], "description": "Best guess from the name, only used to pick a rehearsal avatar"},
    "likely_focus": {"type": "string"}},
    "required": ["name", "email", "role", "gender", "likely_focus"]}

PRACTICE = {"type": "object", "properties": {
    "name": {"type": "string", "description": "Invented"}, "role": {"type": "string"},
    "role_short": {"type": "string", "description": "2 to 12 characters, e.g. CFO"},
    "gender": {"type": "string", "enum": ["male", "female"]},
    "why": {"type": "string", "description": "Why this role usually influences a decision like this"},
    "will_push_on": {"type": "string"}},
    "required": ["name", "role", "role_short", "gender", "why", "will_push_on"]}

BRIEF_SCHEMA = {"type": "object", "properties": {
    "summary": {"type": "string", "description": "2 sentences: what this meeting is and what will decide it"},
    "what_they_do": {"type": "string"},
    "recent_news": {"type": "array", "items": {"type": "object", "properties": {"text": {"type": "string"}, "date": {"type": "string"}}, "required": ["text", "date"]}},
    "attendees": {"type": "array", "items": ATTENDEE},
    "practice_panel": {"type": "array", "items": PRACTICE},
    "questions": {"type": "array", "items": {"type": "object", "properties": {"question": {"type": "string"}, "asked_by": {"type": "string"}, "why": {"type": "string"}, "suggested_answer": {"type": "string"}}, "required": ["question", "asked_by", "why", "suggested_answer"]}},
    "risks": {"type": "array", "items": {"type": "string"}},
    "pitch": {"type": "object", "properties": {"minutes": {"type": "integer"}, "why": {"type": "string"}}, "required": ["minutes", "why"]},
    "goal": {"type": "object", "properties": {"text": {"type": "string"}, "why": {"type": "string"}}, "required": ["text", "why"]}},
    "required": ["summary", "what_they_do", "recent_news", "attendees", "practice_panel", "questions", "risks", "pitch", "goal"]}

# DryRun rehearsal prep (/prep): brief the confirmed practice panel for one rehearsal. Nothing about the meeting is fixed in
# code: how many questions, who interrupts, who chairs and what they say all come from here (and later from /turn).
REHEARSAL_PROMPT = """You set up a rehearsal of a real meeting. The presenter, {presenter}, will pitch to the practice panel below, in a virtual
boardroom, and the panel will react as these people would in this meeting. {length} Plan it.

Meeting (from the calendar, with n8n's notes):
{meeting}

The presenter's brief (real attendees, research, likely questions, risks):
{brief}

The practice panel (ids are fixed; "source": "email" means a real attendee, anything else is a practice role):
{panel}

What the presenter offers, and what they want from this meeting (aim the objections at whatever would stop that ask):
{side}

The deck, slide by slide (index from 0; empty if there is no deck or a slide has no text):
{deck}

The last rehearsal of this meeting (empty if this is the first):
{history}

What the real attendees actually raised before, from their twins (the presenter's real emails and notes, never a rehearsal; each fact
has an id; "readings" are n8n's interpretations, not facts; empty if none):
{twins}

Decide, for this meeting and this panel (never a generic template):
- slides: for each slide in the deck, a short title, its 1 to 3 key points (what the presenter must get across), target_seconds
  (all slides together {pace}, more time where the slide carries more), and rescue cues for when the presenter
  freezes: calm (a few calming words), keyword (the one word or number that unlocks the slide), bridge (a phrase to carry on from),
  and question: a short, kind question the chair could ask to bring a presenter who froze on this slide back in, built from its
  main key point (e.g. "Maybe walk us through the pilot numbers?"), under 12 words.
  A slide with no text: title "Slide <n>" (n from 1), no key points, a calm cue and an empty question only; never guess what it shows. No deck: an empty list.
- personas: for each panel member, by id: display_name (keep the given name; invent a realistic Indian name only if it is empty),
  priorities (what they care about most in this meeting), and objections tied to slides (slide_index, or -1 when there is no deck or it
  could come at any time), grounded in the deck and the research, with source "deck" or "research". The brief's others_doing_this
  is who n8n found in the news already doing what the deck pitches: give each to the person who would care most, as a "research"
  objection on its slide that names them and asks how this is different, built on its question and what the source says. If there was a last rehearsal,
  give each of its weak spots to the person who would press on it hardest, as an objection with source "history", on the slide it is
  about, so this rehearsal is harder exactly where the last one was weak; the plan must leave room to ask about them. Each question
  it owes (owed: questions the presenter could not answer last time) goes back to the person who asked it, as a "history" objection
  with that exact question, and is among the first asked. A panel member with a twin (above, by id) opens with what they actually
  raised before: give them an objection on each of their most relevant raised facts (up to 3), in their words, with source "twin" and
  that fact's fact_id, on the slide it is about; let their stated preferences shape their priorities and manner. Readings may shape
  manner, never an objection. Every other objection has fact_id "". manner: "interrupts" if, in a real
  meeting like this, this person would raise a hand during the pitch; "waits" if they would keep it for the questions. Base it on the
  role, the kind of meeting and difficulty (1 easy to 3 hard).
- chair: the id of the one person who would run this meeting (usually the most senior person from the company): they welcome the
  presenter, open the floor and close the meeting.
- plan: during_pitch and after_pitch, how many questions a real meeting of this kind and length would have during and after the
  pitch, and why (one sentence the presenter will read). Interruptions come from people whose manner is "interrupts". A question with
  its answer takes about a minute, and interruptions eat into the pitch, so keep the numbers realistic for {pace}: a short
  pitch gets few interruptions, if any. Pick the questions that matter most, not one per person. interrupts: where each question
  during the pitch would come, one entry per question (as many as during_pitch): persona_id (someone whose manner is "interrupts"),
  slide_index (the slide it is about; 0 if there is no deck), after_s (how many seconds the presenter would have talked on that slide
  before this person's hand goes up, e.g. once the claim it is about has been made, 8 to 90; with no deck, seconds into the pitch) and
  about (a few words). The presenter is only heard mid-slide at these points, so put them where a real interruption would come.
- time: {time_rule}
- rescue_after_s: seconds of silence before the calm, keyword and bridge cues, rising (about 3, 6 and 10 for most presenters).
- lines: short lines voiced ahead of time so common reactions play at once, in the voice of each person, for this meeting:
  the chair's "welcome" (one, greeting the presenter by name if known, warm and brief, inviting them to begin),
  the chair's "open_floor" (one, thanking them and opening the questions, without naming who asks first: that is decided live),
  both fitting what the presenter wants from the meeting if it is known,
  and 2 "acknowledge" lines per person: 2 to 6 words that fit after ANY reasonable answer to ANY question, so never mention a topic
  (e.g. "Okay, that helps.", "Fair enough.", "Understood, thanks."), in that person's manner. {time_lines} Spoken English, natural;
  the welcome and open_floor under 20 words each.
Answer in JSON."""

REHEARSAL_SCHEMA = {"type": "object", "properties": {
    "slides": {"type": "array", "items": {"type": "object", "properties": {
        "index": {"type": "integer"}, "title": {"type": "string"},
        "key_points": {"type": "array", "items": {"type": "string"}},
        "target_seconds": {"type": "integer"},
        "rescue": {"type": "object", "properties": {"calm": {"type": "string"}, "keyword": {"type": "string"}, "bridge": {"type": "string"}, "question": {"type": "string"}},
                   "required": ["calm", "keyword", "bridge", "question"]}},
        "required": ["index", "title", "key_points", "target_seconds", "rescue"]}},
    "personas": {"type": "array", "items": {"type": "object", "properties": {
        "id": {"type": "string"}, "display_name": {"type": "string"},
        "priorities": {"type": "array", "items": {"type": "string"}},
        "objections": {"type": "array", "items": {"type": "object", "properties": {
            "slide_index": {"type": "integer"}, "text": {"type": "string"}, "source": {"type": "string", "enum": ["deck", "research", "history", "twin"]},
            "fact_id": {"type": "string"}},
            "required": ["slide_index", "text", "source", "fact_id"]}},
        "manner": {"type": "string", "enum": ["interrupts", "waits"]}},
        "required": ["id", "display_name", "priorities", "objections", "manner"]}},
    "chair": {"type": "string"},
    "plan": {"type": "object", "properties": {"during_pitch": {"type": "integer"}, "after_pitch": {"type": "integer"}, "why": {"type": "string"},
        "interrupts": {"type": "array", "items": {"type": "object", "properties": {
            "persona_id": {"type": "string"}, "slide_index": {"type": "integer"}, "after_s": {"type": "integer"}, "about": {"type": "string"}},
            "required": ["persona_id", "slide_index", "after_s", "about"]}}},
             "required": ["during_pitch", "after_pitch", "why", "interrupts"]},
    "time": {"type": "object", "properties": {"nudge_at_s": {"type": "integer"}, "cut_at_s": {"type": "integer"}, "why": {"type": "string"}},
             "required": ["nudge_at_s", "cut_at_s", "why"]},
    "rescue_after_s": {"type": "array", "items": {"type": "integer"}},
    "lines": {"type": "array", "items": {"type": "object", "properties": {
        "persona_id": {"type": "string"}, "kind": {"type": "string", "enum": ["welcome", "open_floor", "acknowledge", "time_nudge", "time_up"]}, "text": {"type": "string"}},
        "required": ["persona_id", "kind", "text"]}}},
    "required": ["slides", "personas", "chair", "plan", "time", "rescue_after_s", "lines"]}

# The parts of REHEARSAL_PROMPT that depend on whether the presenter set a time limit (contract 0.25)
REHEARSAL_TIMED = {
    "length": "They mean to pitch for about {minutes} minutes; the questions come on top of that.",
    "pace": "about {minutes} minutes",
    "time_rule": """how the chair keeps time in a meeting like this, in seconds since the presenter began: nudge_at_s, when the chair says
  time is nearly up (usually right at the limit, {seconds}); cut_at_s, when the chair stops the pitch and moves to the questions, in a
  meeting that keeps strictly to time (investors, a tight slot, a busy senior panel: about a quarter to a half past the limit), or 0 if
  this chair would let the presenter finish; why: one sentence the presenter will read.""",
    "time_lines": """The chair's "time_nudge" (one, polite, under 12 words, e.g. "We're nearly at time, could you bring it to a
  close?") and, only if cut_at_s is not 0, the chair's "time_up" (one, under 15 words, stopping the pitch and going to questions, e.g.
  "Let's stop there and take some questions.").""",
}
REHEARSAL_UNTIMED = {
    "length": "They set no time limit and will take as long as they need.",
    "pace": "the time a clear pitch of this deck would naturally take; only a guide, nobody keeps time",
    "time_rule": "nudge_at_s 0, cut_at_s 0 and why \"\": there is no time limit, so nobody keeps time.",
    "time_lines": "No time_nudge or time_up lines: there is no time limit.",
}

# DryRun turn (/turn): how the room reacts to what the presenter just said. n8n decides who speaks, what and why;
# the headset only decides when (it waits for the presenter to pause).
TURN_PROMPT = """You are the panel in a rehearsal of a real meeting, deciding how the room reacts to what the presenter just said.
React as these people would in this meeting: realistic, specific, never theatrical. During the pitch, most of the time nobody speaks.

The meeting: {meeting}
The plan for questions: {plan}. Asked so far: {asked_during} during the pitch, {asked_after} after it.
Time: {time}
The panel: {personas}
Lines voiced ahead of time (use one by its line_id when it fits, instead of new text): {lines}
The slide on screen: {slide}
What has happened so far, oldest first: {turns}
Every question asked so far (threads): {threads}

This moment: {mode}{asked_by}
What the presenter just said: "{transcript}"

What to do for each moment:
- opening (their first words): if they introduced themselves or greeted the room, the chair welcomes them (kind "welcome", its line_id).
  If they went straight into the pitch, or said nothing, no reaction.
- segment (what they said on one slide): decide whether anyone interrupts now. Only someone whose manner is "interrupts", only while
  questions during the pitch remain in the plan (a guide: break it only for something that really matters), and only about this slide
  or what was just said: a claim with nothing behind it, a number that does not add up, a gap against their objections or the research.
  Never ask what the presenter already covered, nor anything a thread already asks. A question: kind "question", raise_hand true,
  one or two sentences in that person's voice, referring to what was said. Otherwise no reaction. A segment sent mid-slide comes
  at one of the plan's interruption points (plan.interrupts): the hand there goes up only if that point still matters after what
  was said; if the presenter already answered it, nobody reacts.
- answer (to the thread in this moment): judge it in answer_verdict: "resolved" (direct and specific), "partial" or "dodged", and set
  presenter_unsure true if they said they don't know, aren't sure or will come back to it. The person who asked reacts, once:
  resolved: an "acknowledge" line (by line_id). Unsure: they accept it and park it, kind "park" ("That's fine, send it to us after.").
  Partial or dodged: one "follow_up" only if the thread has had none yet (follow_ups 0) and it matters; if it already had one, they let
  it go, kind "move_on" ("Okay, let's leave that there."), visibly unconvinced if it was dodged. Never a second follow-up.
  During the pitch, unless there is a follow-up, the asker then hands back to the pitch, kind "hand_back" ("Thanks, please go on."),
  and nobody asks anything new. After the pitch, add what comes next: the next "question" from whoever matters most (an open thread
  first, with its thread_id), or, once the questions in the plan are done or time is well past the pitch, the chair's "closing".
  Like a real panel, the next question can build on what was just said by someone else ("Building on Sneha's point, ..."), or the
  chair can check back with the asker within their question ("Sneha, does that cover it? Then, ..."), when it fits.
- park, move_on and hand_back: leave text and line_id empty; a line voiced ahead of time plays.
- Threads: every question has one life: asked, at most one follow-up, then closed (answered, parked or dodged). Never ask a closed
  thread again or anything close to it. To ask an open thread again (a hand that went down), give its thread_id; a new question has
  an empty thread_id; a follow-up, park, move_on or hand_back has the thread_id of the thread being answered.
- pitch_end (the pitch is over): the chair opens the floor (kind "open_floor", its line_id), then the first "question" from whoever
  matters most, an open thread first. If the plan has no questions after the pitch, the chair closes instead. If the chair has just
  stopped the pitch for time, they have already moved to the questions: no open_floor, straight to the first question.
- closing (by the chair): how this kind of meeting really ends, in one or two sentences, fitting how it went and what the presenter
  wants (a next step towards it if it went well, polite and noncommittal if not), and end_session true.
After the pitch, questions are asked directly (raise_hand false). Every reaction has a reason: one sentence on why this person said this
now, which the presenter reads afterwards. note: one short sentence to the presenter ("you") on how this moment landed, matching what
actually happens in reactions, also when nobody reacts (e.g. "You put a number on the savings, so Rajiv held his cost question.").
Spoken English, natural, short. Answer in JSON."""

TURN_SCHEMA = {"type": "object", "properties": {
    "note": {"type": "string"},
    "reactions": {"type": "array", "items": {"type": "object", "properties": {
        "persona_id": {"type": "string"},
        "kind": {"type": "string", "enum": ["welcome", "question", "follow_up", "acknowledge", "park", "move_on", "hand_back", "open_floor", "closing"]},
        "text": {"type": "string"},
        "line_id": {"type": "string", "description": "A line voiced ahead of time, or empty"},
        "raise_hand": {"type": "boolean"},
        "reason": {"type": "string"},
        "thread_id": {"type": "string", "description": "The thread this belongs to, or empty for a new question"}},
        "required": ["persona_id", "kind", "text", "line_id", "raise_hand", "reason", "thread_id"]}},
    "answer_verdict": {"type": "string", "enum": ["resolved", "partial", "dodged", "none"]},
    "presenter_unsure": {"type": "boolean"},
    "end_session": {"type": "boolean"}},
    "required": ["note", "reactions", "answer_verdict", "presenter_unsure", "end_session"]}

# DryRun debrief (/debrief): the judgement on one rehearsal. Times, words per minute, filler words and pacing are counted in a Code
# node (the same input always gives the same numbers); this is what needs judgement, always tied to the presenter's own words.
DEBRIEF_PROMPT = """You are debriefing a rehearsal of a real meeting. {presenter} just pitched to a practice panel in a virtual boardroom;
the panel reacted live. Judge it as a sharp, fair coach would, using only what was actually said below. Write to the presenter ("you").

The meeting: {meeting}
The panel (what each cares about and will push on): {personas}
The plan for each slide (key points, target time): {slides}
Weak spots from the last rehearsal of this meeting (check whether they were fixed): {weak_spots}

What the presenter said, slide by slide, with the time spent and the numbers already counted (the time on a slide counts only the
pitch, not the questions asked on it):
{transcript}

The questions, the answers and how each answer was judged live:
{exchanges}

{length}

What went wrong on the system's side, not the presenter's (discount these; never judge the presenter for them): {trouble}
A transcript listed as possibly mis-heard came from speech recognition: never mark a quote from it, never call it jargon or nonsense,
and say "the transcript was unclear here" if it matters. A question that cut the pitch short is the panel's fault, not a pitch that
was too short.

Questions the presenter could not answer well (thread id, who asked, what they said):
{owed}

What n8n found about the company (the brief's research, with numbered sources):
{research}

Who n8n found in the news already doing what the deck pitches (their sources are numbered with the research above; None if no
deck was researched):
{others}

Decide:
- headline: one sentence on how it went and what it means for the real meeting (e.g. "A clear story, but finance left unconvinced
  about the price.").
- metrics: score 0-100 for exactly these four, each with a one-sentence explanation and 1 or 2 quotes as evidence (copied exactly, word
  for word, from what the presenter said, with the slide it was on):
  "Clarity" (could the panel follow what you offer and why it matters), "Evidence" (claims backed by numbers, proof, customers),
  "Objection handling" (how the questions were answered; 60 if there were none), "Structure" (opening, flow between slides, a clear ask
  at the end: did they ask for what they wanted from the meeting, if it is given above, plainly enough for the panel to say yes).
- stakeholders: for each panel member, by id: stance "backs", "undecided" or "opposes" after this pitch, given what they care about and
  how their questions went; reason (one sentence, specific); and the deciding moment: a quote copied exactly from the presenter and its
  slide (or an empty quote if nothing decided it).
- slides: for each slide that has something said on it, by index: covered and missed (which of its key points came across, in a few words
  each); marks on the transcript: up to 4 per slide, each a quote copied exactly from that slide's transcript (a few words to one
  sentence), its kind ("hedge" for weak or apologetic phrasing, "unsupported" for a claim with nothing behind it, "wrong_fact" for
  something false or contradicting the deck, "landed" for something that clearly worked), a short note on why, and better: how to say it
  instead (empty for "landed"). At most one "landed" per slide, and only for a specific claim, number or answer that worked; never for
  reading out a title. Do not mark filler words; they are already counted. notes: the talk track for this slide next time, 2 to 4
  sentences in the presenter's voice, keeping what worked and fixing what did not.
- drill: the one thing to practise next: a short title, focus_persona (the id of the person who will press on it), the slides it is about
  (indexes) and minutes (2 to 5).
- weak_spots: 1 to 3 topics to press on next time, a few words each (e.g. "the payback period", "integration with their TMS").
- owed: for each question the presenter could not answer well (listed above), by its thread id: suggested, a model answer in the
  presenter's voice, 3 to 5 sentences, built only from their deck's key points, the research above and what they actually said;
  confirm, what they must check or fill in themselves before the real meeting (never invent facts about their own product, numbers
  or customers: say what to confirm instead); and sources, the numbers of the research sources it used (empty if none).
Be honest and specific; no generic advice. Answer in JSON."""

DEBRIEF_SCHEMA = {"type": "object", "properties": {
    "headline": {"type": "string"},
    "metrics": {"type": "array", "items": {"type": "object", "properties": {
        "name": {"type": "string", "enum": ["Clarity", "Evidence", "Objection handling", "Structure"]},
        "score": {"type": "integer"}, "explanation": {"type": "string"},
        "evidence": {"type": "array", "items": {"type": "object", "properties": {"slide_index": {"type": "integer"}, "quote": {"type": "string"}},
                                                "required": ["slide_index", "quote"]}}},
        "required": ["name", "score", "explanation", "evidence"]}},
    "stakeholders": {"type": "array", "items": {"type": "object", "properties": {
        "persona_id": {"type": "string"}, "stance": {"type": "string", "enum": ["backs", "undecided", "opposes"]},
        "reason": {"type": "string"}, "quote": {"type": "string"}, "slide_index": {"type": "integer"}},
        "required": ["persona_id", "stance", "reason", "quote", "slide_index"]}},
    "slides": {"type": "array", "items": {"type": "object", "properties": {
        "index": {"type": "integer"},
        "covered": {"type": "array", "items": {"type": "string"}}, "missed": {"type": "array", "items": {"type": "string"}},
        "marks": {"type": "array", "items": {"type": "object", "properties": {
            "quote": {"type": "string"}, "kind": {"type": "string", "enum": ["hedge", "unsupported", "wrong_fact", "landed"]},
            "note": {"type": "string"}, "better": {"type": "string"}},
            "required": ["quote", "kind", "note", "better"]}},
        "notes": {"type": "string"}},
        "required": ["index", "covered", "missed", "marks", "notes"]}},
    "drill": {"type": "object", "properties": {
        "title": {"type": "string"}, "focus_persona": {"type": "string"}, "slides": {"type": "array", "items": {"type": "integer"}},
        "minutes": {"type": "integer"}},
        "required": ["title", "focus_persona", "slides", "minutes"]},
    "weak_spots": {"type": "array", "items": {"type": "string"}},
    "owed": {"type": "array", "items": {"type": "object", "properties": {
        "thread_id": {"type": "string"}, "suggested": {"type": "string"}, "confirm": {"type": "string"},
        "sources": {"type": "array", "items": {"type": "integer"}}},
        "required": ["thread_id", "suggested", "confirm", "sources"]}}},
    "required": ["headline", "metrics", "stakeholders", "slides", "drill", "weak_spots", "owed"]}

# DryRun deck research (/deck-research, contract 0.31): who else already does what the deck pitches. A deck is mostly about the
# presenter's own product, which no outside source has written about; what a well-read panel knows is the competition. n8n searches the
# news for it, and the panel asks "how is yours different?" by name. It never checks the presenter's claims or advises on the slides.
DECK_SEARCH_PROMPT = """You are preparing a presenter for a real meeting. Read their deck and plan how to find who else already does what
it pitches: competitors, big companies with a similar product, startups, government programmes, research labs.

The meeting: {meeting}
What the presenter offers and wants from it: {side}
The deck, slide by slide (index from 0):
{deck}

about: one sentence on what the deck pitches and to whom, in plain words.
searches: 2 or 3 Google News searches that would surface others doing the same thing, the most specific first. Each:
- query: 3 to 5 words naming the kind of product or solution the way a journalist would (e.g. "AI route optimisation logistics",
  "remote patient monitoring app", "solar inverter fault detection"), never the presenter's own product name, project title or team; spell out acronyms the way the
  deck means them; no quotes or operators;
- broad: a broader search, 2 or 3 words, for when the first finds nothing (e.g. "fleet management software");
- slide_index: the slide where a panel would bring the competition up: the slide that says what is new or different, or the solution
  slide (never the title slide unless the deck has nothing else).
Answer in JSON."""

DECK_SEARCH_SCHEMA = {"type": "object", "properties": {
    "about": {"type": "string"},
    "searches": {"type": "array", "items": {"type": "object", "properties": {
        "query": {"type": "string"}, "broad": {"type": "string"}, "slide_index": {"type": "integer"}},
        "required": ["query", "broad", "slide_index"]}}},
    "required": ["about", "searches"]}

DECK_OTHERS_PROMPT = """You find who else already does what a presenter pitches, before a real meeting, so the panel can ask how they
are different. Say only what the sources say.

The meeting: {meeting}
What the deck pitches: {about}
The deck's slides (index, title line): {slides}

Headlines found (numbered sources; many will share a word or an acronym but be about something else):
{headlines}

others: up to 4 companies, products, programmes or labs that the headlines show already building or running the same or nearly the
same thing as the deck (the same problem for the same kind of user, or the same technology for the same use). Leave out: a headline
about the wider field (e.g. "AI in healthcare", "the EV boom"), a trend piece, explainer or opinion, a company only investing,
hiring or seeking partners, and a hobby project. Most decks have 0 to 2; an empty list is a fine answer. Each:
- name: who does the work, as the headline names them (e.g. "Tata Motors", "a Pune startup"); never the publisher, the outlet or a
  think tank writing about it (if the headline doesn't say who, name the programme, e.g. "the state's telemedicine programme");
- what: what the source says they do, in one plain sentence, with the date where the headline gives one; nothing beyond the headline;
- close: "same" if they do what the deck pitches, "near" if it overlaps (the same technology on the same kind of machine or user, or
  the same problem for the same user solved another way); the same technology in an unrelated industry (e.g. AI
  fault detection on railway tracks, for a deck about factory machines) is neither: leave it out;
- slide_index: the slide where the panel would bring them up (from the slides above);
- question: how someone on the panel would put it, naming them, in one short sentence (e.g. "A Pune startup already plans routes for
  fleets like ours. What does yours do that theirs doesn't?");
- sources: the numbers of the headlines it rests on (at least one).
Answer in JSON."""

DECK_OTHERS_SCHEMA = {"type": "object", "properties": {
    "others": {"type": "array", "items": {"type": "object", "properties": {
        "name": {"type": "string"}, "what": {"type": "string"}, "close": {"type": "string", "enum": ["same", "near"]},
        "slide_index": {"type": "integer"}, "question": {"type": "string"}, "sources": {"type": "array", "items": {"type": "integer"}}},
        "required": ["name", "what", "close", "slide_index", "question", "sources"]}}},
    "required": ["others"]}

# DryRun twin (/twin, contract 0.27): a factual file on one real person, from real sources only, every fact quoted
TWIN_PROMPT = """You keep a factual file on one real person the presenter works with: {person}.
Below are the only sources you may use, each with an id. Emails are from the presenter's own inbox; a source marked SUGGESTION was
found by their name only and may be someone else (the presenter will check it). Nothing here comes from a rehearsal.

{sources}

Already in the file (do not repeat these): {known}

facts: what the sources say about THIS person, each:
- kind: "raised" (something they asked for, objected to, worried about or raised), "promised" (something the presenter promised
  them, only from the presenter's own emails or notes), "decision" (something they decided or agreed to), "preference" (how they
  like to work or what they care about, as they put it), "role" (their job title or responsibility, as a source states it),
  "context" (other professional facts: their team, region, projects, who they report to);
- text: one short line in plain words, at most 12 words, e.g. "Asked for a pilot proposal on one lane";
- source_id: the id of the source it comes from;
- quote: copied word for word from that source, 5 to 30 words, that shows the fact. If you cannot quote it, leave the fact out.
Professional only: nothing about their personal life, health, family, religion or politics. Do not guess; a fact must be stated.
readings: at most 3 interpretations of how they behave in a meeting (e.g. "Pushes on cost", "Wants numbers on one page"), each with
evidence: the ids of at least two facts that support it, existing ones by their id (f1, f2...) or your new facts as n0, n1... in
the order you list them. No reading without two pieces of evidence.
role: their current job title if a non-suggestion source states it, with its source_id; otherwise empty strings.
Answer in JSON."""

TWIN_SCHEMA = {"type": "object", "properties": {
    "facts": {"type": "array", "items": {"type": "object", "properties": {
        "kind": {"type": "string", "enum": ["raised", "promised", "decision", "preference", "role", "context"]},
        "text": {"type": "string"}, "source_id": {"type": "string"}, "quote": {"type": "string"}},
        "required": ["kind", "text", "source_id", "quote"]}},
    "readings": {"type": "array", "items": {"type": "object", "properties": {
        "text": {"type": "string"}, "evidence": {"type": "array", "items": {"type": "string"}}},
        "required": ["text", "evidence"]}},
    "role": {"type": "object", "properties": {"text": {"type": "string"}, "source_id": {"type": "string"}}, "required": ["text", "source_id"]}},
    "required": ["facts", "readings", "role"]}

# DryRun after the meeting (/after-meeting, contract 0.28): the presenter's own account of a real meeting, per person, with quotes
AFTER_PROMPT = """The presenter has just come out of a real meeting and said (or typed) how it went, in their own words. Work out what
happened, per person, using ONLY these notes.

The meeting: {meeting}
The people from the invite (only these can be named, by email): {attendees}
What the presenter wanted from it: {goal}
The presenter's notes (transcribed speech or typed; may be rough, or in Hinglish):
{notes}

What each person's practice seat asked in the last rehearsal of this meeting (only to compare below; never report it as something
they said in the real meeting):
{practice}

people: one entry per attendee the notes say something about (email from the list above; leave out anyone the notes don't mention):
- raised: what they asked for, objected to or worried about in the meeting;
- promised: what the presenter promised them;
- decided: what they decided or agreed to;
  each item: text (plain, at most 14 words) and quote (copied word for word from the notes, 3 to 25 words, that shows it);
- next_step: the next step agreed with them, in a few words, or "".
predicted: for each raised item, only when a practice question above for the SAME person asked substantially the same thing:
{ email, raised (the index of that raised item in their list, from 0), practice (the index of the practice question, from 0) }.
followup: the email the presenter would send the attendees now: subject, and body (plain text, under 180 words, in the presenter's
voice): thank them, answer or acknowledge each open point they raised, confirm what the presenter promised with any dates, and the next
step. Never invent facts, figures or commitments that are not in the notes; where the presenter must add something, write
[fill in: what]. Sign off as the presenter, without a name.
Answer in JSON."""

AFTER_ITEM = {"type": "array", "items": {"type": "object", "properties": {"text": {"type": "string"}, "quote": {"type": "string"}}, "required": ["text", "quote"]}}
AFTER_SCHEMA = {"type": "object", "properties": {
    "people": {"type": "array", "items": {"type": "object", "properties": {
        "email": {"type": "string"}, "raised": AFTER_ITEM, "promised": AFTER_ITEM, "decided": AFTER_ITEM, "next_step": {"type": "string"}},
        "required": ["email", "raised", "promised", "decided", "next_step"]}},
    "predicted": {"type": "array", "items": {"type": "object", "properties": {
        "email": {"type": "string"}, "raised": {"type": "integer"}, "practice": {"type": "integer"}}, "required": ["email", "raised", "practice"]}},
    "followup": {"type": "object", "properties": {"subject": {"type": "string"}, "body": {"type": "string"}}, "required": ["subject", "body"]}},
    "required": ["people", "predicted", "followup"]}
