import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, fromAi, expr } from '@n8n/workflow-sdk';

const twinTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "Build a twin (laptop)",
    "parameters": {
      "httpMethod": "POST",
      "path": "dryrun/twin",
      "responseMode": "streaming",
      "options": {}
    },
    "output": [
  {
    "body": {
      "email": "rajiv.menon@kaverifreight.in",
      "name": "Rajiv Menon",
      "company": "Kaveri Freight",
      "domain": "kaverifreight.in"
    }
  }
]
  }
});

const twinPeople = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Read the people table",
    "parameters": {
      "resource": "row",
      "operation": "get",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "We8Agobm9SMWGc7E",
        "cachedResultName": "DryRun people"
      },
      "returnAll": true
    },
    "alwaysOutputData": true,
    "executeOnce": true,
    "output": [
  {
    "email": "rajiv.menon@kaverifreight.in",
    "facts": "[]",
    "sources": "[]"
  }
]
  }
});

const twinWho = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Who they are",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };\nconst lower = e => String(e || '').trim().toLowerCase();\nconst KINDS = ['raised', 'promised', 'decision', 'preference', 'role', 'context'];\nconst rowToTwin = r => ({ email: lower(r.email), aliases: parseJ(r.aliases, []), name: r.name || '', company: r.company || '', role: parseJ(r.role, null),\n  sources: parseJ(r.sources, []), facts: parseJ(r.facts, []), readings: parseJ(r.readings, []), meetings: parseJ(r.meetings, []),\n  predictions: parseJ(r.predictions, []), build_log: parseJ(r.build_log, []), updated: r.updated || '', sample: false });\nconst twinToRow = t => ({ email: t.email, aliases: JSON.stringify(t.aliases || []), name: t.name || '', company: t.company || '', role: t.role ? JSON.stringify(t.role) : '',\n  sources: JSON.stringify(t.sources || []), facts: JSON.stringify(t.facts || []), readings: JSON.stringify(t.readings || []), meetings: JSON.stringify(t.meetings || []),\n  predictions: JSON.stringify(t.predictions || []), build_log: JSON.stringify(t.build_log || []), updated: t.updated || '' });\n// Any address of theirs finds the row: the key, or one the presenter linked\nconst findRow = (rows, email) => rows.find(r => r.email && (lower(r.email) === email || parseJ(r.aliases, []).map(lower).includes(email)));\nconst maxId = (list, prefix) => list.reduce((a, x) => Math.max(a, Number(String(x.id || '').replace(prefix, '')) || 0), 0);\n// Counts for the brief and the people list, honest: connected facts, real meetings already held, suggestions waiting\nconst twinSummary = t => { const today = new Date().toISOString().slice(0, 10); const past = (t.meetings || []).map(m => m.date).filter(d => d && d <= today).sort();\n  return { facts: (t.facts || []).filter(f => f.status === 'connected').length, meetings: past.length, to_check: (t.sources || []).filter(s => s.status === 'suggested').length,\n           last_met: past.length ? past[past.length - 1] : null }; };\n\n// The person's row, or a new twin. Every address they use is searched; the row stays keyed by the first one.\nconst req = $('Build a twin (laptop)').first().json.body || {};\nconst email = lower(req.email);\nif (!email.includes('@')) throw new Error('No email address to build a twin of');\nconst row = findRow($input.all().map(i => i.json), email);\nconst twin = row ? rowToTwin(row) : { email, aliases: [], name: '', company: '', role: null, sources: [], facts: [], readings: [], meetings: [], predictions: [], build_log: [], updated: '', sample: false };\ntwin.name = twin.name || String(req.name || '').trim();\ntwin.company = twin.company || String(req.company || '').trim();\nconst addresses = [twin.email].concat(twin.aliases.map(lower)).filter(Boolean);\nconst PUBLIC = [\"gmail.com\", \"googlemail.com\", \"yahoo.com\", \"yahoo.co.in\", \"outlook.com\", \"hotmail.com\", \"live.com\", \"icloud.com\", \"me.com\", \"proton.me\", \"protonmail.com\", \"rediffmail.com\"];\nconst own = twin.email.split('@')[1] || '';\nconst domain = lower(req.domain) || (PUBLIC.includes(own) ? '' : own);\n// What's there already is drawn first, so a replay starts from nothing\nconst kept = twin.sources.filter(s => s.status !== 'rejected');\nconst facts = twin.facts.filter(f => f.status !== 'rejected');\nconst who = twin.name || twin.email;\nconst text = row ? 'Opened ' + who + \"'s twin: \" + facts.length + ' fact' + (facts.length === 1 ? '' : 's') + ' from ' + kept.length + ' source' + (kept.length === 1 ? '' : 's') + ' so far'\n                 : 'Started a twin of ' + twin.email + (twin.name ? ' (' + twin.name + ')' : '');\nreturn [{ json: { twin, addresses, domain, start: Date.now(),\n                  say: { step: 'load', text, at: Date.now(), adds: { sources: kept, facts, readings: twin.readings, meetings: twin.meetings } } } }];"
    },
    "output": [
  {
    "twin": {},
    "addresses": [
      "rajiv.menon@kaverifreight.in"
    ],
    "domain": "kaverifreight.in",
    "start": 0,
    "say": {}
  }
]
  }
});

const saidWho = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Report: opened",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify({ step: { step: $json.say.step, text: $json.say.text, adds: $json.say.adds }, execution_id: $execution.id, workflow_id: $workflow.id }) }}"),
      "options": {}
    },
    "onError": "continueRegularOutput",
    "output": [
  {}
]
  }
});

const twinEmails = node({
  type: "n8n-nodes-base.gmail",
  version: 2.2,
  config: {
    "name": "Your emails with them",
    "parameters": {
      "resource": "message",
      "operation": "getAll",
      "returnAll": false,
      "limit": 20,
      "simple": false,
      "filters": {
        "readStatus": "both",
        "q": expr("{{ '(' + $('Who they are').first().json.addresses.map(a => 'from:' + a + ' OR to:' + a).join(' OR ') + ')' }}")
      },
      "options": {}
    },
    "alwaysOutputData": true,
    "executeOnce": true,
    "onError": "continueRegularOutput",
    "credentials": { "gmailOAuth2": newCredential("Gmail") },
    "output": [
  {
    "id": "m1",
    "threadId": "t1",
    "subject": "Pilot proposal",
    "date": "2026-10-03T10:00:00.000Z",
    "from": {
      "text": "Rajiv Menon <rajiv.menon@kaverifreight.in>"
    },
    "text": "Could you send a pilot proposal?"
  }
]
  }
});

const twinReadEmails = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Read the emails",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };\nconst lower = e => String(e || '').trim().toLowerCase();\nconst KINDS = ['raised', 'promised', 'decision', 'preference', 'role', 'context'];\nconst rowToTwin = r => ({ email: lower(r.email), aliases: parseJ(r.aliases, []), name: r.name || '', company: r.company || '', role: parseJ(r.role, null),\n  sources: parseJ(r.sources, []), facts: parseJ(r.facts, []), readings: parseJ(r.readings, []), meetings: parseJ(r.meetings, []),\n  predictions: parseJ(r.predictions, []), build_log: parseJ(r.build_log, []), updated: r.updated || '', sample: false });\nconst twinToRow = t => ({ email: t.email, aliases: JSON.stringify(t.aliases || []), name: t.name || '', company: t.company || '', role: t.role ? JSON.stringify(t.role) : '',\n  sources: JSON.stringify(t.sources || []), facts: JSON.stringify(t.facts || []), readings: JSON.stringify(t.readings || []), meetings: JSON.stringify(t.meetings || []),\n  predictions: JSON.stringify(t.predictions || []), build_log: JSON.stringify(t.build_log || []), updated: t.updated || '' });\n// Any address of theirs finds the row: the key, or one the presenter linked\nconst findRow = (rows, email) => rows.find(r => r.email && (lower(r.email) === email || parseJ(r.aliases, []).map(lower).includes(email)));\nconst maxId = (list, prefix) => list.reduce((a, x) => Math.max(a, Number(String(x.id || '').replace(prefix, '')) || 0), 0);\n// Counts for the brief and the people list, honest: connected facts, real meetings already held, suggestions waiting\nconst twinSummary = t => { const today = new Date().toISOString().slice(0, 10); const past = (t.meetings || []).map(m => m.date).filter(d => d && d <= today).sort();\n  return { facts: (t.facts || []).filter(f => f.status === 'connected').length, meetings: past.length, to_check: (t.sources || []).filter(s => s.status === 'suggested').length,\n           last_met: past.length ? past[past.length - 1] : null }; };\n\nconst addrText = x => (x && typeof x === 'object' ? (x.text || (x.value || []).map(v => v.address).join(', ')) : String(x || ''));\nconst cleanMail = t => { const out = []; for (const l of String(t || '').split('\\n')) { const s = l.trim();\n  if ((s.startsWith('On ') && s.endsWith('wrote:')) || s.startsWith('-----Original') || s.startsWith('From: ')) break; if (!s.startsWith('>')) out.push(l); }\n  return out.join('\\n').split('\\n\\n\\n').join('\\n\\n').trim().slice(0, 1800); };\nconst mailDate = m => { const d = m.date ? new Date(m.date) : new Date(Number(m.internalDate) || Date.now()); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };\nconst gmailUrl = id => 'https://mail.google.com/mail/u/0/#all/' + id;\n\n// Each email is a source card, connected (same address). Its text goes to the model; only the quotes are kept.\nconst g = $('Who they are').first().json;\nconst msgs = $input.all().map(i => i.json).filter(m => m.id);\nconst sources = g.twin.sources.slice();\nconst rejected = new Set(sources.filter(s => s.status === 'rejected').map(s => s.key));\nlet n = maxId(sources, 's');\nconst texts = {};\nconst found = [];\nfor (const m of msgs) {\n  const key = 'gmail:' + m.id;\n  if (rejected.has(key)) continue;\n  const from = addrText(m.from || m.From);\n  const theirs = g.addresses.some(a => from.toLowerCase().includes(a));\n  let src = sources.find(s => s.key === key);\n  if (!src) {\n    src = { id: 's' + (++n), type: 'email', title: m.subject || m.Subject || '(no subject)', date: mailDate(m), url: gmailUrl(m.id), from: theirs ? from : 'you',\n            status: 'connected', why: theirs ? 'From their address' : 'You wrote to their address', key };\n    sources.push(src);\n    found.push(src);\n  }\n  texts[src.id] = { kind: theirs ? 'email from them' : 'email from the presenter to them', date: src.date, subject: src.title, text: cleanMail(m.text || m.snippet || '') };\n}\n// The presenter's own notes are sources too (pasted profiles, notes from meetings DryRun didn't see)\nsources.filter(s => s.type === 'manual' && s.status === 'connected' && s.text).forEach(s => { texts[s.id] = { kind: 'note the presenter wrote', date: s.date, text: s.text.slice(0, 4000) }; });\nconst all = g.addresses.join(' or ');\nconst text = msgs.length ? 'Found ' + msgs.length + ' email' + (msgs.length === 1 ? '' : 's') + ' with ' + all + (found.length < msgs.length ? ' (' + found.length + ' new)' : '')\n                         : 'No emails with ' + all + ' in your inbox';\nreturn [{ json: { ...g, sources, texts, emails: msgs.length, say: { step: 'emails', text, at: Date.now(), adds: { sources: found, facts: [], readings: [] } } } }];"
    },
    "output": [
  {
    "twin": {},
    "addresses": [],
    "sources": [],
    "texts": {},
    "say": {}
  }
]
  }
});

const saidEmails = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Report: emails",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify({ step: { step: $json.say.step, text: $json.say.text, adds: $json.say.adds } }) }}"),
      "options": {}
    },
    "onError": "continueRegularOutput",
    "output": [
  {}
]
  }
});

const twinMeetingRows = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Read the meetings",
    "parameters": {
      "resource": "row",
      "operation": "get",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "wURCb4PjdZLpttns",
        "cachedResultName": "DryRun meetings"
      },
      "returnAll": true
    },
    "alwaysOutputData": true,
    "executeOnce": true,
    "output": [
  {
    "meeting_id": "evt123",
    "title": "RouteIQ pitch",
    "start": "2026-10-16T15:00:00+05:30",
    "company": "Kaveri Freight",
    "attendees": "[]"
  }
]
  }
});

const twinMeetings = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Find their meetings",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };\nconst lower = e => String(e || '').trim().toLowerCase();\nconst KINDS = ['raised', 'promised', 'decision', 'preference', 'role', 'context'];\nconst rowToTwin = r => ({ email: lower(r.email), aliases: parseJ(r.aliases, []), name: r.name || '', company: r.company || '', role: parseJ(r.role, null),\n  sources: parseJ(r.sources, []), facts: parseJ(r.facts, []), readings: parseJ(r.readings, []), meetings: parseJ(r.meetings, []),\n  predictions: parseJ(r.predictions, []), build_log: parseJ(r.build_log, []), updated: r.updated || '', sample: false });\nconst twinToRow = t => ({ email: t.email, aliases: JSON.stringify(t.aliases || []), name: t.name || '', company: t.company || '', role: t.role ? JSON.stringify(t.role) : '',\n  sources: JSON.stringify(t.sources || []), facts: JSON.stringify(t.facts || []), readings: JSON.stringify(t.readings || []), meetings: JSON.stringify(t.meetings || []),\n  predictions: JSON.stringify(t.predictions || []), build_log: JSON.stringify(t.build_log || []), updated: t.updated || '' });\n// Any address of theirs finds the row: the key, or one the presenter linked\nconst findRow = (rows, email) => rows.find(r => r.email && (lower(r.email) === email || parseJ(r.aliases, []).map(lower).includes(email)));\nconst maxId = (list, prefix) => list.reduce((a, x) => Math.max(a, Number(String(x.id || '').replace(prefix, '')) || 0), 0);\n// Counts for the brief and the people list, honest: connected facts, real meetings already held, suggestions waiting\nconst twinSummary = t => { const today = new Date().toISOString().slice(0, 10); const past = (t.meetings || []).map(m => m.date).filter(d => d && d <= today).sort();\n  return { facts: (t.facts || []).filter(f => f.status === 'connected').length, meetings: past.length, to_check: (t.sources || []).filter(s => s.status === 'suggested').length,\n           last_met: past.length ? past[past.length - 1] : null }; };\n\n// The real meetings they were invited to (by address). A meeting is a date on the twin's timeline, not a source of facts: what was said\n// in it only reaches the twin through the presenter's notes afterwards. Nothing from a rehearsal of it is read.\nconst g = $('Read the emails').first().json;\nconst rows = $input.all().map(i => i.json).filter(r => r.meeting_id);\nconst invited = r => parseJ(r.attendees, []).find(a => g.addresses.includes(lower(a.email)));\nconst theirs = rows.filter(r => invited(r) && r.status !== 'skipped');\nconst meetings = theirs.map(r => ({ id: String(r.meeting_id), title: r.title || '', date: String(r.start || '').slice(0, 10) })).sort((a, b) => (a.date < b.date ? -1 : 1));\nconst known = new Set(g.twin.meetings.map(m => m.id));\nconst name = g.twin.name || ((theirs.map(invited).find(a => a && a.name && a.name.includes(' ')) || {}).name) || '';\nconst company = g.twin.company || ((theirs.find(r => r.company && r.company !== r.title) || {}).company) || '';\nconst text = meetings.length ? 'Invited to ' + meetings.length + ' of your meetings: ' + meetings.slice(-2).map(m => m.title + ' (' + m.date + ')').join(', ')\n                             : 'Not in any meeting DryRun has seen yet';\nreturn [{ json: { ...g, name, company, meetings, say: { step: 'meetings', text, at: Date.now(), adds: { sources: [], facts: [], readings: [], meetings: meetings.filter(m => !known.has(m.id)) } } } }];"
    },
    "output": [
  {
    "twin": {},
    "name": "Rajiv Menon",
    "company": "Kaveri Freight",
    "meetings": [],
    "addresses": [],
    "domain": "",
    "say": {}
  }
]
  }
});

const saidMeetings = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Report: meetings",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify({ step: { step: $json.say.step, text: $json.say.text, adds: $json.say.adds } }) }}"),
      "options": {}
    },
    "onError": "continueRegularOutput",
    "output": [
  {}
]
  }
});

const twinMentionMail = node({
  type: "n8n-nodes-base.gmail",
  version: 2.2,
  config: {
    "name": "Their name in other emails",
    "parameters": {
      "resource": "message",
      "operation": "getAll",
      "returnAll": false,
      "limit": 8,
      "simple": false,
      "filters": {
        "readStatus": "both",
        "q": expr("{{ (() => { const j = $('Find their meetings').first().json; const n = String(j.name || '').split('\"').join('').trim(); if (n.split(' ').length < 2) return 'from:nobody@invalid.invalid'; return '\"' + n + '\" ' + j.addresses.map(a => '-from:' + a + ' -to:' + a).join(' ') + ' newer_than:365d'; })() }}")
      },
      "options": {}
    },
    "alwaysOutputData": true,
    "executeOnce": true,
    "onError": "continueRegularOutput",
    "credentials": { "gmailOAuth2": newCredential("Gmail") },
    "output": [
  {
    "id": "m9",
    "subject": "Kaveri intro",
    "from": {
      "text": "Priya Nair <priya.nair@kaverifreight.in>"
    },
    "text": "Loop in Rajiv Menon from finance"
  }
]
  }
});

const twinNews = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "News that names them",
    "parameters": {
      "method": "GET",
      "url": expr("{{ (() => { const j = $('Find their meetings').first().json; return String(j.name || '').includes(' ') ? 'https://news.google.com/rss/search?q=' + encodeURIComponent('\"' + j.name + '\"' + (j.company ? ' \"' + j.company + '\"' : '')) + '&hl=en-IN&gl=IN&ceid=IN:en' : 'https://invalid.invalid'; })() }}"),
      "options": {
        "timeout": 15000,
        "response": {
          "response": {
            "responseFormat": "text"
          }
        }
      }
    },
    "onError": "continueRegularOutput",
    "executeOnce": true,
    "output": [
  {
    "data": "<rss></rss>"
  }
]
  }
});

const twinPlaces = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Where to look on their site",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Their company's own pages that usually list people. Public professional pages only; LinkedIn is never read (against its terms).\nconst j = $('Find their meetings').first().json;\nif (!j.domain || !String(j.name || '').includes(' ')) return [{ json: { url: 'https://invalid.invalid' } }];\nreturn ['', '/team', '/about', '/about-us', '/leadership'].map(p => ({ json: { url: 'https://' + j.domain + p } }));"
    },
    "output": [
  {
    "url": "https://kaverifreight.in/team"
  }
]
  }
});

const twinPages = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Read their site",
    "parameters": {
      "method": "GET",
      "url": expr("{{ $json.url }}"),
      "options": {
        "timeout": 8000,
        "redirect": {
          "redirect": {}
        },
        "response": {
          "response": {
            "responseFormat": "text"
          }
        }
      }
    },
    "onError": "continueRegularOutput",
    "alwaysOutputData": true,
    "output": [
  {
    "data": "<html></html>"
  }
]
  }
});

const twinMentions = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Gather the mentions",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };\nconst lower = e => String(e || '').trim().toLowerCase();\nconst KINDS = ['raised', 'promised', 'decision', 'preference', 'role', 'context'];\nconst rowToTwin = r => ({ email: lower(r.email), aliases: parseJ(r.aliases, []), name: r.name || '', company: r.company || '', role: parseJ(r.role, null),\n  sources: parseJ(r.sources, []), facts: parseJ(r.facts, []), readings: parseJ(r.readings, []), meetings: parseJ(r.meetings, []),\n  predictions: parseJ(r.predictions, []), build_log: parseJ(r.build_log, []), updated: r.updated || '', sample: false });\nconst twinToRow = t => ({ email: t.email, aliases: JSON.stringify(t.aliases || []), name: t.name || '', company: t.company || '', role: t.role ? JSON.stringify(t.role) : '',\n  sources: JSON.stringify(t.sources || []), facts: JSON.stringify(t.facts || []), readings: JSON.stringify(t.readings || []), meetings: JSON.stringify(t.meetings || []),\n  predictions: JSON.stringify(t.predictions || []), build_log: JSON.stringify(t.build_log || []), updated: t.updated || '' });\n// Any address of theirs finds the row: the key, or one the presenter linked\nconst findRow = (rows, email) => rows.find(r => r.email && (lower(r.email) === email || parseJ(r.aliases, []).map(lower).includes(email)));\nconst maxId = (list, prefix) => list.reduce((a, x) => Math.max(a, Number(String(x.id || '').replace(prefix, '')) || 0), 0);\n// Counts for the brief and the people list, honest: connected facts, real meetings already held, suggestions waiting\nconst twinSummary = t => { const today = new Date().toISOString().slice(0, 10); const past = (t.meetings || []).map(m => m.date).filter(d => d && d <= today).sort();\n  return { facts: (t.facts || []).filter(f => f.status === 'connected').length, meetings: past.length, to_check: (t.sources || []).filter(s => s.status === 'suggested').length,\n           last_met: past.length ? past[past.length - 1] : null }; };\n\nconst addrText = x => (x && typeof x === 'object' ? (x.text || (x.value || []).map(v => v.address).join(', ')) : String(x || ''));\nconst cleanMail = t => { const out = []; for (const l of String(t || '').split('\\n')) { const s = l.trim();\n  if ((s.startsWith('On ') && s.endsWith('wrote:')) || s.startsWith('-----Original') || s.startsWith('From: ')) break; if (!s.startsWith('>')) out.push(l); }\n  return out.join('\\n').split('\\n\\n\\n').join('\\n\\n').trim().slice(0, 1800); };\nconst mailDate = m => { const d = m.date ? new Date(m.date) : new Date(Number(m.internalDate) || Date.now()); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };\nconst gmailUrl = id => 'https://mail.google.com/mail/u/0/#all/' + id;\n\n// Everywhere else their full name appears: emails from other people, news headlines, their company's pages. Each is a suggestion\n// with why it might be them; a source the presenter rejected before is never suggested again.\nconst g = $('Find their meetings').first().json;\nconst name = String(g.name || '').trim();\nconst full = name.toLowerCase();\nconst sources = g.sources.slice();\nconst texts = { ...g.texts };\nconst rejected = new Set(sources.filter(s => s.status === 'rejected').map(s => s.key));\nlet n = maxId(sources, 's');\nconst found = [];\nconst today = new Date().toISOString().slice(0, 10);\nconst add = (src, text) => {\n  if (rejected.has(src.key)) return;\n  let s = sources.find(x => x.key === src.key);\n  if (!s) { s = { id: 's' + (++n), status: 'suggested', ...src }; sources.push(s); found.push(s); }\n  texts[s.id] = text;\n};\nif (full.includes(' ')) {\n  for (const m of $('Their name in other emails').all().map(i => i.json).filter(m => m.id)) {\n    const body = cleanMail(m.text || m.snippet || '');\n    const at = body.toLowerCase().indexOf(full);\n    if (at < 0) continue;\n    const from = addrText(m.from || m.From);\n    add({ type: 'email', title: m.subject || m.Subject || '(no subject)', date: mailDate(m), url: gmailUrl(m.id), from,\n          why: (from.split('<')[0].trim() || 'Someone') + ' mentions a ' + name, key: 'gmail:' + m.id },\n        { kind: 'email from someone else that mentions ' + name, date: mailDate(m), subject: m.subject || '', text: body.slice(Math.max(0, at - 600), at + 900) });\n  }\n  const rss = String($('News that names them').first().json.data || '');\n  const unescape = t => t.split('<![CDATA[').join('').split(']]>').join('').split('&amp;').join('&').split('&quot;').join('\"').split('&#39;').join(\"'\");\n  const tag = (xml, t) => { const a = xml.indexOf('<' + t); if (a < 0) return ''; const b = xml.indexOf('>', a); const e = xml.indexOf('</' + t + '>', b); return e < 0 ? '' : unescape(xml.slice(b + 1, e)).trim(); };\n  rss.split('<item>').slice(1, 16).forEach(it => {\n    const title = tag(it, 'title');\n    if (!title.toLowerCase().includes(full)) return;\n    const d = new Date(tag(it, 'pubDate'));\n    const date = isNaN(d) ? '' : d.toISOString().slice(0, 10);\n    const publisher = tag(it, 'source');\n    add({ type: 'news', title: (publisher ? publisher + ': ' : '') + title.replace(/ - [^-]+$/, ''), date, url: tag(it, 'link'), why: 'A news story names a ' + name, key: 'news:' + tag(it, 'link') },\n        { kind: 'news headline', date, text: title });\n  });\n  const places = $('Where to look on their site').all().map(i => i.json.url);\n  let pages = 0;\n  $input.all().forEach((page, i) => {\n    if (pages >= 2) return;\n    const html = String(page.json.data || '');\n    const text = html.replace(/<script[^]*?<\\/script>/gi, ' ').replace(/<style[^]*?<\\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ');\n    const at = text.toLowerCase().indexOf(full);\n    if (at < 0 || !places[i] || places[i].includes('invalid.invalid')) return;\n    pages++;\n    const host = places[i].replace('https://', '').replace(/\\/$/, '');\n    add({ type: 'web', title: host, date: today, url: places[i], why: host + ' lists a ' + name, key: 'web:' + places[i] },\n        { kind: 'their company web page', date: today, text: text.slice(Math.max(0, at - 250), at + 450).trim() });\n  });\n}\n// The model reads every live source: connected ones as they are, suggestions marked as such\nlet budget = 26000;\nconst list = sources.filter(s => s.status !== 'rejected' && texts[s.id]).map(s => {\n  const x = texts[s.id];\n  const line = '[' + s.id + '] ' + (s.status === 'suggested' ? 'SUGGESTION, ' : '') + x.kind + (x.date ? ', ' + x.date : '') + (x.subject ? ', subject \"' + x.subject + '\"' : '') + ':\\n' + x.text;\n  budget -= line.length;\n  return budget > 0 ? line : '';\n}).filter(Boolean);\nconst known = g.twin.facts.filter(f => f.status === 'connected').map(f => f.id + ' (' + f.kind + '): ' + f.text).join('\\n') || 'Nothing yet.';\nconst person = (name || g.twin.email) + ' <' + g.addresses.join(', ') + '>' + (g.company ? ', ' + g.company : '');\nconst PROMPT = \"You keep a factual file on one real person the presenter works with: {person}.\\nBelow are the only sources you may use, each with an id. Emails are from the presenter's own inbox; a source marked SUGGESTION was\\nfound by their name only and may be someone else (the presenter will check it). Nothing here comes from a rehearsal.\\n\\n{sources}\\n\\nAlready in the file (do not repeat these): {known}\\n\\nfacts: what the sources say about THIS person, each:\\n- kind: \\\"raised\\\" (something they asked for, objected to, worried about or raised), \\\"promised\\\" (something the presenter promised\\n  them, only from the presenter's own emails or notes), \\\"decision\\\" (something they decided or agreed to), \\\"preference\\\" (how they\\n  like to work or what they care about, as they put it), \\\"role\\\" (their job title or responsibility, as a source states it),\\n  \\\"context\\\" (other professional facts: their team, region, projects, who they report to);\\n- text: one short line in plain words, at most 12 words, e.g. \\\"Asked for a pilot proposal on one lane\\\";\\n- source_id: the id of the source it comes from;\\n- quote: copied word for word from that source, 5 to 30 words, that shows the fact. If you cannot quote it, leave the fact out.\\nProfessional only: nothing about their personal life, health, family, religion or politics. Do not guess; a fact must be stated.\\nreadings: at most 3 interpretations of how they behave in a meeting (e.g. \\\"Pushes on cost\\\", \\\"Wants numbers on one page\\\"), each with\\nevidence: the ids of at least two facts that support it, existing ones by their id (f1, f2...) or your new facts as n0, n1... in\\nthe order you list them. No reading without two pieces of evidence.\\nrole: their current job title if a non-suggestion source states it, with its source_id; otherwise empty strings.\\nAnswer in JSON.\";\nconst prompt = PROMPT.split('{person}').join(person).split('{sources}').join(list.join('\\n\\n') || 'None.').split('{known}').join(known);\nconst text = found.length ? found.length + ' possible mention' + (found.length === 1 ? '' : 's') + ' by name: ' + found.slice(0, 2).map(s => s.why).join('; ') + '. Same person?'\n           : full.includes(' ') ? 'No mentions of ' + name + ' elsewhere' : 'No full name to look for elsewhere';\nreturn [{ json: { ...g, sources, texts, prompt, readable: list.length, say: { step: 'mentions', text, at: Date.now(), adds: { sources: found, facts: [], readings: [] } } } }];"
    },
    "output": [
  {
    "twin": {},
    "sources": [],
    "texts": {},
    "prompt": "",
    "readable": 0,
    "say": {}
  }
]
  }
});

const saidMentions = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Report: mentions",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify({ step: { step: $json.say.step, text: $json.say.text, adds: $json.say.adds } }) }}"),
      "options": {}
    },
    "onError": "continueRegularOutput",
    "output": [
  {}
]
  }
});

const twinAnything = ifElse({
  type: "n8n-nodes-base.if",
  version: 2.3,
  config: {
    "name": "Anything to read?",
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "leftValue": expr("{{ $json.readable }}"),
            "rightValue": 0,
            "operator": {
              "type": "number",
              "operation": "gt"
            }
          }
        ],
        "combinator": "and"
      },
      "options": {}
    },
    "output": [
  {
    "readable": 1
  }
]
  }
});

const twinExtract = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Pull the facts",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"facts\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"kind\": {\"type\": \"string\", \"enum\": [\"raised\", \"promised\", \"decision\", \"preference\", \"role\", \"context\"]}, \"text\": {\"type\": \"string\"}, \"source_id\": {\"type\": \"string\"}, \"quote\": {\"type\": \"string\"} }, \"required\": [\"kind\", \"text\", \"source_id\", \"quote\"]} }, \"readings\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"text\": {\"type\": \"string\"}, \"evidence\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} } }, \"required\": [\"text\", \"evidence\"]} }, \"role\": {\"type\": \"object\", \"properties\": {\"text\": {\"type\": \"string\"}, \"source_id\": {\"type\": \"string\"} }, \"required\": [\"text\", \"source_id\"]} }, \"required\": [\"facts\", \"readings\", \"role\"]} } }) }}"),
      "options": {
        "timeout": 120000
      }
    },
    "onError": "continueErrorOutput",
    "retryOnFail": true,
    "maxTries": 2,
    "waitBetweenTries": 2000,
    "credentials": { "googlePalmApi": newCredential("Gemini") },
    "output": [
  {
    "candidates": [
      {
        "content": {
          "parts": [
            {
              "text": "{}"
            }
          ]
        }
      }
    ]
  }
]
  }
});

const twinExtractGroq = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Pull the facts (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $('Gather the mentions').first().json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: (j.prompt) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"facts\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"kind\": {\"type\": \"string\", \"enum\": [\"raised\", \"promised\", \"decision\", \"preference\", \"role\", \"context\"]}, \"text\": {\"type\": \"string\"}, \"source_id\": {\"type\": \"string\"}, \"quote\": {\"type\": \"string\"} }, \"required\": [\"kind\", \"text\", \"source_id\", \"quote\"]} }, \"readings\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"text\": {\"type\": \"string\"}, \"evidence\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} } }, \"required\": [\"text\", \"evidence\"]} }, \"role\": {\"type\": \"object\", \"properties\": {\"text\": {\"type\": \"string\"}, \"source_id\": {\"type\": \"string\"} }, \"required\": [\"text\", \"source_id\"]} }, \"required\": [\"facts\", \"readings\", \"role\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
      "options": {
        "timeout": 120000
      }
    },
    "retryOnFail": true,
    "maxTries": 3,
    "waitBetweenTries": 5000,
    "credentials": { "groqApi": newCredential("Groq") },
    "output": [
  {
    "choices": [
      {
        "message": {
          "content": "{}"
        }
      }
    ]
  }
]
  }
});

const saidTwinFallback = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Report: Groq instead",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify({ step: { step: 'fallback', text: 'Gemini did not answer, so Groq reads the sources instead', adds: { sources: [], facts: [], readings: [] } } }) }}"),
      "options": {}
    },
    "onError": "continueRegularOutput",
    "output": [
  {}
]
  }
});

const twinRules = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Hold to the rules",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };\nconst lower = e => String(e || '').trim().toLowerCase();\nconst KINDS = ['raised', 'promised', 'decision', 'preference', 'role', 'context'];\nconst rowToTwin = r => ({ email: lower(r.email), aliases: parseJ(r.aliases, []), name: r.name || '', company: r.company || '', role: parseJ(r.role, null),\n  sources: parseJ(r.sources, []), facts: parseJ(r.facts, []), readings: parseJ(r.readings, []), meetings: parseJ(r.meetings, []),\n  predictions: parseJ(r.predictions, []), build_log: parseJ(r.build_log, []), updated: r.updated || '', sample: false });\nconst twinToRow = t => ({ email: t.email, aliases: JSON.stringify(t.aliases || []), name: t.name || '', company: t.company || '', role: t.role ? JSON.stringify(t.role) : '',\n  sources: JSON.stringify(t.sources || []), facts: JSON.stringify(t.facts || []), readings: JSON.stringify(t.readings || []), meetings: JSON.stringify(t.meetings || []),\n  predictions: JSON.stringify(t.predictions || []), build_log: JSON.stringify(t.build_log || []), updated: t.updated || '' });\n// Any address of theirs finds the row: the key, or one the presenter linked\nconst findRow = (rows, email) => rows.find(r => r.email && (lower(r.email) === email || parseJ(r.aliases, []).map(lower).includes(email)));\nconst maxId = (list, prefix) => list.reduce((a, x) => Math.max(a, Number(String(x.id || '').replace(prefix, '')) || 0), 0);\n// Counts for the brief and the people list, honest: connected facts, real meetings already held, suggestions waiting\nconst twinSummary = t => { const today = new Date().toISOString().slice(0, 10); const past = (t.meetings || []).map(m => m.date).filter(d => d && d <= today).sort();\n  return { facts: (t.facts || []).filter(f => f.status === 'connected').length, meetings: past.length, to_check: (t.sources || []).filter(s => s.status === 'suggested').length,\n           last_met: past.length ? past[past.length - 1] : null }; };\n\nconst replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// The twin rules (docs/CONTRACT.md, Twins), after the model:\n// no source, no fact (the quote must be in that source's text); a fact takes its source's status (connected only on the same address);\n// a promise only from the presenter's own emails or notes; a reading needs two connected facts; the role only from a connected source.\n// Then merged: no duplicates, rejected stays rejected, the presenter's notes are never touched.\nconst g = $('Gather the mentions').first().json;\nlet d = {};\ntry { d = JSON.parse(replyText($json) || '{}'); } catch (e) { d = {}; }\nconst norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();\nconst byId = Object.fromEntries(g.sources.map(s => [s.id, s]));\nconst old = g.twin.facts;\nlet n = maxId(old, 'f');\nconst now = new Date().toISOString();\nconst sameText = new Map(old.map(f => [norm(f.text), f.id]));\nconst sameQuote = new Set(old.map(f => f.source_id + '|' + norm(f.quote)));\nconst fresh = [];\nconst ids = {};\n(d.facts || []).forEach((f, i) => {\n  const src = byId[f.source_id];\n  const from = g.texts[f.source_id];\n  if (!src || !from || src.status === 'rejected' || !KINDS.includes(f.kind) || !f.text) return;\n  const q = norm(f.quote);\n  if (q.split(' ').length < 4 || !norm(from.text + ' ' + (from.subject || '')).includes(q)) return;\n  if (f.kind === 'promised' && !(from.kind.startsWith('email from the presenter') || src.type === 'manual')) return;\n  const dup = sameText.get(norm(f.text));\n  if (dup || sameQuote.has(src.id + '|' + q)) { if (dup) ids['n' + i] = dup; return; }\n  const fact = { id: 'f' + (++n), kind: f.kind, text: String(f.text).slice(0, 120), source_id: src.id, quote: String(f.quote).slice(0, 300), status: src.status, added: now };\n  sameText.set(norm(fact.text), fact.id);\n  sameQuote.add(src.id + '|' + q);\n  fresh.push(fact);\n  ids['n' + i] = fact.id;\n});\nconst facts = old.concat(fresh);\nconst connected = new Set(facts.filter(f => f.status === 'connected').map(f => f.id));\nconst held = r => ({ text: String(r.text || '').slice(0, 80), evidence: Array.from(new Set((r.evidence || []).map(e => ids[e] || e))).filter(id => connected.has(id)) });\nlet readings = (d.readings || []).map(held).filter(r => r.text && r.evidence.length >= 2).slice(0, 3);\n// Readings are read afresh each build; with none new, last time's stay while their evidence holds\nif (!readings.length) readings = g.twin.readings.map(held).filter(r => r.text && r.evidence.length >= 2);\nreadings = readings.map((r, i) => ({ id: 'r' + (i + 1), ...r }));\nconst roleSrc = d.role && d.role.text && byId[d.role.source_id];\nconst role = roleSrc && roleSrc.status === 'connected' && g.texts[roleSrc.id] ? { text: String(d.role.text).slice(0, 60), source_id: roleSrc.id } : g.twin.role;\nconst twin = { ...g.twin, name: g.name, company: g.company, role, sources: g.sources, facts, readings, meetings: g.meetings, updated: now };\nconst toCheck = g.sources.filter(s => s.status === 'suggested').length;\nconst text = (fresh.length ? 'Pulled ' + fresh.length + ' new fact' + (fresh.length === 1 ? '' : 's') + ', each with its quote'\n                          : g.readable ? 'Nothing new in the sources' : 'Nothing to read yet') +\n             (toCheck ? '; ' + toCheck + ' source' + (toCheck === 1 ? '' : 's') + ' to check' : '') + (readings.length ? '; ' + readings.length + \" reading\" + (readings.length === 1 ? '' : 's') + ' with evidence' : '');\nconst say = { step: 'extract', text, at: Date.now(), adds: { sources: [], facts: fresh, readings } };\n// The build, saved for Replay: each step with when it landed and the ids it added\nconst start = $('Who they are').first().json.start;\nconst steps = [$('Who they are').first().json.say, $('Read the emails').first().json.say, $('Find their meetings').first().json.say, g.say, say];\ntwin.build_log = steps.map(s => ({ step: s.step, text: s.text, t: Math.max(0, s.at - start),\n  adds: { sources: (s.adds.sources || []).map(x => x.id), facts: (s.adds.facts || []).map(x => x.id), readings: (s.adds.readings || []).map(x => x.id),\n          meetings: (s.adds.meetings || []).map(x => x.id) } }));\nreturn [{ json: { twin, say, row: { ...twinToRow(twin), execution_id: String($execution.id), workflow_id: String($workflow.id) } } }];"
    },
    "output": [
  {
    "twin": {},
    "say": {},
    "row": {
      "email": "rajiv.menon@kaverifreight.in"
    }
  }
]
  }
});

const saidRules = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Report: pulled",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify({ step: { step: $json.say.step, text: $json.say.text, adds: $json.say.adds } }) }}"),
      "options": {}
    },
    "onError": "continueRegularOutput",
    "output": [
  {}
]
  }
});

const twinSave = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save the twin",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "We8Agobm9SMWGc7E",
        "cachedResultName": "DryRun people"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "email",
            "condition": "eq",
            "keyValue": expr("{{ $json.row.email }}")
          }
        ]
      },
      "columns": {
        "mappingMode": "defineBelow",
        "value": {
          "email": expr("{{ $json.row.email }}"),
          "aliases": expr("{{ $json.row.aliases }}"),
          "name": expr("{{ $json.row.name }}"),
          "company": expr("{{ $json.row.company }}"),
          "role": expr("{{ $json.row.role }}"),
          "sources": expr("{{ $json.row.sources }}"),
          "facts": expr("{{ $json.row.facts }}"),
          "readings": expr("{{ $json.row.readings }}"),
          "meetings": expr("{{ $json.row.meetings }}"),
          "predictions": expr("{{ $json.row.predictions }}"),
          "build_log": expr("{{ $json.row.build_log }}"),
          "updated": expr("{{ $json.row.updated }}"),
          "execution_id": expr("{{ $json.row.execution_id }}"),
          "workflow_id": expr("{{ $json.row.workflow_id }}")
        },
        "matchingColumns": [],
        "schema": [
          {
            "id": "email",
            "displayName": "email",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "aliases",
            "displayName": "aliases",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "name",
            "displayName": "name",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "company",
            "displayName": "company",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "role",
            "displayName": "role",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "sources",
            "displayName": "sources",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "facts",
            "displayName": "facts",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "readings",
            "displayName": "readings",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "meetings",
            "displayName": "meetings",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "predictions",
            "displayName": "predictions",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "build_log",
            "displayName": "build_log",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "updated",
            "displayName": "updated",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "execution_id",
            "displayName": "execution_id",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "workflow_id",
            "displayName": "workflow_id",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          }
        ]
      }
    },
    "output": [
  {
    "id": 1
  }
]
  }
});

const twinReply = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send the twin",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify({ twin: $('Hold to the rules').first().json.twin }) }}"),
      "options": {}
    },
    "output": [
  {}
]
  }
});

const about = sticky('## DryRun twin\nBuilds the twin of one real person (POST /webhook/dryrun/twin, docs/CONTRACT.md 0.27), streamed step by step to the twin page: your emails with their address (connected), the meetings they were invited to, their name elsewhere (suggestions only), then facts with quotes. Nothing from a rehearsal is ever read. A step after the model drops any fact whose quote is not in its source.', [twinTrigger], { color: 4 });

export default workflow('dryrun-twin', 'DryRun twin')
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
