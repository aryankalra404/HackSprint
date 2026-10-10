"""Builds the DryRun n8n workflows as n8n Workflow SDK code (n8n/sdk/*.ts).

    python3 n8n/build/build.py

The SDK files are what gets validated and created in n8n through its MCP server (create_workflow_from_code).
Credentials are referenced by name only (newCredential); nothing secret is written. Prompts live in prompts.py.
"""

import json
from pathlib import Path

from prompts import BRIEF_PROMPT, BRIEF_SCHEMA, RESEARCH_PROMPT, TRIAGE_PROMPT, TRIAGE_SCHEMA

OUT = Path(__file__).resolve().parent.parent / "sdk"
GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
APP_URL = "http://localhost:3000"
MEETINGS_TABLE = {"__rl": True, "mode": "id", "value": "86BWrDlUXrOWFgqc", "cachedResultName": "DryRun meetings"}

IMPORTS = ("import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, "
           "nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, "
           "textSplitter, fromAi, expr } from '@n8n/workflow-sdk';\n\n")


def lit(v):
    """A Python value as an SDK (TypeScript) literal."""
    return json.dumps(v, indent=2)


def js_obj(o):
    """A JSON value as JS source that never contains "}}", which would end an n8n {{ }} expression."""
    text = json.dumps(o)
    while "}}" in text:
        text = text.replace("}}", "} }")
    return text


class Expr:
    def __init__(self, s):
        self.s = s


def ts(v, indent=0):
    """Like lit() but Expr values become expr('...') calls."""
    pad = "  " * indent
    if isinstance(v, Expr):
        return "expr(" + json.dumps(v.s) + ")"
    if isinstance(v, dict):
        if not v:
            return "{}"
        items = [f"{pad}  {json.dumps(k)}: {ts(x, indent + 1)}" for k, x in v.items()]
        return "{\n" + ",\n".join(items) + "\n" + pad + "}"
    if isinstance(v, list):
        if not v:
            return "[]"
        return "[\n" + ",\n".join(pad + "  " + ts(x, indent + 1) for x in v) + "\n" + pad + "]"
    return json.dumps(v)


def make_node(var, fn, type_, version, name, params, output, credentials=None, extra=None):
    config = {"name": name, "parameters": params}
    if extra:
        config.update(extra)
    body = ts(config, 1)
    if credentials:
        creds = ", ".join(f"{json.dumps(k)}: newCredential({json.dumps(v)})" for k, v in credentials.items())
        body = body[:-1].rstrip() + f",\n    \"credentials\": {{ {creds} }}\n  }}"
    out = body[:-1].rstrip() + f",\n    \"output\": {lit(output)}\n  }}"
    return f"const {var} = {fn}({{\n  type: {json.dumps(type_)},\n  version: {version},\n  config: {out}\n}});\n\n"


def code_node(var, name, js, output, extra=None):
    return make_node(var, "node", "n8n-nodes-base.code", 2, name, {"mode": "runOnceForAllItems", "language": "javaScript", "jsCode": js.strip()}, output, extra=extra)


def gemini_node(var, name, body_expr, output):
    return make_node(var, "node", "n8n-nodes-base.httpRequest", 4.5, name, {
        "method": "POST",
        "url": GEMINI,
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "googlePalmApi",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": Expr(body_expr),
        "options": {"timeout": 120000},
    }, output, credentials={"googlePalmApi": "Gemini"}, extra={"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 3000})


def upsert_node(var, name, output):
    return make_node(var, "node", "n8n-nodes-base.dataTable", 1.1, name, {
        "resource": "row", "operation": "upsert", "dataTableId": MEETINGS_TABLE, "matchType": "allConditions",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.meeting_id }}")}]},
        "columns": {"mappingMode": "autoMapInputData", "value": None},
    }, output)


GEMINI_REPLY = [{"candidates": [{"content": {"parts": [{"text": "{}"}]}}]}]
MEETING = {"meeting_id": "evt123", "title": "RouteIQ pitch", "start": "2026-10-16T15:00:00+05:30", "description": "",
           "attendees": [{"name": "Priya Nair", "email": "priya.nair@delhivery.com"}], "owner_email": "you@example.com", "from_web": False,
           "company": "Delhivery", "company_domain": "delhivery.com", "kind": "sales_pitch", "why": ""}


# ---------------------------------------------------------------- DryRun prep

def prep():
    c = IMPORTS
    c += make_node("calendarTrigger", "trigger", "n8n-nodes-base.googleCalendarTrigger", 1, "New calendar event", {
        "pollTimes": {"item": [{"mode": "everyMinute"}]},
        "calendarId": {"__rl": True, "mode": "list", "value": "primary", "cachedResultName": "primary"},
        "triggerOn": "eventCreated", "options": {},
    }, [{"id": "evt123", "summary": "RouteIQ pitch", "start": {"dateTime": "2026-10-16T15:00:00+05:30"}, "attendees": []}],
        credentials={"googleCalendarOAuth2Api": "Google Calendar"})
    c += code_node("shapeEvent", "Shape the event", """
// One meeting per calendar event, in the shape the rest of the workflow (and docs/CONTRACT.md) uses
return $input.all().map(({ json: e }) => {
  const attendees = (e.attendees || []).map(a => ({ name: a.displayName || a.email.split('@')[0], email: a.email, self: !!a.self }));
  const self = attendees.find(a => a.self) || { email: (e.creator && e.creator.email) || (e.organizer && e.organizer.email) || '' };
  return { json: {
    meeting_id: e.id,
    title: e.summary || 'Untitled meeting',
    start: (e.start && (e.start.dateTime || e.start.date)) || '',
    description: (e.description || '').replace(/<[^>]+>/g, ' ').slice(0, 2000),
    attendees: attendees.filter(a => !a.self).map(a => ({ name: a.name, email: a.email })),
    owner_email: self.email,
    from_web: false,
  } };
});""", [MEETING])
    c += make_node("webTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "Add a meeting (web app)", {
        "httpMethod": "POST", "path": "dryrun/add-meeting", "responseMode": "onReceived", "options": {},
    }, [{"body": {"company": "Delhivery", "context": "", "attendees": []}}])
    c += code_node("shapeRequest", "Shape the request", """
// The web app sends { id, title, start, company, website, context, attendees: [{ name, email }], owner_email }
return $input.all().map(({ json }) => {
  const b = json.body || json;
  return { json: {
    meeting_id: b.id || ('web-' + Date.now()),
    title: b.title || ('Meeting with ' + (b.company || 'a prospect')),
    start: b.start || new Date(Date.now() + 2 * 86400000).toISOString(),
    description: [b.company && ('Company: ' + b.company), b.website && ('Website: ' + b.website), b.context].filter(Boolean).join('\\n').slice(0, 4000),
    attendees: b.attendees || [],
    owner_email: b.owner_email || '',
    from_web: true,
  } };
});""", [{**MEETING, "meeting_id": "web-1", "from_web": True}])
    c += gemini_node("triage", "Worth preparing?", "{{ JSON.stringify({ contents: [{ parts: [{ text: " + json.dumps(TRIAGE_PROMPT) +
                     " + JSON.stringify($json, null, 1) }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: " +
                     js_obj(TRIAGE_SCHEMA) + " } }) }}", GEMINI_REPLY)
    c += code_node("readDecision", "Read the decision", """
// Gemini's answer, merged back into the meeting it was about. Meetings added from the web app are always prepared.
const shaped = $('Shape the event').isExecuted ? $('Shape the event').all() : $('Shape the request').all();
return $input.all().map((item, i) => {
  const parts = (item.json.candidates && item.json.candidates[0] && item.json.candidates[0].content && item.json.candidates[0].content.parts) || [];
  const d = JSON.parse(parts.map(p => p.text || '').join('') || '{}');
  const m = shaped[i].json;
  const domain = d.company_domain || ((m.attendees[0] && m.attendees[0].email) || '').split('@')[1] || '';
  return { json: { ...m, prepare: m.from_web || !!d.prepare, why: d.why || '', company: d.company || m.title, company_domain: domain, kind: d.kind || 'other' } };
});""", [{**MEETING, "prepare": True, "why": "", "company": "Delhivery", "company_domain": "delhivery.com", "kind": "sales_pitch"}])
    c += make_node("prepareIt", "ifElse", "n8n-nodes-base.if", 2.3, "Prepare it?", {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"leftValue": Expr("{{ $json.prepare }}"), "rightValue": True,
                            "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and",
        }, "options": {},
    }, [{"prepare": True}])
    c += make_node("skip", "node", "n8n-nodes-base.noOp", 1, "Not worth it", {}, [{}])
    c += code_node("rowResearching", "Row: researching", """
// The meeting as a row in the DryRun meetings table, while n8n works on it
return $input.all().map(({ json: m }) => ({ json: {
  meeting_id: m.meeting_id, title: m.title, start: m.start, company: m.company, kind: m.kind, why: m.why,
  attendees: JSON.stringify(m.attendees), owner_email: m.owner_email, status: 'researching',
  brief: '', proposal: '', updated_at: new Date().toISOString(),
} }));""", [{"meeting_id": "evt123", "status": "researching"}])
    c += upsert_node("saveResearching", "Save: researching", [{"id": 1}])
    c += make_node("emails", "node", "n8n-nodes-base.gmail", 2.2, "Emails with them", {
        "resource": "message", "operation": "getAll", "returnAll": False, "limit": 10, "simple": True,
        "filters": {"readStatus": "both", "q": Expr("{{ (() => { const m = $('Read the decision').item.json; const who = m.attendees.map(a => a.email).filter(Boolean); "
                                                    "return who.length ? '(' + who.map(e => 'from:' + e + ' OR to:' + e).join(' OR ') + ') newer_than:120d' : 'from:nobody@invalid'; })() }}")},
    }, [{"From": "Priya Nair <priya.nair@delhivery.com>", "snippet": "Thanks for the intro call", "Subject": "RouteIQ"}],
        credentials={"gmailOAuth2": "Gmail"}, extra={"alwaysOutputData": True, "executeOnce": True})
    c += code_node("summariseEmails", "Summarise the emails", """
// The recent thread with the attendees, as short text for the brief
const msgs = $input.all().map(i => i.json).filter(m => m.snippet);
const meeting = $('Read the decision').first().json;
const emails = msgs.slice(0, 10).map(m => 'From ' + (m.From || '') + ' (' + (m.Subject || '') + '): ' + (m.snippet || '').slice(0, 400)).join('\\n') || 'No recent emails.';
return [{ json: { meeting, emails } }];""", [{"meeting": MEETING, "emails": "No recent emails."}])
    c += gemini_node("research", "Research the company", "{{ JSON.stringify({ contents: [{ parts: [{ text: " + json.dumps(RESEARCH_PROMPT) +
                     ".replace('{company}', $json.meeting.company).replace('{domain}', $json.meeting.company_domain).replace('{kind}', $json.meeting.kind)"
                     ".replace('{title}', $json.meeting.title) }] }], tools: [{ google_search: {} }] }) }}", GEMINI_REPLY)
    c += code_node("readResearch", "Read the research", """
// The grounded research text and its web sources
const c = ($json.candidates && $json.candidates[0]) || {};
const research = ((c.content && c.content.parts) || []).map(p => p.text || '').join('');
const sources = ((c.groundingMetadata && c.groundingMetadata.groundingChunks) || []).filter(g => g.web).map(g => ({ title: g.web.title || '', url: g.web.uri }));
const prev = $('Summarise the emails').first().json;
return [{ json: { ...prev, research, sources } }];""", [{"meeting": MEETING, "emails": "", "research": "", "sources": []}])
    c += gemini_node("brief", "Write the brief and panel", "{{ JSON.stringify({ contents: [{ parts: [{ text: " + json.dumps(BRIEF_PROMPT) +
                     ".replace('{meeting}', JSON.stringify($json.meeting)).replace('{emails}', $json.emails).replace('{research}', $json.research) }] }], "
                     "generationConfig: { responseMimeType: 'application/json', responseSchema: " + js_obj(BRIEF_SCHEMA) + " } }) }}", GEMINI_REPLY)
    c += code_node("seatPanel", "Seat the panel", """
// The brief keeps only real attendees; the practice panel (attendees plus hypothetical roles) is for rehearsal in the web app.
// Everyone gets a chair, a colour and a face, as the contract's /panel response (docs/CONTRACT.md).
const prev = $('Read the research').first().json;
const parts = ($json.candidates && $json.candidates[0] && $json.candidates[0].content && $json.candidates[0].content.parts) || [];
const b = JSON.parse(parts.map(p => p.text || '').join('') || '{}');
const attendees = (b.attendees || []).filter(a => a.name);
const practice = (b.practice_panel || []).slice(0, Math.max(0, 6 - attendees.length));
const SEATS = [0, 1, 5, 2, 6, 3, 7, 4, 8];
const FACES = { female: ['business_female_01', 'business_female_02', 'business_female_03', 'business_female_04'],
                male: ['business_male_01', 'business_male_02', 'business_male_03', 'business_male_04', 'business_male_05', 'business_male_06', 'business_male_07'] };
const used = { female: 0, male: 0 };
const face = gender => {
  let g = gender === 'female' ? 'female' : 'male';
  if (used[g] >= FACES[g].length) g = g === 'female' ? 'male' : 'female';
  const f = FACES[g][used[g]];
  used[g] += 1;
  return f;
};
const short = role => (role || 'Guest').length <= 12 ? (role || 'Guest') : role.split(/\\s+/).filter(w => !['of', 'and', 'the', '&'].includes(w.toLowerCase())).map(w => w[0].toUpperCase()).join('').slice(0, 5);
const people = attendees.slice(0, 6).map(a => ({ display_name: a.name, role: a.role || 'Attendee', role_short: short(a.role), gender: a.gender,
  why: 'In the meeting invite', source: 'email', will_push_on: a.likely_focus }));
const extra = practice.map(p => ({ display_name: p.name, role: p.role, role_short: p.role_short, gender: p.gender, why: p.why, source: 'typical', will_push_on: p.will_push_on }));
const members = people.concat(extra).map((m, i) => ({ id: 'p' + (i + 1), seat: SEATS[i], color: i, avatar: face(m.gender), ...m }));
const brief = {
  summary: b.summary || '', company: { what_they_do: b.what_they_do || '', recent_news: b.recent_news || [] },
  attendees: attendees.map(a => ({ name: a.name, email: a.email || '', role: a.role || '', likely_focus: a.likely_focus || '' })),
  questions: b.questions || [], risks: b.risks || [], sources: prev.sources.slice(0, 8),
};
const proposal = { draft_id: prev.meeting.meeting_id, members, suggestions: b.suggestions || [] };
return [{ json: { meeting: prev.meeting, brief, proposal } }];""", [{"meeting": MEETING, "brief": {}, "proposal": {}}])
    c += code_node("rowReady", "Row: ready", """
const m = $json.meeting;
return [{ json: { meeting_id: m.meeting_id, status: 'ready', brief: JSON.stringify($json.brief), proposal: JSON.stringify($json.proposal), updated_at: new Date().toISOString() } }];""",
                   [{"meeting_id": "evt123", "status": "ready"}])
    c += upsert_node("saveReady", "Save: brief ready", [{"id": 1}])
    c += make_node("emailBrief", "node", "n8n-nodes-base.gmail", 2.2, "Email the brief", {
        "resource": "message", "operation": "send",
        "sendTo": Expr("{{ $('Seat the panel').first().json.meeting.owner_email }}"),
        "subject": Expr("Your brief for {{ $('Seat the panel').first().json.meeting.title }} is ready"),
        "emailType": "html",
        "message": Expr("{{ (() => { const s = $('Seat the panel').first().json; const m = s.meeting; const b = s.brief; "
                        "const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); "
                        "const li = xs => xs.length ? '<ul>' + xs.join('') + '</ul>' : '<p>None found.</p>'; "
                        "const names = b.attendees.map(a => a.name); "
                        "return '<h2>' + esc(m.title) + ' with ' + esc(m.company) + '</h2><p>' + esc(b.summary) + '</p>'"
                        " + '<h3>Who is coming</h3>' + li(b.attendees.map(a => '<li><b>' + esc(a.name) + '</b>' + (a.role ? ' (' + esc(a.role) + ')' : '') + '. Likely focus: ' + esc(a.likely_focus) + '</li>'))"
                        " + '<h3>Questions likely to come up</h3>' + li(b.questions.map(q => '<li>' + esc(q.question) + (names.includes(q.asked_by) ? ' <i>(likely from ' + esc(q.asked_by) + ')</i>' : '') + '<br><small>Suggested answer: ' + esc(q.suggested_answer) + '</small></li>'))"
                        " + '<h3>What could lose it</h3>' + li(b.risks.map(r => '<li>' + esc(r) + '</li>'))"
                        " + '<h3>Recent news about ' + esc(m.company) + '</h3>' + li(b.company.recent_news.map(n => '<li>' + esc(n.date) + ': ' + esc(n.text) + '</li>'))"
                        " + '<p><small>Sources: ' + b.sources.map(x => '<a href=\"' + x.url + '\">' + esc(x.title || 'link') + '</a>').join(', ') + '</small></p>'"
                        " + '<p><a href=\"" + APP_URL + "/m/' + encodeURIComponent(m.meeting_id) + '\">Open the brief and practise in DryRun</a>. "
                        "The practice panel there adds hypothetical roles to rehearse against.</p>'; })() }}"),
        "options": {"appendAttribution": False},
    }, [{"id": "msg1"}], credentials={"gmailOAuth2": "Gmail"})
    c += ("const about = sticky('## DryRun prep\\nSpots important meetings on your calendar and prepares you for them: decides if it is worth it, "
          "reads your emails with the attendees, researches the company, writes the brief, proposes the panel, saves it to the DryRun meetings "
          "table and emails you. The web app can also add a meeting by hand.', [calendarTrigger, webTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-prep', 'DryRun prep')
  .add(about)
  .add(calendarTrigger)
  .to(shapeEvent)
  .to(triage)
  .add(webTrigger)
  .to(shapeRequest)
  .to(triage)
  .add(triage)
  .to(readDecision)
  .to(prepareIt
    .onTrue(rowResearching.to(saveResearching.to(emails.to(summariseEmails.to(research.to(readResearch.to(brief.to(seatPanel.to(rowReady.to(saveReady.to(emailBrief)))))))))))
    .onFalse(skip))
  .group('Decide', [readDecision], { description: 'Gemini decides whether this meeting is worth preparing for, and why' })
  .group('Research', [rowResearching, saveResearching, emails, summariseEmails, research, readResearch], { description: 'Reads your recent emails with the attendees and researches the company with Google Search' })
  .group('Brief', [brief, seatPanel, rowReady, saveReady, emailBrief], { description: 'Writes the brief, seats the panel, saves it and emails you' });
"""
    return c


# ---------------------------------------------------------------- DryRun meetings API

def api():
    c = IMPORTS
    for var, path in [("listTrigger", "dryrun/meetings"), ("oneTrigger", "dryrun/meeting")]:
        name = "GET /meetings" if var == "listTrigger" else "GET /meeting"
        c += make_node(var, "trigger", "n8n-nodes-base.webhook", 2.2, name,
                       {"httpMethod": "GET", "path": path, "responseMode": "responseNode", "options": {}}, [{"query": {}}])
    for var, name in [("readAll", "Read meetings"), ("readOne", "Read meeting")]:
        c += make_node(var, "node", "n8n-nodes-base.dataTable", 1.1, name,
                       {"resource": "row", "operation": "get", "dataTableId": MEETINGS_TABLE, "returnAll": True},
                       [{"meeting_id": "evt123", "title": "RouteIQ pitch", "status": "ready"}], extra={"alwaysOutputData": True})
    c += code_node("shapeList", "Upcoming meetings", """
// Upcoming (and today's) meetings, soonest first (docs/CONTRACT.md, GET /meetings)
const since = Date.now() - 12 * 3600 * 1000;
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const meetings = $input.all().map(i => i.json).filter(r => r.meeting_id && (!r.start || Date.parse(r.start) >= since))
  .sort((a, b) => Date.parse(a.start || 0) - Date.parse(b.start || 0))
  .map(r => ({ id: String(r.meeting_id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees: parse(r.attendees) || [] }));
return [{ json: { meetings } }];""", [{"meetings": []}])
    c += code_node("shapeOne", "The meeting and its brief", """
// One meeting by id, with its brief and proposed panel (docs/CONTRACT.md, GET /meeting)
const id = $('GET /meeting').first().json.query.id;
const r = $input.all().map(i => i.json).find(r => String(r.meeting_id) === String(id));
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
if (!r) return [{ json: { error: 'not found' } }];
return [{ json: {
  meeting: { id: String(r.meeting_id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees: parse(r.attendees) || [] },
  brief: parse(r.brief), proposal: parse(r.proposal),
} }];""", [{"meeting": {}, "brief": None, "proposal": None}])
    for var, name in [("sendList", "Send meetings"), ("sendOne", "Send the meeting")]:
        c += make_node(var, "node", "n8n-nodes-base.respondToWebhook", 1.5, name, {"respondWith": "firstIncomingItem", "options": {}}, [{}])
    c += ("const about = sticky('## DryRun meetings API\\nThe web app reads your meetings and briefs from the DryRun meetings table: "
          "GET /webhook/dryrun/meetings and GET /webhook/dryrun/meeting?id= (docs/CONTRACT.md).', [listTrigger, oneTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-meetings-api', 'DryRun meetings API')
  .add(about)
  .add(listTrigger)
  .to(readAll)
  .to(shapeList)
  .to(sendList)
  .add(oneTrigger)
  .to(readOne)
  .to(shapeOne)
  .to(sendOne);
"""
    return c


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for fname, code in [("prep.ts", prep()), ("meetings-api.ts", api())]:
        (OUT / fname).write_text(code)
        print("wrote", OUT / fname, len(code), "chars")
