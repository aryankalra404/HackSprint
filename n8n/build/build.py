"""Builds the DryRun n8n workflows as n8n Workflow SDK code (n8n/sdk/*.ts).

    python3 n8n/build/build.py

The SDK files are what gets validated and created in n8n through its MCP server (create_workflow_from_code).
Credentials are referenced by name only (newCredential); nothing secret is written. Prompts live in prompts.py.
"""

import json
from pathlib import Path

from prompts import (BRIEF_PROMPT, BRIEF_SCHEMA, DEBRIEF_PROMPT, DEBRIEF_SCHEMA, DECK_REVIEW_PROMPT, DECK_REVIEW_SCHEMA, REHEARSAL_PROMPT, REHEARSAL_SCHEMA, REHEARSAL_TIMED, REHEARSAL_UNTIMED, RESEARCH_PROMPT, TRIAGE_PROMPT, TRIAGE_SCHEMA, TURN_PROMPT,
                     TURN_SCHEMA, TWIN_PROMPT, TWIN_SCHEMA, WEB_PROMPT, AFTER_PROMPT, AFTER_SCHEMA)

OUT = Path(__file__).resolve().parent.parent / "sdk"
# One model for every Gemini step. Free-tier limits are per model (gemini-2.5-flash allows 20 requests a day).
GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
# When Gemini fails (quota, billing, an outage), the same prompt goes to an open model on Groq's free tier.
# Groq has no web search, so "Search the web" stays Gemini-only (it already carries on without it).
GROQ = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_WHISPER = "https://api.groq.com/openai/v1/audio/transcriptions"
WHISPER_MODEL = "whisper-large-v3-turbo"
APP_URL = "http://localhost:3000"
# Fewer news stories than this and n8n also searches the web (Gemini with Google Search, which needs billing on the key)
MIN_NEWS = 3
# Persona voices: Sarvam's Bulbul (Indian voices, one call per line, base64 WAV back). Each person gets a different voice that
# fits their avatar; the lists follow Sarvam's speaker names for this model.
SARVAM_TTS = "https://api.sarvam.ai/text-to-speech"
SARVAM_MODEL = "bulbul:v3"
# Speech to text for the voice note after a real meeting (0.28): clips under 30 s, language detected (Indian English, Hinglish)
SARVAM_STT = "https://api.sarvam.ai/speech-to-text"
SARVAM_STT_MODEL = "saaras:v4"
VOICES = {"female": ["priya", "kavya", "neha", "ritu", "shreya", "simran"], "male": ["rahul", "aditya", "rohan", "amit", "kabir", "varun", "dev"]}
# Lines that say nothing about the meeting (contract 0.26): voiced once per voice and cached by the laptop, so after a voice's first
# rehearsal they cost nothing and play at once. Two sets, so two people at the table don't use the same words. n8n still decides
# when one fits; anything with content is written live.
GENERIC_LINES = [
    {"filler": ["Mm-hm.", "Right.", "Okay.", "I see."], "park": ["That's fine, send it to us after.", "No problem, you can follow up on that."],
     "move_on": ["Okay, let's leave that there.", "Alright, let's move on."], "hand_back": ["Thanks. Please, go on.", "Got it, carry on."]},
    {"filler": ["Mm.", "Okay.", "Hm, right.", "Sure."], "park": ["Fair enough, come back to us on that.", "That's okay, send it over later."],
     "move_on": ["Okay, we'll leave it there.", "Fine, let's keep going."], "hand_back": ["Thank you, please continue.", "Okay, go ahead."]},
]
GENERIC_CHAIR = {"thanks": ["Thank you."], "rescue_soft": ["Take your time."]}
MEETINGS_TABLE = {"__rl": True, "mode": "id", "value": "wURCb4PjdZLpttns", "cachedResultName": "DryRun meetings"}
# One row per rehearsal: its bundle, what happened, the debrief's progress and the debrief (JSON as strings)
SESSIONS_TABLE = {"__rl": True, "mode": "id", "value": "xzUZexBbX6bcX18F", "cachedResultName": "DryRun sessions"}
# One row per real person you meet, keyed by their lower-cased email (contract 0.27: twins). JSON as strings.
PEOPLE_TABLE = {"__rl": True, "mode": "id", "value": "We8Agobm9SMWGc7E", "cachedResultName": "DryRun people"}
PEOPLE_COLUMNS = ["email", "aliases", "name", "company", "role", "sources", "facts", "readings", "meetings", "predictions", "build_log", "updated",
                  "execution_id", "workflow_id"]

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


def gemini_node(var, name, body_expr, output, extra=None):
    return make_node(var, "node", "n8n-nodes-base.httpRequest", 4.5, name, {
        "method": "POST",
        "url": GEMINI,
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "googlePalmApi",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": Expr(body_expr),
        "options": {"timeout": 120000},
    }, output, credentials={"googlePalmApi": "Gemini"}, extra=extra or {"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 3000})


def llm_nodes(var, name, prompt, output, schema=None, source="$json"):
    """A Gemini call with a Groq fallback on its error output: `var` (Gemini) and `var + 'Groq'`.
    `prompt` is a JS expression for the prompt text using $json. The Groq node gets Gemini's error item, not its input,
    so `source` says where to read that input instead (an expression for the same item)."""
    config = (", generationConfig: { responseMimeType: 'application/json', responseSchema: " + js_obj(schema) + " }") if schema else ""
    gemini = gemini_node(var, name, "{{ JSON.stringify({ contents: [{ parts: [{ text: " + prompt + " }] }]" + config + " }) }}", output,
                         extra={"onError": "continueErrorOutput", "retryOnFail": True, "maxTries": 2, "waitBetweenTries": 2000})
    # Groq's JSON mode takes no schema, so the schema goes in the prompt
    ask = ("(" + prompt.replace("$json", "j") + ")" + (" + " + json.dumps("\n\nReply with only a JSON object that follows this JSON schema:\n") +
           " + JSON.stringify(" + js_obj(schema) + ")" if schema else ""))
    # gpt-oss reasons before it answers, and its default 3,072 tokens can run out before the JSON is finished
    body = ("{{ (() => { const j = " + source + "; return JSON.stringify({ model: '" + GROQ_MODEL + "', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: " + ask + " }]" +
            (", response_format: { type: 'json_object' }" if schema else "") + " }); })() }}")
    groq = make_node(var + "Groq", "node", "n8n-nodes-base.httpRequest", 4.5, name + " (Groq)", {
        "method": "POST",
        "url": GROQ,
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "groqApi",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": Expr(body),
        "options": {"timeout": 120000},
    }, [{"choices": [{"message": {"content": "{}"}}]}], credentials={"groqApi": "Groq"},
        # Groq's free tier allows 8,000 tokens a minute, so wait out a burst rather than fail
        extra={"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 5000})
    return gemini + groq


def upsert_node(var, name, output):
    return make_node(var, "node", "n8n-nodes-base.dataTable", 1.1, name, {
        "resource": "row", "operation": "upsert", "dataTableId": MEETINGS_TABLE, "matchType": "allConditions",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.meeting_id }}")}]},
        "columns": {"mappingMode": "autoMapInputData", "value": None},
    }, output)


# Where n8n is in preparing a meeting, worked out from the steps that have run so far (contract: meeting.progress).
# Inlined into every node that saves progress, so each save carries the whole picture.
PROGRESS_JS = """
const ran = name => { try { return $(name).isExecuted; } catch (e) { return false; } };
const out = name => (ran(name) ? $(name).first().json : null);
const decision = out('Read the decision') || {};
const mail = out('Summarise the emails');
const research = out('Read the research');
const seated = out('Seat the panel');
const sent = out('Email the brief');
const names = (decision.attendees || []).map(a => a.name).join(' and ') || 'the attendees';
const company = decision.company || 'the company';
// n8n's code sandbox has no URL class, so read the host by hand: https://www.zeebiz.com/x -> zeebiz.com
const host = u => { const h = String(u || '').split('//').pop().split('/')[0]; return h.startsWith('www.') ? h.slice(4) : h; };
const sites = research ? [...new Set(research.sources.map(x => host(x.site || x.url)).filter(Boolean))] : [];
const attending = seated ? seated.proposal.members.filter(m => m.source === 'email').length : 0;
const practising = seated ? seated.proposal.members.length - attending : 0;
const suggested = seated ? (seated.proposal.suggestions || []).length : 0;
const step = (id, label, done, running, doneText, runningText, extra) =>
  ({ id, label, state: done ? 'done' : running ? 'running' : 'pending', detail: done ? doneText : running ? runningText : '', ...(extra || {}) });
const progress = [
  step('decide', 'Decide', true, false, decision.why || 'Worth preparing', ''),
  step('emails', 'Emails', !!mail, true,
    mail && mail.count ? 'Read ' + mail.count + ' recent email' + (mail.count === 1 ? '' : 's') + ' with ' + names : 'No recent emails with ' + names,
    'Reading your recent emails with ' + names),
  step('research', 'Research', !!research, !!mail,
    research ? 'Read ' + research.news_count + ' recent news stor' + (research.news_count === 1 ? 'y' : 'ies') + ' about ' + company + (research.has_website ? ' and their website' : '')
      + (!research.web_searched ? '' : research.web_count ? ', then searched the web (' + research.web_count + ' page' + (research.web_count === 1 ? '' : 's') + ')'
         : ". Little news, and web search isn't available on this Gemini key") : '',
    'Reading the news about ' + company + ' and their website',
    { sources: sites.slice(0, 8).map(h => ({ title: h, url: 'https://' + h })) }),
  step('brief', 'Brief', !!seated, !!research,
    seated ? 'Wrote ' + seated.brief.questions.length + ' likely questions and ' + seated.brief.risks.length + ' risks' : '', 'Writing your brief and the hardest questions'),
  step('panel', 'Panel', !!seated, !!research,
    'Seated ' + attending + ' from the invite' + (practising ? ' and ' + practising + ' practice role' + (practising === 1 ? '' : 's') : '') + '; suggested '
      + suggested + ' more to practise against', 'Seating the practice panel'),
  step('email', 'Email', !!sent && !sent.error, !!seated,
    'Emailed you the brief', 'Emailing you the brief'),
];
if (sent && sent.error) Object.assign(progress[5], { state: 'error', detail: "Couldn't email the brief" });
const progressFields = { progress: JSON.stringify(progress), execution_id: String($execution.id), workflow_id: String($workflow.id) };
"""


# The model's text, from Gemini or (when Gemini failed) the Groq fallback
REPLY_JS = """
const replyText = j => j.choices
  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')
  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');
"""


def progress_node(var, name):
    return code_node(var, name, PROGRESS_JS + """
// Save how far n8n has got, for the live progress on the brief page
return [{ json: { meeting_id: $('Read the decision').first().json.meeting_id, ...progressFields } }];""", [{"meeting_id": "evt123", "progress": "[]"}])


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
  const start = (e.start && (e.start.dateTime || e.start.date)) || '';
  const end = (e.end && (e.end.dateTime || e.end.date)) || '';
  // The slot's length, so the brief can suggest how long to pitch (null for all-day events)
  const minutes = start && end && e.start.dateTime ? Math.round((Date.parse(end) - Date.parse(start)) / 60000) : null;
  return { json: {
    meeting_id: e.id,
    title: e.summary || 'Untitled meeting',
    start,
    minutes,
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
// The web app sends { id, title, start, company, website, context, attendees: [{ name, email }], owner_email, offer }
return $input.all().map(({ json }) => {
  const b = json.body || json;
  return { json: {
    meeting_id: b.id || ('web-' + Date.now()),
    title: b.title || ('Meeting with ' + (b.company || 'a prospect')),
    start: b.start || new Date(Date.now() + 2 * 86400000).toISOString(),
    minutes: b.minutes || null,
    description: [b.company && ('Company: ' + b.company), b.website && ('Website: ' + b.website), b.offer && ('What the presenter offers: ' + b.offer), b.context].filter(Boolean).join('\\n').slice(0, 4000),
    attendees: b.attendees || [],
    owner_email: b.owner_email || '',
    from_web: true,
  } };
});""", [{**MEETING, "meeting_id": "web-1", "from_web": True}])
    c += llm_nodes("triage", "Worth preparing?", json.dumps(TRIAGE_PROMPT) + " + JSON.stringify($json, null, 1)", GEMINI_REPLY, schema=TRIAGE_SCHEMA,
                   source="($('Shape the event').isExecuted ? $('Shape the event') : $('Shape the request')).item.json")
    c += code_node("readDecision", "Read the decision", REPLY_JS + """
// The model's answer, merged back into the meeting it was about. Meetings added from the web app are always prepared.
const shaped = $('Shape the event').isExecuted ? $('Shape the event').all() : $('Shape the request').all();
return $input.all().map((item, i) => {
  const d = JSON.parse(replyText(item.json) || '{}');
  const m = shaped[i].json;
  const domain = d.company_domain || ((m.attendees[0] && m.attendees[0].email) || '').split('@')[1] || '';
  // Added by hand (or "Prepare anyway"): always prepared, and the reason says so when n8n would have skipped it
  const why = m.from_web && !d.prepare ? "Prepared because you asked. n8n's view: " + (d.why || 'not a high-stakes meeting') : (d.why || '');
  return { json: { ...m, prepare: m.from_web || !!d.prepare, why, company: d.company || m.title, company_domain: domain, kind: d.kind || 'other' } };
});""", [{**MEETING, "prepare": True, "why": "", "company": "Delhivery", "company_domain": "delhivery.com", "kind": "sales_pitch"}])
    c += make_node("prepareIt", "ifElse", "n8n-nodes-base.if", 2.3, "Prepare it?", {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"leftValue": Expr("{{ $json.prepare }}"), "rightValue": True,
                            "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and",
        }, "options": {},
    }, [{"prepare": True}])
    # Skipped meetings are kept, with the reason, so the presenter sees every decision and can prepare one anyway
    c += code_node("rowSkipped", "Row: skipped", """
// Not worth preparing: keep it in the table with n8n's reason, so the web app can list it and offer "Prepare anyway"
return $input.all().map(({ json: m }) => ({ json: {
  meeting_id: m.meeting_id, title: m.title, start: m.start, company: m.company, kind: m.kind, why: m.why,
  attendees: JSON.stringify(m.attendees), owner_email: m.owner_email, status: 'skipped',
  brief: '', proposal: '', progress: '[]', started_at: '', updated_at: new Date().toISOString(),
  execution_id: String($execution.id), workflow_id: String($workflow.id),
} }));""", [{"meeting_id": "evt123", "status": "skipped"}])
    c += upsert_node("saveSkipped", "Save: skipped", [{"id": 1}])
    c += code_node("rowResearching", "Row: researching", """
// The meeting as a row in the DryRun meetings table, while n8n works on it
""" + PROGRESS_JS + """
return $input.all().map(({ json: m }) => ({ json: {
  meeting_id: m.meeting_id, title: m.title, start: m.start, company: m.company, kind: m.kind, why: m.why,
  attendees: JSON.stringify(m.attendees), owner_email: m.owner_email, status: 'researching',
  brief: '', proposal: '', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...progressFields,
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
return [{ json: { meeting, emails, count: msgs.length } }];""", [{"meeting": MEETING, "emails": "No recent emails.", "count": 0}])
    c += progress_node("progressEmails", "Progress: emails read")
    c += upsert_node("saveProgressEmails", "Save progress: emails", [{"id": 1}])
    # Research from free sources: Google News (dated headlines with links) and the company's own website
    c += make_node("news", "node", "n8n-nodes-base.httpRequest", 4.5, "Find the news", {
        "method": "GET",
        "url": Expr("https://news.google.com/rss/search?q={{ encodeURIComponent('\"' + $('Summarise the emails').first().json.meeting.company + '\"') }}&hl=en-IN&gl=IN&ceid=IN:en"),
        "options": {"timeout": 20000, "response": {"response": {"responseFormat": "text"}}},
    }, [{"data": "<rss></rss>"}], extra={"onError": "continueRegularOutput", "retryOnFail": True, "maxTries": 2})
    c += make_node("website", "node", "n8n-nodes-base.httpRequest", 4.5, "Read their website", {
        "method": "GET",
        "url": Expr("https://{{ $('Summarise the emails').first().json.meeting.company_domain || 'invalid.invalid' }}"),
        "options": {"timeout": 15000, "redirect": {"redirect": {}}, "response": {"response": {"responseFormat": "text"}}},
    }, [{"data": "<html></html>"}], extra={"onError": "continueRegularOutput"})
    c += code_node("gatherSources", "Gather the sources", """
// Up to 15 recent headlines (with date, publisher and link) and the readable text of their homepage
const prev = $('Summarise the emails').first().json;
const rss = ($('Find the news').first().json.data || '').toString();
const unescape = t => t.replace(/<!\\[CDATA\\[|\\]\\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tag = (xml, t) => { const m = xml.match(new RegExp('<' + t + '[^>]*>([^]*?)</' + t + '>')); return m ? unescape(m[1]).trim() : ''; };
const news = (rss.match(/<item>[^]*?<\\/item>/g) || []).slice(0, 15).map(it => {
  const src = it.match(/<source url="([^"]*)">([^]*?)<\\/source>/);
  const date = new Date(tag(it, 'pubDate'));
  return { title: tag(it, 'title').replace(/ - [^-]+$/, ''), url: tag(it, 'link'), publisher: src ? unescape(src[2]) : '', site: src ? src[1] : '',
           date: isNaN(date) ? '' : date.toISOString().slice(0, 10) };
});
const html = ($('Read their website').first().json.data || '').toString();
const meta = name => { const m = html.match(new RegExp('<meta[^>]+(?:name|property)="' + name + '"[^>]+content="([^"]*)"', 'i')); return m ? unescape(m[1]) : ''; };
const body = html.replace(/<script[^]*?<\\/script>/gi, ' ').replace(/<style[^]*?<\\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
// App-style sites render in the browser; their meta description still says what the company does
const website = [tag(html, 'title'), meta('description'), meta('og:description'), body].filter(Boolean).join(' ').slice(0, 3000);
return [{ json: { ...prev, news, website } }];""", [{"meeting": MEETING, "emails": "", "news": [], "website": ""}])
    c += make_node("enoughNews", "ifElse", "n8n-nodes-base.if", 2.3, "Enough news?", {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"leftValue": Expr("{{ $json.news.length }}"), "rightValue": MIN_NEWS,
                            "operator": {"type": "number", "operation": "gte"}}],
            "combinator": "and",
        }, "options": {},
    }, [{"meeting": MEETING, "news": []}])
    # Small or private companies barely make the news: ask Gemini to search the web. On a free key this is refused (429),
    # so it carries on without, and no retries
    c += gemini_node("searchWeb", "Search the web", "{{ JSON.stringify({ contents: [{ parts: [{ text: " + json.dumps(WEB_PROMPT) +
                     ".replace('{company}', $json.meeting.company).replace('{domain}', $json.meeting.company_domain || 'domain unknown')"
                     ".replace('{kind}', $json.meeting.kind) }] }], tools: [{ google_search: {} }] }) }}", GEMINI_REPLY,
                     extra={"onError": "continueRegularOutput"})
    c += code_node("addWeb", "Add the web results", """
// Keep the search answer only if Google Search actually backed it, with the pages it used as sources
const prev = $('Gather the sources').first().json;
const c = ($json.candidates && $json.candidates[0]) || {};
const text = ((c.content && c.content.parts) || []).map(p => p.text || '').join('').trim();
const pages = ((c.groundingMetadata && c.groundingMetadata.groundingChunks) || []).map(x => x.web).filter(w => w && w.uri);
const found = text && pages.length > 0;
// Each page's title is its site (e.g. inc42.com); its link goes through Google's redirect to the article
const web = found ? pages.slice(0, 6).map(w => ({ title: w.title || 'Web page', url: w.uri, site: 'https://' + (w.domain || w.title || '') })) : [];
const error = $json.error ? ($json.error.message || String($json.error)).split('\\n')[0].slice(0, 160) : '';
return [{ json: { ...prev, web_searched: true, web_found: found ? text : '', web, web_error: error } }];""",
                   [{"meeting": MEETING, "emails": "", "news": [], "website": "", "web_searched": True, "web_found": "", "web": [], "web_error": ""}])
    c += llm_nodes("research", "Research the company", json.dumps(RESEARCH_PROMPT) +
                   ".replace('{company}', $json.meeting.company).replace('{kind}', $json.meeting.kind).replace('{title}', $json.meeting.title)"
                   ".replace('{news}', $json.news.map(n => n.date + ' | ' + n.publisher + ' | ' + n.title).join('\\n') || 'None found.')"
                   ".replace('{website}', $json.website || 'Not available.').replace('{web}', $json.web_found || 'Not searched.')", GEMINI_REPLY,
                   source="((() => { try { return $('Add the web results').isExecuted; } catch (e) { return false; } })() ? $('Add the web results') : $('Gather the sources')).first().json")
    c += code_node("readResearch", "Read the research", REPLY_JS + """
// The research summary, with the news it was written from as sources
const research = replyText($json);
// Came straight from the news, or through the web search when the news had little
const searched = (() => { try { return $('Add the web results').isExecuted; } catch (e) { return false; } })();
const prev = searched ? $('Add the web results').first().json : $('Gather the sources').first().json;
const web = prev.web || [];
const sources = prev.news.slice(0, 8).map(n => ({ title: (n.publisher ? n.publisher + ': ' : '') + n.title, url: n.url, date: n.date, site: n.site }))
  .concat(web.map(w => ({ title: w.title, url: w.url, site: w.site })));
return [{ json: { meeting: prev.meeting, emails: prev.emails, research, sources, news_count: prev.news.length, has_website: !!prev.website,
                  web_searched: searched, web_count: web.length, web_error: prev.web_error || '' } }];""",
                   [{"meeting": MEETING, "emails": "", "research": "", "sources": [], "news_count": 0, "has_website": False,
                     "web_searched": False, "web_count": 0, "web_error": ""}])
    c += progress_node("progressResearch", "Progress: researched")
    c += upsert_node("saveProgressResearch", "Save progress: research", [{"id": 1}])
    c += llm_nodes("brief", "Write the brief and panel", json.dumps(BRIEF_PROMPT) +
                   ".replace('{meeting}', JSON.stringify($('Read the research').first().json.meeting)).replace('{emails}', $('Read the research').first().json.emails)"
                   ".replace('{research}', $('Read the research').first().json.research)", GEMINI_REPLY, schema=BRIEF_SCHEMA)
    c += code_node("seatPanel", "Seat the panel", REPLY_JS + """
// The brief keeps only real attendees. The practice panel seats the real people from outside the presenter's organisation (contract 0.22);
// the hypothetical practice roles are suggestions the presenter can add with one tap, each a whole person with a name and a face.
// Only when no real attendee is known are the top two practice roles seated, so there is someone to pitch to.
// Everyone gets a chair, a colour and a face, as the contract's /panel response (docs/CONTRACT.md).
const prev = $('Read the research').first().json;
const b = JSON.parse(replyText($json) || '{}');
const attendees = (b.attendees || []).filter(a => a.name);
// Colleagues from the presenter's own company are on their side of the table (a public mail domain says nothing)
const PUBLIC = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'rediffmail.com'];
const domain = e => String(e || '').toLowerCase().split('@')[1] || '';
const own = domain(prev.meeting.owner_email);
const external = attendees.filter(a => !own || PUBLIC.includes(own) || domain(a.email) !== own);
const practice = (b.practice_panel || []).filter(p => p.name && p.role);
const SEATS = [0, 1, 5, 2, 6, 3, 7, 4, 8];
const FACES = { female: ['business_female_01', 'business_female_02', 'business_female_03', 'business_female_04'],
                male: ['business_male_01', 'business_male_02', 'business_male_03', 'business_male_04', 'business_male_05', 'business_male_06', 'business_male_07'] };
const used = { female: 0, male: 0 };
const face = gender => {
  let g = gender === 'female' ? 'female' : 'male';
  if (used[g] >= FACES[g].length) g = g === 'female' ? 'male' : 'female';
  const f = FACES[g][used[g] % FACES[g].length];
  used[g] += 1;
  return f;
};
// A real person's role only if the invite or emails state it: empty means the presenter fills it in
const short = role => !role ? '' : role.length <= 12 ? role : role.split(/\\s+/).filter(w => !['of', 'and', 'the', '&'].includes(w.toLowerCase())).map(w => w[0].toUpperCase()).join('').slice(0, 5);
const people = external.slice(0, 6).map(a => ({ display_name: a.name, role: a.role || '', role_short: short(a.role), gender: a.gender,
  why: 'In the meeting invite', source: 'email', will_push_on: a.likely_focus }));
const asPerson = p => ({ display_name: p.name, role: p.role, role_short: p.role_short || short(p.role), gender: p.gender, why: p.why, source: 'typical', will_push_on: p.will_push_on });
const seatedPractice = people.length ? [] : practice.slice(0, 2);
const members = people.concat(seatedPractice.map(asPerson)).map((m, i) => ({ id: 'p' + (i + 1), seat: SEATS[i], color: i, avatar: face(m.gender), ...m }));
// The rest of the practice roles, ranked, each with a face of its own so adding one seats a ready person
const suggestions = practice.slice(seatedPractice.length).map(p => ({ ...asPerson(p), avatar: face(p.gender) }));
const brief = {
  summary: b.summary || '', company: { what_they_do: b.what_they_do || '', recent_news: b.recent_news || [] },
  attendees: attendees.map(a => ({ name: a.name, email: a.email || '', role: a.role || '', likely_focus: a.likely_focus || '' })),
  questions: b.questions || [], risks: b.risks || [], sources: prev.sources.slice(0, 12),
};
// n8n's suggested pitch length (contract 0.18: proposal.pitch), kept to whole minutes from 1 to 60
const pitch = b.pitch && b.pitch.minutes ? { minutes: Math.max(1, Math.min(60, Math.round(b.pitch.minutes))), why: b.pitch.why || '' } : undefined;
// n8n's guess at what the presenter wants from the meeting (0.26: proposal.goal), for them to confirm or edit on the brief
const goal = b.goal && b.goal.text ? { text: b.goal.text, why: b.goal.why || '' } : undefined;
const proposal = { draft_id: prev.meeting.meeting_id, members, suggestions, ...(pitch ? { pitch } : {}), ...(goal ? { goal } : {}) };
return [{ json: { meeting: prev.meeting, brief, proposal } }];""", [{"meeting": MEETING, "brief": {}, "proposal": {}}])
    c += code_node("rowReady", "Row: ready", PROGRESS_JS + """
const s = $('Seat the panel').first().json;
return [{ json: { meeting_id: s.meeting.meeting_id, status: 'ready', brief: JSON.stringify(s.brief), proposal: JSON.stringify(s.proposal), updated_at: new Date().toISOString(), ...progressFields } }];""",
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
    }, [{"id": "msg1"}], credentials={"gmailOAuth2": "Gmail"}, extra={"onError": "continueRegularOutput"})
    c += progress_node("progressEmailed", "Progress: emailed")
    c += upsert_node("saveProgressEmailed", "Save progress: emailed", [{"id": 1}])
    # If a run fails: find its meeting by run id and mark the step it was on as failed, with a plain reason
    c += make_node("onFailure", "trigger", "n8n-nodes-base.errorTrigger", 1, "If a run fails", {},
                   [{"execution": {"id": "12", "error": {"message": "quota"}, "lastNodeExecuted": "Research the company"}, "workflow": {"id": "wf"}}])
    c += make_node("findRun", "node", "n8n-nodes-base.dataTable", 1.1, "Find its meeting", {
        "resource": "row", "operation": "get", "dataTableId": MEETINGS_TABLE, "matchType": "anyCondition",
        "filters": {"conditions": [{"keyName": "execution_id", "condition": "eq", "keyValue": Expr("{{ String($json.execution.id) }}")}]},
    }, [{"meeting_id": "evt123", "progress": "[]"}])
    c += code_node("markFailed", "Mark it failed", """
// Show where it stopped and why, instead of leaving the page on "researching" forever
const failure = $('If a run fails').first().json.execution || {};
const message = (failure.error && (failure.error.description || failure.error.message)) || 'Something went wrong';
const reason = /quota|too many requests|rate limit/i.test(message)
  ? "Gemini and the Groq fallback are both out of quota. Try again in a minute, or turn on billing for Gemini."
  : message.split('\\n')[0].slice(0, 160);
return $input.all().map(({ json: row }) => {
  let progress = [];
  try { progress = JSON.parse(row.progress || '[]'); } catch (e) { progress = []; }
  const stuck = progress.find(s => s.state === 'running') || progress.find(s => s.state === 'pending');
  if (stuck) Object.assign(stuck, { state: 'error', detail: reason });
  return { json: { meeting_id: row.meeting_id, status: 'failed', progress: JSON.stringify(progress), updated_at: new Date().toISOString() } };
});""", [{"meeting_id": "evt123", "status": "failed"}])
    c += upsert_node("saveFailed", "Save: failed", [{"id": 1}])
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
  .add(triage.onError(triageGroq))
  .add(triageGroq)
  .to(readDecision)
  .to(prepareIt
    .onTrue(rowResearching.to(saveResearching.to(emails.to(summariseEmails.to(progressEmails.to(saveProgressEmails.to(news.to(website.to(gatherSources.to(enoughNews
      .onTrue(research.to(readResearch.to(progressResearch.to(saveProgressResearch.to(brief.to(seatPanel.to(rowReady.to(saveReady.to(emailBrief.to(progressEmailed.to(saveProgressEmailed)))))))))))
      .onFalse(searchWeb.to(addWeb.to(research)))))))))))))
    .onFalse(rowSkipped.to(saveSkipped)))
  .add(research.onError(researchGroq))
  .add(researchGroq)
  .to(readResearch)
  .add(brief.onError(briefGroq))
  .add(briefGroq)
  .to(seatPanel)
  .group('Skipped', [rowSkipped, saveSkipped], { description: 'Keeps meetings that are not worth preparing, with the reason, so you can prepare them anyway' })
  .group('Decide', [readDecision], { description: 'Gemini decides whether this meeting is worth preparing for, and why' })
  .group('Research', [rowResearching, saveResearching, emails, summariseEmails, progressEmails, saveProgressEmails, news, website, gatherSources, enoughNews, searchWeb, addWeb, research, researchGroq, readResearch, progressResearch, saveProgressResearch], { description: 'Reads your emails with the attendees, the company news and website (searching the web if news is thin), saving progress as it goes' })
  .add(onFailure)
  .to(findRun)
  .to(markFailed)
  .to(saveFailed)
  .group('If it fails', [findRun, markFailed, saveFailed], { description: 'Marks the meeting as failed, with where it stopped and why, so the web app never waits forever' })
  .group('Brief', [brief, briefGroq, seatPanel, rowReady, saveReady, emailBrief, progressEmailed, saveProgressEmailed], { description: 'Writes the brief, seats the panel, saves it and emails you' });
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
    # Each meeting's rehearsals (0.20), from the DryRun sessions table, read once per request
    for var, name in [("sessionsAll", "Read rehearsals"), ("sessionsOne", "Read its rehearsals")]:
        c += make_node(var, "node", "n8n-nodes-base.dataTable", 1.1, name,
                       {"resource": "row", "operation": "get", "dataTableId": SESSIONS_TABLE, "returnAll": True},
                       [{"session_id": "s1", "meeting_id": "evt123", "status": "done", "overall": 63, "headline": "", "at": "2026-10-12T18:02:00.000Z"}],
                       extra={"alwaysOutputData": True, "executeOnce": True})
    c += code_node("shapeList", "Upcoming meetings", """
// Upcoming (and today's) meetings, soonest first (docs/CONTRACT.md, GET /meetings), each with its rehearsals so far
const since = Date.now() - 12 * 3600 * 1000;
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const sessions = $input.all().map(i => i.json).filter(r => r.session_id && r.status === 'done');
const practice = id => {
  const done = sessions.filter(r => String(r.meeting_id) === String(id)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return done.length ? { sessions: done.length, last: { session_id: done[0].session_id, at: done[0].at, overall: done[0].overall, headline: done[0].headline || '' } } : null;
};
const meetings = $('Read meetings').all().map(i => i.json).filter(r => r.meeting_id && (!r.start || Date.parse(r.start) >= since))
  .sort((a, b) => Date.parse(a.start || 0) - Date.parse(b.start || 0))
  .map(r => ({ id: String(r.meeting_id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees: parse(r.attendees) || [],
               progress: parse(r.progress) || [], started_at: r.started_at || null,
               run: r.execution_id ? { workflow_id: r.workflow_id, execution_id: r.execution_id } : null, practice: practice(r.meeting_id) }));
return [{ json: { meetings } }];""", [{"meetings": []}])
    # The twins of its attendees (0.27): how much DryRun knows of each, and "Since last time" for the brief
    c += read_people("peopleOne", "Read their twins")
    c += code_node("shapeOne", "The meeting and its brief", TWIN_ROW_JS + """
// One meeting by id, with its brief, proposed panel and rehearsals, newest first (docs/CONTRACT.md, GET /meeting)
const id = $('GET /meeting').first().json.query.id;
const r = $('Read meeting').all().map(i => i.json).find(r => String(r.meeting_id) === String(id));
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
if (!r) return [{ json: { error: 'not found' } }];
const sessions = $('Read its rehearsals').all().map(i => i.json).filter(x => x.session_id && String(x.meeting_id) === String(id))
  .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  .map(x => ({ session_id: x.session_id, at: x.at, status: x.status, overall: typeof x.overall === 'number' ? x.overall : null, headline: x.headline || '' }));
const done = sessions.filter(x => x.status === 'done');
// Each attendee's twin, as counts; and for those DryRun knows, what they raised and what you promised, facts only (never readings)
const rows = $input.all().map(i => i.json).filter(x => x.email);
const twinOf = a => { const row = a && a.email ? findRow(rows, lower(a.email)) : null; return row ? rowToTwin(row) : null; };
const attendees = (parse(r.attendees) || []).map(a => { const t = twinOf(a); return { ...a, twin: t ? twinSummary(t) : null }; });
const brief = parse(r.brief);
const label = s => s.type === 'email' ? (s.from === 'you' ? 'your email' : 'email') + ' of ' + s.date + ': ' + s.title : s.type === 'manual' ? 'your note of ' + s.date : s.title;
const since = (parse(r.attendees) || []).map(a => {
  const t = twinOf(a);
  if (!t) return null;
  const src = Object.fromEntries(t.sources.filter(s => s.status === 'connected').map(s => [s.id, s]));
  const pick = kinds => t.facts.filter(f => f.status === 'connected' && kinds.includes(f.kind) && src[f.source_id])
    .map(f => ({ text: f.text, date: src[f.source_id].date || '', source: label(src[f.source_id]) })).sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 4);
  const raised = pick(['raised', 'decision']);
  const promised = pick(['promised']);
  return raised.length || promised.length ? { email: t.email, name: t.name || a.name, raised, promised } : null;
}).filter(Boolean);
return [{ json: {
  meeting: { id: String(r.meeting_id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees,
             progress: parse(r.progress) || [], started_at: r.started_at || null,
             run: r.execution_id ? { workflow_id: r.workflow_id, execution_id: r.execution_id } : null,
             practice: done.length ? { sessions: done.length, last: { session_id: done[0].session_id, at: done[0].at, overall: done[0].overall, headline: done[0].headline } } : null,
             // What happened in the real meeting (0.28), from the presenter's voice note
             after: parse(r.after) },
  brief: brief ? { ...brief, since_last_time: since } : null, proposal: parse(r.proposal), sessions,
} }];""", [{"meeting": {}, "brief": None, "proposal": None, "sessions": []}])
    # Twins (0.27): one, or everyone, from the DryRun people table. The laptop keeps copies, so these are read rarely.
    for var, name, path in [("twinTrigger", "GET /twin", "dryrun/twin"), ("twinsTrigger", "GET /twins", "dryrun/twins")]:
        c += make_node(var, "trigger", "n8n-nodes-base.webhook", 2.2, name, {"httpMethod": "GET", "path": path, "responseMode": "responseNode", "options": {}}, [{"query": {}}])
    c += read_people("peopleTwin", "Read the people table")
    c += read_people("peopleTwins", "Read everyone")
    c += code_node("shapeTwin", "Their twin", TWIN_ROW_JS + """
// One twin by any of their addresses (docs/CONTRACT.md, GET /twin)
const row = findRow($input.all().map(i => i.json), lower($('GET /twin').first().json.query.email));
return [{ json: { twin: row ? rowToTwin(row) : null } }];""", [{"twin": None}])
    c += code_node("shapeTwins", "Everyone", TWIN_ROW_JS + """
// Everyone DryRun keeps a twin of, with honest counts (docs/CONTRACT.md, GET /twins)
const twins = $input.all().map(i => i.json).filter(r => r.email).map(rowToTwin)
  .map(t => ({ email: t.email, name: t.name, company: t.company, role: (t.role && t.role.text) || '', updated: t.updated, ...twinSummary(t) }))
  .sort((a, b) => (a.updated < b.updated ? 1 : -1));
return [{ json: { twins } }];""", [{"twins": []}])
    for var, name in [("sendList", "Send meetings"), ("sendOne", "Send the meeting"), ("sendTwin", "Send the twin"), ("sendTwins", "Send everyone")]:
        c += make_node(var, "node", "n8n-nodes-base.respondToWebhook", 1.5, name, {"respondWith": "firstIncomingItem", "options": {}}, [{}])
    c += ("const about = sticky('## DryRun meetings API\\nThe web app reads your meetings and briefs from the DryRun meetings table, with each meeting\\'s "
          "rehearsals from DryRun sessions and its attendees\\' twins from DryRun people: GET /webhook/dryrun/meetings, GET /webhook/dryrun/meeting?id=, GET /webhook/dryrun/twin?email= and GET /webhook/dryrun/twins (docs/CONTRACT.md).', [listTrigger, oneTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-meetings-api', 'DryRun meetings API')
  .add(about)
  .add(listTrigger)
  .to(readAll)
  .to(sessionsAll)
  .to(shapeList)
  .to(sendList)
  .add(oneTrigger)
  .to(readOne)
  .to(sessionsOne)
  .to(peopleOne)
  .to(shapeOne)
  .to(sendOne)
  .add(twinTrigger)
  .to(peopleTwin)
  .to(shapeTwin)
  .to(sendTwin)
  .add(twinsTrigger)
  .to(peopleTwins)
  .to(shapeTwins)
  .to(sendTwins)
  .group('Meetings', [readAll, sessionsAll, shapeList, sendList], { description: 'GET /meetings: upcoming meetings, each with its rehearsals so far' })
  .group('One meeting', [readOne, sessionsOne, peopleOne, shapeOne, sendOne], { description: 'GET /meeting: one meeting with its brief, panel, rehearsals and its attendees\' twins' })
  .group('Twins', [peopleTwin, shapeTwin, sendTwin, peopleTwins, shapeTwins, sendTwins], { description: 'GET /twin and GET /twins: the DryRun people table' });
"""
    return c


# ---------------------------------------------------------------- DryRun rehearsal prep (/prep)

REHEARSAL_REQUEST = {"body": {"draft_id": "evt123", "presenter": {"name": "Aryan", "email": "you@example.com"}, "pitch_minutes": 5,
                              "deck": {"name": "RouteIQ.pdf", "slides": [{"index": 0, "text": "RouteIQ for Delhivery"}]},
                              "prospect": {"company": "Delhivery", "website": "", "context": "RouteIQ pitch"},
                              "panel": [{"id": "p1", "seat": 0, "color": 0, "role": "VP Operations", "role_short": "VP Ops", "display_name": "Priya Nair",
                                         "avatar": "business_female_01", "difficulty": 2, "source": "email"}]}}


def progress_chunk(var, name, step, detail_js, with_run=False):
    """A streamed progress chunk for /prep (contract 0.24): { progress: { id, detail } }, plus which execution this is on the first one.
    Respond to Webhook passes its input through, so the next node gets the same item."""
    run = ", execution_id: $execution.id, workflow_id: $workflow.id" if with_run else ""
    body = "{{ JSON.stringify({ progress: { id: '" + step + "', detail: " + detail_js + " }" + run + " }) }}"
    return make_node(var, "node", "n8n-nodes-base.respondToWebhook", 1.5, name, {"respondWith": "json", "responseBody": Expr(body), "options": {}}, [{}],
                     # A progress chunk that fails must never stop the rehearsal
                     extra={"onError": "continueRegularOutput"})


def rehearsal():
    c = IMPORTS
    c += make_node("prepTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "Start a rehearsal (web app)", {
        # Streaming (contract 0.24): a chunk after each stage, so the practice page shows n8n's progress, then the bundle
        "httpMethod": "POST", "path": "dryrun/prep", "responseMode": "streaming", "options": {},
    }, [REHEARSAL_REQUEST])
    # The meeting's brief and research, saved by DryRun prep. A meeting missing from the table still gets a rehearsal.
    c += make_node("findMeeting", "node", "n8n-nodes-base.dataTable", 1.1, "Find the meeting", {
        "resource": "row", "operation": "get", "dataTableId": MEETINGS_TABLE, "matchType": "anyCondition",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.body.draft_id }}")}]},
    }, [{"meeting_id": "evt123", "title": "RouteIQ pitch", "kind": "sales_pitch", "why": "", "brief": "{}"}], extra={"alwaysOutputData": True})
    # The meeting's last debriefed rehearsal (0.20): the next one presses on its weak spots and shows its talk track
    c += make_node("lastRehearsal", "node", "n8n-nodes-base.dataTable", 1.1, "Last rehearsal", {
        "resource": "row", "operation": "get", "dataTableId": SESSIONS_TABLE, "matchType": "anyCondition",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $('Start a rehearsal (web app)').first().json.body.draft_id || 'none' }}")}]},
        "returnAll": True,
    }, [{"session_id": "s0", "meeting_id": "evt123", "status": "done", "at": "2026-10-10T19:12:00.000Z", "overall": 63, "debrief": "{}"}],
        extra={"alwaysOutputData": True, "executeOnce": True})
    # The twins of the real people at the table (0.27): what they actually raised before, from real sources only
    c += read_people("prepTwins", "Their twins")
    c += code_node("gather", "Gather what n8n knows", """
// Everything the rehearsal is planned from: the meeting and its brief (from the DryRun meetings table), the confirmed panel,
// the deck's slide text and the pitch length (docs/CONTRACT.md, POST /prep)
const req = $('Start a rehearsal (web app)').first().json.body;
const row = $('Find the meeting').first().json || {};
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
// The last debriefed rehearsal of this meeting, if any: its score, weak spots, drill and each slide's talk track
const done = $('Last rehearsal').all().map(i => i.json).filter(r => r.session_id && r.status === 'done').sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
const lastDebrief = done.length ? parse(done[0].debrief) : null;
const last = lastDebrief ? { overall: lastDebrief.overall, headline: lastDebrief.headline || '', weak_spots: lastDebrief.weak_spots || [], drill: lastDebrief.drill || null,
                             notes: Object.fromEntries((lastDebrief.slides || []).filter(s => s.notes).map(s => [s.index, s.notes])),
                             // The questions they couldn't answer (0.26: owed), asked again, early
                             owed: (lastDebrief.owed || []).map(o => ({ persona_id: o.persona_id, question: o.question })) } : null;
// Know your side (0.26): what the presenter offers, and what they want from this meeting
const side = { offer: (req.presenter && req.presenter.offer) || '', goal: (req.goal && req.goal.text) || '' };
const brief = parse(row.brief) || {};
// No pitch length (null, contract 0.25) means no time limit: n8n paces the slides naturally and nobody keeps time
const limited = req.pitch_minutes !== null;
const minutes = limited ? Math.max(1, Math.min(60, Math.round(Number(req.pitch_minutes) || 5))) : null;
const fill = t => t.split('{minutes} minutes').join(minutes === 1 ? '1 minute' : minutes + ' minutes').split('{minutes}').join(String(minutes)).split('{seconds}').join(String(minutes * 60));
const timing = Object.fromEntries(Object.entries(limited ? """ + json.dumps(REHEARSAL_TIMED) + """ : """ + json.dumps(REHEARSAL_UNTIMED) + """).map(([k, v]) => [k, fill(v)]));
const meeting = { title: row.title || (req.prospect && req.prospect.context) || 'Meeting', company: row.company || (req.prospect && req.prospect.company) || '',
                  kind: row.kind || 'other', start: row.start || '', notes: row.why || '' };
const panel = (req.panel || []).map(p => ({ id: p.id, name: p.display_name || '', role: p.role, difficulty: p.difficulty || 2,
                                            source: p.source || 'typical', will_push_on: p.will_push_on || '', why: p.why || '' }));
const slides = ((req.deck && req.deck.slides) || []).map(s => ({ index: s.index, text: String(s.text || '').slice(0, 1500) }));
// Twins (0.27): for each real attendee DryRun knows (twin_email), their connected facts with dates and sources, and n8n's readings
// labelled as such. Nothing from a rehearsal is in a twin.
const low = e => String(e || '').trim().toLowerCase();
const people = $input.all().map(i => i.json).filter(r => r.email);
const twins = (req.panel || []).filter(m => m.twin_email).map(m => {
  const r = people.find(x => low(x.email) === low(m.twin_email) || (parse(x.aliases) || []).map(low).includes(low(m.twin_email)));
  if (!r) return null;
  const sources = Object.fromEntries((parse(r.sources) || []).map(s => [s.id, s]));
  const label = s => !s ? '' : s.type === 'email' ? (s.from === 'you' ? 'your email' : 'email') + ' of ' + s.date + ': ' + s.title : s.type === 'manual' ? 'your note of ' + s.date : s.title;
  const facts = (parse(r.facts) || []).filter(f => f.status === 'connected' && sources[f.source_id]).map(f => ({ id: f.id, kind: f.kind, text: f.text, date: sources[f.source_id].date || '', from: label(sources[f.source_id]) }));
  const raised = facts.filter(f => f.kind === 'raised' || f.kind === 'decision').slice(-8);
  const prefers = facts.filter(f => f.kind === 'preference').slice(-4);
  if (!raised.length && !prefers.length) return null;
  return { persona_id: m.id, name: r.name || m.display_name, raised, prefers, readings: (parse(r.readings) || []).map(x => 'n8n reading: ' + x.text) };
}).filter(Boolean);
return [{ json: { req, minutes, timing, twins, twins_text: twins.length ? JSON.stringify(twins, null, 1) : 'None.', presenter: (req.presenter && req.presenter.name) || '', meeting, panel, slides, last, side,
                  side_text: (side.offer ? 'They offer: ' + side.offer + '. ' : '') + (side.goal ? 'They want: ' + side.goal + '.' : '') || 'Not given.',
                  history: last ? JSON.stringify({ score: last.overall, headline: last.headline, weak_spots: last.weak_spots, drill: last.drill && last.drill.title, owed: last.owed }) : 'First rehearsal.',
                  brief: { summary: brief.summary || '', attendees: brief.attendees || [], questions: brief.questions || [], risks: brief.risks || [],
                           company: brief.company || {},
                           // n8n's review of the uploaded deck (0.26, DryRun deck review): the panel presses on the same points
                           where_the_deck_will_get_pushback: ((parse(row.deck_review) || {}).items || []).map(x => ({ slide_index: x.slide_index, claim: x.claim, pushback: x.pushback, who: x.who })) } } }];""", [{"minutes": 5, "presenter": "Aryan", "meeting": {}, "panel": [], "slides": [], "brief": {}}])
    c += progress_chunk("saidGather", "Report: gathered", "gather",
                        "[$json.meeting.company ? 'The brief on ' + $json.meeting.company : 'No saved brief for this meeting', "
                        "$json.panel.length + ($json.panel.length === 1 ? ' person' : ' people') + ' at the table', "
                        "$json.slides.length ? $json.slides.length + ' slides' : 'no deck', $json.minutes ? $json.minutes + ' min pitch' : 'no time limit', "
                        "$json.last ? 'last rehearsal ' + $json.last.overall + '/100 with ' + $json.last.weak_spots.length + ' weak spots to press on' : 'the first rehearsal', "
                        "$json.twins.length ? $json.twins.length + (($json.twins.length === 1) ? ' twin' : ' twins') + ' of real attendees: what they raised before' : ''].filter(Boolean).join(', ')",
                        with_run=True)
    c += llm_nodes("plan", "Plan the rehearsal", json.dumps(REHEARSAL_PROMPT) +
                   ".split('{length}').join($json.timing.length).split('{pace}').join($json.timing.pace).split('{time_rule}').join($json.timing.time_rule)"
                   ".split('{time_lines}').join($json.timing.time_lines).replace('{presenter}', $json.presenter || 'the presenter')"
                   ".replace('{meeting}', JSON.stringify($json.meeting, null, 1)).replace('{brief}', JSON.stringify($json.brief, null, 1))"
                   ".replace('{panel}', JSON.stringify($json.panel, null, 1)).replace('{side}', $json.side_text || 'Not given.').replace('{deck}', JSON.stringify($json.slides, null, 1))"
                   ".replace('{history}', $json.history || 'First rehearsal.').replace('{twins}', $json.twins_text || 'None.')",
                   GEMINI_REPLY, schema=REHEARSAL_SCHEMA, source="$('Gather what n8n knows').first().json")
    c += code_node("bundle", "Build the bundle", REPLY_JS + """
// The rehearsal bundle (docs/CONTRACT.md, POST /prep response). Seats, colours, faces and difficulty stay as the presenter set them;
// the plan, the briefs and the lines are n8n's. The laptop fills in each slide's image and saves the voices.
const g = $('Gather what n8n knows').first().json;
const p = JSON.parse(replyText($json) || '{}');
const byId = Object.fromEntries((p.personas || []).map(x => [x.id, x]));
const ids = g.req.panel.map(m => m.id);
// A different voice for each person, fitting their avatar (Sarvam speaker names)
const VOICES = """ + json.dumps(VOICES) + """;
const used = { female: 0, male: 0 };
const voiceFor = avatar => { const g = String(avatar).includes('female') ? 'female' : 'male'; return VOICES[g][used[g]++ % VOICES[g].length]; };
const chair = ids.includes(p.chair) ? p.chair : (g.req.panel.find(m => m.seat === 0) || g.req.panel[0] || {}).id;
const personas = g.req.panel.map(m => {
  const x = byId[m.id] || {};
  return { id: m.id, seat: m.seat, color: m.color, role: m.role, role_short: m.role_short, avatar: m.avatar,
           display_name: m.display_name || x.display_name || m.role, priorities: x.priorities || [],
           // A "twin" objection only when it names a connected fact of that person's twin (0.27), with that fact's date and source
           objections: (x.objections || []).map(o => {
             const fact = o.source === 'twin' && ((g.twins.find(w => w.persona_id === m.id) || {}).raised || []).find(f => f.id === o.fact_id);
             if (fact) return { slide_index: o.slide_index, text: o.text, source: 'twin', date: fact.date, from: fact.from };
             return { slide_index: o.slide_index, text: o.text, source: ['deck', 'history'].includes(o.source) ? o.source : 'research' };
           }),
           // Whoever presses on a weak spot from last time is one step harder (at most 3)
           difficulty: Math.min(3, (m.difficulty || 2) + ((x.objections || []).some(o => o.source === 'history') ? 1 : 0)), manner: x.manner === 'interrupts' ? 'interrupts' : 'waits', chair: m.id === chair,
           voice: voiceFor(m.avatar), ...(m.twin_email ? { twin_email: m.twin_email } : {}) };
});
// Slide times scaled so they add up to the pitch length. With no time limit (0.25) they stay n8n's natural estimate, which is then
// the pitch length (300 s for a pitch with no deck).
const raw = g.slides.map(s => (p.slides || []).find(x => x.index === s.index) || { index: s.index, title: 'Slide ' + (s.index + 1), key_points: [], target_seconds: 60, rescue: {} });
const total = raw.reduce((a, s) => a + Math.max(5, Math.min(900, s.target_seconds || 0)), 0) || 1;
const pitchSeconds = g.minutes ? g.minutes * 60 : raw.length ? total : 300;
const slides = raw.map(s => ({ index: s.index, title: s.title || '', image_url: '', key_points: s.key_points || [],
  target_seconds: Math.max(5, Math.round(Math.max(5, Math.min(900, s.target_seconds || 0)) * pitchSeconds / total)),
  rescue: { calm: (s.rescue && s.rescue.calm) || 'Take a breath.', keyword: (s.rescue && s.rescue.keyword) || '', bridge: (s.rescue && s.rescue.bridge) || '' },
  question: (s.rescue && s.rescue.question) || '',
  // The talk track from the last debrief of this meeting, on the speaker view (null on a first rehearsal)
  notes: (g.last && g.last.notes[s.index]) || null }));
const r = (p.rescue_after_s || []).map(Number).filter(n => n > 0).slice(0, 3);
const rescue = r.length === 3 && r[0] < r[1] && r[1] < r[2] ? r : [3, 6, 10];
const during = Math.max(0, Math.round((p.plan && p.plan.during_pitch) || 0));
// Where someone may interrupt mid-slide (0.25): the only times the presenter is heard before they change slide. Real slides (0 with no
// deck), people who interrupt, one point per person and slide.
const interrupters = personas.filter(x => x.manner === 'interrupts').map(x => x.id);
const maxSlide = Math.max(0, slides.length - 1);
const seen = new Set();
const interrupts = ((p.plan && p.plan.interrupts) || [])
  .filter(x => interrupters.includes(x.persona_id) && Number.isInteger(x.slide_index) && x.slide_index >= 0 && x.slide_index <= maxSlide)
  .filter(x => { const k = x.persona_id + ':' + x.slide_index; if (seen.has(k)) return false; seen.add(k); return true; })
  .slice(0, during)
  .map(x => ({ persona_id: x.persona_id, slide_index: x.slide_index, after_s: Math.max(5, Math.min(slides.length ? 120 : pitchSeconds, Math.round(Number(x.after_s) || 15))), about: x.about || '' }));
const plan = { during_pitch: during, after_pitch: Math.max(0, Math.round((p.plan && p.plan.after_pitch) || 0)), why: (p.plan && p.plan.why) || '', interrupts };
// How the chair keeps time (0.25), with a limit only: a nudge near the limit, and, in a strict meeting, the questions a while after it
const t = p.time || {};
const nudge = Math.round(Math.max(0.8 * pitchSeconds, Math.min(1.3 * pitchSeconds, Number(t.nudge_at_s) || pitchSeconds)));
const cut = Number(t.cut_at_s) > 0 ? Math.round(Math.max(nudge + 15, Math.min(2 * pitchSeconds, Number(t.cut_at_s)))) : 0;
const time = g.minutes ? { limit_s: pitchSeconds, nudge_at_s: nudge, cut_at_s: cut, why: t.why || '' } : null;
// The chair's time lines only with a limit (time_up only if the chair stops the pitch)
const chairId = (personas.find(x => x.chair) || {}).id;
const KINDS = ['welcome', 'open_floor', 'acknowledge', 'time_nudge', 'time_up'];
const lines = (p.lines || []).filter(l => ids.includes(l.persona_id) && l.text && KINDS.includes(l.kind))
  .filter(l => !l.kind.startsWith('time_') || (time && l.persona_id === chairId && (l.kind === 'time_nudge' || cut > 0)))
  .map((l, i) => ({ id: 'l' + (i + 1), persona_id: l.persona_id, kind: l.kind, text: l.text }));
// The chair's way back in for a presenter who froze, one per slide (0.26)
slides.filter(s => s.question).forEach(s => lines.push({ id: 'l' + (lines.length + 1), persona_id: chairId, kind: 'rescue_question', text: s.question, slide_index: s.index }));
slides.forEach(s => { delete s.question; });
// Lines that say nothing about the meeting, the same in any of them (0.26): voiced once per voice, then cached by the laptop
const GENERIC = """ + json.dumps(GENERIC_LINES) + """;
const CHAIR = """ + json.dumps(GENERIC_CHAIR) + """;
personas.forEach((x, k) => {
  const set = Object.assign({}, GENERIC[k % GENERIC.length], x.chair ? CHAIR : {});
  let n = 0;
  Object.entries(set).forEach(([kind, texts]) => texts.forEach(text => lines.push({ id: 'g-' + x.id + '-' + (++n), persona_id: x.id, kind, text, generic: true, voice: x.voice })));
});
return [{ json: { session_id: 's' + Date.now().toString(36), prospect: { company: g.meeting.company }, pitch_seconds: pitchSeconds, time, plan,
                  rescue_after_s: rescue, slides, personas, lines, drill: (g.last && g.last.drill) || null,
                  // What the presenter offers and wants (0.26), so /turn and /debrief judge against the ask
                  goal: g.side.goal || null, offer: g.side.offer || null } }];""", [{"session_id": "s1", "personas": [], "slides": [], "lines": []}])
    c += progress_chunk("saidPlan", "Report: planned", "plan",
                        "(() => { const b = $json; const clock = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); const chair = b.personas.find(p => p.chair); const n = b.personas.reduce((a, p) => a + p.objections.length, 0); "
                        "return [b.slides.length ? b.slides.length + ' slides timed to the pitch' : '', n + ' objections', chair ? chair.display_name.split(' ')[0] + ' chairs' : '', "
                        "b.plan.during_pitch + ' questions during the pitch and ' + b.plan.after_pitch + ' after', "
                        "!b.time ? 'no time limit' : 'the chair nudges at ' + clock(b.time.nudge_at_s) + (b.time.cut_at_s ? ' and stops the pitch at ' + clock(b.time.cut_at_s) : '')"
                        "].filter(Boolean).join(', '); })()")
    c += progress_chunk("saidFallback", "Report: Groq instead", "fallback", "'Gemini did not answer, so Groq plans it instead'")
    c += code_node("eachLine", "One item per line", """
// Each line to voice, in its person's voice. Skipped when the web app asks for no voices (testing without spending TTS credits).
// Lines the laptop already has in that voice with the same words (cached_voices, 0.26) aren't voiced again: the generic ones after a
// voice's first rehearsal, and on "Run it again" every line whose words didn't change.
const b = $input.first().json;
const req = $('Start a rehearsal (web app)').first().json.body;
if (req.voices === false) return [];
const voice = Object.fromEntries(b.personas.map(p => [p.id, p.voice]));
const cached = req.cached_voices || {};
return b.lines.filter(l => !(cached[voice[l.persona_id]] || []).includes(l.text))
  .map(l => ({ json: { id: l.id, text: l.text, speaker: voice[l.persona_id] } }));""", [{"id": "l1", "text": "Welcome, Aryan.", "speaker": "priya"}], extra={"alwaysOutputData": True})
    c += make_node("voice", "node", "n8n-nodes-base.httpRequest", 4.5, "Voice the line (Sarvam)", {
        "method": "POST",
        "url": SARVAM_TTS,
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": Expr("{{ JSON.stringify({ text: $json.text, language_code: 'en-IN', model: '" + SARVAM_MODEL + "', speaker: $json.speaker, speech_sample_rate: 22050, output_audio_codec: 'mp3' }) }}"),
        # A few lines at a time, so a first rehearsal with new voices (their generic lines too) doesn't take a minute
        "options": {"timeout": 30000, "batching": {"batch": {"batchSize": 4, "batchInterval": 0}}},
    }, [{"request_id": "r1", "audios": ["UklGRg=="]}], credentials={"httpHeaderAuth": "Sarvam"},
        # A line that fails to voice is left without audio; the rehearsal still goes ahead
        extra={"onError": "continueRegularOutput", "retryOnFail": True, "maxTries": 2, "waitBetweenTries": 1000})
    c += code_node("addVoices", "Add the voices", """
// Each line's audio (base64 MP3) into the bundle; the laptop saves them as WAV and serves them to the headset
const b = $('Build the bundle').first().json;
const lines = $('One item per line').all().map(i => i.json);
const out = $input.all().map(i => i.json);
const audio = {};
lines.forEach((l, i) => { const a = out[i] && out[i].audios && out[i].audios[0]; if (l.id && a) audio[l.id] = a; });
return [{ json: { ...b, lines: b.lines.map(l => (audio[l.id] ? { ...l, audio_base64: audio[l.id] } : l)) } }];""", [{"session_id": "s1", "lines": []}])
    c += progress_chunk("saidVoices", "Report: voiced", "voices",
                        "(() => { const n = $json.lines.length; const v = $json.lines.filter(l => l.audio_base64).length; "
                        "return !n ? 'No lines to voice' : v + ' new line' + (v === 1 ? '' : 's') + ' voiced, each in the voice of whoever says it' + (n > v ? '; ' + (n - v) + ' already on the laptop' : ''); })()")
    c += make_node("reply", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send the bundle", {"respondWith": "firstIncomingItem", "options": {}}, [{}])
    c += ("const about = sticky('## DryRun rehearsal prep\\nBriefs the practice panel for one rehearsal (POST /webhook/dryrun/prep, docs/CONTRACT.md): "
          "plans each slide and the rescue cues, what each person will push on, who interrupts and who chairs, how many questions to ask "
          "and when, and the lines voiced ahead of time.', [prepTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-rehearsal-prep', 'DryRun rehearsal prep')
  .add(about)
  .add(prepTrigger)
  .to(findMeeting)
  .to(lastRehearsal)
  .to(prepTwins)
  .to(gather)
  .to(saidGather)
  .to(plan)
  .to(bundle)
  .to(saidPlan)
  .to(eachLine)
  .to(voice)
  .to(addVoices)
  .to(saidVoices)
  .to(reply)
  .add(plan.onError(saidFallback))
  .add(saidFallback)
  .to(planGroq)
  .to(bundle)
  .group('Plan', [lastRehearsal, prepTwins, gather, saidGather, plan, saidFallback, planGroq, bundle, saidPlan], { description: 'Plans the slides, the panel, the questions and the lines for this meeting and pitch length' })
  .group('Voices', [eachLine, voice, addVoices, saidVoices], { description: 'Voices the lines ahead of time with Sarvam, in each person\\'s voice' });
"""
    return c


# ---------------------------------------------------------------- DryRun turn (/turn)

def groq_first_nodes(var, name, prompt, output, schema, source):
    """For live turns, where every second shows: Groq first (fast), Gemini on its error output. `prompt` is a JS expression using j."""
    ask = "(" + prompt + ") + " + json.dumps("\n\nReply with only a JSON object that follows this JSON schema:\n") + " + JSON.stringify(" + js_obj(schema) + ")"
    body = ("{{ (() => { const j = " + source + "; return JSON.stringify({ model: '" + GROQ_MODEL + "', reasoning_effort: 'low', max_completion_tokens: 4096, "
            "messages: [{ role: 'user', content: " + ask + " }], response_format: { type: 'json_object' } }); })() }}")
    groq = make_node(var, "node", "n8n-nodes-base.httpRequest", 4.5, name, {
        "method": "POST", "url": GROQ, "authentication": "predefinedCredentialType", "nodeCredentialType": "groqApi",
        "sendBody": True, "specifyBody": "json", "jsonBody": Expr(body), "options": {"timeout": 30000},
    }, [{"choices": [{"message": {"content": "{}"}}]}], credentials={"groqApi": "Groq"}, extra={"onError": "continueErrorOutput"})
    gemini = gemini_node(var + "Gemini", name + " (Gemini)", "{{ (() => { const j = " + source + "; return JSON.stringify({ contents: [{ parts: [{ text: " + prompt +
                         " }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: " + js_obj(schema) + " } }); })() }}", GEMINI_REPLY,
                         extra={"retryOnFail": False})
    return groq + gemini


# What n8n decided, held to the rules in code (contract 0.26), since a prompt alone didn't stop the panel asking one question five times
# or opening the floor mid-pitch. Every question is a thread: asked, at most one follow-up, then answered, parked or dodged, and never
# asked again. Lines voiced ahead of time play as they are; new lines go to the voice.
CHECK_JS = """
const r = $('What the room knows').first().json.room;
const d = JSON.parse(replyText($json) || '{}');
const people = Object.fromEntries((r.bundle.personas || []).map(p => [p.id, p]));
const lines = Object.fromEntries((r.bundle.lines || []).map(l => [l.id, l]));
const name = id => ((people[id] || {}).display_name || id).split(' ')[0];
const KINDS = ['welcome', 'question', 'follow_up', 'acknowledge', 'park', 'move_on', 'hand_back', 'open_floor', 'closing'];
// Park, move-on and hand-back need no text: a generic line plays (0.26)
const SOCIAL = ['park', 'move_on', 'hand_back'];
// The model sometimes starts a line with who says it ("Rohan: ..."), which the voice would read out
const unnamed = (p, text) => { const t = String(text || '').trim(); const first = String(p.display_name || '').split(' ')[0];
  return [p.display_name, first, p.role_short].filter(Boolean).reduce((a, n) => (a.toLowerCase().startsWith(n.toLowerCase() + ':') ? a.slice(n.length + 1).trim() : a), t); };
let reactions = (d.reactions || []).filter(x => people[x.persona_id] && KINDS.includes(x.kind) && (x.text || lines[x.line_id] || SOCIAL.includes(x.kind)))
  .map(x => ({ ...x, text: unnamed(people[x.persona_id], x.text) }));
if (r.mode === 'opening') reactions = reactions.filter(x => x.kind === 'welcome').slice(0, 1);
// Stopped for time, the chair has already moved to the questions with a line the headset played (0.25)
if (r.mode === 'pitch_end' && r.time_up) reactions = reactions.filter(x => x.kind !== 'open_floor');

// Near-duplicates: about half the content words (cut to 5 letters, so "verify" matches "verification") of the shorter question are in the other
const STOP = new Set(['what', 'that', 'this', 'with', 'your', 'have', 'will', 'would', 'could', 'should', 'about', 'there', 'their', 'them', 'they',
  'into', 'from', 'does', 'when', 'where', 'which', 'were', 'been', 'than', 'then', 'also', 'just', 'some', 'more', 'much', 'very', 'like',
  'make', 'sure', 'know', 'going', 'want', 'tell', 'give', 'okay', 'thanks', 'please', 'how', 'can', 'you', 'the', 'and', 'are', 'for']);
const words = t => String(t || '').toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean);
const content = t => new Set(words(t).filter(w => w.length > 3 && !STOP.has(w)).map(w => w.slice(0, 5)));
const near = (a, b) => {
  const A = content(a), B = content(b);
  let n = 0;
  A.forEach(w => { if (B.has(w)) n++; });
  return (n >= 4 && n / Math.min(A.size, B.size) >= 0.5) || (n > 0 && n / Math.max(A.size, B.size) >= 0.7);
};
const CLOSED = ['answered', 'parked', 'dodged'];
const threads = (r.threads || []).map(t => ({ ...t, follow_ups: t.follow_ups || 0 }));
const byId = Object.fromEntries(threads.map(t => [t.id, t]));
// Everything a thread has asked so far (the question and its follow-up), from the turns
const asks = t => [t.text].concat(r.turns.flatMap(x => (x.reactions || []).filter(y => y.thread_id === t.id).map(y => y.text)));
const like = text => threads.find(t => asks(t).some(a => near(a, text)));
const changed = new Set();
const pitchOver = r.mode === 'pitch_end' || r.turns.some(t => t.mode === 'pitch_end');
const said = words(r.transcript).length;
// A line voiced ahead of time of this kind for this person (one not said yet this run, if there is one), or new text
const saidBefore = new Set(r.turns.flatMap(t => (t.reactions || []).map(x => x.text)));
const say = (pid, kind, text, reason, threadId) => {
  const own = (r.bundle.lines || []).filter(x => x.persona_id === pid && x.kind === kind);
  const l = own.find(x => !saidBefore.has(x.text)) || own[0];
  return { persona_id: pid, kind, text: l ? l.text : text, line_id: l ? l.id : '', raise_hand: false, reason, thread_id: threadId || '' };
};
reactions = reactions.map(x => (SOCIAL.includes(x.kind) ? say(x.persona_id, x.kind, x.text || "Okay.", x.reason || '', x.thread_id) : x));

// An answer closes its thread, or earns its one follow-up
const verdict = r.mode === 'answer' && ['resolved', 'partial', 'dodged'].includes(d.answer_verdict) ? d.answer_verdict : null;
const cur = r.answering_id ? byId[r.answering_id] : null;
if (cur) {
  const asker = cur.persona_id;
  const unsure = d.presenter_unsure === true || /(not sure|not certain|don.t know|do not know|no idea|get back to|come back to|find out|have to check|need to check)/i.test(r.transcript);
  const wantsFollow = reactions.some(x => x.kind === 'follow_up' && x.persona_id === asker);
  const follow = verdict !== 'resolved' && !unsure && wantsFollow && cur.follow_ups < 1;
  if (follow) {
    cur.status = 'followed_up';
    cur.follow_ups += 1;
    // Just the follow-up: the presenter answers it next
    reactions = reactions.filter(x => x.kind === 'follow_up' && x.persona_id === asker).slice(0, 1);
  } else {
    // A second follow-up becomes a close: parked if they said they don't know, otherwise dodged
    cur.status = verdict === 'resolved' ? 'answered' : unsure ? 'parked' : verdict === 'dodged' || wantsFollow ? 'dodged' : 'answered';
    reactions = reactions.filter(x => x.kind !== 'follow_up');
    const own = reactions.filter(x => x.persona_id === asker && ['acknowledge', 'park', 'move_on'].includes(x.kind));
    if (cur.status === 'parked' && !own.some(x => x.kind === 'park')) {
      reactions = reactions.filter(x => !(x.persona_id === asker && x.kind === 'acknowledge'));
      reactions.unshift(say(asker, 'park', "That's fine, send it to us after.", "You said you weren't sure, so " + name(asker) + ' parked it for later.', cur.id));
    } else if (cur.status === 'dodged' && !own.length) {
      reactions.unshift(say(asker, 'move_on', "Okay, let's leave that there.", name(asker) + ' had already followed up once, so they let it go, unconvinced.', cur.id));
    }
    // During the pitch, the asker hands back, and nobody asks anything new
    if (!pitchOver) {
      reactions = reactions.filter(x => !['question', 'open_floor', 'closing'].includes(x.kind));
      if (!reactions.some(x => x.kind === 'hand_back')) reactions.push(say(asker, 'hand_back', 'Thanks. Please, go on.', 'Back to the pitch.', cur.id));
    }
  }
  changed.add(cur.id);
  reactions.forEach(x => { if (x.persona_id === asker && x.kind !== 'question') x.thread_id = cur.id; });
}

// Questions: one at a time, never a closed thread or anything close to one; during the pitch only from someone who interrupts, once
// the presenter has said enough on the slide (about 10 seconds, or 5 at a planned interruption point), never on the title slide
// unless planned, and never the floor opened or the meeting closed
const out = [];
let asked = 0;
for (const x of reactions) {
  if (x.kind === 'open_floor' && r.mode !== 'pitch_end') continue;
  if (x.kind === 'closing' && !pitchOver) continue;
  if (['park', 'move_on', 'hand_back', 'follow_up'].includes(x.kind) && r.mode !== 'answer') continue;
  if (x.kind === 'question') {
    if (asked >= 1) continue;
    if (!pitchOver && r.mode !== 'segment') continue;
    if (r.mode === 'segment' && (people[x.persona_id].manner === 'waits' || said < (r.mid_slide ? 12 : 25) || (r.slide_index === 0 && !r.mid_slide))) continue;
    let t = x.thread_id ? byId[x.thread_id] : null;
    if (!t) t = like(x.text) || null;
    if (t && (CLOSED.includes(t.status) || t === cur || t.persona_id !== x.persona_id)) continue;
    if (!t) {
      t = { id: 'q' + (threads.length + 1), persona_id: x.persona_id, text: x.text, slide_index: r.slide_index, status: 'open', follow_ups: 0, planned: false };
      threads.push(t);
      byId[t.id] = t;
    }
    changed.add(t.id);
    x.thread_id = t.id;
    asked++;
  }
  out.push(x);
}
reactions = out;
if (asked) reactions = reactions.filter(x => x.kind !== 'closing');

// After the pitch someone always speaks next: if the model's question was dropped, the next open thread, then an objection nobody
// has asked (they're written as questions), or, with none left or the plan's questions done, the chair closes
const followedUp = reactions.some(x => x.kind === 'follow_up');
if (pitchOver && (r.mode === 'answer' || r.mode === 'pitch_end') && !asked && !followedUp && !reactions.some(x => x.kind === 'closing')) {
  const open = threads.find(t => t.status === 'open' && t !== cur && people[t.persona_id]);
  const chair = (r.bundle.personas || []).find(p => p.chair) || (r.bundle.personas || [])[0];
  const more = r.asked_after < Math.max(1, (r.bundle.plan || {}).after_pitch || 0);
  const unasked = more ? (r.bundle.personas || []).flatMap(p => (p.objections || []).map(o => ({ p, text: o.text })))
    .filter(o => o.text.includes('?') && !like(o.text)).sort((a, b) => (b.p.difficulty || 0) - (a.p.difficulty || 0))[0] : null;
  if (open) {
    reactions.push({ persona_id: open.persona_id, kind: 'question', text: open.text, line_id: '', raise_hand: false, reason: name(open.persona_id) + ' still had this open from earlier.', thread_id: open.id });
    changed.add(open.id);
  } else if (unasked) {
    const t = { id: 'q' + (threads.length + 1), persona_id: unasked.p.id, text: unasked.text, slide_index: r.slide_index, status: 'open', follow_ups: 0, planned: false };
    threads.push(t);
    byId[t.id] = t;
    changed.add(t.id);
    reactions.push({ persona_id: t.persona_id, kind: 'question', text: t.text, line_id: '', raise_hand: false, reason: name(t.persona_id) + ' had not raised this yet.', thread_id: t.id });
  } else if (chair) {
    reactions.push({ persona_id: chair.id, kind: 'closing', text: "Thank you, that's everything from us for today. We'll be in touch.", line_id: '', raise_hand: false, reason: 'No questions left, so the chair closed the meeting.', thread_id: '' });
  }
}

reactions = reactions.slice(0, 3).map(x => {
  const line = lines[x.line_id] && lines[x.line_id].persona_id === x.persona_id ? lines[x.line_id] : null;
  const out = { persona_id: x.persona_id, kind: x.kind, text: line ? line.text : x.text, raise_hand: r.mode === 'segment' && x.kind === 'question',
                reason: x.reason || '', ...(x.thread_id ? { thread_id: x.thread_id } : {}) };
  return line ? { ...out, line_id: line.id } : out;
});
// A bundle briefed before voices existed has none: fall back to a voice that fits the avatar
const voiceOf = p => p.voice || (String(p.avatar).includes('female') ? 'priya' : 'rahul');
const toVoice = reactions.map((x, i) => ({ i, text: x.text, speaker: voiceOf(people[x.persona_id]), voiced: !!x.line_id })).filter(x => !x.voiced);
return { reply: { transcript: r.transcript, note: d.note || '', reactions, answer_verdict: verdict, threads: [...changed].map(id => byId[id]),
                  end_session: reactions.some(x => x.kind === 'closing') }, to_voice: toVoice };"""


# Whisper's hint list: words it would otherwise mishear. For an answer, the question being answered and the asker's name come first, so
# answers come back as words (11 Oct: "Nearest True Tax Limit"); then the company, the slide titles and the people.
WHISPER_HINT = ("{{ (() => { const b = $json.body || $('What the presenter said (headset)').first().json.body; const ctx = b.context || {}; const bundle = ctx.bundle || {}; "
                "const people = bundle.personas || []; const who = people.find(p => p.id === b.asked_by); "
                "const open = b.mode === 'answer' ? (ctx.threads || ctx.pending || []).filter(t => t.persona_id === b.asked_by && t.status !== 'answered' && t.status !== 'parked' && t.status !== 'dodged').pop() : null; "
                "return [open ? open.text : '', who ? who.display_name : '', (bundle.prospect || {}).company].concat((bundle.slides || []).map(s => s.title), people.map(p => p.display_name))"
                ".filter(Boolean).join(', ').slice(0, 600); })() }}")


TURN_REQUEST = {"body": {"session_id": "s1", "mode": "segment", "slide_index": 1, "t": 42.0, "audio_base64": "UklGRg==", "audio_format": "m4a",
                         "context": {"bundle": {"personas": [], "slides": [], "lines": [], "plan": {"during_pitch": 1, "after_pitch": 1, "why": ""}, "pitch_seconds": 120,
                                                "prospect": {"company": "Delhivery"}},
                                     "elapsed_s": 42.0, "turns": [], "threads": [], "pending": []}}}


def expr_node(var, name, field, type_, js, output, extra=None):
    """A Set node whose one field is computed by JavaScript in an n8n expression. Used on the live turn instead of Code nodes: the
    first Code node of a run waits about 1.7 s for n8n Cloud's code runner, while expressions run at once (contract 0.26)."""
    body = "{{ (() => {\n" + js.strip().replace("}}", "} }") + "\n})() }}"
    return make_node(var, "node", "n8n-nodes-base.set", 3.4, name, {
        "mode": "manual", "assignments": {"assignments": [{"id": var, "name": field, "type": type_, "value": Expr(body)}]}, "options": {},
    }, output, extra=extra)


TURN_READ_JS = """
// The moment, its audio as a file for transcription, and the context the laptop sent (docs/CONTRACT.md, POST /turn).
// n8n keeps no state between turns: everything it decides from is here.
const q = $('What the presenter said (headset)').first().json.body;
const ctx = q.context || {};
const bundle = ctx.bundle || {};
const turns = ctx.turns || [];
const pitchEnd = turns.findIndex(t => t.mode === 'pitch_end');
const askedDuring = turns.filter((t, i) => (pitchEnd < 0 || i < pitchEnd) && t.mode !== 'pitch_end').reduce((a, t) => a + (t.reactions || []).filter(r => r.kind === 'question').length, 0);
const askedAfter = pitchEnd < 0 ? 0 : turns.slice(pitchEnd).reduce((a, t) => a + (t.reactions || []).filter(r => r.kind === 'question').length, 0);
// Every question's life (0.26), kept by the laptop. An older laptop sends only the pending questions: they become open threads.
const threads = (ctx.threads || (ctx.pending || []).map((q, i) => ({ id: 'q' + (i + 1), persona_id: q.persona_id, text: q.text, slide_index: q.slide_index, status: 'open', follow_ups: 0, planned: false })));
// An answer answers the asker's latest thread that's still open. With none, it answers the chair's way-back-in question after a freeze,
// which the client asked from the bundle without n8n (0.26): that becomes a thread too.
let answering = q.mode === 'answer' && q.asked_by ? threads.filter(t => t.persona_id === q.asked_by && (t.status === 'open' || t.status === 'followed_up')).pop() : null;
const rescue = q.mode === 'answer' && !answering ? (bundle.lines || []).find(l => l.kind === 'rescue_question' && l.persona_id === q.asked_by && l.slide_index === q.slide_index) : null;
if (rescue) {
  answering = { id: 'q' + (threads.length + 1), persona_id: rescue.persona_id, text: rescue.text, slide_index: q.slide_index, status: 'open', follow_ups: 0, planned: true };
  threads.push(answering);
}
const r = { session_id: q.session_id, mode: q.mode, slide_index: q.slide_index, t: q.t, asked_by: q.asked_by || '', mid_slide: !!q.mid_slide, time_up: !!q.time_up,
               bundle, elapsed: Math.round(ctx.elapsed_s || q.t || 0),
               turns, threads, answering_id: answering ? answering.id : '', asked_during: askedDuring, asked_after: askedAfter };
"""

def turn():
    c = IMPORTS
    c += make_node("turnTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "What the presenter said (headset)", {
        "httpMethod": "POST", "path": "dryrun/turn", "responseMode": "responseNode", "options": {},
    }, [TURN_REQUEST])
    # The speech as a file for Whisper: the laptop sends AAC (m4a), or WAV if it couldn't compress it
    c += make_node("readAudio", "node", "n8n-nodes-base.convertToFile", 1.1, "Read the speech", {
        "operation": "toBinary", "sourceProperty": "body.audio_base64",
        "options": {"fileName": Expr("{{ $json.body.audio_format === 'm4a' ? 'turn.m4a' : 'turn.wav' }}"),
                    "mimeType": Expr("{{ $json.body.audio_format === 'm4a' ? 'audio/mp4' : 'audio/wav' }}")},
    }, [{}], extra={"onError": "continueRegularOutput"})
    c += make_node("transcribe", "node", "n8n-nodes-base.httpRequest", 4.5, "Transcribe (Groq Whisper)", {
        "method": "POST", "url": GROQ_WHISPER, "authentication": "predefinedCredentialType", "nodeCredentialType": "groqApi",
        "sendBody": True, "contentType": "multipart-form-data",
        "bodyParameters": {"parameters": [
            {"parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "data"},
            {"name": "model", "value": WHISPER_MODEL}, {"name": "language", "value": "en"}, {"name": "response_format", "value": "json"},
            # Words Whisper would otherwise mishear ("RouteIQ" came out as "Rautik"): for an answer, the question being answered and
            # who asked it first, then the company, the slides and the people
            {"name": "prompt", "value": Expr(WHISPER_HINT)}]},
        "options": {"timeout": 30000},
    }, [{"text": "So at your scale, that is a meaningful saving in the first year."}], credentials={"groqApi": "Groq"},
        # No audio, or a failed transcription, carries on with an empty transcript: the room just doesn't react
        extra={"onError": "continueRegularOutput"})
    # The prompt is put together in "What the room knows", so changing it means changing one node
    prompt = "j.prompt"
    c += expr_node("context", "What the room knows", "room", "object", TURN_READ_JS + """
// The prompt, kept short: a live turn should take a few seconds, and Groq's free tier allows 8,000 tokens a minute
const PROMPT = """ + json.dumps(TURN_PROMPT) + """;
const b = r.bundle;
const transcript = String($('Transcribe (Groq Whisper)').first().json.text || '').trim();
const personas = (b.personas || []).map(p => ({ id: p.id, name: p.display_name, role: p.role, manner: p.manner, chair: p.chair, difficulty: p.difficulty,
  priorities: p.priorities, objections: (p.objections || []).map(o => (o.slide_index >= 0 ? 'slide ' + (o.slide_index + 1) + ': ' : '') + o.text) }));
const slide = (b.slides || []).find(s => s.index === r.slide_index);
const name = id => ((b.personas || []).find(p => p.id === id) || {}).display_name || id;
const history = r.turns.slice(-12).map(t => '[' + t.mode + (t.slide_index >= 0 ? ', slide ' + (t.slide_index + 1) : '') + '] presenter: "' + String(t.transcript || '').slice(0, 400) + '"'
  + (t.reactions || []).map(x => ' | ' + name(x.persona_id) + ' (' + x.kind + '): "' + x.text + '"').join('') + (t.answer_verdict ? ' | answer ' + t.answer_verdict : '')).join('\\n') || 'Nothing yet.';
const parts = {
  meeting: (b.prospect && b.prospect.company ? 'with ' + b.prospect.company : 'a meeting') + (b.offer ? '. The presenter offers: ' + b.offer : '') + (b.goal ? '. They want: ' + b.goal : ''),
  plan: JSON.stringify(b.plan || {}),
  asked_during: String(r.asked_during), asked_after: String(r.asked_after),
  // With a limit, how the chair keeps time; with none (time null, 0.25), the pitch length is only an estimate
  time: b.time && b.time.limit_s ? r.elapsed + ' seconds in, for a pitch of ' + b.time.limit_s + ' seconds' + (b.time.cut_at_s ? '; the chair stops the pitch at ' + b.time.cut_at_s + ' seconds' : '') + '.'
    : b.time === null ? r.elapsed + ' seconds in. No time limit (about ' + (b.pitch_seconds || 0) + ' seconds is only an estimate).'
    : r.elapsed + ' seconds in, for a pitch of ' + (b.pitch_seconds || 0) + ' seconds.',
  // Generic lines (0.26) aren't listed: n8n's code picks them for a park, move-on or hand-back
  personas: JSON.stringify(personas), lines: JSON.stringify((b.lines || []).filter(l => !l.generic && l.kind !== 'rescue_question').map(l => ({ line_id: l.id, persona_id: l.persona_id, kind: l.kind, text: l.text }))),
  slide: slide ? JSON.stringify({ number: slide.index + 1, title: slide.title, key_points: slide.key_points }) : 'No slides.',
  turns: history,
  threads: r.threads.length ? r.threads.map(t => t.id + ' (' + name(t.persona_id) + ', ' + t.status + ', follow-ups ' + (t.follow_ups || 0) + '): "' + t.text + '"').join('; ') : 'None yet.',
  mode: r.mode + (r.mid_slide ? " (mid-slide, at one of the plan's interruption points)" : '') + (r.time_up ? ' (the chair just stopped the pitch for time)' : ''),
  asked_by: r.asked_by ? ' (answering ' + name(r.asked_by) + ', id ' + r.asked_by + (r.answering_id ? ', thread ' + r.answering_id : '') + ')' : '', transcript,
};
// Each {name} in the prompt filled in by splitting, so nothing in the text is read as a replacement pattern
const prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);
// No question is possible on this slide (0.26): "Check the reactions" would drop any, so the model is skipped
const said = transcript.toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean).length;
const interrupters = (b.personas || []).filter(p => p.manner !== 'waits');
const skip = r.mode === 'segment' && (!interrupters.length || said < (r.mid_slide ? 12 : 25) || (r.slide_index === 0 && !r.mid_slide));
const skip_note = !skip ? '' : !said ? 'Nothing came through on this slide, so the panel just listened.'
  : !interrupters.length ? 'Nobody on this panel interrupts a pitch, so they held their questions.'
  : r.slide_index === 0 && !r.mid_slide ? 'Your opening slide: the panel let you get going.' : 'Only a few words on this slide, so nobody cut in.';
return { ...r, transcript, prompt, skip, skip_note };""", [{"room": {"mode": "segment", "transcript": "", "prompt": "", "skip": False, "skip_note": ""}}])
    c += make_node("couldAsk", "ifElse", "n8n-nodes-base.if", 2.3, "Could anyone ask?", {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"leftValue": Expr("{{ !$json.room.skip }}"), "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and",
        }, "options": {},
    }, [{"room": {"skip": False}}])
    c += expr_node("nobody", "Nobody reacts", "reply", "object", """
// Nobody could have asked here: no model call, just the transcript and why nobody spoke
const r = $('What the room knows').first().json.room;
return { transcript: r.transcript, note: r.skip_note, reactions: [], answer_verdict: null, threads: [], end_session: false };""",
                   [{"reply": {"transcript": "", "note": "", "reactions": []}}])
    c += groq_first_nodes("decide", "Decide who reacts", prompt, [{"choices": [{"message": {"content": "{}"}}]}], TURN_SCHEMA, "$('What the room knows').first().json.room")
    c += expr_node("check", "Check the reactions", "out", "object", REPLY_JS + CHECK_JS, [{"out": {"reply": {"reactions": [], "threads": []}, "to_voice": []}}])
    c += make_node("anyToVoice", "ifElse", "n8n-nodes-base.if", 2.3, "New lines to voice?", {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"leftValue": Expr("{{ $json.out.to_voice.length }}"), "rightValue": 0, "operator": {"type": "number", "operation": "gt"}}],
            "combinator": "and",
        }, "options": {},
    }, [{"out": {"to_voice": []}}])
    c += make_node("eachReaction", "node", "n8n-nodes-base.splitOut", 1, "One item per new line", {"fieldToSplitOut": "out.to_voice", "options": {}},
                   [{"i": 0, "text": "Meaningful isn't a number.", "speaker": "rahul"}])
    c += make_node("voiceTurn", "node", "n8n-nodes-base.httpRequest", 4.5, "Voice the line (Sarvam)", {
        "method": "POST", "url": SARVAM_TTS, "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
        "sendBody": True, "specifyBody": "json",
        "jsonBody": Expr("{{ JSON.stringify({ text: $json.text, language_code: 'en-IN', model: '" + SARVAM_MODEL + "', speaker: $json.speaker, speech_sample_rate: 22050, output_audio_codec: 'mp3' }) }}"),
        # A turn's new lines are voiced at the same time
        "options": {"timeout": 20000, "batching": {"batch": {"batchSize": 3, "batchInterval": 0}}},
    }, [{"request_id": "r1", "audios": ["UklGRg=="]}], credentials={"httpHeaderAuth": "Sarvam"}, extra={"onError": "continueRegularOutput"})
    c += expr_node("withVoices", "Add the voices", "reply", "object", """
// The reply with each new line's audio (base64 MP3); the laptop saves them as WAV and gives the headset their paths
const c = $('Check the reactions').first().json.out;
const voiced = $('Voice the line (Sarvam)').isExecuted;
const items = voiced ? $('One item per new line').all().map(i => i.json) : [];
const out = voiced ? $('Voice the line (Sarvam)').all().map(i => i.json) : [];
const reactions = c.reply.reactions.map(x => ({ ...x }));
items.forEach((v, k) => { const a = out[k] && out[k].audios && out[k].audios[0]; if (a) reactions[v.i].audio_base64 = a; });
return { ...c.reply, reactions };""", [{"reply": {"transcript": "", "reactions": []}}], extra={"executeOnce": True})
    c += make_node("replyTurn", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send the reactions",
                   {"respondWith": "json", "responseBody": Expr("{{ JSON.stringify($json.reply) }}"), "options": {}}, [{}])
    c += ("const about = sticky('## DryRun turn\\nHow the room reacts to what the presenter just said (POST /webhook/dryrun/turn, docs/CONTRACT.md): "
          "transcribes it, decides whether anyone speaks, who, what and why (or why nobody does), holds that to the rules (every question "
          "a thread: one follow-up, then answered, parked or dodged), and voices it. The laptop sends the context, so this keeps no state. "
          "No Code nodes on this path: their runner takes about 1.7 s to start, expressions don\\'t.', [turnTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-turn', 'DryRun turn')
  .add(about)
  .add(turnTrigger)
  .to(readAudio)
  .to(transcribe)
  .to(context)
  .to(couldAsk
    .onTrue(decide)
    .onFalse(nobody.to(replyTurn)))
  .add(decide)
  .to(check)
  .to(anyToVoice
    .onTrue(eachReaction.to(voiceTurn.to(withVoices.to(replyTurn))))
    .onFalse(withVoices))
  .add(decide.onError(decideGemini))
  .add(decideGemini)
  .to(check)
  .group('Listen', [readAudio, transcribe], { description: 'Reads the speech and transcribes what the presenter said' })
  .group('Decide', [context, couldAsk, nobody, decide, decideGemini, check], { description: 'Decides whether anyone reacts, who, what and why, and holds it to the rules; skips the model where no question is possible' })
  .group('Voice', [anyToVoice, eachReaction, voiceTurn, withVoices], { description: 'Voices new lines with Sarvam; lines voiced in prep play as they are' });
"""
    return c


# ---------------------------------------------------------------- DryRun debrief (/debrief and GET /session)

DEBRIEF_REQUEST = {"body": {"session_id": "s1", "meeting_id": "evt123", "client": "web", "duration_s": 300, "owner_email": "you@example.com",
                            "presenter": {"name": "Aryan", "email": "you@example.com"},
                            "events": [{"t": 0, "type": "slide", "slide_index": 0},
                                       {"t": 40, "type": "turn", "mode": "segment", "slide_index": 0, "transcript": "We cut empty miles by a third.",
                                        "note": "", "reactions": [], "answer_verdict": None}],
                            "bundle": {"session_id": "s1", "prospect": {"company": "Delhivery"}, "pitch_seconds": 300, "slides": [], "personas": [], "lines": []}}}


def sessions_upsert(var, name):
    return make_node(var, "node", "n8n-nodes-base.dataTable", 1.1, name, {
        "resource": "row", "operation": "upsert", "dataTableId": SESSIONS_TABLE, "matchType": "allConditions",
        "filters": {"conditions": [{"keyName": "session_id", "condition": "eq", "keyValue": Expr("{{ $json.session_id }}")}]},
        "columns": {"mappingMode": "autoMapInputData", "value": None},
    }, [{"id": 1}])


# Where n8n is in the debrief (contract: debrief_status), from the steps that have run so far; inlined into each save
DEBRIEF_PROGRESS_JS = """
const ran = name => { try { return $(name).isExecuted; } catch (e) { return false; } };
const out = name => (ran(name) ? $(name).first().json : null);
const read = $('Read the session').first().json;
const judged = out('Build the debrief');
const mailed = out('Email the report');
const step = (id, label, done, running, doneText, runningText) => ({ id, label, state: done ? 'done' : running ? 'running' : 'pending', detail: done ? doneText : running ? runningText : '' });
const debriefSteps = [
  step('read', 'Read the transcript', true, false, read.summary, ''),
  step('judge', 'Judged the pitch', !!judged, true,
    judged ? (judged.debrief.overall == null ? 'Too short to score, so no scores; marked ' : 'Scored ' + judged.debrief.metrics.length + ' things with evidence, marked ') + judged.marks + ' moments, ' + judged.backs + ' of ' + judged.debrief.stakeholders.length + ' would back it' : '',
    'Marking the transcript, scoring the answers and reading the room'),
  step('plan', 'Planned the next rehearsal', !!judged, !!judged,
    judged ? (judged.debrief.owed.length ? 'Drafted answers to ' + judged.debrief.owed.length + ' question' + (judged.debrief.owed.length === 1 ? '' : 's') + ' you owe them. ' : '')
      + 'Drill: ' + judged.debrief.drill.title + (judged.debrief.weak_spots.length ? '. The panel will press on ' + judged.debrief.weak_spots.join(', ') : '') : '', ''),
  step('email', 'Emailed you the report', !!mailed && !mailed.error, !!judged, 'To ' + (read.owner_email || 'you'), 'Emailing you the report'),
];
if (mailed && mailed.error) Object.assign(debriefSteps[3], { state: 'error', detail: "Couldn't email the report" });
const statusFields = { debrief_status: JSON.stringify({ done: !!mailed, steps: debriefSteps }), execution_id: String($execution.id), workflow_id: String($workflow.id), updated_at: new Date().toISOString() };
"""


def debrief_chunk(var, name, row_node):
    """A streamed progress chunk for /debrief (contract 0.26): { debrief_status }, as the row just saved has it. Respond to Webhook passes its
    input through, and a chunk that fails never stops the debrief."""
    body = "{{ JSON.stringify({ debrief_status: JSON.parse($('" + row_node + "').first().json.debrief_status), execution_id: $execution.id, workflow_id: $workflow.id }) }}"
    return make_node(var, "node", "n8n-nodes-base.respondToWebhook", 1.5, name, {"respondWith": "json", "responseBody": Expr(body), "options": {}}, [{}],
                     extra={"onError": "continueRegularOutput"})


def debrief():
    c = IMPORTS
    # Streaming (contract 0.26): a progress chunk after each step, so the dashboard shows n8n's steps as they happen, then the record
    c += make_node("debriefTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "Debrief a session (laptop)", {
        "httpMethod": "POST", "path": "dryrun/debrief", "responseMode": "streaming", "options": {},
    }, [DEBRIEF_REQUEST])
    c += make_node("findHistory", "node", "n8n-nodes-base.dataTable", 1.1, "Earlier rehearsals", {
        "resource": "row", "operation": "get", "dataTableId": SESSIONS_TABLE, "matchType": "anyCondition",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.body.meeting_id || 'none' }}")}]},
        "returnAll": True,
    }, [{"session_id": "s0", "meeting_id": "evt123", "status": "done", "overall": 65, "at": "2026-10-10T19:12:00.000Z", "debrief": "{}"}],
        extra={"alwaysOutputData": True})
    # The meeting's brief (0.26): the research the homework's suggested answers are drawn from, with its sources
    c += make_node("findBrief", "node", "n8n-nodes-base.dataTable", 1.1, "The brief", {
        "resource": "row", "operation": "get", "dataTableId": MEETINGS_TABLE, "matchType": "anyCondition",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $('Debrief a session (laptop)').first().json.body.meeting_id || 'none' }}")}]},
    }, [{"meeting_id": "evt123", "brief": "{}"}], extra={"alwaysOutputData": True, "executeOnce": True})
    c += code_node("readSession", "Read the session", REPLY_JS + """
// What happened, slide by slide, with everything that can be counted counted here (the same input always gives the same numbers):
// time on each slide, words per minute, filler words, pacing against the plan. The model only judges (docs/CONTRACT.md, POST /debrief).
const b = $('Debrief a session (laptop)').first().json.body;
const parse = x => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };
const bundle = b.bundle || {};
const personas = bundle.personas || [];
const planned = bundle.slides || [];
const events = (b.events || []).slice().sort((x, y) => x.t - y.t);
const duration = Number(b.duration_s) || (events.length ? events[events.length - 1].t : 0);
const turns = events.filter(e => e.type === 'turn');
const end = turns.find(t => t.mode === 'pitch_end');
const pitchEnd = end ? end.t : duration;
// Time on each slide during the pitch, from the slide changes
const changes = events.filter(e => e.type === 'slide');
if (!changes.length || changes[0].t > 0) changes.unshift({ t: 0, type: 'slide', slide_index: changes.length ? 0 : 0 });
// Exchanges during the pitch (0.26), from the question to the end of its last answer, aren't the presenter's pitch time: the report
// blamed them for the panel's questions before
const asks = [];
turns.forEach((t, k) => (t.reactions || []).filter(r => r.kind === 'question' || r.kind === 'follow_up').forEach(r => asks.push({ k, t, r })));
const busy = [];
asks.filter(a => a.t.t < pitchEnd).forEach(a => {
  const answers = turns.slice(a.k + 1).filter(x => x.mode === 'answer' && x.asked_by === a.r.persona_id && x.t <= pitchEnd);
  const until = answers.length ? answers[0].t : null;
  if (until != null) busy.push([a.t.t, until]);
});
const overlap = (from, to) => busy.reduce((n, [a, z]) => n + Math.max(0, Math.min(to, z) - Math.max(from, a)), 0);
const seconds = {};
changes.forEach((c, i) => {
  const from = Math.min(c.t, pitchEnd);
  const to = Math.min(i + 1 < changes.length ? changes[i + 1].t : duration, pitchEnd);
  seconds[c.slide_index] = (seconds[c.slide_index] || 0) + Math.max(0, to - from - overlap(from, to));
});
// What was said on each slide during the pitch (the opening, each slide, the last slide), and the answers apart
const said = {};
turns.filter(t => t.mode !== 'answer' && String(t.transcript || '').trim()).forEach(t => { said[t.slide_index] = ((said[t.slide_index] || '') + ' ' + t.transcript.trim()).trim(); });
const words = t => String(t || '').split(/\\s+/).filter(Boolean).length;
const FILLER = /\\b(um+|uh+|erm|you know|basically|sort of|kind of|i mean)\\b/gi;
const indexes = [...new Set(Object.keys(said).map(Number).concat(Object.keys(seconds).map(Number)))].sort((x, y) => x - y);
const slides = indexes.map(i => {
  const transcript = said[i] || '';
  const plan = planned.find(s => s.index === i) || {};
  const sec = Math.round(seconds[i] || 0);
  const fillers = transcript.match(FILLER) || [];
  return { index: i, title: plan.title || 'Slide ' + (i + 1), transcript, seconds: sec, target_seconds: plan.target_seconds || 0,
           words_per_minute: sec >= 10 ? Math.round(words(transcript) / (sec / 60)) : 0, key_points: plan.key_points || [],
           fillers: [...new Set(fillers)].slice(0, 3), filler_count: fillers.length };
});
// Each question with the answer that followed it
const name = id => ((personas.find(p => p.id === id) || {}).display_name) || id;
const exchanges = [];
turns.forEach(t => {
  if (t.mode === 'answer') {
    const open = exchanges.slice().reverse().find(x => !x.answer && x.persona_id === t.asked_by);
    if (open) Object.assign(open, { answer: t.transcript || '', verdict: t.answer_verdict || null });
  }
  (t.reactions || []).filter(r => r.kind === 'question' || r.kind === 'follow_up').forEach(r =>
    exchanges.push({ t: t.t, slide_index: t.slide_index, persona_id: r.persona_id, question: r.text, answer: null, verdict: null, thread_id: r.thread_id || '', kind: r.kind }));
});
// Every question's life (0.26): the last status each thread reached
const threads = {};
turns.forEach(t => (t.threads || []).forEach(x => { threads[x.id] = x; }));
// Pacing: how far each slide was from its target, and the whole pitch from its length
const timed = slides.filter(s => s.target_seconds > 0 && s.seconds > 0);
const off = timed.length ? timed.reduce((a, s) => a + Math.min(1, Math.abs(s.seconds / s.target_seconds - 1)), 0) / timed.length : 0;
const pitchSec = Math.round(Math.min(pitchEnd, duration));
const clock = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
const worst = timed.slice().sort((x, y) => Math.abs(y.seconds / y.target_seconds - 1) - Math.abs(x.seconds / x.target_seconds - 1))[0];
const pacing = { name: 'Pacing', score: timed.length ? Math.max(20, Math.round(100 - 70 * off)) : 60,
  explanation: 'You pitched for ' + clock(pitchSec) + (bundle.time === null ? ' with no time limit' : bundle.pitch_seconds ? ' against a plan of ' + clock(bundle.pitch_seconds) : '')
    + (end && end.time_up ? ', and the chair stopped you for time' : '')
    + (worst ? '; slide ' + (worst.index + 1) + ' took ' + clock(worst.seconds) + ' against ' + clock(worst.target_seconds) : '') + '.', evidence: [] };
// Earlier debriefed rehearsals of this meeting, oldest first, and the weak spots the last one left
const earlier = $('Earlier rehearsals').all().map(i => i.json).filter(r => r.session_id && r.session_id !== b.session_id && r.status === 'done' && typeof r.overall === 'number')
  .sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
const history = earlier.map(r => ({ session_id: r.session_id, at: r.at, overall: r.overall }));
const last = earlier.length ? parse(earlier[earlier.length - 1].debrief) : null;
const weakBefore = (last && last.weak_spots) || [];
// What went wrong on the system's side (0.26), for the model to discount and the report to show quietly
const STEM = w => w.slice(0, 5);
const content = t => String(t || '').toLowerCase().split(/[^a-z0-9%]+/).filter(w => w.length > 3).map(STEM);
const deckWords = new Set(planned.flatMap(x => content([x.title].concat(x.key_points || []).join(' ')))
  .concat(personas.flatMap(p => content((p.objections || []).map(o => o.text).join(' ')))));
const trouble = [];
const garbled = [];
// (not the opening: a greeting shares no words with the deck)
turns.filter(t => t.mode === 'segment' || t.mode === 'answer').forEach(t => {
  const own = content(t.transcript);
  const asked = t.mode === 'answer' ? exchanges.filter(x => x.persona_id === t.asked_by && x.t <= t.t).map(x => x.question).join(' ') : '';
  const near = new Set([...deckWords, ...content(asked)]);
  const shared = own.filter(w => near.has(w)).length;
  if (own.length >= 3 && words(t.transcript) <= 12 && shared / own.length < 0.2) {
    garbled.push(t.transcript);
    trouble.push({ t: t.t, kind: 'garbled', note: 'The transcript may be mis-heard: "' + String(t.transcript).trim().slice(0, 80) + '"' });
  }
});
let spoken = 0;
turns.filter(t => t.t < pitchEnd).forEach(t => {
  if (t.mode !== 'answer') spoken += words(t.transcript);
  const cut = (t.reactions || []).find(r => r.kind === 'open_floor' || (r.kind === 'question' && t.mode !== 'answer'));
  if (cut && spoken < 30) trouble.push({ t: t.t, kind: 'cut_short', note: name(cut.persona_id) + (cut.kind === 'open_floor' ? ' opened the floor' : ' asked a question') + ' after only ' + spoken + ' words of your pitch' });
});
events.filter(e => e.type === 'turn_failed').forEach(e => trouble.push({ t: e.t, kind: 'turn_failed', note: 'n8n did not answer this ' + (e.mode || 'turn') + ', so nobody reacted' }));
// Too little to judge: under about 45 s of pitch or 60 words, nothing is scored
const pitchSeconds = Math.round(slides.reduce((a, x) => a + x.seconds, 0));
const pitchWords = slides.reduce((a, x) => a + words(x.transcript), 0);
const scored = pitchSeconds >= 45 && pitchWords >= 60;
// Questions the presenter owes them (0.26): threads parked or dodged, and answers judged partial
const ownedBy = {};
// Without thread ids (a run before 0.26), a follow-up or a repeat of the same question belongs with that person's earlier one
const STEMS = t => new Set(content(t));
const same = (a, b) => { const A = STEMS(a), B = STEMS(b); let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n >= 3 && n / Math.min(A.size, B.size) >= 0.5; };
exchanges.forEach(x => {
  const earlierOwn = Object.values(ownedBy).filter(o => o.persona_id === x.persona_id);
  const latest = earlierOwn[earlierOwn.length - 1];
  const id = x.thread_id || (x.kind === 'follow_up' && latest ? latest.thread_id : '') || ((earlierOwn.find(o => same(o.question, x.question)) || {}).thread_id) || ('x' + Math.round(x.t) + x.persona_id);
  const th = threads[x.thread_id];
  const status = th && (th.status === 'parked' || th.status === 'dodged') ? th.status : x.verdict === 'partial' || x.verdict === 'dodged' ? (x.verdict === 'dodged' ? 'dodged' : 'partial') : null;
  const o = ownedBy[id] || { thread_id: id, persona_id: x.persona_id, question: (th && th.text) || x.question, said: [], status: null };
  if (x.answer) o.said.push(x.answer);
  if (status) o.status = o.status === 'parked' || o.status === 'dodged' ? o.status : status;
  if (th && th.status === 'answered' && x.verdict !== 'partial') o.status = o.status === 'partial' ? 'partial' : null;
  ownedBy[id] = o;
});
const owed = Object.values(ownedBy).filter(o => o.status).map(o => ({ ...o, said: o.said.join(' ').trim() })).slice(0, 5);
// The research from the meeting's brief, numbered so the model can cite it
const briefRow = $('The brief').first().json || {};
const brief = parse(briefRow.brief) || {};
const sources = (brief.sources || []).slice(0, 12);
const research = [brief.company && brief.company.what_they_do ? 'What they do: ' + brief.company.what_they_do : '']
  .concat(((brief.company && brief.company.recent_news) || []).map(n => 'News' + (n.date ? ' (' + n.date + ')' : '') + ': ' + n.text))
  .concat(sources.map((x, i) => '[' + (i + 1) + '] ' + x.title + ' ' + x.url)).filter(Boolean).join('\\n') || 'No research saved for this meeting.';
const totalWords = slides.reduce((a, s) => a + words(s.transcript), 0) + exchanges.reduce((a, x) => a + words(x.answer), 0);
const answered = exchanges.filter(x => x.answer).length;
const summary = totalWords + ' words over ' + slides.filter(s => s.transcript).length + ' slide' + (slides.length === 1 ? '' : 's')
  + ', ' + exchanges.length + ' question' + (exchanges.length === 1 ? '' : 's') + ' (' + answered + ' answered) in ' + clock(duration);
// The prompt, with each {name} filled in by splitting (nothing in the text is read as a replacement pattern)
const PROMPT = """ + json.dumps(DEBRIEF_PROMPT) + """;
const parts = {
  presenter: (b.presenter && b.presenter.name) || 'The presenter',
  meeting: (bundle.prospect && bundle.prospect.company ? 'with ' + bundle.prospect.company : 'a meeting') + (bundle.time === null ? ', a pitch with no time limit' : ', a ' + clock(bundle.pitch_seconds || pitchSec) + ' pitch')
    + (end && end.time_up ? ' (the chair stopped it for time)' : '')
    + (bundle.offer ? '. The presenter offers: ' + bundle.offer : '') + (bundle.goal ? '. What they wanted from the meeting: ' + bundle.goal : ''),
  personas: JSON.stringify(personas.map(p => ({ id: p.id, name: p.display_name, role: p.role, priorities: p.priorities, objections: (p.objections || []).map(o => o.text) }))),
  slides: JSON.stringify(planned.map(s => ({ index: s.index, title: s.title, key_points: s.key_points, target_seconds: s.target_seconds }))),
  weak_spots: weakBefore.length ? weakBefore.join('; ') : 'None (first rehearsal).',
  transcript: slides.map(s => '[slide ' + (s.index + 1) + ' (index ' + s.index + '): ' + s.title + ', ' + s.seconds + ' s against ' + s.target_seconds + ' s, '
    + s.words_per_minute + ' words a minute, ' + s.filler_count + ' filler words] "' + (s.transcript || '(nothing said)') + '"').join('\\n') || 'Nothing was said.',
  exchanges: exchanges.map(x => name(x.persona_id) + ' (' + x.persona_id + ') asked on slide ' + (x.slide_index + 1) + ': "' + x.question + '" Answer: "'
    + (x.answer || '(not answered)') + '"' + (x.verdict ? ' (judged ' + x.verdict + ')' : '')).join('\\n') || 'No questions were asked.',
  trouble: trouble.length ? trouble.map(x => '- at ' + clock(x.t) + ': ' + x.note).join('\\n') : 'None.',
  length: scored ? 'You pitched for ' + clock(pitchSeconds) + ' (' + pitchWords + ' words), not counting the questions.'
    : 'Only ' + clock(pitchSeconds) + ' of pitch (' + pitchWords + ' words): too little to score. Give scores of 0; they will not be shown. Still write the talk tracks, weak spots and drill.',
  owed: owed.length ? owed.map(o => o.thread_id + ': ' + name(o.persona_id) + ' asked "' + o.question + '"; the presenter said "' + (o.said || '(nothing)') + '" (' + o.status + ')').join('\\n') : 'None.',
  research,
};
const prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);
const telemetry = { session_id: b.session_id, client: b.client || 'web', duration_s: duration, events, ...(b.gaze_dwell_s ? { gaze_dwell_s: b.gaze_dwell_s } : {}),
                    ...(b.facing_slides_s != null ? { facing_slides_s: b.facing_slides_s } : {}) };
return [{ json: { session_id: b.session_id, meeting_id: b.meeting_id || '', owner_email: b.owner_email || (b.presenter && b.presenter.email) || '',
                  bundle, telemetry, slides, exchanges, pacing, history, weak_before: weakBefore, summary, prompt,
                  trouble, garbled, owed, sources, pitch: { seconds: pitchSeconds, words: pitchWords, scored } } }];""",
                   [{"session_id": "s1", "meeting_id": "evt123", "summary": "", "prompt": "", "slides": [], "exchanges": [], "history": []}])
    c += code_node("rowStart", "Row: debriefing", DEBRIEF_PROGRESS_JS + """
// The session in the DryRun sessions table while n8n debriefs it
const r = $('Read the session').first().json;
return [{ json: { session_id: r.session_id, meeting_id: r.meeting_id, at: new Date().toISOString(), status: 'debriefing', headline: '',
                  bundle: JSON.stringify(r.bundle), telemetry: JSON.stringify(r.telemetry), debrief: '', ...statusFields } }];""", [{"session_id": "s1"}])
    c += sessions_upsert("saveStart", "Save: debriefing")
    c += debrief_chunk("saidStart", "Report: read", "Row: debriefing")
    c += llm_nodes("judge", "Judge the pitch", "$('Read the session').first().json.prompt", GEMINI_REPLY, schema=DEBRIEF_SCHEMA,
                   source="$('Read the session').first().json")
    c += code_node("buildDebrief", "Build the debrief", REPLY_JS + """
// The debrief (docs/CONTRACT.md, POST /debrief result): the model's judgement held to what was really said (every quote must be in the
// transcript, so the report can underline it), with the counted numbers, the overall score and the history.
const r = $('Read the session').first().json;
const d = JSON.parse(replyText($json) || '{}');
const personas = r.bundle.personas || [];
const ids = personas.map(p => p.id);
const turns = r.telemetry.events.filter(e => e.type === 'turn');
// A quote as it appears in the transcript (the model sometimes changes case or spacing), or null if it isn't there
const find = (text, quote) => {
  const q = String(quote || '').trim().replace(/^["']|["'.,]$/g, '');
  if (q.length < 3 || !text) return null;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  return at < 0 ? null : text.slice(at, at + q.length);
};
// When a quote was said: the turn whose transcript has it
const moment = (quote, slideIndex) => {
  const t = turns.find(x => find(x.transcript, quote));
  if (!t) return null;
  return { t: t.t, slide_index: t.slide_index, quote: find(t.transcript, quote) };
};
const NAMES = ['Clarity', 'Evidence', 'Objection handling', 'Structure'];
const clamp = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
// A quote from a transcript that may be mis-heard is never used against the presenter (0.26)
const misheard = quote => r.garbled.some(g => find(g, quote));
const scored = r.pitch.scored;
const metrics = NAMES.map(n => {
  const m = (d.metrics || []).find(x => x.name === n) || { score: 50, explanation: '', evidence: [] };
  return { name: n, score: scored ? clamp(m.score) : null, explanation: m.explanation || '',
           evidence: (m.evidence || []).filter(e => !misheard(e.quote)).map(e => moment(e.quote, e.slide_index)).filter(Boolean).slice(0, 2) };
}).concat([{ ...r.pacing, score: scored ? r.pacing.score : null }]);
// Too little pitch to judge: no scores at all, said plainly
const overall = scored ? Math.round(metrics.reduce((a, m) => a + m.score, 0) / metrics.length) : null;
const clock = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
const headline = scored ? d.headline || '' : 'Too short to score: ' + clock(r.pitch.seconds) + ' of pitch. Try a 2-minute run.';
const stakeholders = ids.map(id => {
  const s = (d.stakeholders || []).find(x => x.persona_id === id) || { stance: 'undecided', reason: '' };
  return { persona_id: id, stance: ['backs', 'undecided', 'opposes'].includes(s.stance) ? s.stance : 'undecided', reason: s.reason || '',
           deciding_moment: s.quote ? moment(s.quote, s.slide_index) : null };
});
let marks = 0;
const slides = r.slides.map(s => {
  const j = (d.slides || []).find(x => x.index === s.index) || { covered: [], missed: [], marks: [], notes: '' };
  let landed = 0;
  // Marks have to matter: never on a mis-heard transcript, and one "landed" a slide at most
  const judged = (j.marks || []).map(m => ({ ...m, quote: find(s.transcript, m.quote) })).filter(m => m.quote && !misheard(m.quote))
    .filter(m => m.kind !== 'landed' || landed++ < 1)
    .map(m => ({ quote: m.quote, kind: m.kind, note: m.note || '', better: m.kind === 'landed' ? '' : (m.better || '') })).slice(0, 4);
  const fillers = s.fillers.map(f => ({ quote: f, kind: 'filler', note: s.filler_count > 1 ? 'Filler word (' + s.filler_count + ' on this slide)' : 'Filler word', better: '' }));
  marks += judged.length;
  return { index: s.index, transcript: s.transcript, seconds: s.seconds, target_seconds: s.target_seconds, words_per_minute: s.words_per_minute,
           covered: j.covered || [], missed: j.missed || [], marks: judged.concat(fillers), notes: j.notes || '' };
});
const dr = d.drill || {};
const drill = { title: dr.title || 'Run it again', focus_persona: ids.includes(dr.focus_persona) ? dr.focus_persona : (ids[0] || ''),
                slides: (dr.slides || []).filter(i => r.slides.some(s => s.index === i)), minutes: Math.max(2, Math.min(5, Math.round(dr.minutes || 3))) };
const g = r.telemetry.gaze_dwell_s;
const facing = g ? { slides_s: r.telemetry.facing_slides_s || 0, longest_gap: null } : null;
// Homework (0.26): a suggested answer, with its sources, for every question the presenter couldn't answer
const drafts = Object.fromEntries((d.owed || []).map(o => [o.thread_id, o]));
const owed = r.owed.map(o => {
  const x = drafts[o.thread_id] || {};
  return { thread_id: o.thread_id, persona_id: o.persona_id, question: o.question, said: o.said, status: o.status, suggested: x.suggested || '', confirm: x.confirm || '',
           sources: (x.sources || []).map(n => r.sources[n - 1]).filter(Boolean).map(x => ({ title: x.title, url: x.url })) };
}).filter(o => o.suggested);
const debrief = { headline, overall, previous_overall: r.history.length ? r.history[r.history.length - 1].overall : null,
                  stakeholders, metrics, slides, facing, drill, weak_spots: (d.weak_spots || []).slice(0, 3), owed, trouble: r.trouble, pitch: r.pitch,
                  actions_taken: (owed.length ? ['answers_drafted'] : []).concat(['weak_spots_saved']) };
return [{ json: { session_id: r.session_id, debrief, marks, backs: stakeholders.filter(s => s.stance === 'backs').length } }];""",
                   [{"session_id": "s1", "debrief": {"metrics": [], "stakeholders": [], "drill": {"title": ""}, "weak_spots": []}, "marks": 0, "backs": 0}])
    c += code_node("rowJudged", "Row: judged", DEBRIEF_PROGRESS_JS + """
const j = $('Build the debrief').first().json;
return [{ json: { session_id: j.session_id, overall: j.debrief.overall, headline: j.debrief.headline, ...statusFields } }];""", [{"session_id": "s1"}])
    c += sessions_upsert("saveJudged", "Save progress: judged")
    c += debrief_chunk("saidJudged", "Report: judged", "Row: judged")
    c += make_node("emailReport", "node", "n8n-nodes-base.gmail", 2.2, "Email the report", {
        "resource": "message", "operation": "send",
        "sendTo": Expr("{{ $('Read the session').first().json.owner_email }}"),
        "subject": Expr("{{ (() => { const r = $('Read the session').first().json; const d = $('Build the debrief').first().json.debrief; "
                        "const co = (r.bundle.prospect || {}).company || 'your meeting'; "
                        "return 'Your rehearsal for ' + co + ': ' + (d.overall == null ? 'too short to score' : d.overall + '/100') + (d.owed.length ? ', ' + d.owed.length + ' question' + (d.owed.length === 1 ? '' : 's') + ' you owe ' + co : ''); })() }}"),
        "emailType": "html",
        "message": Expr("{{ (() => { const r = $('Read the session').first().json; const d = $('Build the debrief').first().json.debrief; "
                        "const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); "
                        "const who = id => ((r.bundle.personas || []).find(p => p.id === id) || {}).display_name || id; "
                        "const STANCE = { backs: 'would back it', undecided: 'is undecided', opposes: 'is not convinced' }; "
                        "const co = esc((r.bundle.prospect || {}).company || 'them'); "
                        "const owed = d.owed.length ? '<h3>' + d.owed.length + ' question' + (d.owed.length === 1 ? '' : 's') + ' you couldn&#39;t answer for ' + co + ', with suggested answers</h3>' + d.owed.map(o => '<p><b>' + esc(who(o.persona_id)) + ':</b> ' + esc(o.question) + '<br><i>You said:</i> ' + esc(o.said || '(nothing)') + '<br><i>Try:</i> ' + esc(o.suggested) + (o.confirm ? '<br><i>Check first:</i> ' + esc(o.confirm) : '') + (o.sources.length ? '<br><small>Sources: ' + o.sources.map(x => '<a href=\"' + esc(x.url) + '\">' + esc(x.title) + '</a>').join(', ') + '</small>' : '') + '</p>').join('') : ''; "
                        "return owed + '<h2>' + esc(d.headline) + '</h2><p><b>' + (d.overall == null ? 'Not scored' : d.overall + '/100') + '</b>' + (d.previous_overall != null ? ' (last time ' + d.previous_overall + ')' : '') + '</p>'"
                        " + '<h3>The room</h3><ul>' + d.stakeholders.map(s => '<li><b>' + esc(who(s.persona_id)) + '</b> ' + STANCE[s.stance] + '. ' + esc(s.reason) + '</li>').join('') + '</ul>'"
                        " + '<h3>Scores</h3><ul>' + d.metrics.map(m => '<li>' + esc(m.name) + (m.score == null ? '' : ': ' + m.score) + '. ' + esc(m.explanation) + '</li>').join('') + '</ul>'"
                        " + '<h3>Next time</h3><p><b>' + esc(d.drill.title) + '</b>, ' + d.drill.minutes + ' minutes against ' + esc(who(d.drill.focus_persona)) + '.'"
                        " + (d.weak_spots.length ? ' The panel will press on ' + esc(d.weak_spots.join(', ')) + '.' : '') + '</p>'"
                        " + '<p><a href=\"" + APP_URL + "/s/' + encodeURIComponent(r.session_id) + '/report\">Open the full report</a>: what you said on each slide, marked up, with a talk track for next time.</p>'; })() }}"),
        "options": {"appendAttribution": False},
    }, [{"id": "msg1"}], credentials={"gmailOAuth2": "Gmail"}, extra={"onError": "continueRegularOutput"})
    c += code_node("rowDone", "Row: done", DEBRIEF_PROGRESS_JS + """
// The finished debrief, and the whole session record the laptop gets back (the same as GET /session)
const r = $('Read the session').first().json;
const j = $('Build the debrief').first().json;
const mailedOk = !!mailed && !mailed.error;
const debrief = { ...j.debrief, actions_taken: (mailedOk ? ['report_emailed'] : []).concat(j.debrief.actions_taken) };
return [{ json: { session_id: r.session_id, status: 'done', overall: debrief.overall, headline: debrief.headline, debrief: JSON.stringify(debrief), ...statusFields } }];""",
                   [{"session_id": "s1", "debrief": "{}", "debrief_status": "{}"}])
    c += sessions_upsert("saveDone", "Save: debriefed")
    c += debrief_chunk("saidDone", "Report: emailed", "Row: done")
    c += code_node("practised", "Mark the meeting practised", """
// The meeting now has a rehearsal behind it (shown on the web app's home page)
const r = $('Read the session').first().json;
// (always one item, so the reply still goes out for a session without a meeting: 'none' matches no row)
return [{ json: { meeting_id: r.meeting_id || 'none', status: 'practised', updated_at: new Date().toISOString() } }];""", [{"meeting_id": "evt123"}])
    c += make_node("savePractised", "node", "n8n-nodes-base.dataTable", 1.1, "Save: practised", {
        "resource": "row", "operation": "update", "dataTableId": MEETINGS_TABLE, "matchType": "allConditions",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.meeting_id }}")}]},
        "columns": {"mappingMode": "defineBelow", "value": {"status": Expr("{{ $json.status }}"), "updated_at": Expr("{{ $json.updated_at }}")},
                    "matchingColumns": [], "schema": [
                        {"id": "status", "displayName": "status", "required": False, "defaultMatch": False, "display": True, "type": "string", "canBeUsedToMatch": True},
                        {"id": "updated_at", "displayName": "updated_at", "required": False, "defaultMatch": False, "display": True, "type": "string", "canBeUsedToMatch": True}]},
    }, [{"id": 1}], extra={"onError": "continueRegularOutput", "alwaysOutputData": True})
    c += code_node("theRecord", "The session record", """
// The whole session, the same as GET /session gives, for the laptop that is waiting on this run
const r = $('Read the session').first().json;
const done = $('Row: done').first().json;
return [{ json: { bundle: r.bundle, status: { done: true, steps: [] }, telemetry: r.telemetry, debrief_status: JSON.parse(done.debrief_status),
                  debrief: JSON.parse(done.debrief), history: r.history } }];""", [{"bundle": {}, "debrief": {}}])
    c += make_node("replyDebrief", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send the debrief", {"respondWith": "firstIncomingItem", "options": {}}, [{}])

    # GET /session: one session for the dashboard and the report, with its earlier rehearsals
    c += make_node("sessionTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "GET /session", {
        "httpMethod": "GET", "path": "dryrun/session", "responseMode": "responseNode", "options": {},
    }, [{"query": {"session_id": "s1"}}])
    c += make_node("readSessions", "node", "n8n-nodes-base.dataTable", 1.1, "Read sessions", {
        "resource": "row", "operation": "get", "dataTableId": SESSIONS_TABLE, "returnAll": True,
    }, [{"session_id": "s1", "meeting_id": "evt123", "status": "done"}], extra={"alwaysOutputData": True})
    c += code_node("shapeSession", "The session", """
// docs/CONTRACT.md, GET /session: the record, or 404
const id = $('GET /session').first().json.query.session_id;
const rows = $input.all().map(i => i.json).filter(r => r.session_id);
const row = rows.find(r => String(r.session_id) === String(id));
const parse = x => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };
if (!row) return [{ json: { code: 404, body: { error: 'not found' } } }];
const history = rows.filter(r => r.meeting_id === row.meeting_id && r.session_id !== row.session_id && r.status === 'done' && typeof r.overall === 'number'
  && Date.parse(r.at) < Date.parse(row.at)).sort((x, y) => Date.parse(x.at) - Date.parse(y.at)).map(r => ({ session_id: r.session_id, at: r.at, overall: r.overall }));
return [{ json: { code: 200, body: { bundle: parse(row.bundle), status: { done: true, steps: [] }, telemetry: parse(row.telemetry),
  debrief_status: parse(row.debrief_status), debrief: row.status === 'done' ? parse(row.debrief) : null, history, state: row.status } } }];""",
                   [{"code": 200, "body": {}}])
    c += make_node("sendSession", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send the session", {
        "respondWith": "json", "responseBody": Expr("{{ JSON.stringify($json.body) }}"), "options": {"responseCode": Expr("{{ $json.code }}")},
    }, [{}])
    c += ("const about = sticky('## DryRun debrief\\nWhen a rehearsal ends (POST /webhook/dryrun/debrief, docs/CONTRACT.md): counts the time, pace and filler words on "
          "each slide, has the model judge the pitch against the plan and the panel (marks on the transcript, scores with evidence, who would back it, "
          "a talk track per slide, the drill and weak spots), saves it to the DryRun sessions table step by step, emails the report and marks the meeting "
          "practised. The next /prep for the meeting reads it. GET /webhook/dryrun/session reads one session.', [debriefTrigger, sessionTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-debrief', 'DryRun debrief')
  .add(about)
  .add(debriefTrigger)
  .to(findHistory)
  .to(findBrief)
  .to(readSession)
  .to(rowStart)
  .to(saveStart)
  .to(saidStart)
  .to(judge)
  .to(buildDebrief)
  .to(rowJudged)
  .to(saveJudged)
  .to(saidJudged)
  .to(emailReport)
  .to(rowDone)
  .to(saveDone)
  .to(saidDone)
  .to(practised)
  .to(savePractised)
  .to(theRecord)
  .to(replyDebrief)
  .add(judge.onError(judgeGroq))
  .add(judgeGroq)
  .to(buildDebrief)
  .add(sessionTrigger)
  .to(readSessions)
  .to(shapeSession)
  .to(sendSession)
  .group('Read', [findHistory, findBrief, readSession, rowStart, saveStart, saidStart], { description: 'Counts time, pace and filler words per slide and pairs each question with its answer' })
  .group('Judge', [judge, judgeGroq, buildDebrief, rowJudged, saveJudged, saidJudged], { description: 'Marks the transcript, scores with evidence, reads the room, plans the drill' })
  .group('Act', [emailReport, rowDone, saveDone, saidDone, practised, savePractised, theRecord, replyDebrief], { description: 'Emails the report, saves it for the next rehearsal and marks the meeting practised' });
"""
    return c


# ---------------------------------------------------------------- DryRun deck review (/deck-review)

DECK_REVIEW_REQUEST = {"body": {"meeting_id": "evt123", "deck": {"name": "RouteIQ.pdf", "slides": [{"index": 0, "text": "RouteIQ cuts fuel cost by 30%"}]},
                                "presenter": {"offer": "RouteIQ: route optimisation"}, "goal": "a paid pilot"}}


def deck_review():
    c = IMPORTS
    c += make_node("reviewTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "A deck was uploaded (laptop)", {
        "httpMethod": "POST", "path": "dryrun/deck-review", "responseMode": "responseNode", "options": {},
    }, [DECK_REVIEW_REQUEST])
    c += make_node("reviewMeeting", "node", "n8n-nodes-base.dataTable", 1.1, "Find the meeting", {
        "resource": "row", "operation": "get", "dataTableId": MEETINGS_TABLE, "matchType": "anyCondition",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.body.meeting_id || 'none' }}")}]},
    }, [{"meeting_id": "evt123", "title": "RouteIQ pitch", "company": "Delhivery", "brief": "{}", "proposal": "{}"}], extra={"alwaysOutputData": True})
    c += code_node("reviewGather", "What to check it against", """
// The deck's slide text against the brief: its research with numbered sources, the attendees and what they care about, the hardest
// questions and risks, and what the presenter offers and wants (docs/CONTRACT.md, POST /deck-review)
const req = $('A deck was uploaded (laptop)').first().json.body;
const row = $input.first().json || {};
const parse = x => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };
const brief = parse(row.brief) || {};
const proposal = parse(row.proposal) || {};
const sources = (brief.sources || []).slice(0, 12);
const research = [brief.company && brief.company.what_they_do ? 'What they do: ' + brief.company.what_they_do : '']
  .concat(((brief.company && brief.company.recent_news) || []).map(n => 'News' + (n.date ? ' (' + n.date + ')' : '') + ': ' + n.text))
  .concat(sources.map((x, i) => '[' + (i + 1) + '] ' + x.title + ' ' + x.url)).filter(Boolean).join('\\n') || 'No research saved for this meeting.';
const goal = req.goal || (proposal.goal && proposal.goal.text) || '';
const offer = (req.presenter && req.presenter.offer) || '';
const slides = ((req.deck && req.deck.slides) || []).map(s => ({ index: s.index, text: String(s.text || '').slice(0, 1200) })).filter(s => s.text);
const parts = {
  meeting: (row.title || 'A meeting') + (row.company ? ' with ' + row.company : ''),
  side: (offer ? 'They offer: ' + offer + '. ' : '') + (goal ? 'They want: ' + goal + '.' : '') || 'Not given.',
  brief: JSON.stringify({ summary: brief.summary || '', attendees: brief.attendees || [], questions: (brief.questions || []).map(q => q.question), risks: brief.risks || [] }),
  research,
  deck: JSON.stringify(slides),
};
const PROMPT = """ + json.dumps(DECK_REVIEW_PROMPT) + """;
const prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);
const indexes = ((req.deck && req.deck.slides) || []).map(s => s.index);
return [{ json: { meeting_id: row.meeting_id || '', found: !!row.meeting_id, slides: slides.length, indexes, sources, prompt } }];""",
                   [{"meeting_id": "evt123", "found": True, "slides": 1, "sources": [], "prompt": ""}])
    c += llm_nodes("reviewJudge", "Review the deck", "$json.prompt", GEMINI_REPLY, schema=DECK_REVIEW_SCHEMA,
                   source="$('What to check it against').first().json")
    c += code_node("reviewBuild", "The review", REPLY_JS + """
// Held to the deck and the sources: real slides only, each source by its number, at most five
const g = $('What to check it against').first().json;
const d = JSON.parse(replyText($json) || '{}');
const items = (d.items || []).filter(x => g.indexes.includes(x.slide_index) && x.claim && x.pushback).slice(0, 5)
  .map(x => ({ slide_index: x.slide_index, claim: x.claim, pushback: x.pushback, who: x.who || '', fix: x.fix || '',
               source: g.sources[x.source - 1] ? { title: g.sources[x.source - 1].title, url: g.sources[x.source - 1].url } : null }));
const review = { items, summary: d.summary || '', at: new Date().toISOString() };
return [{ json: { meeting_id: g.meeting_id, found: g.found, review, deck_review: JSON.stringify(review), updated_at: review.at } }];""",
                   [{"meeting_id": "evt123", "found": True, "review": {"items": []}, "deck_review": "{}"}])
    c += make_node("reviewKnown", "ifElse", "n8n-nodes-base.if", 2.3, "A known meeting?", {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"leftValue": Expr("{{ $json.found }}"), "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and",
        }, "options": {},
    }, [{"found": True}])
    # Saved on the meeting, so the next /prep aims the panel at the same points
    c += make_node("reviewSave", "node", "n8n-nodes-base.dataTable", 1.1, "Save it on the meeting", {
        "resource": "row", "operation": "update", "dataTableId": MEETINGS_TABLE, "matchType": "allConditions",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.meeting_id }}")}]},
        "columns": {"mappingMode": "defineBelow", "value": {"deck_review": Expr("{{ $json.deck_review }}"), "updated_at": Expr("{{ $json.updated_at }}")},
                    "matchingColumns": [], "schema": [
                        {"id": "deck_review", "displayName": "deck_review", "required": False, "defaultMatch": False, "display": True, "type": "string", "canBeUsedToMatch": True},
                        {"id": "updated_at", "displayName": "updated_at", "required": False, "defaultMatch": False, "display": True, "type": "string", "canBeUsedToMatch": True}]},
    }, [{"id": 1}], extra={"onError": "continueRegularOutput", "alwaysOutputData": True})
    c += make_node("reviewReply", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send the review", {
        "respondWith": "json", "responseBody": Expr("{{ JSON.stringify($('The review').first().json.review) }}"), "options": {},
    }, [{}])
    c += ("const about = sticky('## DryRun deck review\\nWhen the presenter uploads a deck (POST /webhook/dryrun/deck-review, docs/CONTRACT.md): "
          "checks its claims against the brief (the research and its sources, the attendees and what they care about) and says where it will "
          "get pushback, from whom, and how to fix it. Saved on the meeting, so the next rehearsal presses on the same points.', [reviewTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-deck-review', 'DryRun deck review')
  .add(about)
  .add(reviewTrigger)
  .to(reviewMeeting)
  .to(reviewGather)
  .to(reviewJudge)
  .to(reviewBuild)
  .to(reviewKnown
    .onTrue(reviewSave.to(reviewReply))
    .onFalse(reviewReply))
  .add(reviewJudge.onError(reviewJudgeGroq))
  .add(reviewJudgeGroq)
  .to(reviewBuild)
  .group('Review', [reviewMeeting, reviewGather, reviewJudge, reviewJudgeGroq, reviewBuild], { description: 'Checks the deck against the brief and its sources' })
  .group('Save', [reviewKnown, reviewSave], { description: 'Saves the review on the meeting for the next rehearsal' });
"""
    return c



# ---------------------------------------------------------------- DryRun twin (/twin) and DryRun twin update (/twin/update)

# A twin as the contract has it (0.27), from a DryRun people row and back. Inlined into every node that reads or writes one.
TWIN_ROW_JS = r"""
const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const lower = e => String(e || '').trim().toLowerCase();
const KINDS = ['raised', 'promised', 'decision', 'preference', 'role', 'context'];
const rowToTwin = r => ({ email: lower(r.email), aliases: parseJ(r.aliases, []), name: r.name || '', company: r.company || '', role: parseJ(r.role, null),
  sources: parseJ(r.sources, []), facts: parseJ(r.facts, []), readings: parseJ(r.readings, []), meetings: parseJ(r.meetings, []),
  predictions: parseJ(r.predictions, []), build_log: parseJ(r.build_log, []), updated: r.updated || '', sample: false });
const twinToRow = t => ({ email: t.email, aliases: JSON.stringify(t.aliases || []), name: t.name || '', company: t.company || '', role: t.role ? JSON.stringify(t.role) : '',
  sources: JSON.stringify(t.sources || []), facts: JSON.stringify(t.facts || []), readings: JSON.stringify(t.readings || []), meetings: JSON.stringify(t.meetings || []),
  predictions: JSON.stringify(t.predictions || []), build_log: JSON.stringify(t.build_log || []), updated: t.updated || '' });
// Any address of theirs finds the row: the key, or one the presenter linked
const findRow = (rows, email) => rows.find(r => r.email && (lower(r.email) === email || parseJ(r.aliases, []).map(lower).includes(email)));
const maxId = (list, prefix) => list.reduce((a, x) => Math.max(a, Number(String(x.id || '').replace(prefix, '')) || 0), 0);
// Counts for the brief and the people list, honest: connected facts, real meetings already held, suggestions waiting
const twinSummary = t => { const today = new Date().toISOString().slice(0, 10); const past = (t.meetings || []).map(m => m.date).filter(d => d && d <= today).sort();
  return { facts: (t.facts || []).filter(f => f.status === 'connected').length, meetings: past.length, to_check: (t.sources || []).filter(s => s.status === 'suggested').length,
           last_met: past.length ? past[past.length - 1] : null }; };
"""

# The text of a fetched email, without the quoted thread below it
EMAIL_JS = r"""
const addrText = x => (x && typeof x === 'object' ? (x.text || (x.value || []).map(v => v.address).join(', ')) : String(x || ''));
const cleanMail = t => { const out = []; for (const l of String(t || '').split('\n')) { const s = l.trim();
  if ((s.startsWith('On ') && s.endsWith('wrote:')) || s.startsWith('-----Original') || s.startsWith('From: ')) break; if (!s.startsWith('>')) out.push(l); }
  return out.join('\n').split('\n\n\n').join('\n\n').trim().slice(0, 1800); };
const mailDate = m => { const d = m.date ? new Date(m.date) : new Date(Number(m.internalDate) || Date.now()); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
const gmailUrl = id => 'https://mail.google.com/mail/u/0/#all/' + id;
// DryRun's own emails (the brief n8n wrote, the rehearsal report) are never a source: the brief is n8n's writing and the report is
// about a practice run (twin rule 1)
const ownMail = m => { const s = String(m.subject || m.Subject || ''); return (s.startsWith('Your brief for ') && s.endsWith(' is ready')) || s.startsWith('Your rehearsal for '); };
"""

# Gmail search terms that leave out DryRun's own emails (brief, rehearsal report): never a source for a twin
OWN_MAIL_Q = '-subject:(\\"Your brief for\\") -subject:(\\"Your rehearsal for\\")'

PUBLIC_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'rediffmail.com']

TWIN_REQUEST = {"body": {"email": "rajiv.menon@kaverifreight.in", "name": "Rajiv Menon", "company": "Kaveri Freight", "domain": "kaverifreight.in"}}


def twin_chunk(var, name, with_run=False):
    """A streamed step for /twin (contract 0.27): { step: { step, text, adds } }, from the item's `say`."""
    run = ", execution_id: $execution.id, workflow_id: $workflow.id" if with_run else ""
    body = "{{ JSON.stringify({ step: { step: $json.say.step, text: $json.say.text, adds: $json.say.adds }" + run + " }) }}"
    return make_node(var, "node", "n8n-nodes-base.respondToWebhook", 1.5, name, {"respondWith": "json", "responseBody": Expr(body), "options": {}}, [{}],
                     extra={"onError": "continueRegularOutput"})


def people_upsert(var, name):
    """Saves $json.row to the DryRun people table, keyed by email (each column mapped, so nothing else on the item is written)."""
    return make_node(var, "node", "n8n-nodes-base.dataTable", 1.1, name, {
        "resource": "row", "operation": "upsert", "dataTableId": PEOPLE_TABLE, "matchType": "allConditions",
        "filters": {"conditions": [{"keyName": "email", "condition": "eq", "keyValue": Expr("{{ $json.row.email }}")}]},
        "columns": {"mappingMode": "defineBelow", "value": {c: Expr("{{ $json.row." + c + " }}") for c in PEOPLE_COLUMNS}, "matchingColumns": [],
                    "schema": [{"id": c, "displayName": c, "required": False, "defaultMatch": False, "display": True, "type": "string", "canBeUsedToMatch": True} for c in PEOPLE_COLUMNS]},
    }, [{"id": 1}])


def read_people(var, name):
    return make_node(var, "node", "n8n-nodes-base.dataTable", 1.1, name,
                     {"resource": "row", "operation": "get", "dataTableId": PEOPLE_TABLE, "returnAll": True},
                     [{"email": "rajiv.menon@kaverifreight.in", "facts": "[]", "sources": "[]"}], extra={"alwaysOutputData": True, "executeOnce": True})


def twin():
    c = IMPORTS
    c += make_node("twinTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "Build a twin (laptop)", {
        # Streamed like /prep: a step as each stage lands (the twin page draws it), then the twin
        "httpMethod": "POST", "path": "dryrun/twin", "responseMode": "streaming", "options": {},
    }, [TWIN_REQUEST])
    c += read_people("twinPeople", "Read the people table")
    c += code_node("twinWho", "Who they are", TWIN_ROW_JS + r"""
// The person's row, or a new twin. Every address they use is searched; the row stays keyed by the first one.
const req = $('Build a twin (laptop)').first().json.body || {};
const email = lower(req.email);
if (!email.includes('@')) throw new Error('No email address to build a twin of');
const row = findRow($input.all().map(i => i.json), email);
const twin = row ? rowToTwin(row) : { email, aliases: [], name: '', company: '', role: null, sources: [], facts: [], readings: [], meetings: [], predictions: [], build_log: [], updated: '', sample: false };
twin.name = twin.name || String(req.name || '').trim();
twin.company = twin.company || String(req.company || '').trim();
const addresses = [twin.email].concat(twin.aliases.map(lower)).filter(Boolean);
const PUBLIC = """ + json.dumps(PUBLIC_DOMAINS) + r""";
const own = twin.email.split('@')[1] || '';
const domain = lower(req.domain) || (PUBLIC.includes(own) ? '' : own);
// A twin built before DryRun's own emails were left out may still carry them (rule 1): they go, with their facts
const ownTitle = s => s.type === 'email' && ((String(s.title).startsWith('Your brief for ') && String(s.title).endsWith(' is ready')) || String(s.title).startsWith('Your rehearsal for '));
const gone = new Set(twin.sources.filter(ownTitle).map(s => s.id));
twin.sources = twin.sources.filter(s => !gone.has(s.id));
twin.facts = twin.facts.filter(f => !gone.has(f.source_id));
// What's there already is drawn first, so a replay starts from nothing
const kept = twin.sources.filter(s => s.status !== 'rejected');
const facts = twin.facts.filter(f => f.status !== 'rejected');
const who = twin.name || twin.email;
const text = row ? 'Opened ' + who + "'s twin: " + facts.length + ' fact' + (facts.length === 1 ? '' : 's') + ' from ' + kept.length + ' source' + (kept.length === 1 ? '' : 's') + ' so far'
                 : 'Started a twin of ' + twin.email + (twin.name ? ' (' + twin.name + ')' : '');
return [{ json: { twin, addresses, domain, start: Date.now(),
                  say: { step: 'load', text, at: Date.now(), adds: { sources: kept, facts, readings: twin.readings, meetings: twin.meetings } } } }];""",
                   [{"twin": {}, "addresses": ["rajiv.menon@kaverifreight.in"], "domain": "kaverifreight.in", "start": 0, "say": {}}])
    c += twin_chunk("saidWho", "Report: opened", with_run=True)
    # Rule 3: an email from or to one of their addresses is them, for sure
    c += make_node("twinEmails", "node", "n8n-nodes-base.gmail", 2.2, "Your emails with them", {
        "resource": "message", "operation": "getAll", "returnAll": False, "limit": 20, "simple": False,
        "filters": {"readStatus": "both", "q": Expr("{{ '(' + $('Who they are').first().json.addresses.map(a => 'from:' + a + ' OR to:' + a).join(' OR ') + ') " + OWN_MAIL_Q + "' }}")},
        "options": {},
    }, [{"id": "m1", "threadId": "t1", "subject": "Pilot proposal", "date": "2026-10-03T10:00:00.000Z", "from": {"text": "Rajiv Menon <rajiv.menon@kaverifreight.in>"}, "text": "Could you send a pilot proposal?"}],
        credentials={"gmailOAuth2": "Gmail"}, extra={"alwaysOutputData": True, "executeOnce": True, "onError": "continueRegularOutput"})
    c += code_node("twinReadEmails", "Read the emails", TWIN_ROW_JS + EMAIL_JS + r"""
// Each email is a source card, connected (same address). Its text goes to the model; only the quotes are kept.
const g = $('Who they are').first().json;
const msgs = $input.all().map(i => i.json).filter(m => m.id);
const sources = g.twin.sources.slice();
const rejected = new Set(sources.filter(s => s.status === 'rejected').map(s => s.key));
let n = maxId(sources, 's');
const texts = {};
const found = [];
for (const m of msgs) {
  const key = 'gmail:' + m.id;
  if (rejected.has(key) || ownMail(m)) continue;
  const from = addrText(m.from || m.From);
  const theirs = g.addresses.some(a => from.toLowerCase().includes(a));
  let src = sources.find(s => s.key === key);
  if (!src) {
    src = { id: 's' + (++n), type: 'email', title: m.subject || m.Subject || '(no subject)', date: mailDate(m), url: gmailUrl(m.id), from: theirs ? from : 'you',
            status: 'connected', why: theirs ? 'From their address' : 'You wrote to their address', key };
    sources.push(src);
    found.push(src);
  }
  texts[src.id] = { kind: theirs ? 'email from them' : 'email from the presenter to them', date: src.date, subject: src.title, text: cleanMail(m.text || m.snippet || '') };
}
// The presenter's own notes are sources too (pasted profiles, notes from meetings DryRun didn't see)
sources.filter(s => s.type === 'manual' && s.status === 'connected' && s.text).forEach(s => { texts[s.id] = { kind: 'note the presenter wrote', date: s.date, text: s.text.slice(0, 4000) }; });
const all = g.addresses.join(' or ');
const text = msgs.length ? 'Found ' + msgs.length + ' email' + (msgs.length === 1 ? '' : 's') + ' with ' + all + (found.length < msgs.length ? ' (' + found.length + ' new)' : '')
                         : 'No emails with ' + all + ' in your inbox';
return [{ json: { ...g, sources, texts, emails: msgs.length, say: { step: 'emails', text, at: Date.now(), adds: { sources: found, facts: [], readings: [] } } } }];""",
                   [{"twin": {}, "addresses": [], "sources": [], "texts": {}, "say": {}}])
    c += twin_chunk("saidEmails", "Report: emails")
    c += make_node("twinMeetingRows", "node", "n8n-nodes-base.dataTable", 1.1, "Read the meetings", {
        "resource": "row", "operation": "get", "dataTableId": MEETINGS_TABLE, "returnAll": True,
    }, [{"meeting_id": "evt123", "title": "RouteIQ pitch", "start": "2026-10-16T15:00:00+05:30", "company": "Kaveri Freight", "attendees": "[]"}],
        extra={"alwaysOutputData": True, "executeOnce": True})
    c += code_node("twinMeetings", "Find their meetings", TWIN_ROW_JS + r"""
// The real meetings they were invited to (by address). A meeting is a date on the twin's timeline, not a source of facts: what was said
// in it only reaches the twin through the presenter's notes afterwards. Nothing from a rehearsal of it is read.
const g = $('Read the emails').first().json;
const rows = $input.all().map(i => i.json).filter(r => r.meeting_id);
const invited = r => parseJ(r.attendees, []).find(a => g.addresses.includes(lower(a.email)));
const theirs = rows.filter(r => invited(r) && r.status !== 'skipped');
const meetings = theirs.map(r => ({ id: String(r.meeting_id), title: r.title || '', date: String(r.start || '').slice(0, 10) })).sort((a, b) => (a.date < b.date ? -1 : 1));
const known = new Set(g.twin.meetings.map(m => m.id));
const name = g.twin.name || ((theirs.map(invited).find(a => a && a.name && a.name.includes(' ')) || {}).name) || '';
const company = g.twin.company || ((theirs.find(r => r.company && r.company !== r.title) || {}).company) || '';
const text = meetings.length ? 'Invited to ' + meetings.length + ' of your meetings: ' + meetings.slice(-2).map(m => m.title + ' (' + m.date + ')').join(', ')
                             : 'Not in any meeting DryRun has seen yet';
return [{ json: { ...g, name, company, meetings, say: { step: 'meetings', text, at: Date.now(), adds: { sources: [], facts: [], readings: [], meetings: meetings.filter(m => !known.has(m.id)) } } } }];""",
                   [{"twin": {}, "name": "Rajiv Menon", "company": "Kaveri Freight", "meetings": [], "addresses": [], "domain": "", "say": {}}])
    c += twin_chunk("saidMeetings", "Report: meetings")
    # Rule 3 again: found by name only, so each of these is a suggestion for the presenter to confirm
    c += make_node("twinMentionMail", "node", "n8n-nodes-base.gmail", 2.2, "Their name in other emails", {
        "resource": "message", "operation": "getAll", "returnAll": False, "limit": 8, "simple": False,
        "filters": {"readStatus": "both", "q": Expr("{{ (() => { const j = $('Find their meetings').first().json; const n = String(j.name || '').split('\"').join('').trim(); "
                                                    "if (n.split(' ').length < 2) return 'from:nobody@invalid.invalid'; "
                                                    "return '\"' + n + '\" ' + j.addresses.map(a => '-from:' + a + ' -to:' + a).join(' ') + ' newer_than:365d " + OWN_MAIL_Q + "'; })() }}")},
        "options": {},
    }, [{"id": "m9", "subject": "Kaveri intro", "from": {"text": "Priya Nair <priya.nair@kaverifreight.in>"}, "text": "Loop in Rajiv Menon from finance"}],
        credentials={"gmailOAuth2": "Gmail"}, extra={"alwaysOutputData": True, "executeOnce": True, "onError": "continueRegularOutput"})
    c += make_node("twinNews", "node", "n8n-nodes-base.httpRequest", 4.5, "News that names them", {
        "method": "GET",
        "url": Expr("{{ (() => { const j = $('Find their meetings').first().json; return String(j.name || '').includes(' ') ? 'https://news.google.com/rss/search?q=' + "
                    "encodeURIComponent('\"' + j.name + '\"' + (j.company ? ' \"' + j.company + '\"' : '')) + '&hl=en-IN&gl=IN&ceid=IN:en' : 'https://invalid.invalid'; })() }}"),
        "options": {"timeout": 15000, "response": {"response": {"responseFormat": "text"}}},
    }, [{"data": "<rss></rss>"}], extra={"onError": "continueRegularOutput", "executeOnce": True})
    c += code_node("twinPlaces", "Where to look on their site", r"""
// Their company's own pages that usually list people. Public professional pages only; LinkedIn is never read (against its terms).
const j = $('Find their meetings').first().json;
if (!j.domain || !String(j.name || '').includes(' ')) return [{ json: { url: 'https://invalid.invalid' } }];
return ['', '/team', '/about', '/about-us', '/leadership'].map(p => ({ json: { url: 'https://' + j.domain + p } }));""", [{"url": "https://kaverifreight.in/team"}])
    c += make_node("twinPages", "node", "n8n-nodes-base.httpRequest", 4.5, "Read their site", {
        "method": "GET", "url": Expr("{{ $json.url }}"),
        "options": {"timeout": 8000, "redirect": {"redirect": {}}, "response": {"response": {"responseFormat": "text"}}},
    }, [{"data": "<html></html>"}], extra={"onError": "continueRegularOutput", "alwaysOutputData": True})
    c += code_node("twinMentions", "Gather the mentions", TWIN_ROW_JS + EMAIL_JS + r"""
// Everywhere else their full name appears: emails from other people, news headlines, their company's pages. Each is a suggestion
// with why it might be them; a source the presenter rejected before is never suggested again.
const g = $('Find their meetings').first().json;
const name = String(g.name || '').trim();
const full = name.toLowerCase();
const sources = g.sources.slice();
const texts = { ...g.texts };
const rejected = new Set(sources.filter(s => s.status === 'rejected').map(s => s.key));
let n = maxId(sources, 's');
const found = [];
const today = new Date().toISOString().slice(0, 10);
const add = (src, text) => {
  if (rejected.has(src.key)) return;
  let s = sources.find(x => x.key === src.key);
  if (!s) { s = { id: 's' + (++n), status: 'suggested', ...src }; sources.push(s); found.push(s); }
  texts[s.id] = text;
};
if (full.includes(' ')) {
  for (const m of $('Their name in other emails').all().map(i => i.json).filter(m => m.id && !ownMail(m))) {
    const body = cleanMail(m.text || m.snippet || '');
    const at = body.toLowerCase().indexOf(full);
    if (at < 0) continue;
    const from = addrText(m.from || m.From);
    add({ type: 'email', title: m.subject || m.Subject || '(no subject)', date: mailDate(m), url: gmailUrl(m.id), from,
          why: (from.split('<')[0].trim() || 'Someone') + ' mentions a ' + name, key: 'gmail:' + m.id },
        { kind: 'email from someone else that mentions ' + name, date: mailDate(m), subject: m.subject || '', text: body.slice(Math.max(0, at - 600), at + 900) });
  }
  const rss = String($('News that names them').first().json.data || '');
  const unescape = t => t.split('<![CDATA[').join('').split(']]>').join('').split('&amp;').join('&').split('&quot;').join('"').split('&#39;').join("'");
  const tag = (xml, t) => { const a = xml.indexOf('<' + t); if (a < 0) return ''; const b = xml.indexOf('>', a); const e = xml.indexOf('</' + t + '>', b); return e < 0 ? '' : unescape(xml.slice(b + 1, e)).trim(); };
  rss.split('<item>').slice(1, 16).forEach(it => {
    const title = tag(it, 'title');
    if (!title.toLowerCase().includes(full)) return;
    const d = new Date(tag(it, 'pubDate'));
    const date = isNaN(d) ? '' : d.toISOString().slice(0, 10);
    const publisher = tag(it, 'source');
    add({ type: 'news', title: (publisher ? publisher + ': ' : '') + title.replace(/ - [^-]+$/, ''), date, url: tag(it, 'link'), why: 'A news story names a ' + name, key: 'news:' + tag(it, 'link') },
        { kind: 'news headline', date, text: title });
  });
  const places = $('Where to look on their site').all().map(i => i.json.url);
  let pages = 0;
  $input.all().forEach((page, i) => {
    if (pages >= 2) return;
    const html = String(page.json.data || '');
    const text = html.replace(/<script[^]*?<\/script>/gi, ' ').replace(/<style[^]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const at = text.toLowerCase().indexOf(full);
    if (at < 0 || !places[i] || places[i].includes('invalid.invalid')) return;
    pages++;
    const host = places[i].replace('https://', '').replace(/\/$/, '');
    add({ type: 'web', title: host, date: today, url: places[i], why: host + ' lists a ' + name, key: 'web:' + places[i] },
        { kind: 'their company web page', date: today, text: text.slice(Math.max(0, at - 250), at + 450).trim() });
  });
}
// The model reads every live source: connected ones as they are, suggestions marked as such
let budget = 26000;
const list = sources.filter(s => s.status !== 'rejected' && texts[s.id]).map(s => {
  const x = texts[s.id];
  const line = '[' + s.id + '] ' + (s.status === 'suggested' ? 'SUGGESTION, ' : '') + x.kind + (x.date ? ', ' + x.date : '') + (x.subject ? ', subject "' + x.subject + '"' : '') + ':\n' + x.text;
  budget -= line.length;
  return budget > 0 ? line : '';
}).filter(Boolean);
const known = g.twin.facts.filter(f => f.status === 'connected').map(f => f.id + ' (' + f.kind + '): ' + f.text).join('\n') || 'Nothing yet.';
const person = (name || g.twin.email) + ' <' + g.addresses.join(', ') + '>' + (g.company ? ', ' + g.company : '');
const PROMPT = """ + json.dumps(TWIN_PROMPT) + r""";
const prompt = PROMPT.split('{person}').join(person).split('{sources}').join(list.join('\n\n') || 'None.').split('{known}').join(known);
const text = found.length ? found.length + ' possible mention' + (found.length === 1 ? '' : 's') + ' by name: ' + found.slice(0, 2).map(s => s.why).join('; ') + '. Same person?'
           : full.includes(' ') ? 'No mentions of ' + name + ' elsewhere' : 'No full name to look for elsewhere';
return [{ json: { ...g, sources, texts, prompt, readable: list.length, say: { step: 'mentions', text, at: Date.now(), adds: { sources: found, facts: [], readings: [] } } } }];""",
                   [{"twin": {}, "sources": [], "texts": {}, "prompt": "", "readable": 0, "say": {}}])
    c += twin_chunk("saidMentions", "Report: mentions")
    c += make_node("twinAnything", "ifElse", "n8n-nodes-base.if", 2.3, "Anything to read?", {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"leftValue": Expr("{{ $json.readable }}"), "rightValue": 0, "operator": {"type": "number", "operation": "gt"}}],
            "combinator": "and",
        }, "options": {},
    }, [{"readable": 1}])
    c += llm_nodes("twinExtract", "Pull the facts", "$json.prompt", GEMINI_REPLY, schema=TWIN_SCHEMA, source="$('Gather the mentions').first().json")
    c += make_node("saidTwinFallback", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Report: Groq instead", {
        "respondWith": "json", "responseBody": Expr("{{ JSON.stringify({ step: { step: 'fallback', text: 'Gemini did not answer, so Groq reads the sources instead', adds: { sources: [], facts: [], readings: [] } } }) }}"), "options": {},
    }, [{}], extra={"onError": "continueRegularOutput"})
    c += code_node("twinRules", "Hold to the rules", TWIN_ROW_JS + REPLY_JS + r"""
// The twin rules (docs/CONTRACT.md, Twins), after the model:
// no source, no fact (the quote must be in that source's text); a fact takes its source's status (connected only on the same address);
// a promise only from the presenter's own emails or notes; a reading needs two connected facts; the role only from a connected source.
// Then merged: no duplicates, rejected stays rejected, the presenter's notes are never touched.
const g = $('Gather the mentions').first().json;
let d = {};
try { d = JSON.parse(replyText($json) || '{}'); } catch (e) { d = {}; }
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const byId = Object.fromEntries(g.sources.map(s => [s.id, s]));
const old = g.twin.facts;
let n = maxId(old, 'f');
const now = new Date().toISOString();
const sameText = new Map(old.map(f => [norm(f.text), f.id]));
const sameQuote = new Set(old.map(f => f.source_id + '|' + norm(f.quote)));
const fresh = [];
const ids = {};
(d.facts || []).forEach((f, i) => {
  const src = byId[f.source_id];
  const from = g.texts[f.source_id];
  if (!src || !from || src.status === 'rejected' || !KINDS.includes(f.kind) || !f.text) return;
  const q = norm(f.quote);
  if (q.split(' ').length < 4 || !norm(from.text + ' ' + (from.subject || '')).includes(q)) return;
  if (f.kind === 'promised' && !(from.kind.startsWith('email from the presenter') || src.type === 'manual')) return;
  const dup = sameText.get(norm(f.text));
  if (dup || sameQuote.has(src.id + '|' + q)) { if (dup) ids['n' + i] = dup; return; }
  const fact = { id: 'f' + (++n), kind: f.kind, text: String(f.text).slice(0, 120), source_id: src.id, quote: String(f.quote).slice(0, 300), status: src.status, added: now };
  sameText.set(norm(fact.text), fact.id);
  sameQuote.add(src.id + '|' + q);
  fresh.push(fact);
  ids['n' + i] = fact.id;
});
const facts = old.concat(fresh);
const connected = new Set(facts.filter(f => f.status === 'connected').map(f => f.id));
const held = r => ({ text: String(r.text || '').slice(0, 80), evidence: Array.from(new Set((r.evidence || []).map(e => ids[e] || e))).filter(id => connected.has(id)) });
let readings = (d.readings || []).map(held).filter(r => r.text && r.evidence.length >= 2).slice(0, 3);
// Readings are read afresh each build; with none new, last time's stay while their evidence holds
if (!readings.length) readings = g.twin.readings.map(held).filter(r => r.text && r.evidence.length >= 2);
readings = readings.map((r, i) => ({ id: 'r' + (i + 1), ...r }));
const roleSrc = d.role && d.role.text && byId[d.role.source_id];
const role = roleSrc && roleSrc.status === 'connected' && g.texts[roleSrc.id] ? { text: String(d.role.text).slice(0, 60), source_id: roleSrc.id } : g.twin.role;
const twin = { ...g.twin, name: g.name, company: g.company, role, sources: g.sources, facts, readings, meetings: g.meetings, updated: now };
const toCheck = g.sources.filter(s => s.status === 'suggested').length;
const text = (fresh.length ? 'Pulled ' + fresh.length + ' new fact' + (fresh.length === 1 ? '' : 's') + ', each with its quote'
                          : g.readable ? 'Nothing new in the sources' : 'Nothing to read yet') +
             (toCheck ? '; ' + toCheck + ' source' + (toCheck === 1 ? '' : 's') + ' to check' : '') + (readings.length ? '; ' + readings.length + " reading" + (readings.length === 1 ? '' : 's') + ' with evidence' : '');
const say = { step: 'extract', text, at: Date.now(), adds: { sources: [], facts: fresh, readings } };
// The build, saved for Replay: each step with when it landed and the ids it added
const start = $('Who they are').first().json.start;
const steps = [$('Who they are').first().json.say, $('Read the emails').first().json.say, $('Find their meetings').first().json.say, g.say, say];
twin.build_log = steps.map(s => ({ step: s.step, text: s.text, t: Math.max(0, s.at - start),
  adds: { sources: (s.adds.sources || []).map(x => x.id), facts: (s.adds.facts || []).map(x => x.id), readings: (s.adds.readings || []).map(x => x.id),
          meetings: (s.adds.meetings || []).map(x => x.id) } }));
return [{ json: { twin, say, row: { ...twinToRow(twin), execution_id: String($execution.id), workflow_id: String($workflow.id) } } }];""",
                   [{"twin": {}, "say": {}, "row": {"email": "rajiv.menon@kaverifreight.in"}}])
    c += twin_chunk("saidRules", "Report: pulled")
    c += people_upsert("twinSave", "Save the twin")
    c += make_node("twinReply", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send the twin", {
        "respondWith": "json", "responseBody": Expr("{{ JSON.stringify({ twin: $('Hold to the rules').first().json.twin }) }}"), "options": {},
    }, [{}])
    c += ("const about = sticky('## DryRun twin\\nBuilds the twin of one real person (POST /webhook/dryrun/twin, docs/CONTRACT.md 0.27), streamed step by step "
          "to the twin page: your emails with their address (connected), the meetings they were invited to, their name elsewhere (suggestions only), "
          "then facts with quotes. Nothing from a rehearsal is ever read. A step after the model drops any fact whose quote is not in its source.', [twinTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-twin', 'DryRun twin')
  .add(about)
  .add(twinTrigger)
  .to(twinPeople)
  .to(twinWho)
  .to(saidWho)
  .to(twinEmails)
  .to(twinReadEmails)
  .to(saidEmails)
  .to(twinMeetingRows)
  .to(twinMeetings)
  .to(saidMeetings)
  .to(twinMentionMail)
  .to(twinNews)
  .to(twinPlaces)
  .to(twinPages)
  .to(twinMentions)
  .to(saidMentions)
  .to(twinAnything
    .onTrue(twinExtract.to(twinRules))
    .onFalse(twinRules))
  .add(twinExtract.onError(saidTwinFallback))
  .add(saidTwinFallback)
  .to(twinExtractGroq)
  .to(twinRules)
  .add(twinRules)
  .to(saidRules)
  .to(twinSave)
  .to(twinReply)
  .group('Who', [twinPeople, twinWho, saidWho], { description: 'Opens their row in DryRun people, or starts one' })
  .group('Connected', [twinEmails, twinReadEmails, saidEmails, twinMeetingRows, twinMeetings, saidMeetings], { description: 'Sure: your emails with their address, the meetings they were invited to' })
  .group('Suggestions', [twinMentionMail, twinNews, twinPlaces, twinPages, twinMentions, saidMentions], { description: 'Found by name only: you confirm or reject each' })
  .group('Facts', [twinAnything, twinExtract, saidTwinFallback, twinExtractGroq, twinRules, saidRules, twinSave, twinReply], { description: 'Facts with quotes, held to the rules, merged and saved' });
"""
    return c


TWIN_UPDATE_REQUEST = {"body": {"email": "rajiv.menon@kaverifreight.in", "changes": [{"op": "confirm", "source_id": "s5"}]}}


def twin_update():
    c = IMPORTS
    c += make_node("updTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "Changes to a twin (laptop)", {
        "httpMethod": "POST", "path": "dryrun/twin/update", "responseMode": "responseNode", "options": {},
    }, [TWIN_UPDATE_REQUEST])
    c += read_people("updPeople", "Read the people table")
    c += code_node("updApply", "Apply the changes", TWIN_ROW_JS + r"""
// The presenter's batch of changes from the twin page (docs/CONTRACT.md, POST /twin/update), in order. Confirming a suggestion connects
// it and its facts; rejecting it rejects them and is remembered, so the same source is never suggested again.
const req = $('Changes to a twin (laptop)').first().json.body || {};
const email = lower(req.email);
const changes = Array.isArray(req.changes) ? req.changes : [];
const row = findRow($input.all().map(i => i.json), email);
if (!row) return [{ json: { action: 'none', reply: { twin: null, error: 'DryRun has no twin of ' + email } } }];
if (changes.some(x => x.op === 'forget')) return [{ json: { action: 'forget', email: lower(row.email), reply: { forgotten: true } } }];
const t = rowToTwin(row);
let sN = maxId(t.sources, 's');
let fN = maxId(t.facts, 'f');
const now = new Date().toISOString();
for (const x of changes) {
  if (x.op === 'confirm' || x.op === 'reject') {
    const s = t.sources.find(y => y.id === x.source_id);
    if (!s || s.type === 'manual') continue;
    s.status = x.op === 'confirm' ? 'connected' : 'rejected';
    if (x.op === 'confirm') s.why = 'You confirmed it: ' + (s.why || '');
    t.facts.forEach(f => { if (f.source_id === s.id) f.status = s.status; });
  } else if (x.op === 'note') {
    const text = String(x.text || '').trim().slice(0, 8000);
    if (!text) continue;
    const s = { id: 's' + (++sN), type: 'manual', title: text.length < 300 ? 'Your note' : 'Text you pasted', date: now.slice(0, 10), status: 'connected', why: 'You added this', key: 'manual:' + now + ':' + sN, text };
    t.sources.push(s);
    // A short note is a fact as it stands; longer text is read for facts, with quotes, on the next build
    if (text.length < 300) t.facts.push({ id: 'f' + (++fN), kind: KINDS.includes(x.kind) ? x.kind : 'context', text: text.slice(0, 120), source_id: s.id, quote: text, status: 'connected', added: now });
  } else if (x.op === 'alias') {
    const a = lower(x.email);
    if (a.includes('@') && a !== t.email && !t.aliases.includes(a)) t.aliases.push(a);
  } else if (x.op === 'delete') {
    t.facts = t.facts.filter(f => f.id !== x.fact_id);
  }
}
// What no longer holds goes: readings need two connected facts, the role a connected source
const ok = new Set(t.facts.filter(f => f.status === 'connected').map(f => f.id));
t.readings = t.readings.map(r => ({ ...r, evidence: r.evidence.filter(id => ok.has(id)) })).filter(r => r.evidence.length >= 2);
if (t.role && !t.sources.some(s => s.id === t.role.source_id && s.status === 'connected')) t.role = null;
t.updated = now;
return [{ json: { action: 'save', row: { ...twinToRow(t), execution_id: String($execution.id), workflow_id: String($workflow.id) }, reply: { twin: t } } }];""",
                   [{"action": "save", "row": {"email": "rajiv.menon@kaverifreight.in"}, "reply": {}}])
    for var, name, action in [("updForget", "Forget them?", "forget"), ("updSave", "Save it?", "save")]:
        c += make_node(var, "ifElse", "n8n-nodes-base.if", 2.3, name, {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "conditions": [{"leftValue": Expr("{{ $json.action }}"), "rightValue": action, "operator": {"type": "string", "operation": "equals"}}],
                "combinator": "and",
            }, "options": {},
        }, [{"action": action}])
    c += make_node("updDelete", "node", "n8n-nodes-base.dataTable", 1.1, "Delete their row", {
        "resource": "row", "operation": "deleteRows", "dataTableId": PEOPLE_TABLE, "matchType": "allConditions",
        "filters": {"conditions": [{"keyName": "email", "condition": "eq", "keyValue": Expr("{{ $json.email }}")}]},
    }, [{"id": 1}], extra={"alwaysOutputData": True})
    c += people_upsert("updWrite", "Save the twin")
    c += make_node("updReply", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send the twin", {
        "respondWith": "json", "responseBody": Expr("{{ JSON.stringify($('Apply the changes').first().json.reply) }}"), "options": {},
    }, [{}])
    c += ("const about = sticky('## DryRun twin update\\nThe presenter\\'s changes to a twin, sent from the twin page as one batch (POST /webhook/dryrun/twin/update, "
          "docs/CONTRACT.md 0.27): confirm or reject a suggestion, add a note, link another address, delete a fact, or forget the person.', [updTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-twin-update', 'DryRun twin update')
  .add(about)
  .add(updTrigger)
  .to(updPeople)
  .to(updApply)
  .to(updForget
    .onTrue(updDelete.to(updReply))
    .onFalse(updSave
      .onTrue(updWrite.to(updReply))
      .onFalse(updReply)))
  .group('Changes', [updPeople, updApply], { description: 'Applies the batch of confirmations, rejections, notes, links and deletions' })
  .group('Save', [updForget, updSave, updDelete, updWrite, updReply], { description: 'Saves the twin, or forgets the person' });
"""
    return c



# ---------------------------------------------------------------- DryRun after the meeting (/after-meeting, twins step 5)

AFTER_REQUEST = {"body": {"meeting_id": "evt123", "owner_email": "you@example.com", "notes": "Rajiv asked about the diesel price again. I promised the case study by Friday.",
                          "audio": [{"base64": "UklGRg==", "format": "m4a"}]}}


def if_node(var, name, left, op_type, op, right=None, sample=None):
    cond = {"leftValue": Expr(left), "operator": {"type": op_type, "operation": op}}
    if right is None:
        cond["rightValue"] = ""
        cond["operator"]["singleValue"] = True
    else:
        cond["rightValue"] = right
    return make_node(var, "ifElse", "n8n-nodes-base.if", 2.3, name, {
        "conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"}, "conditions": [cond], "combinator": "and"},
        "options": {},
    }, [sample or {}])


def meeting_update(var, name, fields):
    """Updates the meeting's row (by $json.meeting_id) with the given columns, each from $json."""
    return make_node(var, "node", "n8n-nodes-base.dataTable", 1.1, name, {
        "resource": "row", "operation": "update", "dataTableId": MEETINGS_TABLE, "matchType": "allConditions",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.meeting_id }}")}]},
        "columns": {"mappingMode": "defineBelow", "value": {f: Expr("{{ $json." + f + " }}") for f in fields}, "matchingColumns": [],
                    "schema": [{"id": f, "displayName": f, "required": False, "defaultMatch": False, "display": True, "type": "string", "canBeUsedToMatch": True} for f in fields]},
    }, [{"id": 1}], extra={"onError": "continueRegularOutput", "alwaysOutputData": True})


def audio_pieces(var, name):
    return code_node(var, name, r"""
// The voice note, piece by piece (the laptop cuts it into clips under 30 s, in order)
return ($('A voice note came in (laptop)').first().json.body.audio || []).filter(a => a && a.base64).slice(0, 12)
  .map((a, i) => ({ json: { i, audio_base64: a.base64, format: a.format === 'wav' ? 'wav' : 'm4a' } }));""", [{"i": 0, "audio_base64": "UklGRg==", "format": "m4a"}])


def audio_file(var, name):
    return make_node(var, "node", "n8n-nodes-base.convertToFile", 1.1, name, {
        "operation": "toBinary", "sourceProperty": "audio_base64",
        "options": {"fileName": Expr("{{ 'note-' + $json.i + '.' + $json.format }}"), "mimeType": Expr("{{ $json.format === 'wav' ? 'audio/wav' : 'audio/mp4' }}")},
    }, [{}])


def after_meeting():
    c = IMPORTS
    c += make_node("afterTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "A voice note came in (laptop)", {
        # Answers as soon as the meeting is saved; the follow-up then waits for the presenter's approval in the same execution
        "httpMethod": "POST", "path": "dryrun/after-meeting", "responseMode": "responseNode", "options": {},
    }, [AFTER_REQUEST])
    c += make_node("afterMeeting", "node", "n8n-nodes-base.dataTable", 1.1, "Find the meeting", {
        "resource": "row", "operation": "get", "dataTableId": MEETINGS_TABLE, "matchType": "anyCondition",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.body.meeting_id || 'none' }}")}]},
    }, [{"meeting_id": "evt123", "title": "RouteIQ pitch", "start": "2026-10-14T15:00:00+05:30", "company": "Kaveri Freight", "attendees": "[]", "proposal": "{}"}],
        extra={"alwaysOutputData": True})
    c += make_node("afterSessions", "node", "n8n-nodes-base.dataTable", 1.1, "Its rehearsals", {
        "resource": "row", "operation": "get", "dataTableId": SESSIONS_TABLE, "matchType": "anyCondition",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $('A voice note came in (laptop)').first().json.body.meeting_id || 'none' }}")}]},
        "returnAll": True,
    }, [{"session_id": "s0", "meeting_id": "evt123", "status": "done", "at": "2026-10-13T19:00:00.000Z", "bundle": "{}", "telemetry": "{}"}],
        extra={"alwaysOutputData": True, "executeOnce": True})
    c += read_people("afterPeople", "Read the people table")
    c += code_node("afterWhat", "What came in", TWIN_ROW_JS + r"""
// The meeting from the invite, its attendees, and what each one's practice seat asked in the last debriefed rehearsal of it: only to
// score how well the rehearsal predicted the real meeting (0.28). The practice lines are compared, never kept.
const req = $('A voice note came in (laptop)').first().json.body || {};
const row = $('Find the meeting').first().json || {};
if (!row.meeting_id) throw new Error('DryRun has no meeting ' + req.meeting_id);
const attendees = (parseJ(row.attendees, []) || []).filter(a => String(a.email || '').includes('@')).map(a => ({ name: a.name || a.email, email: lower(a.email) }));
const done = $('Its rehearsals').all().map(i => i.json).filter(r => r.session_id && r.status === 'done').sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
const last = done[0];
const bundle = last ? (typeof last.bundle === 'string' ? parseJ(last.bundle, {}) : last.bundle || {}) : {};
const tel = last ? (typeof last.telemetry === 'string' ? parseJ(last.telemetry, {}) : last.telemetry || {}) : {};
const asked = {};
(tel.events || []).filter(e => e.type === 'turn').forEach(e => (e.reactions || []).filter(r => r.kind === 'question' || r.kind === 'follow_up')
  .forEach(r => { (asked[r.persona_id] = asked[r.persona_id] || []).push(r.text); }));
const practice = attendees.map(a => {
  const p = (bundle.personas || []).find(x => lower(x.twin_email) === a.email || lower(x.display_name) === lower(a.name));
  return p ? { email: a.email, name: a.name, questions: (asked[p.id] || []).slice(0, 8) } : null;
}).filter(Boolean);
const proposal = parseJ(row.proposal, {}) || {};
return [{ json: { req, meeting: { id: String(row.meeting_id), title: row.title || '', date: String(row.start || '').slice(0, 10) || new Date().toISOString().slice(0, 10), company: row.company || '' },
                  attendees, practice, session_id: last ? last.session_id : '', notes: String(req.notes || '').slice(0, 12000),
                  pieces: (req.audio || []).filter(a => a && a.base64).length, owner: req.owner_email || row.owner_email || '',
                  goal: (proposal.goal && proposal.goal.text) || '',
                  keyterms: JSON.stringify([row.company].concat(attendees.map(a => a.name)).filter(Boolean).map(x => String(x).slice(0, 60)).slice(0, 20)) } }];""",
                   [{"meeting": {}, "attendees": [], "practice": [], "notes": "", "pieces": 1, "owner": "you@example.com", "keyterms": "[]"}])
    c += if_node("afterVoice", "A voice note?", "{{ $json.pieces }}", "number", "gt", 0, {"pieces": 1})
    c += audio_pieces("afterPieces", "Each piece")
    c += audio_file("afterFile", "The piece as a file")
    c += make_node("afterSarvam", "node", "n8n-nodes-base.httpRequest", 4.5, "Transcribe (Sarvam)", {
        "method": "POST", "url": SARVAM_STT, "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
        "sendBody": True, "contentType": "multipart-form-data",
        "bodyParameters": {"parameters": [
            {"parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "data"},
            {"name": "model", "value": SARVAM_STT_MODEL},
            # Detected, so Indian English and Hinglish both come through; the names and the company as key terms
            {"name": "language_code", "value": "unknown"},
            {"name": "keyterms", "value": Expr("{{ $('What came in').first().json.keyterms }}")}]},
        "options": {"timeout": 60000},
    }, [{"request_id": "r1", "transcript": "Rajiv asked about the diesel price again.", "language_code": "en-IN"}], credentials={"httpHeaderAuth": "Sarvam"},
        extra={"onError": "continueRegularOutput", "retryOnFail": True, "maxTries": 2, "waitBetweenTries": 1000})
    c += code_node("afterHeard", "Heard every piece?", r"""
// A piece Sarvam couldn't transcribe sends the whole note to Whisper instead, so the pieces stay in order
const out = $input.all().map(i => i.json);
return [{ json: { failed: out.filter(o => o.error || typeof o.transcript !== 'string').length, pieces: out.length } }];""", [{"failed": 0, "pieces": 1}])
    c += if_node("afterGaps", "Any piece failed?", "{{ $json.failed }}", "number", "gt", 0, {"failed": 0})
    c += audio_pieces("afterPieces2", "Every piece again")
    c += audio_file("afterFile2", "The piece as a file again")
    c += make_node("afterWhisper", "node", "n8n-nodes-base.httpRequest", 4.5, "Transcribe (Groq Whisper)", {
        "method": "POST", "url": GROQ_WHISPER, "authentication": "predefinedCredentialType", "nodeCredentialType": "groqApi",
        "sendBody": True, "contentType": "multipart-form-data",
        "bodyParameters": {"parameters": [
            {"parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "data"},
            {"name": "model", "value": WHISPER_MODEL}, {"name": "response_format", "value": "json"},
            {"name": "prompt", "value": Expr("{{ JSON.parse($('What came in').first().json.keyterms).join(', ') }}")}]},
        "options": {"timeout": 60000},
    }, [{"text": "Rajiv asked about the diesel price again."}], credentials={"groqApi": "Groq"}, extra={"onError": "continueRegularOutput"})
    c += code_node("afterJoin", "The notes", r"""
// The note as one text: what was said (Sarvam, Whisper where Sarvam failed), then anything typed
const w = $('What came in').first().json;
const ran = n => { try { return $(n).isExecuted; } catch (e) { return false; } };
let pieces = ran('Transcribe (Sarvam)') ? $('Transcribe (Sarvam)').all().map(i => String(i.json.transcript || '').trim()) : [];
let heard = pieces.length ? 'Sarvam' : '';
if (ran('Transcribe (Groq Whisper)')) {
  const wh = $('Transcribe (Groq Whisper)').all().map(i => String(i.json.text || '').trim());
  pieces = (pieces.length ? pieces : wh).map((p, i) => p || wh[i] || '');
  heard = 'Sarvam and Whisper';
}
const spoken = pieces.filter(Boolean).join(' ');
const transcript = [spoken, w.notes].filter(Boolean).join('\n\n').trim();
if (!transcript) throw new Error('Nothing to read: the voice note could not be transcribed and no notes were typed');
const PROMPT = """ + json.dumps(AFTER_PROMPT) + r""";
const parts = { meeting: w.meeting.title + (w.meeting.company ? ' with ' + w.meeting.company : '') + ', ' + w.meeting.date,
                attendees: JSON.stringify(w.attendees), goal: w.goal || 'Not given.', notes: transcript,
                practice: w.practice.length ? JSON.stringify(w.practice.map(p => ({ email: p.email, questions: p.questions }))) : 'No rehearsal of this meeting.' };
const prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);
return [{ json: { ...w, transcript, source: spoken ? 'voice' : 'notes', heard, prompt } }];""",
                   [{"transcript": "", "source": "notes", "prompt": ""}])
    c += llm_nodes("afterRead", "Work out what happened", "$json.prompt", GEMINI_REPLY, schema=AFTER_SCHEMA, source="$('The notes').first().json")
    c += code_node("afterRules", "Hold to the rules", TWIN_ROW_JS + REPLY_JS + r"""
// The twin rules after the model (docs/CONTRACT.md 0.28): only attendees from the invite, by email; every item quoted from the notes;
// a prediction only for someone who had a practice seat, and only the number and the real facts it matched are kept. Then each person's
// twin gets the notes as a source (connected: the presenter's own account of a real meeting with them), the facts, the meeting and the
// prediction.
const w = $('The notes').first().json;
let d = {};
try { d = JSON.parse(replyText($json) || '{}'); } catch (e) { d = {}; }
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const said = norm(w.transcript);
const quoted = x => x && x.text && norm(x.quote).split(' ').length >= 3 && said.includes(norm(x.quote));
const byEmail = Object.fromEntries(w.attendees.map(a => [a.email, a]));
const people = (d.people || []).filter(p => byEmail[lower(p.email)]).map(p => ({
  email: lower(p.email), name: byEmail[lower(p.email)].name,
  raised: (p.raised || []).filter(quoted).slice(0, 8).map(x => ({ text: String(x.text).slice(0, 140), quote: String(x.quote).slice(0, 300) })),
  promised: (p.promised || []).filter(quoted).slice(0, 6).map(x => ({ text: String(x.text).slice(0, 140), quote: String(x.quote).slice(0, 300) })),
  decided: (p.decided || []).filter(quoted).slice(0, 6).map(x => ({ text: String(x.text).slice(0, 140), quote: String(x.quote).slice(0, 300) })),
  next_step: String(p.next_step || '').slice(0, 140) }))
  .filter(p => p.raised.length || p.promised.length || p.decided.length || p.next_step);
// How well the last rehearsal predicted it: per person who had a seat, how many of the things they really raised it had asked
const seat = Object.fromEntries(w.practice.map(p => [p.email, p]));
const hits = {};
(d.predicted || []).forEach(x => {
  const e = lower(x.email);
  const person = people.find(p => p.email === e);
  if (!person || !seat[e] || !person.raised[x.raised] || !seat[e].questions[x.practice]) return;
  (hits[e] = hits[e] || new Set()).add(x.raised);
});
const predictions = people.filter(p => seat[p.email] && p.raised.length).map(p => ({ email: p.email, name: p.name, asked: p.raised.length,
  predicted: hits[p.email] ? hits[p.email].size : 0, practice_asked: seat[p.email].questions.length, matched_index: hits[p.email] ? Array.from(hits[p.email]) : [] }));
const now = new Date().toISOString();
const f = d.followup || {};
const to = w.attendees.map(a => a.email);
// A draft with a gap left to fill ([fill in: ...]) is never offered for one-click sending: "Send it" would email the attendees the gap (0.29)
const followupBody = String(f.body || '').slice(0, 3000);
const followup = { to, subject: String(f.subject || '').slice(0, 160), body: followupBody,
                   status: !followupBody || !to.length || !w.owner ? 'none' : followupBody.toLowerCase().includes('[fill in') ? 'draft' : 'waiting' };
const run = { workflow_id: String($workflow.id), execution_id: String($execution.id) };
// Each person's twin: started if DryRun didn't know them, never touching anything else in it
const rows = $('Read the people table').all().map(i => i.json).filter(r => r.email);
const key = 'after:' + w.meeting.id;
const twinRows = people.map(p => {
  const found = findRow(rows, p.email);
  const t = found ? rowToTwin(found) : { email: p.email, aliases: [], name: p.name, company: w.meeting.company, role: null, sources: [], facts: [], readings: [], meetings: [], predictions: [], build_log: [], updated: '', sample: false };
  // Counted before any fact is dropped, so a dropped fact's id is never given to a new one
  let n = maxId(t.facts, 'f');
  let src = t.sources.find(s => s.key === key);
  if (!src) { src = { id: 's' + (maxId(t.sources, 's') + 1), type: 'meeting_note', key }; t.sources.push(src); }
  // Notes sent again for the same meeting replace its text, so the facts the earlier notes gave go too: their quotes may not be in the
  // new text (rule 2). Only this source's connected facts, which only this workflow writes; a fact the presenter rejected stays, so the
  // same words aren't brought back below.
  else t.facts = t.facts.filter(x => !(x.source_id === src.id && x.status === 'connected'));
  Object.assign(src, { title: 'Your notes from ' + (w.meeting.title || 'the meeting'), date: w.meeting.date, status: 'connected', why: 'Your own account of a real meeting with them', text: w.transcript.slice(0, 6000) });
  const have = new Set(t.facts.map(x => norm(x.text)));
  const ids = [];
  [['raised', p.raised], ['promised', p.promised], ['decision', p.decided]].forEach(([kind, list]) => list.forEach((x, i) => {
    const existing = t.facts.find(y => norm(y.text) === norm(x.text));
    if (existing) { if (kind === 'raised') ids[i] = existing.id; return; }
    const fact = { id: 'f' + (++n), kind, text: x.text, source_id: src.id, quote: x.quote, status: 'connected', added: now };
    t.facts.push(fact);
    have.add(norm(x.text));
    if (kind === 'raised') ids[i] = fact.id;
  }));
  if (!t.meetings.some(m => m.id === w.meeting.id)) t.meetings.push({ id: w.meeting.id, title: w.meeting.title, date: w.meeting.date });
  const pr = predictions.find(x => x.email === p.email);
  if (pr) t.predictions = t.predictions.filter(x => x.meeting_id !== w.meeting.id).concat([{ meeting_id: w.meeting.id, date: w.meeting.date, asked: pr.asked, predicted: pr.predicted, matched: pr.matched_index.map(i => ids[i]).filter(Boolean) }]);
  t.name = t.name || p.name;
  t.updated = now;
  return { ...twinToRow(t), execution_id: run.execution_id, workflow_id: run.workflow_id };
});
const after = { at: now, source: w.source, transcript: w.transcript.slice(0, 12000), heard: w.heard || '', people,
  predictions: predictions.map(({ matched_index, ...x }) => x), followup, run };
return [{ json: { meeting_id: w.meeting.id, after: JSON.stringify(after), status: 'done', updated_at: now, result: after, rows: twinRows, owner: w.owner } }];""",
                   [{"meeting_id": "evt123", "after": "{}", "status": "done", "result": {}, "rows": [], "owner": "you@example.com"}])
    c += meeting_update("afterSave", "Save it on the meeting", ["after", "status", "updated_at"])
    c += if_node("afterAnyone", "Any twins to update?", "{{ $('Hold to the rules').first().json.rows.length }}", "number", "gt", 0, {})
    c += code_node("afterRows", "One row per person", r"""
return $('Hold to the rules').first().json.rows.map(row => ({ json: { row } }));""", [{"row": {"email": "rajiv.menon@kaverifreight.in"}}])
    c += people_upsert("afterUpsert", "Update their twins")
    c += make_node("afterReply", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send what n8n found", {
        "respondWith": "json", "responseBody": Expr("{{ JSON.stringify({ after: $('Hold to the rules').first().json.result }) }}"), "options": {},
    }, [{}], extra={"executeOnce": True})
    c += if_node("afterToSend", "A follow-up to send?", "{{ $('Hold to the rules').first().json.result.followup.status }}", "string", "equals", "waiting", {})
    # Human in the loop: nothing goes to the attendees until the presenter says so, from their own inbox
    c += make_node("afterAsk", "node", "n8n-nodes-base.gmail", 2.2, "Ask before sending", {
        "resource": "message", "operation": "sendAndWait",
        "sendTo": Expr("{{ $('Hold to the rules').first().json.owner }}"),
        "subject": Expr("{{ 'Send your follow-up for ' + ($('The notes').first().json.meeting.title || 'the meeting') + '?' }}"),
        "message": Expr("{{ (() => { const f = $('Hold to the rules').first().json.result.followup; const esc = t => String(t || '').split('&').join('&amp;').split('<').join('&lt;'); "
                        "return '<p>n8n drafted this follow-up from your notes on the meeting. <b>Send it</b> emails it to ' + esc(f.to.join(', ')) + ' from your Gmail; '"
                        " + '<b>Don\\'t send</b> keeps it as a draft on the meeting page. To change anything first, answer Don\\'t send, then send it yourself.</p>'"
                        " + '<p><b>Subject:</b> ' + esc(f.subject) + '</p><p>' + esc(f.body).split('\\n').join('<br>') + '</p>'; })() }}"),
        "responseType": "approval",
        "approvalOptions": {"values": {"approvalType": "double", "approveLabel": "Send it", "disapproveLabel": "Don't send"}},
        "options": {"limitWaitTime": {"values": {"limitType": "afterTimeInterval", "resumeAmount": 2, "resumeUnit": "days"}}, "appendAttribution": False},
    }, [{"data": {"approved": True}}], credentials={"gmailOAuth2": "Gmail"}, extra={"executeOnce": True})
    c += if_node("afterApproved", "Approved?", "{{ $json.data && $json.data.approved }}", "boolean", "true", None, {"data": {"approved": True}})
    c += make_node("afterSend", "node", "n8n-nodes-base.gmail", 2.2, "Send the follow-up", {
        "resource": "message", "operation": "send",
        "sendTo": Expr("{{ $('Hold to the rules').first().json.result.followup.to.join(',') }}"),
        "subject": Expr("{{ $('Hold to the rules').first().json.result.followup.subject }}"),
        "emailType": "text",
        "message": Expr("{{ $('Hold to the rules').first().json.result.followup.body }}"),
        "options": {"appendAttribution": False},
    }, [{"id": "m1"}], credentials={"gmailOAuth2": "Gmail"}, extra={"onError": "continueRegularOutput"})
    for var, name, status in [("afterSent", "It was sent", "sent"), ("afterDeclined", "It was not sent", "declined")]:
        cond = "$input.first().json.id ? 'sent' : 'failed'" if status == "sent" else "'declined'"
        c += code_node(var, name, r"""
// The answer, on the meeting: the follow-up was sent (or failed to send), or the presenter kept it
const r = $('Hold to the rules').first().json;
const after = { ...r.result, followup: { ...r.result.followup, status: """ + cond + r""", answered_at: new Date().toISOString() } };
return [{ json: { meeting_id: r.meeting_id, after: JSON.stringify(after) } }];""", [{"meeting_id": "evt123", "after": "{}"}])
    c += meeting_update("afterSaveAnswer", "Save the answer", ["after"])
    c += ("const about = sticky('## DryRun after the meeting\\nAfter a real meeting (POST /webhook/dryrun/after-meeting, docs/CONTRACT.md 0.28): Sarvam transcribes the "
          "presenter\\'s voice note (Whisper if it fails), n8n works out what each attendee raised, what was promised and decided, updates their twins, scores "
          "how well the last rehearsal predicted it, and drafts the follow-up, which goes out only after the presenter approves it from their inbox.', [afterTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-after-meeting', 'DryRun after the meeting')
  .add(about)
  .add(afterTrigger)
  .to(afterMeeting)
  .to(afterSessions)
  .to(afterPeople)
  .to(afterWhat)
  .to(afterVoice
    .onTrue(afterPieces.to(afterFile).to(afterSarvam).to(afterHeard).to(afterGaps
      .onTrue(afterPieces2.to(afterFile2).to(afterWhisper).to(afterJoin))
      .onFalse(afterJoin)))
    .onFalse(afterJoin))
  .add(afterJoin)
  .to(afterRead)
  .to(afterRules)
  .add(afterRead.onError(afterReadGroq))
  .add(afterReadGroq)
  .to(afterRules)
  .add(afterRules)
  .to(afterSave)
  .to(afterAnyone
    .onTrue(afterRows.to(afterUpsert).to(afterReply))
    .onFalse(afterReply))
  .add(afterReply)
  .to(afterToSend
    .onTrue(afterAsk.to(afterApproved
      .onTrue(afterSend.to(afterSent).to(afterSaveAnswer))
      .onFalse(afterDeclined.to(afterSaveAnswer)))))
  .group('Listen', [afterMeeting, afterSessions, afterPeople, afterWhat, afterVoice, afterPieces, afterFile, afterSarvam, afterHeard, afterGaps, afterPieces2, afterFile2, afterWhisper, afterJoin], { description: 'The meeting, its last rehearsal, and the voice note transcribed by Sarvam (Whisper if it fails)' })
  .group('Understand', [afterRead, afterReadGroq, afterRules, afterSave, afterAnyone, afterRows, afterUpsert, afterReply], { description: 'Per person: raised, promised, decided, with quotes; their twins and the hit rate' })
  .group('Follow up', [afterToSend, afterAsk, afterApproved, afterSend, afterSent, afterDeclined, afterSaveAnswer], { description: 'The follow-up, sent only after the presenter approves it' });
"""
    return c


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for fname, code in [("prep.ts", prep()), ("meetings-api.ts", api()), ("rehearsal-prep.ts", rehearsal()), ("turn.ts", turn()), ("debrief.ts", debrief()), ("deck-review.ts", deck_review()), ("twin.ts", twin()), ("twin-update.ts", twin_update()), ("after-meeting.ts", after_meeting())]:
        (OUT / fname).write_text(code)
        print("wrote", OUT / fname, len(code), "chars")
