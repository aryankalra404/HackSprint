"""Builds the DryRun n8n workflows as n8n Workflow SDK code (n8n/sdk/*.ts).

    python3 n8n/build/build.py

The SDK files are what gets validated and created in n8n through its MCP server (create_workflow_from_code).
Credentials are referenced by name only (newCredential); nothing secret is written. Prompts live in prompts.py.
"""

import json
from pathlib import Path

from prompts import (BRIEF_PROMPT, BRIEF_SCHEMA, REHEARSAL_PROMPT, REHEARSAL_SCHEMA, RESEARCH_PROMPT, TRIAGE_PROMPT, TRIAGE_SCHEMA, TURN_PROMPT,
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
    'Seated ' + attending + ' from the invite and ' + practising + ' practice role' + (practising === 1 ? '' : 's'), 'Seating the practice panel'),
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
// The brief keeps only real attendees; the practice panel (attendees plus hypothetical roles) is for rehearsal in the web app.
// Everyone gets a chair, a colour and a face, as the contract's /panel response (docs/CONTRACT.md).
const prev = $('Read the research').first().json;
const b = JSON.parse(replyText($json) || '{}');
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
  questions: b.questions || [], risks: b.risks || [], sources: prev.sources.slice(0, 12),
};
// n8n's suggested pitch length (contract 0.18: proposal.pitch), kept to whole minutes from 1 to 60
const pitch = b.pitch && b.pitch.minutes ? { minutes: Math.max(1, Math.min(60, Math.round(b.pitch.minutes))), why: b.pitch.why || '' } : undefined;
const proposal = { draft_id: prev.meeting.meeting_id, members, suggestions: b.suggestions || [], ...(pitch ? { pitch } : {}) };
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
    c += code_node("shapeList", "Upcoming meetings", """
// Upcoming (and today's) meetings, soonest first (docs/CONTRACT.md, GET /meetings)
const since = Date.now() - 12 * 3600 * 1000;
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const meetings = $input.all().map(i => i.json).filter(r => r.meeting_id && (!r.start || Date.parse(r.start) >= since))
  .sort((a, b) => Date.parse(a.start || 0) - Date.parse(b.start || 0))
  .map(r => ({ id: String(r.meeting_id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees: parse(r.attendees) || [],
               progress: parse(r.progress) || [], started_at: r.started_at || null,
               run: r.execution_id ? { workflow_id: r.workflow_id, execution_id: r.execution_id } : null }));
return [{ json: { meetings } }];""", [{"meetings": []}])
    c += code_node("shapeOne", "The meeting and its brief", """
// One meeting by id, with its brief and proposed panel (docs/CONTRACT.md, GET /meeting)
const id = $('GET /meeting').first().json.query.id;
const r = $input.all().map(i => i.json).find(r => String(r.meeting_id) === String(id));
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
if (!r) return [{ json: { error: 'not found' } }];
return [{ json: {
  meeting: { id: String(r.meeting_id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees: parse(r.attendees) || [],
             progress: parse(r.progress) || [], started_at: r.started_at || null,
             run: r.execution_id ? { workflow_id: r.workflow_id, execution_id: r.execution_id } : null },
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


# ---------------------------------------------------------------- DryRun rehearsal prep (/prep)

REHEARSAL_REQUEST = {"body": {"draft_id": "evt123", "presenter": {"name": "Aryan", "email": "you@example.com"}, "pitch_minutes": 5,
                              "deck": {"name": "RouteIQ.pdf", "slides": [{"index": 0, "text": "RouteIQ for Delhivery"}]},
                              "prospect": {"company": "Delhivery", "website": "", "context": "RouteIQ pitch"},
                              "panel": [{"id": "p1", "seat": 0, "color": 0, "role": "VP Operations", "role_short": "VP Ops", "display_name": "Priya Nair",
                                         "avatar": "business_female_01", "difficulty": 2, "source": "email"}]}}


def rehearsal():
    c = IMPORTS
    c += make_node("prepTrigger", "trigger", "n8n-nodes-base.webhook", 2.2, "Start a rehearsal (web app)", {
        "httpMethod": "POST", "path": "dryrun/prep", "responseMode": "responseNode", "options": {},
    }, [REHEARSAL_REQUEST])
    # The meeting's brief and research, saved by DryRun prep. A meeting missing from the table still gets a rehearsal.
    c += make_node("findMeeting", "node", "n8n-nodes-base.dataTable", 1.1, "Find the meeting", {
        "resource": "row", "operation": "get", "dataTableId": MEETINGS_TABLE, "matchType": "anyCondition",
        "filters": {"conditions": [{"keyName": "meeting_id", "condition": "eq", "keyValue": Expr("{{ $json.body.draft_id }}")}]},
    }, [{"meeting_id": "evt123", "title": "RouteIQ pitch", "kind": "sales_pitch", "why": "", "brief": "{}"}], extra={"alwaysOutputData": True})
    c += code_node("gather", "Gather what n8n knows", """
// Everything the rehearsal is planned from: the meeting and its brief (from the DryRun meetings table), the confirmed panel,
// the deck's slide text and the pitch length (docs/CONTRACT.md, POST /prep)
const req = $('Start a rehearsal (web app)').first().json.body;
const row = $input.first().json || {};
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const brief = parse(row.brief) || {};
const minutes = Math.max(1, Math.min(60, Math.round(Number(req.pitch_minutes) || 5)));
const meeting = { title: row.title || (req.prospect && req.prospect.context) || 'Meeting', company: row.company || (req.prospect && req.prospect.company) || '',
                  kind: row.kind || 'other', start: row.start || '', notes: row.why || '' };
const panel = (req.panel || []).map(p => ({ id: p.id, name: p.display_name || '', role: p.role, difficulty: p.difficulty || 2,
                                            source: p.source || 'typical', will_push_on: p.will_push_on || '', why: p.why || '' }));
const slides = ((req.deck && req.deck.slides) || []).map(s => ({ index: s.index, text: String(s.text || '').slice(0, 1500) }));
return [{ json: { req, minutes, presenter: (req.presenter && req.presenter.name) || '', meeting, panel, slides,
                  brief: { summary: brief.summary || '', attendees: brief.attendees || [], questions: brief.questions || [], risks: brief.risks || [],
                           company: brief.company || {} } } }];""", [{"minutes": 5, "presenter": "Aryan", "meeting": {}, "panel": [], "slides": [], "brief": {}}])
    c += llm_nodes("plan", "Plan the rehearsal", json.dumps(REHEARSAL_PROMPT) +
                   ".replace('{presenter}', $json.presenter || 'the presenter').split('{minutes}').join(String($json.minutes))"
                   ".replace('{meeting}', JSON.stringify($json.meeting, null, 1)).replace('{brief}', JSON.stringify($json.brief, null, 1))"
                   ".replace('{panel}', JSON.stringify($json.panel, null, 1)).replace('{deck}', JSON.stringify($json.slides, null, 1))",
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
           objections: (x.objections || []).map(o => ({ slide_index: o.slide_index, text: o.text, source: o.source === 'deck' ? 'deck' : 'research' })),
           difficulty: m.difficulty || 2, manner: x.manner === 'interrupts' ? 'interrupts' : 'waits', chair: m.id === chair,
           voice: voiceFor(m.avatar) };
});
// Slide times scaled so they add up to the pitch length
const pitchSeconds = g.minutes * 60;
const raw = g.slides.map(s => (p.slides || []).find(x => x.index === s.index) || { index: s.index, title: 'Slide ' + (s.index + 1), key_points: [], target_seconds: 60, rescue: {} });
const total = raw.reduce((a, s) => a + Math.max(5, s.target_seconds || 0), 0) || 1;
const slides = raw.map(s => ({ index: s.index, title: s.title || '', image_url: '', key_points: s.key_points || [],
  target_seconds: Math.max(5, Math.round(Math.max(5, s.target_seconds || 0) * pitchSeconds / total)),
  rescue: { calm: (s.rescue && s.rescue.calm) || 'Take a breath.', keyword: (s.rescue && s.rescue.keyword) || '', bridge: (s.rescue && s.rescue.bridge) || '' },
  notes: null }));
const r = (p.rescue_after_s || []).map(Number).filter(n => n > 0).slice(0, 3);
const rescue = r.length === 3 && r[0] < r[1] && r[1] < r[2] ? r : [3, 6, 10];
const plan = { during_pitch: Math.max(0, Math.round((p.plan && p.plan.during_pitch) || 0)), after_pitch: Math.max(0, Math.round((p.plan && p.plan.after_pitch) || 0)),
               why: (p.plan && p.plan.why) || '' };
const lines = (p.lines || []).filter(l => ids.includes(l.persona_id) && l.text).map((l, i) => ({ id: 'l' + (i + 1), persona_id: l.persona_id, kind: l.kind, text: l.text }));
return [{ json: { session_id: 's' + Date.now().toString(36), prospect: { company: g.meeting.company }, pitch_seconds: pitchSeconds, plan,
                  rescue_after_s: rescue, slides, personas, lines, drill: null } }];""", [{"session_id": "s1", "personas": [], "slides": [], "lines": []}])
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
    c += make_node("reply", "node", "n8n-nodes-base.respondToWebhook", 1.5, "Send the bundle", {"respondWith": "firstIncomingItem", "options": {}}, [{}])
    c += ("const about = sticky('## DryRun rehearsal prep\\nBriefs the practice panel for one rehearsal (POST /webhook/dryrun/prep, docs/CONTRACT.md): "
          "plans each slide and the rescue cues, what each person will push on, who interrupts and who chairs, how many questions to ask "
          "and when, and the lines voiced ahead of time.', [prepTrigger], { color: 4 });\n\n")
    c += """export default workflow('dryrun-rehearsal-prep', 'DryRun rehearsal prep')
  .add(about)
  .add(prepTrigger)
  .to(findMeeting)
  .to(gather)
  .to(plan)
  .to(bundle)
  .to(eachLine)
  .to(voice)
  .to(addVoices)
  .to(reply)
  .add(plan.onError(planGroq))
  .add(planGroq)
  .to(bundle)
  .group('Plan', [gather, plan, planGroq, bundle], { description: 'Plans the slides, the panel, the questions and the lines for this meeting and pitch length' })
  .group('Voices', [eachLine, voice, addVoices], { description: 'Voices the lines ahead of time with Sarvam, in each person\\'s voice' });
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


TURN_REQUEST = {"body": {"session_id": "s1", "mode": "segment", "slide_index": 1, "t": 42.0, "audio_base64": "UklGRg==", "audio_format": "m4a",
                         "context": {"bundle": {"personas": [], "slides": [], "lines": [], "plan": {"during_pitch": 1, "after_pitch": 1, "why": ""}, "pitch_seconds": 120,
                                                "prospect": {"company": "Delhivery"}},
                                     "elapsed_s": 42.0, "turns": [], "pending": []}}}


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
const json = { session_id: b.session_id, mode: b.mode, slide_index: b.slide_index, t: b.t, asked_by: b.asked_by || '', bundle, elapsed: Math.round(ctx.elapsed_s || b.t || 0),
               turns, pending: ctx.pending || [], asked_during: askedDuring, asked_after: askedAfter };
// The laptop sends the speech as AAC (m4a), or WAV if it couldn't compress it
const audio = b.audio_base64 || b.audio_wav_base64 || '';
const m4a = b.audio_format === 'm4a';
return [{ json: { ...json, has_audio: !!audio }, binary: audio ? { audio: { data: audio, mimeType: m4a ? 'audio/mp4' : 'audio/wav', fileName: m4a ? 'turn.m4a' : 'turn.wav' } } : {} }];""",
                   [{"mode": "segment", "bundle": {}, "turns": [], "pending": [], "asked_during": 0, "asked_after": 0, "has_audio": True}])
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
  asked_during: String(r.asked_during), asked_after: String(r.asked_after), elapsed: String(r.elapsed), pitch: String(b.pitch_seconds || 0),
  personas: JSON.stringify(personas), lines: JSON.stringify((b.lines || []).map(l => ({ line_id: l.id, persona_id: l.persona_id, kind: l.kind, text: l.text }))),
  slide: slide ? JSON.stringify({ number: slide.index + 1, title: slide.title, key_points: slide.key_points }) : 'No slides.',
  turns: history, pending: JSON.stringify(r.pending), mode: r.mode, asked_by: r.asked_by ? ' (answering ' + name(r.asked_by) + ', id ' + r.asked_by + ')' : '', transcript,
};
// Each {name} in the prompt filled in by splitting, so nothing in the text is read as a replacement pattern
const prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);
return [{ json: { ...r, transcript, prompt } }];""",
                   [{"mode": "segment", "transcript": ""}])
    c += groq_first_nodes("decide", "Decide who reacts", prompt, [{"choices": [{"message": {"content": "{}"}}]}], TURN_SCHEMA, "$('What the room knows').first().json")
    c += code_node("check", "Check the reactions", REPLY_JS + """
// What n8n decided, held to the contract: real people and lines, only a welcome at the opening, the session ends only on a closing.
// New lines go to the voice; lines voiced ahead of time play as they are.
const r = $('What the room knows').first().json;
const d = JSON.parse(replyText($json) || '{}');
const people = Object.fromEntries((r.bundle.personas || []).map(p => [p.id, p]));
const lines = Object.fromEntries((r.bundle.lines || []).map(l => [l.id, l]));
const KINDS = ['welcome', 'question', 'follow_up', 'acknowledge', 'open_floor', 'closing'];
let reactions = (d.reactions || []).filter(x => people[x.persona_id] && KINDS.includes(x.kind) && (x.text || lines[x.line_id]));
if (r.mode === 'opening') reactions = reactions.filter(x => x.kind === 'welcome').slice(0, 1);
reactions = reactions.slice(0, 3).map(x => {
  const line = lines[x.line_id] && lines[x.line_id].persona_id === x.persona_id ? lines[x.line_id] : null;
  const out = { persona_id: x.persona_id, kind: x.kind, text: line ? line.text : String(x.text), raise_hand: r.mode === 'segment' && x.kind === 'question', reason: x.reason || '' };
  return line ? { ...out, line_id: line.id } : out;
});
const verdict = r.mode === 'answer' && ['resolved', 'partial', 'dodged'].includes(d.answer_verdict) ? d.answer_verdict : null;
// A bundle briefed before voices existed has none: fall back to a voice that fits the avatar
const voiceOf = p => p.voice || (String(p.avatar).includes('female') ? 'priya' : 'rahul');
const toVoice = reactions.map((x, i) => ({ i, text: x.text, speaker: voiceOf(people[x.persona_id]), voiced: !!x.line_id })).filter(x => !x.voiced);
return [{ json: { reply: { transcript: r.transcript, note: d.note || '', reactions, answer_verdict: verdict, end_session: reactions.some(x => x.kind === 'closing') },
                  to_voice: toVoice } }];""", [{"reply": {"reactions": []}, "to_voice": []}])
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


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for fname, code in [("prep.ts", prep()), ("meetings-api.ts", api()), ("rehearsal-prep.ts", rehearsal()), ("turn.ts", turn())]:
        (OUT / fname).write_text(code)
        print("wrote", OUT / fname, len(code), "chars")
