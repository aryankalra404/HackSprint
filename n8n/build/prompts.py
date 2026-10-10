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

BRIEF_PROMPT = """You prepare a presenter for a high-stakes meeting. Write their brief and decide who will be in the room.

Meeting:
{meeting}

Recent emails with them:
{emails}

Research on the company:
{research}

Rules:
- panel: 4 to 6 people. Real attendees from the invite and the emails come first, with their real names (source "email").
  Then add the roles that usually decide a deal like this at a company like this (source "research" or "typical") with
  invented, realistic Indian names. Never use the names of real people found in the research, and never invent facts about real attendees beyond their role.
- Each person's will_push_on must be specific to this meeting, citing the research or emails where possible, not generic.
- questions: the 5 hardest questions they will ask, each with asked_by (a panel name), why they will ask it, and a short suggested answer.
- suggestions: 2 or 3 more roles that could be in the room, with why.
- risks: what could lose this meeting, in short phrases.
Answer in JSON."""

PERSON = {"type": "object", "properties": {
    "name": {"type": "string"}, "role": {"type": "string"},
    "role_short": {"type": "string", "description": "2 to 12 characters, e.g. CFO"},
    "gender": {"type": "string", "enum": ["male", "female"]},
    "why": {"type": "string", "description": "Why they will be in the room, one sentence"},
    "source": {"type": "string", "enum": ["email", "research", "deck", "typical"]},
    "cares_about": {"type": "string"}, "will_push_on": {"type": "string"}},
    "required": ["name", "role", "role_short", "gender", "why", "source", "cares_about", "will_push_on"]}

BRIEF_SCHEMA = {"type": "object", "properties": {
    "summary": {"type": "string", "description": "2 sentences: what this meeting is and what will decide it"},
    "what_they_do": {"type": "string"},
    "recent_news": {"type": "array", "items": {"type": "object", "properties": {"text": {"type": "string"}, "date": {"type": "string"}}, "required": ["text", "date"]}},
    "panel": {"type": "array", "items": PERSON},
    "suggestions": {"type": "array", "items": {"type": "object", "properties": {"role": {"type": "string"}, "role_short": {"type": "string"}, "why": {"type": "string"}}, "required": ["role", "role_short", "why"]}},
    "questions": {"type": "array", "items": {"type": "object", "properties": {"question": {"type": "string"}, "asked_by": {"type": "string"}, "why": {"type": "string"}, "suggested_answer": {"type": "string"}}, "required": ["question", "asked_by", "why", "suggested_answer"]}},
    "risks": {"type": "array", "items": {"type": "string"}}},
    "required": ["summary", "what_they_do", "recent_news", "panel", "suggestions", "questions", "risks"]}


