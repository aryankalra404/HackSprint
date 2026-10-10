"""Builds the importable n8n workflows in ../ from readable Python.

    python3 n8n/build/build.py

No credentials are written to the files: after importing, pick them in n8n (see ../README.md).
"""

import json
import uuid
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent
GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
APP_URL = "http://localhost:3000"


def node(name, type_, version, params, pos, **extra):
    return {"parameters": params, "id": str(uuid.uuid4()), "name": name, "type": type_, "typeVersion": version, "position": pos, **extra}


def code(name, js, pos, **extra):
    return node(name, "n8n-nodes-base.code", 2, {"jsCode": js.strip()}, pos, **extra)


def gemini(name, body_expr, pos):
    """POST to Gemini; the key comes from a Header Auth credential (x-goog-api-key)."""
    return node(name, "n8n-nodes-base.httpRequest", 4.2, {
        "method": "POST",
        "url": GEMINI,
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": body_expr,
        "options": {"timeout": 120000},
    }, pos, retryOnFail=True, maxTries=3, waitBetweenTries=3000)


def sheets(name, operation, pos):
    params = {
        "operation": operation,
        "documentId": {"__rl": True, "value": "", "mode": "url"},
        "sheetName": {"__rl": True, "value": "Meetings", "mode": "name"},
        "options": {},
    }
    if operation == "appendOrUpdate":
        params["columns"] = {"mappingMode": "autoMapInputData", "value": {}, "matchingColumns": ["id"], "schema": []}
    return node(name, "n8n-nodes-base.googleSheets", 4.5, params, pos)


def connect(*chain):
    """connect("A", "B", "C") → A→B→C on main output 0. Use ("A", 1) for another output."""
    out = {}
    for a, b in zip(chain, chain[1:]):
        src, idx = (a if isinstance(a, tuple) else (a, 0))
        out.setdefault(src, {"main": []})
        while len(out[src]["main"]) <= idx:
            out[src]["main"].append([])
        out[src]["main"][idx].append({"node": b, "type": "main", "index": 0})
    return out


def merge(*conns):
    out = {}
    for c in conns:
        for src, v in c.items():
            dst = out.setdefault(src, {"main": []})
            for i, targets in enumerate(v["main"]):
                while len(dst["main"]) <= i:
                    dst["main"].append([])
                dst["main"][i].extend(targets)
    return out


def note(text, pos, w=420, h=200):
    return node("Note " + str(uuid.uuid4())[:4], "n8n-nodes-base.stickyNote", 1, {"content": text, "width": w, "height": h}, pos)


# ---------------------------------------------------------------- prompts (tested against gemini-2.5-flash)

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


def js_str(s):
    return json.dumps(s)


def js_obj(o):
    """A JSON value as JS source that never contains "}}", which would end an n8n {{ }} expression."""
    text = json.dumps(o)
    while "}}" in text:
        text = text.replace("}}", "} }")
    return text


# ---------------------------------------------------------------- workflow: DryRun prep

def prep_workflow():
    nodes = [
        note("## DryRun prep\nSpots important meetings on your calendar and prepares you for them: decides if it's worth it, "
             "reads your emails with the attendees, researches the company, writes the brief, proposes the panel, saves it "
             "to the Meetings sheet and emails you.\n\nThe web app can also add a meeting by hand (webhook).", [-80, -360], 520, 220),
        node("New calendar event", "n8n-nodes-base.googleCalendarTrigger", 1, {
            "pollTimes": {"item": [{"mode": "everyMinute"}]},
            "calendarId": {"__rl": True, "value": "primary", "mode": "list", "cachedResultName": "primary"},
            "triggerOn": "eventCreated",
            "options": {},
        }, [0, 0]),
        code("Shape the event", """
// One meeting per calendar event, in the shape the rest of the workflow (and docs/CONTRACT.md) uses
return $input.all().map(({ json: e }) => {
  const attendees = (e.attendees || []).map(a => ({ name: a.displayName || a.email.split('@')[0], email: a.email, self: !!a.self }));
  const self = attendees.find(a => a.self) || { email: e.creator?.email || e.organizer?.email || '' };
  return { json: {
    id: e.id,
    title: e.summary || 'Untitled meeting',
    start: e.start?.dateTime || e.start?.date || '',
    description: (e.description || '').replace(/<[^>]+>/g, ' ').slice(0, 2000),
    attendees: attendees.filter(a => !a.self).map(({ name, email }) => ({ name, email })),
    owner_email: self.email,
    from_web: false,
  } };
});""", [220, 0]),
        node("Add a meeting (web app)", "n8n-nodes-base.webhook", 2, {
            "httpMethod": "POST", "path": "dryrun/add-meeting", "responseMode": "onReceived", "options": {},
        }, [0, 220], webhookId=str(uuid.uuid4())),
        code("Shape the request", """
// The web app sends { title, start, company, website, context, attendees: [{ name, email }], owner_email }
return $input.all().map(({ json }) => {
  const b = json.body || {};
  return { json: {
    id: 'web-' + Date.now(),
    title: b.title || ('Meeting with ' + (b.company || 'a prospect')),
    start: b.start || new Date(Date.now() + 2 * 86400000).toISOString(),
    description: [b.company && ('Company: ' + b.company), b.website && ('Website: ' + b.website), b.context].filter(Boolean).join('\\n').slice(0, 4000),
    attendees: b.attendees || [],
    owner_email: b.owner_email || '',
    from_web: true,
  } };
});""", [220, 220]),
        gemini("Worth preparing?", "={{ JSON.stringify({ contents: [{ parts: [{ text: " + js_str(TRIAGE_PROMPT) +
               " + JSON.stringify($json, null, 1) }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: " +
               js_obj(TRIAGE_SCHEMA) + " } }) }}", [460, 100]),
        code("Read the decision", """
// Gemini's answer, merged back into the meeting it was about. Meetings added from the web app are always prepared.
const shaped = $('Shape the event').isExecuted ? $('Shape the event').all() : $('Shape the request').all();
return $input.all().map((item, i) => {
  const text = item.json.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
  const d = JSON.parse(text);
  const m = shaped[i].json;
  const domain = d.company_domain || (m.attendees[0]?.email || '').split('@')[1] || '';
  return { json: { ...m, prepare: m.from_web || d.prepare, why: d.why, company: d.company || m.title, company_domain: domain, kind: d.kind } };
});""", [680, 100]),
        node("Prepare it?", "n8n-nodes-base.if", 2, {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "conditions": [{"id": str(uuid.uuid4()), "leftValue": "={{ $json.prepare }}", "rightValue": True,
                                "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                "combinator": "and",
            },
            "options": {},
        }, [900, 100]),
        node("Not worth it", "n8n-nodes-base.noOp", 1, {}, [1120, 240]),
        code("Row: researching", """
// The meeting as a row in the Meetings sheet, while n8n works on it
return $input.all().map(({ json: m }) => ({ json: {
  id: m.id, title: m.title, start: m.start, company: m.company, kind: m.kind, why: m.why,
  attendees: JSON.stringify(m.attendees), owner_email: m.owner_email, status: 'researching',
  brief: '', proposal: '', updated_at: new Date().toISOString(),
} }));""", [1120, 0]),
        sheets("Save: researching", "appendOrUpdate", [1340, 0]),
        node("Emails with them", "n8n-nodes-base.gmail", 2.1, {
            "operation": "getAll",
            "returnAll": False,
            "limit": 10,
            "filters": {"q": "={{ (() => { const m = $('Read the decision').item.json; const who = m.attendees.map(a => a.email).filter(Boolean); "
                             "return who.length ? '(' + who.map(e => 'from:' + e + ' OR to:' + e).join(' OR ') + ') newer_than:120d' : 'from:nobody@invalid'; })() }}"},
        }, [1560, 0], alwaysOutputData=True),
        code("Summarise the emails", """
// The recent thread with the attendees, as short text for the brief
const msgs = $input.all().map(i => i.json).filter(m => m.snippet || m.text);
const meeting = $('Read the decision').first().json;
const emails = msgs.slice(0, 10).map(m => `From ${m.From || m.from?.text || ''}, ${m.date || m.Date || ''}: ${(m.snippet || m.text || '').slice(0, 400)}`).join('\\n') || 'No recent emails.';
return [{ json: { meeting, emails } }];""", [1780, 0]),
        gemini("Research the company", "={{ JSON.stringify({ contents: [{ parts: [{ text: " + js_str(RESEARCH_PROMPT) +
               ".replace('{company}', $json.meeting.company).replace('{domain}', $json.meeting.company_domain).replace('{kind}', $json.meeting.kind).replace('{title}', $json.meeting.title) }] }], tools: [{ google_search: {} }] }) }}",
               [2000, 0]),
        code("Read the research", """
// The grounded research text and its web sources
const c = $json.candidates?.[0] || {};
const research = (c.content?.parts || []).map(p => p.text || '').join('');
const sources = (c.groundingMetadata?.groundingChunks || []).filter(g => g.web).map(g => ({ title: g.web.title || '', url: g.web.uri }));
const prev = $('Summarise the emails').first().json;
return [{ json: { ...prev, research, sources } }];""", [2220, 0]),
        gemini("Write the brief and panel", "={{ JSON.stringify({ contents: [{ parts: [{ text: " + js_str(BRIEF_PROMPT) +
               ".replace('{meeting}', JSON.stringify($json.meeting)).replace('{emails}', $json.emails).replace('{research}', $json.research) }] }], "
               "generationConfig: { responseMimeType: 'application/json', responseSchema: " + js_obj(BRIEF_SCHEMA) + " } }) }}",
               [2440, 0]),
        code("Seat the panel", """
// Give everyone a chair, a colour and a face, as the contract's /panel response (docs/CONTRACT.md)
const prev = $('Read the research').first().json;
const b = JSON.parse(($json.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('') || '{}');
const SEATS = [0, 1, 5, 2, 6, 3, 7, 4, 8];
const FACES = { female: ['business_female_01', 'business_female_02', 'business_female_03', 'business_female_04'],
                male: ['business_male_01', 'business_male_02', 'business_male_03', 'business_male_04', 'business_male_05', 'business_male_06', 'business_male_07'] };
const used = { female: 0, male: 0 };
const members = (b.panel || []).slice(0, 6).map((p, i) => {
  const g = p.gender === 'female' ? 'female' : 'male';
  const pool = FACES[g].length > used[g] ? FACES[g] : FACES[g === 'female' ? 'male' : 'female'];
  const avatar = pool[used[pool === FACES.female ? 'female' : 'male']++];
  return { id: 'p' + (i + 1), seat: SEATS[i], color: i, role: p.role, role_short: p.role_short, display_name: p.name,
           gender: g, avatar, why: p.why, source: p.source, cares_about: p.cares_about, will_push_on: p.will_push_on };
});
const brief = {
  summary: b.summary, company: { what_they_do: b.what_they_do, recent_news: b.recent_news || [] },
  people: members.map(m => ({ name: m.display_name, role: m.role, cares_about: m.cares_about, will_push_on: m.will_push_on })),
  questions: b.questions || [], risks: b.risks || [], sources: prev.sources.slice(0, 8),
};
const proposal = { draft_id: prev.meeting.id, members, suggestions: b.suggestions || [] };
return [{ json: { meeting: prev.meeting, brief, proposal } }];""", [2660, 0]),
        code("Row: ready", """
const { meeting: m, brief, proposal } = $json;
return [{ json: { id: m.id, status: 'ready', brief: JSON.stringify(brief), proposal: JSON.stringify(proposal), updated_at: new Date().toISOString() } }];""",
             [2880, 0]),
        sheets("Save: brief ready", "appendOrUpdate", [3100, 0]),
        node("Email the brief", "n8n-nodes-base.gmail", 2.1, {
            "sendTo": "={{ $('Seat the panel').first().json.meeting.owner_email }}",
            "subject": "=Your brief for {{ $('Seat the panel').first().json.meeting.title }} is ready",
            "emailType": "html",
            "message": "={{ (() => { const { meeting: m, brief: b } = $('Seat the panel').first().json; "
                       "const li = xs => '<ul>' + xs.map(x => '<li>' + x + '</li>').join('') + '</ul>'; "
                       "return '<h2>' + m.title + ' with ' + m.company + '</h2><p>' + b.summary + '</p>'"
                       " + '<h3>Who will push on what</h3>' + li(b.people.map(p => '<b>' + p.name + '</b> (' + p.role + '): ' + p.will_push_on))"
                       " + '<h3>The hardest questions</h3>' + li(b.questions.map(q => '<b>' + q.asked_by + ':</b> ' + q.question))"
                       " + '<h3>What could lose it</h3>' + li(b.risks)"
                       " + '<p><a href=\"" + APP_URL + "/m/' + encodeURIComponent(m.id) + '\">Open the brief and rehearse</a></p>'; })() }}",
            "options": {"appendAttribution": False},
        }, [3320, 0]),
    ]
    connections = merge(
        connect("New calendar event", "Shape the event", "Worth preparing?"),
        connect("Add a meeting (web app)", "Shape the request", "Worth preparing?"),
        connect("Worth preparing?", "Read the decision", "Prepare it?", "Row: researching", "Save: researching", "Emails with them",
                "Summarise the emails", "Research the company", "Read the research", "Write the brief and panel", "Seat the panel",
                "Row: ready", "Save: brief ready", "Email the brief"),
        connect(("Prepare it?", 1), "Not worth it"),
    )
    return {"name": "DryRun prep", "nodes": nodes, "connections": connections, "settings": {"executionOrder": "v1"}, "pinData": {}}


# ---------------------------------------------------------------- workflow: DryRun meetings API

def api_workflow():
    nodes = [
        note("## DryRun meetings API\nThe web app reads your meetings and briefs from the Meetings sheet: `GET /webhook/dryrun/meetings` "
             "and `GET /webhook/dryrun/meeting?id=` (docs/CONTRACT.md).", [-80, -260], 520, 160),
        node("GET /meetings", "n8n-nodes-base.webhook", 2, {"httpMethod": "GET", "path": "dryrun/meetings", "responseMode": "responseNode", "options": {}},
             [0, 0], webhookId=str(uuid.uuid4())),
        sheets("Read meetings", "read", [220, 0]),
        code("Upcoming meetings", """
// Upcoming (and today's) meetings, soonest first
const since = Date.now() - 12 * 3600 * 1000;
const meetings = $input.all().map(i => i.json).filter(r => r.id && (!r.start || Date.parse(r.start) >= since))
  .sort((a, b) => Date.parse(a.start || 0) - Date.parse(b.start || 0))
  .map(r => ({ id: String(r.id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status,
               attendees: (() => { try { return JSON.parse(r.attendees || '[]'); } catch { return []; } })() }));
return [{ json: { meetings } }];""", [440, 0], alwaysOutputData=True),
        node("Send meetings", "n8n-nodes-base.respondToWebhook", 1.1, {"respondWith": "firstIncomingItem", "options": {}}, [660, 0]),

        node("GET /meeting", "n8n-nodes-base.webhook", 2, {"httpMethod": "GET", "path": "dryrun/meeting", "responseMode": "responseNode", "options": {}},
             [0, 240], webhookId=str(uuid.uuid4())),
        sheets("Read meeting", "read", [220, 240]),
        code("The meeting and its brief", """
// One meeting by id, with its brief and proposed panel
const id = $('GET /meeting').first().json.query.id;
const r = $input.all().map(i => i.json).find(r => String(r.id) === String(id));
const parse = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
if (!r) return [{ json: { error: 'not found' } }];
return [{ json: {
  meeting: { id: String(r.id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees: parse(r.attendees) || [] },
  brief: parse(r.brief), proposal: parse(r.proposal),
} }];""", [440, 240], alwaysOutputData=True),
        node("Send the meeting", "n8n-nodes-base.respondToWebhook", 1.1, {"respondWith": "firstIncomingItem", "options": {}}, [660, 240]),
    ]
    connections = merge(
        connect("GET /meetings", "Read meetings", "Upcoming meetings", "Send meetings"),
        connect("GET /meeting", "Read meeting", "The meeting and its brief", "Send the meeting"),
    )
    return {"name": "DryRun meetings API", "nodes": nodes, "connections": connections, "settings": {"executionOrder": "v1"}, "pinData": {}}


if __name__ == "__main__":
    for fname, wf in [("wf1-prep.json", prep_workflow()), ("wf0-meetings-api.json", api_workflow())]:
        (OUT / fname).write_text(json.dumps(wf, indent=2) + "\n")
        print("wrote", OUT / fname, f"({len(wf['nodes'])} nodes)")
