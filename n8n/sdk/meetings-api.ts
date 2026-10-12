import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, fromAi, expr } from '@n8n/workflow-sdk';

const listTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "GET /meetings",
    "parameters": {
      "httpMethod": "GET",
      "path": "dryrun/meetings",
      "responseMode": "responseNode",
      "options": {}
    },
    "output": [
  {
    "query": {}
  }
]
  }
});

const oneTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "GET /meeting",
    "parameters": {
      "httpMethod": "GET",
      "path": "dryrun/meeting",
      "responseMode": "responseNode",
      "options": {}
    },
    "output": [
  {
    "query": {}
  }
]
  }
});

const readAll = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Read meetings",
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
    "output": [
  {
    "meeting_id": "evt123",
    "title": "RouteIQ pitch",
    "status": "ready"
  }
]
  }
});

const readOne = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Read meeting",
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
    "output": [
  {
    "meeting_id": "evt123",
    "title": "RouteIQ pitch",
    "status": "ready"
  }
]
  }
});

const sessionsAll = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Read rehearsals",
    "parameters": {
      "resource": "row",
      "operation": "get",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "xzUZexBbX6bcX18F",
        "cachedResultName": "DryRun sessions"
      },
      "returnAll": true
    },
    "alwaysOutputData": true,
    "executeOnce": true,
    "output": [
  {
    "session_id": "s1",
    "meeting_id": "evt123",
    "status": "done",
    "overall": 63,
    "headline": "",
    "at": "2026-10-12T18:02:00.000Z"
  }
]
  }
});

const sessionsOne = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Read its rehearsals",
    "parameters": {
      "resource": "row",
      "operation": "get",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "xzUZexBbX6bcX18F",
        "cachedResultName": "DryRun sessions"
      },
      "returnAll": true
    },
    "alwaysOutputData": true,
    "executeOnce": true,
    "output": [
  {
    "session_id": "s1",
    "meeting_id": "evt123",
    "status": "done",
    "overall": 63,
    "headline": "",
    "at": "2026-10-12T18:02:00.000Z"
  }
]
  }
});

const shapeList = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Upcoming meetings",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Upcoming (and today's) meetings, soonest first (docs/CONTRACT.md, GET /meetings), each with its rehearsals so far\nconst since = Date.now() - 12 * 3600 * 1000;\nconst parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };\nconst sessions = $input.all().map(i => i.json).filter(r => r.session_id && r.status === 'done');\nconst practice = id => {\n  const done = sessions.filter(r => String(r.meeting_id) === String(id)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));\n  return done.length ? { sessions: done.length, last: { session_id: done[0].session_id, at: done[0].at, overall: done[0].overall, headline: done[0].headline || '' } } : null;\n};\nconst meetings = $('Read meetings').all().map(i => i.json).filter(r => r.meeting_id && (!r.start || Date.parse(r.start) >= since))\n  .sort((a, b) => Date.parse(a.start || 0) - Date.parse(b.start || 0))\n  .map(r => ({ id: String(r.meeting_id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees: parse(r.attendees) || [],\n               progress: parse(r.progress) || [], started_at: r.started_at || null,\n               run: r.execution_id ? { workflow_id: r.workflow_id, execution_id: r.execution_id } : null, practice: practice(r.meeting_id) }));\nreturn [{ json: { meetings } }];"
    },
    "output": [
  {
    "meetings": []
  }
]
  }
});

const peopleOne = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Read their twins",
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

const shapeOne = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "The meeting and its brief",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };\nconst lower = e => String(e || '').trim().toLowerCase();\nconst KINDS = ['raised', 'promised', 'decision', 'preference', 'role', 'context'];\nconst rowToTwin = r => ({ email: lower(r.email), aliases: parseJ(r.aliases, []), name: r.name || '', company: r.company || '', role: parseJ(r.role, null),\n  sources: parseJ(r.sources, []), facts: parseJ(r.facts, []), readings: parseJ(r.readings, []), meetings: parseJ(r.meetings, []),\n  predictions: parseJ(r.predictions, []), build_log: parseJ(r.build_log, []), updated: r.updated || '', sample: false });\nconst twinToRow = t => ({ email: t.email, aliases: JSON.stringify(t.aliases || []), name: t.name || '', company: t.company || '', role: t.role ? JSON.stringify(t.role) : '',\n  sources: JSON.stringify(t.sources || []), facts: JSON.stringify(t.facts || []), readings: JSON.stringify(t.readings || []), meetings: JSON.stringify(t.meetings || []),\n  predictions: JSON.stringify(t.predictions || []), build_log: JSON.stringify(t.build_log || []), updated: t.updated || '' });\n// Any address of theirs finds the row: the key, or one the presenter linked\nconst findRow = (rows, email) => rows.find(r => r.email && (lower(r.email) === email || parseJ(r.aliases, []).map(lower).includes(email)));\nconst maxId = (list, prefix) => list.reduce((a, x) => Math.max(a, Number(String(x.id || '').replace(prefix, '')) || 0), 0);\n// Counts for the brief and the people list, honest: connected facts, real meetings already held, suggestions waiting\nconst twinSummary = t => { const today = new Date().toISOString().slice(0, 10); const past = (t.meetings || []).map(m => m.date).filter(d => d && d <= today).sort();\n  return { facts: (t.facts || []).filter(f => f.status === 'connected').length, meetings: past.length, to_check: (t.sources || []).filter(s => s.status === 'suggested').length,\n           last_met: past.length ? past[past.length - 1] : null }; };\n\n// One meeting by id, with its brief, proposed panel and rehearsals, newest first (docs/CONTRACT.md, GET /meeting)\nconst id = $('GET /meeting').first().json.query.id;\nconst r = $('Read meeting').all().map(i => i.json).find(r => String(r.meeting_id) === String(id));\nconst parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };\nif (!r) return [{ json: { error: 'not found' } }];\nconst sessions = $('Read its rehearsals').all().map(i => i.json).filter(x => x.session_id && String(x.meeting_id) === String(id))\n  .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))\n  .map(x => ({ session_id: x.session_id, at: x.at, status: x.status, overall: typeof x.overall === 'number' ? x.overall : null, headline: x.headline || '' }));\nconst done = sessions.filter(x => x.status === 'done');\n// Each attendee's twin, as counts; and for those DryRun knows, what they raised and what you promised, facts only (never readings)\nconst rows = $input.all().map(i => i.json).filter(x => x.email);\nconst twinOf = a => { const row = a && a.email ? findRow(rows, lower(a.email)) : null; return row ? rowToTwin(row) : null; };\nconst attendees = (parse(r.attendees) || []).map(a => { const t = twinOf(a); return { ...a, twin: t ? twinSummary(t) : null }; });\nconst brief = parse(r.brief);\nconst label = s => s.type === 'email' ? (s.from === 'you' ? 'your email' : 'email') + ' of ' + s.date + ': ' + s.title : s.type === 'manual' ? 'your note of ' + s.date : s.title;\nconst since = (parse(r.attendees) || []).map(a => {\n  const t = twinOf(a);\n  if (!t) return null;\n  const src = Object.fromEntries(t.sources.filter(s => s.status === 'connected').map(s => [s.id, s]));\n  const pick = kinds => t.facts.filter(f => f.status === 'connected' && kinds.includes(f.kind) && src[f.source_id])\n    .map(f => ({ text: f.text, date: src[f.source_id].date || '', source: label(src[f.source_id]) })).sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 4);\n  const raised = pick(['raised', 'decision']);\n  const promised = pick(['promised']);\n  return raised.length || promised.length ? { email: t.email, name: t.name || a.name, raised, promised } : null;\n}).filter(Boolean);\nreturn [{ json: {\n  meeting: { id: String(r.meeting_id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees,\n             progress: parse(r.progress) || [], started_at: r.started_at || null,\n             run: r.execution_id ? { workflow_id: r.workflow_id, execution_id: r.execution_id } : null,\n             practice: done.length ? { sessions: done.length, last: { session_id: done[0].session_id, at: done[0].at, overall: done[0].overall, headline: done[0].headline } } : null,\n             // What happened in the real meeting (0.28), from the presenter's voice note\n             after: parse(r.after) },\n  brief: brief ? { ...brief, since_last_time: since } : null, proposal: parse(r.proposal), sessions,\n} }];"
    },
    "output": [
  {
    "meeting": {},
    "brief": null,
    "proposal": null,
    "sessions": []
  }
]
  }
});

const twinTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "GET /twin",
    "parameters": {
      "httpMethod": "GET",
      "path": "dryrun/twin",
      "responseMode": "responseNode",
      "options": {}
    },
    "output": [
  {
    "query": {}
  }
]
  }
});

const twinsTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "GET /twins",
    "parameters": {
      "httpMethod": "GET",
      "path": "dryrun/twins",
      "responseMode": "responseNode",
      "options": {}
    },
    "output": [
  {
    "query": {}
  }
]
  }
});

const peopleTwin = node({
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

const peopleTwins = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Read everyone",
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

const shapeTwin = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Their twin",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };\nconst lower = e => String(e || '').trim().toLowerCase();\nconst KINDS = ['raised', 'promised', 'decision', 'preference', 'role', 'context'];\nconst rowToTwin = r => ({ email: lower(r.email), aliases: parseJ(r.aliases, []), name: r.name || '', company: r.company || '', role: parseJ(r.role, null),\n  sources: parseJ(r.sources, []), facts: parseJ(r.facts, []), readings: parseJ(r.readings, []), meetings: parseJ(r.meetings, []),\n  predictions: parseJ(r.predictions, []), build_log: parseJ(r.build_log, []), updated: r.updated || '', sample: false });\nconst twinToRow = t => ({ email: t.email, aliases: JSON.stringify(t.aliases || []), name: t.name || '', company: t.company || '', role: t.role ? JSON.stringify(t.role) : '',\n  sources: JSON.stringify(t.sources || []), facts: JSON.stringify(t.facts || []), readings: JSON.stringify(t.readings || []), meetings: JSON.stringify(t.meetings || []),\n  predictions: JSON.stringify(t.predictions || []), build_log: JSON.stringify(t.build_log || []), updated: t.updated || '' });\n// Any address of theirs finds the row: the key, or one the presenter linked\nconst findRow = (rows, email) => rows.find(r => r.email && (lower(r.email) === email || parseJ(r.aliases, []).map(lower).includes(email)));\nconst maxId = (list, prefix) => list.reduce((a, x) => Math.max(a, Number(String(x.id || '').replace(prefix, '')) || 0), 0);\n// Counts for the brief and the people list, honest: connected facts, real meetings already held, suggestions waiting\nconst twinSummary = t => { const today = new Date().toISOString().slice(0, 10); const past = (t.meetings || []).map(m => m.date).filter(d => d && d <= today).sort();\n  return { facts: (t.facts || []).filter(f => f.status === 'connected').length, meetings: past.length, to_check: (t.sources || []).filter(s => s.status === 'suggested').length,\n           last_met: past.length ? past[past.length - 1] : null }; };\n\n// One twin by any of their addresses (docs/CONTRACT.md, GET /twin)\nconst row = findRow($input.all().map(i => i.json), lower($('GET /twin').first().json.query.email));\nreturn [{ json: { twin: row ? rowToTwin(row) : null } }];"
    },
    "output": [
  {
    "twin": null
  }
]
  }
});

const shapeTwins = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Everyone",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };\nconst lower = e => String(e || '').trim().toLowerCase();\nconst KINDS = ['raised', 'promised', 'decision', 'preference', 'role', 'context'];\nconst rowToTwin = r => ({ email: lower(r.email), aliases: parseJ(r.aliases, []), name: r.name || '', company: r.company || '', role: parseJ(r.role, null),\n  sources: parseJ(r.sources, []), facts: parseJ(r.facts, []), readings: parseJ(r.readings, []), meetings: parseJ(r.meetings, []),\n  predictions: parseJ(r.predictions, []), build_log: parseJ(r.build_log, []), updated: r.updated || '', sample: false });\nconst twinToRow = t => ({ email: t.email, aliases: JSON.stringify(t.aliases || []), name: t.name || '', company: t.company || '', role: t.role ? JSON.stringify(t.role) : '',\n  sources: JSON.stringify(t.sources || []), facts: JSON.stringify(t.facts || []), readings: JSON.stringify(t.readings || []), meetings: JSON.stringify(t.meetings || []),\n  predictions: JSON.stringify(t.predictions || []), build_log: JSON.stringify(t.build_log || []), updated: t.updated || '' });\n// Any address of theirs finds the row: the key, or one the presenter linked\nconst findRow = (rows, email) => rows.find(r => r.email && (lower(r.email) === email || parseJ(r.aliases, []).map(lower).includes(email)));\nconst maxId = (list, prefix) => list.reduce((a, x) => Math.max(a, Number(String(x.id || '').replace(prefix, '')) || 0), 0);\n// Counts for the brief and the people list, honest: connected facts, real meetings already held, suggestions waiting\nconst twinSummary = t => { const today = new Date().toISOString().slice(0, 10); const past = (t.meetings || []).map(m => m.date).filter(d => d && d <= today).sort();\n  return { facts: (t.facts || []).filter(f => f.status === 'connected').length, meetings: past.length, to_check: (t.sources || []).filter(s => s.status === 'suggested').length,\n           last_met: past.length ? past[past.length - 1] : null }; };\n\n// Everyone DryRun keeps a twin of, with honest counts (docs/CONTRACT.md, GET /twins)\nconst twins = $input.all().map(i => i.json).filter(r => r.email).map(rowToTwin)\n  .map(t => ({ email: t.email, name: t.name, company: t.company, role: (t.role && t.role.text) || '', updated: t.updated, ...twinSummary(t) }))\n  .sort((a, b) => (a.updated < b.updated ? 1 : -1));\nreturn [{ json: { twins } }];"
    },
    "output": [
  {
    "twins": []
  }
]
  }
});

const sendList = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send meetings",
    "parameters": {
      "respondWith": "firstIncomingItem",
      "options": {}
    },
    "output": [
  {}
]
  }
});

const sendOne = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send the meeting",
    "parameters": {
      "respondWith": "firstIncomingItem",
      "options": {}
    },
    "output": [
  {}
]
  }
});

const sendTwin = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send the twin",
    "parameters": {
      "respondWith": "firstIncomingItem",
      "options": {}
    },
    "output": [
  {}
]
  }
});

const sendTwins = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send everyone",
    "parameters": {
      "respondWith": "firstIncomingItem",
      "options": {}
    },
    "output": [
  {}
]
  }
});

const about = sticky('## DryRun meetings API\nThe web app reads your meetings and briefs from the DryRun meetings table, with each meeting\'s rehearsals from DryRun sessions and its attendees\' twins from DryRun people: GET /webhook/dryrun/meetings, GET /webhook/dryrun/meeting?id=, GET /webhook/dryrun/twin?email= and GET /webhook/dryrun/twins (docs/CONTRACT.md).', [listTrigger, oneTrigger], { color: 4 });

export default workflow('dryrun-meetings-api', 'DryRun meetings API')
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
  .group('One meeting', [readOne, sessionsOne, peopleOne, shapeOne, sendOne], { description: 'GET /meeting: one meeting with its brief, panel, rehearsals and its attendees' twins' })
  .group('Twins', [peopleTwin, shapeTwin, sendTwin, peopleTwins, shapeTwins, sendTwins], { description: 'GET /twin and GET /twins: the DryRun people table' });
