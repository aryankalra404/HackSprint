"""Builds the DryRun n8n workflows as n8n Workflow SDK code (n8n/sdk/*.ts).

    python3 n8n/build/build.py

The SDK files are what gets validated and created in n8n through its MCP server (create_workflow_from_code).
Credentials are referenced by name only (newCredential); nothing secret is written. Prompts live in prompts.py.
"""

import json
from pathlib import Path

from prompts import (BRIEF_PROMPT, BRIEF_SCHEMA, DEBRIEF_PROMPT, DEBRIEF_SCHEMA, REHEARSAL_PROMPT, REHEARSAL_SCHEMA, REHEARSAL_TIMED, REHEARSAL_UNTIMED, RESEARCH_PROMPT, TRIAGE_PROMPT, TRIAGE_SCHEMA, TURN_PROMPT,
                     TURN_SCHEMA, WEB_PROMPT)

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
VOICES = {"female": ["priya", "kavya", "neha", "ritu", "shreya", "simran"], "male": ["rahul", "aditya", "rohan", "amit", "kabir", "varun", "dev"]}
MEETINGS_TABLE = {"__rl": True, "mode": "id", "value": "wURCb4PjdZLpttns", "cachedResultName": "DryRun meetings"}
# One row per rehearsal: its bundle, what happened, the debrief's progress and the debrief (JSON as strings)
SESSIONS_TABLE = {"__rl": True, "mode": "id", "value": "xzUZexBbX6bcX18F", "cachedResultName": "DryRun sessions"}

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
// The web app sends { id, title, start, company, website, context, attendees: [{ name, email }], owner_email }
return $input.all().map(({ json }) => {
  const b = json.body || json;
  return { json: {
    meeting_id: b.id || ('web-' + Date.now()),
    title: b.title || ('Meeting with ' + (b.company || 'a prospect')),
    start: b.start || new Date(Date.now() + 2 * 86400000).toISOString(),
    minutes: b.minutes || null,
    description: [b.company && ('Company: ' + b.company), b.website && ('Website: ' + b.website), b.context].filter(Boolean).join('\\n').slice(0, 4000),
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
const proposal = { draft_id: prev.meeting.meeting_id, members, suggestions, ...(pitch ? { pitch } : {}) };
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
    c += code_node("shapeOne", "The meeting and its brief", """
// One meeting by id, with its brief, proposed panel and rehearsals, newest first (docs/CONTRACT.md, GET /meeting)
const id = $('GET /meeting').first().json.query.id;
const r = $('Read meeting').all().map(i => i.json).find(r => String(r.meeting_id) === String(id));
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
if (!r) return [{ json: { error: 'not found' } }];
const sessions = $input.all().map(i => i.json).filter(x => x.session_id && String(x.meeting_id) === String(id))
  .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  .map(x => ({ session_id: x.session_id, at: x.at, status: x.status, overall: typeof x.overall === 'number' ? x.overall : null, headline: x.headline || '' }));
const done = sessions.filter(x => x.status === 'done');
return [{ json: {
  meeting: { id: String(r.meeting_id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees: parse(r.attendees) || [],
             progress: parse(r.progress) || [], started_at: r.started_at || null,
             run: r.execution_id ? { workflow_id: r.workflow_id, execution_id: r.execution_id } : null,
             practice: done.length ? { sessions: done.length, last: { session_id: done[0].session_id, at: done[0].at, overall: done[0].overall, headline: done[0].headline } } : null },
  brief: parse(r.brief), proposal: parse(r.proposal), sessions,
} }];""", [{"meeting": {}, "brief": None, "proposal": None, "sessions": []}])
    for var, name in [("sendList", "Send meetings"), ("sendOne", "Send the meeting")]:
        c += make_node(var, "node", "n8n-nodes-base.respondToWebhook", 1.5, name, {"respondWith": "firstIncomingItem", "options": {}}, [{}])
    c += ("const about = sticky('## DryRun meetings API\\nThe web app reads your meetings and briefs from the DryRun meetings table, with each meeting\\'s "
          "rehearsals from DryRun sessions: GET /webhook/dryrun/meetings and GET /webhook/dryrun/meeting?id= (docs/CONTRACT.md).', [listTrigger, oneTrigger], { color: 4 });\n\n")
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
  .to(shapeOne)
  .to(sendOne)
  .group('Meetings', [readAll, sessionsAll, shapeList, sendList], { description: 'GET /meetings: upcoming meetings, each with its rehearsals so far' })
  .group('One meeting', [readOne, sessionsOne, shapeOne, sendOne], { description: 'GET /meeting: one meeting with its brief, panel and rehearsals' });
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
    c += code_node("gather", "Gather what n8n knows", """
// Everything the rehearsal is planned from: the meeting and its brief (from the DryRun meetings table), the confirmed panel,
// the deck's slide text and the pitch length (docs/CONTRACT.md, POST /prep)
const req = $('Start a rehearsal (web app)').first().json.body;
const row = $('Find the meeting').first().json || {};
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
// The last debriefed rehearsal of this meeting, if any: its score, weak spots, drill and each slide's talk track
const done = $input.all().map(i => i.json).filter(r => r.session_id && r.status === 'done').sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
const lastDebrief = done.length ? parse(done[0].debrief) : null;
const last = lastDebrief ? { overall: lastDebrief.overall, headline: lastDebrief.headline || '', weak_spots: lastDebrief.weak_spots || [], drill: lastDebrief.drill || null,
                             notes: Object.fromEntries((lastDebrief.slides || []).filter(s => s.notes).map(s => [s.index, s.notes])) } : null;
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
return [{ json: { req, minutes, timing, presenter: (req.presenter && req.presenter.name) || '', meeting, panel, slides, last,
                  history: last ? JSON.stringify({ score: last.overall, headline: last.headline, weak_spots: last.weak_spots, drill: last.drill && last.drill.title }) : 'First rehearsal.',
                  brief: { summary: brief.summary || '', attendees: brief.attendees || [], questions: brief.questions || [], risks: brief.risks || [],
                           company: brief.company || {} } } }];""", [{"minutes": 5, "presenter": "Aryan", "meeting": {}, "panel": [], "slides": [], "brief": {}}])
    c += progress_chunk("saidGather", "Report: gathered", "gather",
                        "[$json.meeting.company ? 'The brief on ' + $json.meeting.company : 'No saved brief for this meeting', "
                        "$json.panel.length + ($json.panel.length === 1 ? ' person' : ' people') + ' at the table', "
                        "$json.slides.length ? $json.slides.length + ' slides' : 'no deck', $json.minutes ? $json.minutes + ' min pitch' : 'no time limit', "
                        "$json.last ? 'last rehearsal ' + $json.last.overall + '/100 with ' + $json.last.weak_spots.length + ' weak spots to press on' : 'the first rehearsal'].join(', ')",
                        with_run=True)
    c += llm_nodes("plan", "Plan the rehearsal", json.dumps(REHEARSAL_PROMPT) +
                   ".split('{length}').join($json.timing.length).split('{pace}').join($json.timing.pace).split('{time_rule}').join($json.timing.time_rule)"
                   ".split('{time_lines}').join($json.timing.time_lines).replace('{presenter}', $json.presenter || 'the presenter')"
                   ".replace('{meeting}', JSON.stringify($json.meeting, null, 1)).replace('{brief}', JSON.stringify($json.brief, null, 1))"
                   ".replace('{panel}', JSON.stringify($json.panel, null, 1)).replace('{deck}', JSON.stringify($json.slides, null, 1))"
                   ".replace('{history}', $json.history || 'First rehearsal.')",
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
           objections: (x.objections || []).map(o => ({ slide_index: o.slide_index, text: o.text, source: ['deck', 'history'].includes(o.source) ? o.source : 'research' })),
           // Whoever presses on a weak spot from last time is one step harder (at most 3)
           difficulty: Math.min(3, (m.difficulty || 2) + ((x.objections || []).some(o => o.source === 'history') ? 1 : 0)), manner: x.manner === 'interrupts' ? 'interrupts' : 'waits', chair: m.id === chair,
           voice: voiceFor(m.avatar) };
});
// Slide times scaled so they add up to the pitch length. With no time limit (0.25) they stay n8n's natural estimate, which is then
// the pitch length (300 s for a pitch with no deck).
const raw = g.slides.map(s => (p.slides || []).find(x => x.index === s.index) || { index: s.index, title: 'Slide ' + (s.index + 1), key_points: [], target_seconds: 60, rescue: {} });
const total = raw.reduce((a, s) => a + Math.max(5, Math.min(900, s.target_seconds || 0)), 0) || 1;
const pitchSeconds = g.minutes ? g.minutes * 60 : raw.length ? total : 300;
const slides = raw.map(s => ({ index: s.index, title: s.title || '', image_url: '', key_points: s.key_points || [],
  target_seconds: Math.max(5, Math.round(Math.max(5, Math.min(900, s.target_seconds || 0)) * pitchSeconds / total)),
  rescue: { calm: (s.rescue && s.rescue.calm) || 'Take a breath.', keyword: (s.rescue && s.rescue.keyword) || '', bridge: (s.rescue && s.rescue.bridge) || '' },
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
return [{ json: { session_id: 's' + Date.now().toString(36), prospect: { company: g.meeting.company }, pitch_seconds: pitchSeconds, time, plan,
                  rescue_after_s: rescue, slides, personas, lines, drill: (g.last && g.last.drill) || null } }];""", [{"session_id": "s1", "personas": [], "slides": [], "lines": []}])
    c += progress_chunk("saidPlan", "Report: planned", "plan",
                        "(() => { const b = $json; const clock = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); const chair = b.personas.find(p => p.chair); const n = b.personas.reduce((a, p) => a + p.objections.length, 0); "
                        "return [b.slides.length ? b.slides.length + ' slides timed to the pitch' : '', n + ' objections', chair ? chair.display_name.split(' ')[0] + ' chairs' : '', "
                        "b.plan.during_pitch + ' questions during the pitch and ' + b.plan.after_pitch + ' after', "
                        "!b.time ? 'no time limit' : 'the chair nudges at ' + clock(b.time.nudge_at_s) + (b.time.cut_at_s ? ' and stops the pitch at ' + clock(b.time.cut_at_s) : '')"
                        "].filter(Boolean).join(', '); })()")
    c += progress_chunk("saidFallback", "Report: Groq instead", "fallback", "'Gemini did not answer, so Groq plans it instead'")
    c += code_node("eachLine", "One item per line", """
// Each line to voice, in its person's voice. Skipped when the web app asks for no voices (testing without spending TTS credits).
const b = $input.first().json;
const req = $('Start a rehearsal (web app)').first().json.body;
if (req.voices === false) return [];
const voice = Object.fromEntries(b.personas.map(p => [p.id, p.voice]));
return b.lines.map(l => ({ json: { id: l.id, text: l.text, speaker: voice[l.persona_id] } }));""", [{"id": "l1", "text": "Welcome, Aryan.", "speaker": "priya"}], extra={"alwaysOutputData": True})
    c += make_node("voice", "node", "n8n-nodes-base.httpRequest", 4.5, "Voice the line (Sarvam)", {
        "method": "POST",
        "url": SARVAM_TTS,
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": Expr("{{ JSON.stringify({ text: $json.text, language_code: 'en-IN', model: '" + SARVAM_MODEL + "', speaker: $json.speaker, speech_sample_rate: 22050, output_audio_codec: 'mp3' }) }}"),
        "options": {"timeout": 30000},
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
                        "return n ? v + ' of ' + n + ' lines voiced, each in the voice of whoever says it' : 'No lines to voice'; })()")
    c += make_node("reply", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send the bundle", {"respondWith": "firstIncomingItem", "options": {}}, [{}])
    c += ("const about = sticky('## DryRun rehearsal prep\\nBriefs the practice panel for one rehearsal (POST /webhook/dryrun/prep, docs/CONTRACT.md): "
          "plans each slide and the rescue cues, what each person will push on, who interrupts and who chairs, how many questions to ask "
          "and when, and the lines voiced ahead of time.', [prepTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-rehearsal-prep', 'DryRun rehearsal prep')
  .add(about)
  .add(prepTrigger)
  .to(findMeeting)
  .to(lastRehearsal)
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
  .group('Plan', [lastRehearsal, gather, saidGather, plan, saidFallback, planGroq, bundle, saidPlan], { description: 'Plans the slides, the panel, the questions and the lines for this meeting and pitch length' })
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
const r = $('What the room knows').first().json;
const d = JSON.parse(replyText($json) || '{}');
const people = Object.fromEntries((r.bundle.personas || []).map(p => [p.id, p]));
const lines = Object.fromEntries((r.bundle.lines || []).map(l => [l.id, l]));
const name = id => ((people[id] || {}).display_name || id).split(' ')[0];
const KINDS = ['welcome', 'question', 'follow_up', 'acknowledge', 'park', 'move_on', 'hand_back', 'open_floor', 'closing'];
let reactions = (d.reactions || []).filter(x => people[x.persona_id] && KINDS.includes(x.kind) && (x.text || lines[x.line_id])).map(x => ({ ...x }));
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
// A line voiced ahead of time of this kind for this person, or new text
const say = (pid, kind, text, reason, threadId) => {
  const l = (r.bundle.lines || []).find(x => x.persona_id === pid && x.kind === kind);
  return { persona_id: pid, kind, text: l ? l.text : text, line_id: l ? l.id : '', raise_hand: false, reason, thread_id: threadId || '' };
};

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

// The model sometimes starts a line with who says it ("Rohan: ..."), which the voice would read out
const unnamed = (p, text) => { const t = String(text || '').trim(); const first = String(p.display_name || '').split(' ')[0];
  return [p.display_name, first, p.role_short].filter(Boolean).reduce((a, n) => (a.toLowerCase().startsWith(n.toLowerCase() + ':') ? a.slice(n.length + 1).trim() : a), t); };
reactions = reactions.slice(0, 3).map(x => {
  const line = lines[x.line_id] && lines[x.line_id].persona_id === x.persona_id ? lines[x.line_id] : null;
  const out = { persona_id: x.persona_id, kind: x.kind, text: line ? line.text : unnamed(people[x.persona_id], x.text), raise_hand: r.mode === 'segment' && x.kind === 'question',
                reason: x.reason || '', ...(x.thread_id ? { thread_id: x.thread_id } : {}) };
  return line ? { ...out, line_id: line.id } : out;
});
// A bundle briefed before voices existed has none: fall back to a voice that fits the avatar
const voiceOf = p => p.voice || (String(p.avatar).includes('female') ? 'priya' : 'rahul');
const toVoice = reactions.map((x, i) => ({ i, text: x.text, speaker: voiceOf(people[x.persona_id]), voiced: !!x.line_id })).filter(x => !x.voiced);
return [{ json: { reply: { transcript: r.transcript, note: d.note || '', reactions, answer_verdict: verdict, threads: [...changed].map(id => byId[id]),
                           end_session: reactions.some(x => x.kind === 'closing') }, to_voice: toVoice } }];"""


TURN_REQUEST = {"body": {"session_id": "s1", "mode": "segment", "slide_index": 1, "t": 42.0, "audio_base64": "UklGRg==", "audio_format": "m4a",
                         "context": {"bundle": {"personas": [], "slides": [], "lines": [], "plan": {"during_pitch": 1, "after_pitch": 1, "why": ""}, "pitch_seconds": 120,
                                                "prospect": {"company": "Delhivery"}},
                                     "elapsed_s": 42.0, "turns": [], "threads": [], "pending": []}}}


def turn():
    c = IMPORTS
    c += make_node("turnTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "What the presenter said (headset)", {
        "httpMethod": "POST", "path": "dryrun/turn", "responseMode": "responseNode", "options": {},
    }, [TURN_REQUEST])
    c += code_node("readTurn", "Read the turn", """
// The moment, its audio as a file for transcription, and the context the laptop sent (docs/CONTRACT.md, POST /turn).
// n8n keeps no state between turns: everything it decides from is here.
const b = $input.first().json.body;
const ctx = b.context || {};
const bundle = ctx.bundle || {};
const turns = ctx.turns || [];
const pitchEnd = turns.findIndex(t => t.mode === 'pitch_end');
const askedDuring = turns.filter((t, i) => (pitchEnd < 0 || i < pitchEnd) && t.mode !== 'pitch_end').reduce((a, t) => a + (t.reactions || []).filter(r => r.kind === 'question').length, 0);
const askedAfter = pitchEnd < 0 ? 0 : turns.slice(pitchEnd).reduce((a, t) => a + (t.reactions || []).filter(r => r.kind === 'question').length, 0);
// Every question's life (0.26), kept by the laptop. An older laptop sends only the pending questions: they become open threads.
const threads = (ctx.threads || (ctx.pending || []).map((q, i) => ({ id: 'q' + (i + 1), persona_id: q.persona_id, text: q.text, slide_index: q.slide_index, status: 'open', follow_ups: 0, planned: false })));
// An answer answers the asker's latest thread that's still open
const answering = b.mode === 'answer' && b.asked_by ? threads.filter(t => t.persona_id === b.asked_by && (t.status === 'open' || t.status === 'followed_up')).pop() : null;
const json = { session_id: b.session_id, mode: b.mode, slide_index: b.slide_index, t: b.t, asked_by: b.asked_by || '', mid_slide: !!b.mid_slide, time_up: !!b.time_up,
               bundle, elapsed: Math.round(ctx.elapsed_s || b.t || 0),
               turns, threads, answering_id: answering ? answering.id : '', asked_during: askedDuring, asked_after: askedAfter };
// The laptop sends the speech as AAC (m4a), or WAV if it couldn't compress it
const audio = b.audio_base64 || b.audio_wav_base64 || '';
const m4a = b.audio_format === 'm4a';
return [{ json: { ...json, has_audio: !!audio }, binary: audio ? { audio: { data: audio, mimeType: m4a ? 'audio/mp4' : 'audio/wav', fileName: m4a ? 'turn.m4a' : 'turn.wav' } } : {} }];""",
                   [{"mode": "segment", "bundle": {}, "turns": [], "threads": [], "answering_id": "", "asked_during": 0, "asked_after": 0, "has_audio": True}])
    c += make_node("transcribe", "node", "n8n-nodes-base.httpRequest", 4.5, "Transcribe (Groq Whisper)", {
        "method": "POST", "url": GROQ_WHISPER, "authentication": "predefinedCredentialType", "nodeCredentialType": "groqApi",
        "sendBody": True, "contentType": "multipart-form-data",
        "bodyParameters": {"parameters": [
            {"parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "audio"},
            {"name": "model", "value": WHISPER_MODEL}, {"name": "language", "value": "en"}, {"name": "response_format", "value": "json"},
            # Names Whisper would otherwise mishear ("RouteIQ" came out as "Rautik"): the company, the slides and the people
            {"name": "prompt", "value": Expr("{{ [($json.bundle.prospect || {}).company].concat(($json.bundle.slides || []).map(s => s.title), "
                                             "($json.bundle.personas || []).map(p => p.display_name)).filter(Boolean).join(', ').slice(0, 600) }}")}]},
        "options": {"timeout": 30000},
    }, [{"text": "So at your scale, that is a meaningful saving in the first year."}], credentials={"groqApi": "Groq"},
        # No audio, or a failed transcription, carries on with an empty transcript: the room just doesn't react
        extra={"onError": "continueRegularOutput"})
    # The prompt is put together in "What the room knows", so changing it means changing one node
    prompt = "j.prompt"
    c += code_node("context", "What the room knows", """
// The prompt, kept short: a live turn should take a few seconds, and Groq's free tier allows 8,000 tokens a minute
const PROMPT = """ + json.dumps(TURN_PROMPT) + """;
const r = $('Read the turn').first().json;
const b = r.bundle;
const transcript = String(($json && $json.text) || '').trim();
const personas = (b.personas || []).map(p => ({ id: p.id, name: p.display_name, role: p.role, manner: p.manner, chair: p.chair, difficulty: p.difficulty,
  priorities: p.priorities, objections: (p.objections || []).map(o => (o.slide_index >= 0 ? 'slide ' + (o.slide_index + 1) + ': ' : '') + o.text) }));
const slide = (b.slides || []).find(s => s.index === r.slide_index);
const name = id => ((b.personas || []).find(p => p.id === id) || {}).display_name || id;
const history = r.turns.slice(-12).map(t => '[' + t.mode + (t.slide_index >= 0 ? ', slide ' + (t.slide_index + 1) : '') + '] presenter: "' + String(t.transcript || '').slice(0, 400) + '"'
  + (t.reactions || []).map(x => ' | ' + name(x.persona_id) + ' (' + x.kind + '): "' + x.text + '"').join('') + (t.answer_verdict ? ' | answer ' + t.answer_verdict : '')).join('\\n') || 'Nothing yet.';
const parts = {
  meeting: b.prospect && b.prospect.company ? 'with ' + b.prospect.company : 'a meeting', plan: JSON.stringify(b.plan || {}),
  asked_during: String(r.asked_during), asked_after: String(r.asked_after),
  // With a limit, how the chair keeps time; with none (time null, 0.25), the pitch length is only an estimate
  time: b.time && b.time.limit_s ? r.elapsed + ' seconds in, for a pitch of ' + b.time.limit_s + ' seconds' + (b.time.cut_at_s ? '; the chair stops the pitch at ' + b.time.cut_at_s + ' seconds' : '') + '.'
    : b.time === null ? r.elapsed + ' seconds in. No time limit (about ' + (b.pitch_seconds || 0) + ' seconds is only an estimate).'
    : r.elapsed + ' seconds in, for a pitch of ' + (b.pitch_seconds || 0) + ' seconds.',
  personas: JSON.stringify(personas), lines: JSON.stringify((b.lines || []).map(l => ({ line_id: l.id, persona_id: l.persona_id, kind: l.kind, text: l.text }))),
  slide: slide ? JSON.stringify({ number: slide.index + 1, title: slide.title, key_points: slide.key_points }) : 'No slides.',
  turns: history,
  threads: r.threads.length ? r.threads.map(t => t.id + ' (' + name(t.persona_id) + ', ' + t.status + ', follow-ups ' + (t.follow_ups || 0) + '): "' + t.text + '"').join('; ') : 'None yet.',
  mode: r.mode + (r.mid_slide ? " (mid-slide, at one of the plan's interruption points)" : '') + (r.time_up ? ' (the chair just stopped the pitch for time)' : ''),
  asked_by: r.asked_by ? ' (answering ' + name(r.asked_by) + ', id ' + r.asked_by + (r.answering_id ? ', thread ' + r.answering_id : '') + ')' : '', transcript,
};
// Each {name} in the prompt filled in by splitting, so nothing in the text is read as a replacement pattern
const prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);
return [{ json: { ...r, transcript, prompt } }];""",
                   [{"mode": "segment", "transcript": ""}])
    c += groq_first_nodes("decide", "Decide who reacts", prompt, [{"choices": [{"message": {"content": "{}"}}]}], TURN_SCHEMA, "$('What the room knows').first().json")
    c += code_node("check", "Check the reactions", REPLY_JS + CHECK_JS, [{"reply": {"reactions": [], "threads": []}, "to_voice": []}])
    c += make_node("anyToVoice", "ifElse", "n8n-nodes-base.if", 2.3, "New lines to voice?", {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"leftValue": Expr("{{ $json.to_voice.length }}"), "rightValue": 0, "operator": {"type": "number", "operation": "gt"}}],
            "combinator": "and",
        }, "options": {},
    }, [{"to_voice": []}])
    c += code_node("eachReaction", "One item per new line", """
return $input.first().json.to_voice.map(v => ({ json: v }));""", [{"i": 0, "text": "Meaningful isn't a number.", "speaker": "rahul"}])
    c += make_node("voiceTurn", "node", "n8n-nodes-base.httpRequest", 4.5, "Voice the line (Sarvam)", {
        "method": "POST", "url": SARVAM_TTS, "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
        "sendBody": True, "specifyBody": "json",
        "jsonBody": Expr("{{ JSON.stringify({ text: $json.text, language_code: 'en-IN', model: '" + SARVAM_MODEL + "', speaker: $json.speaker, speech_sample_rate: 22050, output_audio_codec: 'mp3' }) }}"),
        "options": {"timeout": 20000},
    }, [{"request_id": "r1", "audios": ["UklGRg=="]}], credentials={"httpHeaderAuth": "Sarvam"}, extra={"onError": "continueRegularOutput"})
    c += code_node("withVoices", "Add the voices", """
// The reply with each new line's audio (base64 MP3); the laptop saves them as WAV and gives the headset their paths
const c = $('Check the reactions').first().json;
const voiced = (() => { try { return $('Voice the line (Sarvam)').isExecuted; } catch (e) { return false; } })();
const items = voiced ? $('One item per new line').all().map(i => i.json) : [];
const out = voiced ? $('Voice the line (Sarvam)').all().map(i => i.json) : [];
const reactions = c.reply.reactions.map(x => ({ ...x }));
items.forEach((v, k) => { const a = out[k] && out[k].audios && out[k].audios[0]; if (a) reactions[v.i].audio_base64 = a; });
return [{ json: { ...c.reply, reactions } }];""", [{"transcript": "", "reactions": []}])
    c += make_node("replyTurn", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send the reactions", {"respondWith": "firstIncomingItem", "options": {}}, [{}])
    c += ("const about = sticky('## DryRun turn\\nHow the room reacts to what the presenter just said (POST /webhook/dryrun/turn, docs/CONTRACT.md): "
          "transcribes it, decides whether anyone speaks, who, what and why (or why nobody does), and voices it. The laptop sends the context, "
          "so this keeps no state.', [turnTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-turn', 'DryRun turn')
  .add(about)
  .add(turnTrigger)
  .to(readTurn)
  .to(transcribe)
  .to(context)
  .to(decide)
  .to(check)
  .to(anyToVoice
    .onTrue(eachReaction.to(voiceTurn.to(withVoices.to(replyTurn))))
    .onFalse(withVoices))
  .add(decide.onError(decideGemini))
  .add(decideGemini)
  .to(check)
  .group('Listen', [readTurn, transcribe], { description: 'Reads the moment and transcribes what the presenter said' })
  .group('Decide', [context, decide, decideGemini, check], { description: 'Decides whether anyone reacts, who, what and why' })
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
    judged ? 'Scored ' + judged.debrief.metrics.length + ' things with evidence, marked ' + judged.marks + ' moments, ' + judged.backs + ' of ' + judged.debrief.stakeholders.length + ' would back it' : '',
    'Marking the transcript, scoring the answers and reading the room'),
  step('plan', 'Planned the next rehearsal', !!judged, !!judged,
    judged ? 'Drill: ' + judged.debrief.drill.title + (judged.debrief.weak_spots.length ? '. The panel will press on ' + judged.debrief.weak_spots.join(', ') : '') : '', ''),
  step('email', 'Emailed you the report', !!mailed && !mailed.error, !!judged, 'To ' + (read.owner_email || 'you'), 'Emailing you the report'),
];
if (mailed && mailed.error) Object.assign(debriefSteps[3], { state: 'error', detail: "Couldn't email the report" });
const statusFields = { debrief_status: JSON.stringify({ done: !!mailed, steps: debriefSteps }), execution_id: String($execution.id), workflow_id: String($workflow.id), updated_at: new Date().toISOString() };
"""


def debrief():
    c = IMPORTS
    c += make_node("debriefTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "Debrief a session (laptop)", {
        "httpMethod": "POST", "path": "dryrun/debrief", "responseMode": "responseNode", "options": {},
    }, [DEBRIEF_REQUEST])
    c += make_node("findHistory", "node", "n8n-nodes-base.dataTable", 1.1, "Earlier rehearsals", {
        "resource": "row", "operation": "get", "dataTableId": SESSIONS_TABLE, "matchType": "anyCondition",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.body.meeting_id || 'none' }}")}]},
        "returnAll": True,
    }, [{"session_id": "s0", "meeting_id": "evt123", "status": "done", "overall": 65, "at": "2026-10-10T19:12:00.000Z", "debrief": "{}"}],
        extra={"alwaysOutputData": True})
    c += code_node("readSession", "Read the session", REPLY_JS + """
// What happened, slide by slide, with everything that can be counted counted here (the same input always gives the same numbers):
// time on each slide, words per minute, filler words, pacing against the plan. The model only judges (docs/CONTRACT.md, POST /debrief).
const b = $('Debrief a session (laptop)').first().json.body;
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
const seconds = {};
changes.forEach((c, i) => {
  const from = Math.min(c.t, pitchEnd);
  const to = Math.min(i + 1 < changes.length ? changes[i + 1].t : duration, pitchEnd);
  seconds[c.slide_index] = (seconds[c.slide_index] || 0) + Math.max(0, to - from);
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
    exchanges.push({ t: t.t, slide_index: t.slide_index, persona_id: r.persona_id, question: r.text, answer: null, verdict: null }));
});
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
const parse = x => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };
const earlier = $input.all().map(i => i.json).filter(r => r.session_id && r.session_id !== b.session_id && r.status === 'done' && typeof r.overall === 'number')
  .sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
const history = earlier.map(r => ({ session_id: r.session_id, at: r.at, overall: r.overall }));
const last = earlier.length ? parse(earlier[earlier.length - 1].debrief) : null;
const weakBefore = (last && last.weak_spots) || [];
const totalWords = slides.reduce((a, s) => a + words(s.transcript), 0) + exchanges.reduce((a, x) => a + words(x.answer), 0);
const answered = exchanges.filter(x => x.answer).length;
const summary = totalWords + ' words over ' + slides.filter(s => s.transcript).length + ' slide' + (slides.length === 1 ? '' : 's')
  + ', ' + exchanges.length + ' question' + (exchanges.length === 1 ? '' : 's') + ' (' + answered + ' answered) in ' + clock(duration);
// The prompt, with each {name} filled in by splitting (nothing in the text is read as a replacement pattern)
const PROMPT = """ + json.dumps(DEBRIEF_PROMPT) + """;
const parts = {
  presenter: (b.presenter && b.presenter.name) || 'The presenter',
  meeting: (bundle.prospect && bundle.prospect.company ? 'with ' + bundle.prospect.company : 'a meeting') + (bundle.time === null ? ', a pitch with no time limit' : ', a ' + clock(bundle.pitch_seconds || pitchSec) + ' pitch')
    + (end && end.time_up ? ' (the chair stopped it for time)' : ''),
  personas: JSON.stringify(personas.map(p => ({ id: p.id, name: p.display_name, role: p.role, priorities: p.priorities, objections: (p.objections || []).map(o => o.text) }))),
  slides: JSON.stringify(planned.map(s => ({ index: s.index, title: s.title, key_points: s.key_points, target_seconds: s.target_seconds }))),
  weak_spots: weakBefore.length ? weakBefore.join('; ') : 'None (first rehearsal).',
  transcript: slides.map(s => '[slide ' + (s.index + 1) + ' (index ' + s.index + '): ' + s.title + ', ' + s.seconds + ' s against ' + s.target_seconds + ' s, '
    + s.words_per_minute + ' words a minute, ' + s.filler_count + ' filler words] "' + (s.transcript || '(nothing said)') + '"').join('\\n') || 'Nothing was said.',
  exchanges: exchanges.map(x => name(x.persona_id) + ' (' + x.persona_id + ') asked on slide ' + (x.slide_index + 1) + ': "' + x.question + '" Answer: "'
    + (x.answer || '(not answered)') + '"' + (x.verdict ? ' (judged ' + x.verdict + ')' : '')).join('\\n') || 'No questions were asked.',
};
const prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);
const telemetry = { session_id: b.session_id, client: b.client || 'web', duration_s: duration, events, ...(b.gaze_dwell_s ? { gaze_dwell_s: b.gaze_dwell_s } : {}),
                    ...(b.facing_slides_s != null ? { facing_slides_s: b.facing_slides_s } : {}) };
return [{ json: { session_id: b.session_id, meeting_id: b.meeting_id || '', owner_email: b.owner_email || (b.presenter && b.presenter.email) || '',
                  bundle, telemetry, slides, exchanges, pacing, history, weak_before: weakBefore, summary, prompt } }];""",
                   [{"session_id": "s1", "meeting_id": "evt123", "summary": "", "prompt": "", "slides": [], "exchanges": [], "history": []}])
    c += code_node("rowStart", "Row: debriefing", DEBRIEF_PROGRESS_JS + """
// The session in the DryRun sessions table while n8n debriefs it
const r = $('Read the session').first().json;
return [{ json: { session_id: r.session_id, meeting_id: r.meeting_id, at: new Date().toISOString(), status: 'debriefing', headline: '',
                  bundle: JSON.stringify(r.bundle), telemetry: JSON.stringify(r.telemetry), debrief: '', ...statusFields } }];""", [{"session_id": "s1"}])
    c += sessions_upsert("saveStart", "Save: debriefing")
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
const metrics = NAMES.map(n => {
  const m = (d.metrics || []).find(x => x.name === n) || { score: 50, explanation: '', evidence: [] };
  return { name: n, score: clamp(m.score), explanation: m.explanation || '', evidence: (m.evidence || []).map(e => moment(e.quote, e.slide_index)).filter(Boolean).slice(0, 2) };
}).concat([r.pacing]);
const overall = Math.round(metrics.reduce((a, m) => a + m.score, 0) / metrics.length);
const stakeholders = ids.map(id => {
  const s = (d.stakeholders || []).find(x => x.persona_id === id) || { stance: 'undecided', reason: '' };
  return { persona_id: id, stance: ['backs', 'undecided', 'opposes'].includes(s.stance) ? s.stance : 'undecided', reason: s.reason || '',
           deciding_moment: s.quote ? moment(s.quote, s.slide_index) : null };
});
let marks = 0;
const slides = r.slides.map(s => {
  const j = (d.slides || []).find(x => x.index === s.index) || { covered: [], missed: [], marks: [], notes: '' };
  const judged = (j.marks || []).map(m => ({ ...m, quote: find(s.transcript, m.quote) })).filter(m => m.quote)
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
const debrief = { headline: d.headline || '', overall, previous_overall: r.history.length ? r.history[r.history.length - 1].overall : null,
                  stakeholders, metrics, slides, facing, drill, weak_spots: (d.weak_spots || []).slice(0, 3), actions_taken: ['weak_spots_saved'] };
return [{ json: { session_id: r.session_id, debrief, marks, backs: stakeholders.filter(s => s.stance === 'backs').length } }];""",
                   [{"session_id": "s1", "debrief": {"metrics": [], "stakeholders": [], "drill": {"title": ""}, "weak_spots": []}, "marks": 0, "backs": 0}])
    c += code_node("rowJudged", "Row: judged", DEBRIEF_PROGRESS_JS + """
const j = $('Build the debrief').first().json;
return [{ json: { session_id: j.session_id, overall: j.debrief.overall, headline: j.debrief.headline, ...statusFields } }];""", [{"session_id": "s1"}])
    c += sessions_upsert("saveJudged", "Save progress: judged")
    c += make_node("emailReport", "node", "n8n-nodes-base.gmail", 2.2, "Email the report", {
        "resource": "message", "operation": "send",
        "sendTo": Expr("{{ $('Read the session').first().json.owner_email }}"),
        "subject": Expr("{{ (() => { const r = $('Read the session').first().json; const d = $('Build the debrief').first().json.debrief; "
                        "return 'Your rehearsal for ' + ((r.bundle.prospect || {}).company || 'your meeting') + ': ' + d.overall + '/100'; })() }}"),
        "emailType": "html",
        "message": Expr("{{ (() => { const r = $('Read the session').first().json; const d = $('Build the debrief').first().json.debrief; "
                        "const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); "
                        "const who = id => ((r.bundle.personas || []).find(p => p.id === id) || {}).display_name || id; "
                        "const STANCE = { backs: 'would back it', undecided: 'is undecided', opposes: 'is not convinced' }; "
                        "return '<h2>' + esc(d.headline) + '</h2><p><b>' + d.overall + '/100</b>' + (d.previous_overall != null ? ' (last time ' + d.previous_overall + ')' : '') + '</p>'"
                        " + '<h3>The room</h3><ul>' + d.stakeholders.map(s => '<li><b>' + esc(who(s.persona_id)) + '</b> ' + STANCE[s.stance] + '. ' + esc(s.reason) + '</li>').join('') + '</ul>'"
                        " + '<h3>Scores</h3><ul>' + d.metrics.map(m => '<li>' + esc(m.name) + ': ' + m.score + '. ' + esc(m.explanation) + '</li>').join('') + '</ul>'"
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
  .to(readSession)
  .to(rowStart)
  .to(saveStart)
  .to(judge)
  .to(buildDebrief)
  .to(rowJudged)
  .to(saveJudged)
  .to(emailReport)
  .to(rowDone)
  .to(saveDone)
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
  .group('Read', [findHistory, readSession, rowStart, saveStart], { description: 'Counts time, pace and filler words per slide and pairs each question with its answer' })
  .group('Judge', [judge, judgeGroq, buildDebrief, rowJudged, saveJudged], { description: 'Marks the transcript, scores with evidence, reads the room, plans the drill' })
  .group('Act', [emailReport, rowDone, saveDone, practised, savePractised, theRecord, replyDebrief], { description: 'Emails the report, saves it for the next rehearsal and marks the meeting practised' });
"""
    return c


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for fname, code in [("prep.ts", prep()), ("meetings-api.ts", api()), ("rehearsal-prep.ts", rehearsal()), ("turn.ts", turn()), ("debrief.ts", debrief())]:
        (OUT / fname).write_text(code)
        print("wrote", OUT / fname, len(code), "chars")
