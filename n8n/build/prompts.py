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
- practice_panel: 1 to 4 extra people for a rehearsal only, playing the roles that usually influence a decision like this at a company
  like this (e.g. CTO, procurement). Give them invented, realistic Indian names. Never use the names of real people found in the research.
  These are clearly hypothetical and are never presented as attendees.
- questions: the 5 hardest questions likely to come up. asked_by: the name of the attendee most likely to ask it, or "" if it is not
  clearly one of them. Never attribute a question to a practice_panel person. Include why it is likely and a short suggested answer.
- risks: what could lose this meeting, in short phrases, grounded in the emails and research.
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
    "suggestions": {"type": "array", "items": {"type": "object", "properties": {"role": {"type": "string"}, "role_short": {"type": "string"}, "why": {"type": "string"}}, "required": ["role", "role_short", "why"]}},
    "questions": {"type": "array", "items": {"type": "object", "properties": {"question": {"type": "string"}, "asked_by": {"type": "string"}, "why": {"type": "string"}, "suggested_answer": {"type": "string"}}, "required": ["question", "asked_by", "why", "suggested_answer"]}},
    "risks": {"type": "array", "items": {"type": "string"}},
    "pitch": {"type": "object", "properties": {"minutes": {"type": "integer"}, "why": {"type": "string"}}, "required": ["minutes", "why"]}},
    "required": ["summary", "what_they_do", "recent_news", "attendees", "practice_panel", "suggestions", "questions", "risks", "pitch"]}

# DryRun rehearsal prep (/prep): brief the confirmed practice panel for one rehearsal. Nothing about the meeting is fixed in
# code: how many questions, who interrupts, who chairs and what they say all come from here (and later from /turn).
REHEARSAL_PROMPT = """You set up a rehearsal of a real meeting. The presenter, {presenter}, will pitch for about {minutes} minutes to the practice
panel below, in a virtual boardroom, and the panel will react as these people would in this meeting. Plan it.

Meeting (from the calendar, with n8n's notes):
{meeting}

The presenter's brief (real attendees, research, likely questions, risks):
{brief}

The practice panel (ids are fixed; "source": "email" means a real attendee, anything else is a practice role):
{panel}

The deck, slide by slide (index from 0; empty if there is no deck or a slide has no text):
{deck}

Decide, for this meeting and this panel (never a generic template):
- slides: for each slide in the deck, a short title, its 1 to 3 key points (what the presenter must get across), target_seconds
  (all slides together about {minutes} minutes, more time where the slide carries more), and rescue cues for when the presenter
  freezes: calm (a few calming words), keyword (the one word or number that unlocks the slide), bridge (a phrase to carry on from).
  A slide with no text: title "Slide <n>" (n from 1), no key points and a calm cue only; never guess what it shows. No deck: an empty list.
- personas: for each panel member, by id: display_name (keep the given name; invent a realistic Indian name only if it is empty),
  priorities (what they care about most in this meeting), and objections tied to slides (slide_index, or -1 when there is no deck or it
  could come at any time), grounded in the deck and the research, with source "deck" or "research". manner: "interrupts" if, in a real
  meeting like this, this person would raise a hand during the pitch; "waits" if they would keep it for the questions. Base it on the
  role, the kind of meeting and difficulty (1 easy to 3 hard).
- chair: the id of the one person who would run this meeting (usually the most senior person from the company): they welcome the
  presenter, open the floor and close the meeting.
- plan: during_pitch and after_pitch, how many questions a real meeting of this kind and length would have during and after the
  pitch, and why (one sentence the presenter will read). Interruptions come from people whose manner is "interrupts". A question with
  its answer takes about a minute, and interruptions eat into the pitch, so keep the numbers realistic for {minutes} minutes: a short
  pitch gets few interruptions, if any. Pick the questions that matter most, not one per person.
- rescue_after_s: seconds of silence before the calm, keyword and bridge cues, rising (about 3, 6 and 10 for most presenters).
- lines: short lines voiced ahead of time so common reactions play at once, in the voice of each person, for this meeting:
  the chair's "welcome" (one, greeting the presenter by name if known, warm and brief, inviting them to begin),
  the chair's "open_floor" (one, thanking them and opening the questions, without naming who asks first: that is decided live),
  and 2 "acknowledge" lines per person: 2 to 6 words that fit after ANY reasonable answer to ANY question, so never mention a topic
  (e.g. "Okay, that helps.", "Fair enough.", "Understood, thanks."), in that person's manner. Spoken English, natural; the welcome and
  open_floor under 20 words each.
Answer in JSON."""

REHEARSAL_SCHEMA = {"type": "object", "properties": {
    "slides": {"type": "array", "items": {"type": "object", "properties": {
        "index": {"type": "integer"}, "title": {"type": "string"},
        "key_points": {"type": "array", "items": {"type": "string"}},
        "target_seconds": {"type": "integer"},
        "rescue": {"type": "object", "properties": {"calm": {"type": "string"}, "keyword": {"type": "string"}, "bridge": {"type": "string"}},
                   "required": ["calm", "keyword", "bridge"]}},
        "required": ["index", "title", "key_points", "target_seconds", "rescue"]}},
    "personas": {"type": "array", "items": {"type": "object", "properties": {
        "id": {"type": "string"}, "display_name": {"type": "string"},
        "priorities": {"type": "array", "items": {"type": "string"}},
        "objections": {"type": "array", "items": {"type": "object", "properties": {
            "slide_index": {"type": "integer"}, "text": {"type": "string"}, "source": {"type": "string", "enum": ["deck", "research"]}},
            "required": ["slide_index", "text", "source"]}},
        "manner": {"type": "string", "enum": ["interrupts", "waits"]}},
        "required": ["id", "display_name", "priorities", "objections", "manner"]}},
    "chair": {"type": "string"},
    "plan": {"type": "object", "properties": {"during_pitch": {"type": "integer"}, "after_pitch": {"type": "integer"}, "why": {"type": "string"}},
             "required": ["during_pitch", "after_pitch", "why"]},
    "rescue_after_s": {"type": "array", "items": {"type": "integer"}},
    "lines": {"type": "array", "items": {"type": "object", "properties": {
        "persona_id": {"type": "string"}, "kind": {"type": "string", "enum": ["welcome", "open_floor", "acknowledge"]}, "text": {"type": "string"}},
        "required": ["persona_id", "kind", "text"]}}},
    "required": ["slides", "personas", "chair", "plan", "rescue_after_s", "lines"]}

# DryRun turn (/turn): how the room reacts to what the presenter just said. n8n decides who speaks, what and why;
# the headset only decides when (it waits for the presenter to pause).
TURN_PROMPT = """You are the panel in a rehearsal of a real meeting, deciding how the room reacts to what the presenter just said.
React as these people would in this meeting: realistic, specific, never theatrical. During the pitch, most of the time nobody speaks.

The meeting: {meeting}
The plan for questions: {plan}. Asked so far: {asked_during} during the pitch, {asked_after} after it.
Time: {elapsed} seconds in, for a pitch of {pitch} seconds.
The panel: {personas}
Lines voiced ahead of time (use one by its line_id when it fits, instead of new text): {lines}
The slide on screen: {slide}
What has happened so far, oldest first: {turns}
Questions raised but not answered yet: {pending}

This moment: {mode}{asked_by}
What the presenter just said: "{transcript}"

What to do for each moment:
- opening (their first words): if they introduced themselves or greeted the room, the chair welcomes them (kind "welcome", its line_id).
  If they went straight into the pitch, or said nothing, no reaction.
- segment (what they said on one slide): decide whether anyone interrupts now. Only someone whose manner is "interrupts", only while
  questions during the pitch remain in the plan (a guide: break it only for something that really matters), and only about this slide
  or what was just said: a claim with nothing behind it, a number that does not add up, a gap against their objections or the research.
  Never ask what the presenter already covered, and never repeat a pending question. A question: kind "question", raise_hand true,
  one or two sentences in that person's voice, referring to what was said. Otherwise no reaction.
- answer (to the question in this moment): judge it in answer_verdict: "resolved" (direct and specific), "partial" or "dodged". The person
  who asked reacts: an "acknowledge" line (by line_id) if resolved, or one "follow_up" (only if that question has had no follow-up yet)
  if partial or dodged and it matters. After the pitch, add what comes next: the next "question" from whoever matters most (a pending
  one first), or, once the questions in the plan are done or time is well past the pitch, the chair's "closing".
- pitch_end (the pitch is over): the chair opens the floor (kind "open_floor", its line_id), then the first "question" from whoever
  matters most, a pending one first. If the plan has no questions after the pitch, the chair closes instead.
- closing (by the chair): how this kind of meeting really ends, in one or two sentences, fitting how it went (a next step if it went
  well, polite and noncommittal if not), and end_session true.
After the pitch, questions are asked directly (raise_hand false). Every reaction has a reason: one sentence on why this person said this
now, which the presenter reads afterwards. note: one short sentence to the presenter ("you") on how this moment landed, matching what
actually happens in reactions, also when nobody reacts (e.g. "You put a number on the savings, so Rajiv held his cost question.").
Spoken English, natural, short. Answer in JSON."""

TURN_SCHEMA = {"type": "object", "properties": {
    "note": {"type": "string"},
    "reactions": {"type": "array", "items": {"type": "object", "properties": {
        "persona_id": {"type": "string"},
        "kind": {"type": "string", "enum": ["welcome", "question", "follow_up", "acknowledge", "open_floor", "closing"]},
        "text": {"type": "string"},
        "line_id": {"type": "string", "description": "A line voiced ahead of time, or empty"},
        "raise_hand": {"type": "boolean"},
        "reason": {"type": "string"}},
        "required": ["persona_id", "kind", "text", "line_id", "raise_hand", "reason"]}},
    "answer_verdict": {"type": "string", "enum": ["resolved", "partial", "dodged", "none"]},
    "end_session": {"type": "boolean"}},
    "required": ["note", "reactions", "answer_verdict", "end_session"]}
