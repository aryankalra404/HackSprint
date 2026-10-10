"""Prompts and JSON schemas for the DryRun workflows (tested against gemini-2.5-flash)."""

import json

TRIAGE_PROMPT = """You decide which calendar events are worth preparing a rehearsal for. The presenter is the attendee marked "self".
Prepare for high-stakes conversations with people outside the presenter's organisation where they must persuade or perform:
sales pitches and demos, investor pitches, interviews, client reviews, partnership talks. Skip internal syncs, standups,
1:1s with colleagues, personal events and anything with no external attendee.
"why" is one specific sentence for the presenter: who is coming and what is at stake.

Event:
"""

TRIAGE_SCHEMA = {"type": "object", "properties": {
    "prepare": {"type": "boolean"},
    "why": {"type": "string"},
    "company": {"type": "string", "description": "The external organisation, or empty"},
    "company_domain": {"type": "string", "description": "Their email or web domain, or empty"},
    "kind": {"type": "string", "enum": ["sales_pitch", "investor_pitch", "interview", "client_review", "partnership", "internal", "personal", "other"]}},
    "required": ["prepare", "why", "company", "company_domain", "kind"]}

RESEARCH_PROMPT = """Research {company} ({domain}) for someone about to meet them: a {kind} titled "{title}".
In under 200 words: what they do, their scale, and the 3 to 5 most relevant recent developments (with dates) that the people
in the meeting will have on their minds: results, costs, leadership, strategy, problems. Plain text."""

BRIEF_PROMPT = """You prepare a presenter for a high-stakes meeting. Write their brief, which they will rely on, so it must be accurate.

Meeting:
{meeting}

Recent emails with them:
{emails}

Research on the company (from Google Search):
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
    "risks": {"type": "array", "items": {"type": "string"}}},
    "required": ["summary", "what_they_do", "recent_news", "attendees", "practice_panel", "suggestions", "questions", "risks"]}
