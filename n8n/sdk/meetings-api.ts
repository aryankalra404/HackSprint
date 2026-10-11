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

const shapeOne = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "The meeting and its brief",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// One meeting by id, with its brief, proposed panel and rehearsals, newest first (docs/CONTRACT.md, GET /meeting)\nconst id = $('GET /meeting').first().json.query.id;\nconst r = $('Read meeting').all().map(i => i.json).find(r => String(r.meeting_id) === String(id));\nconst parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };\nif (!r) return [{ json: { error: 'not found' } }];\nconst sessions = $input.all().map(i => i.json).filter(x => x.session_id && String(x.meeting_id) === String(id))\n  .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))\n  .map(x => ({ session_id: x.session_id, at: x.at, status: x.status, overall: typeof x.overall === 'number' ? x.overall : null, headline: x.headline || '' }));\nconst done = sessions.filter(x => x.status === 'done');\nreturn [{ json: {\n  meeting: { id: String(r.meeting_id), title: r.title, start: r.start, company: r.company, why: r.why, status: r.status, attendees: parse(r.attendees) || [],\n             progress: parse(r.progress) || [], started_at: r.started_at || null,\n             run: r.execution_id ? { workflow_id: r.workflow_id, execution_id: r.execution_id } : null,\n             practice: done.length ? { sessions: done.length, last: { session_id: done[0].session_id, at: done[0].at, overall: done[0].overall, headline: done[0].headline } } : null },\n  brief: parse(r.brief), proposal: parse(r.proposal), sessions,\n} }];"
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

const about = sticky('## DryRun meetings API\nThe web app reads your meetings and briefs from the DryRun meetings table, with each meeting\'s rehearsals from DryRun sessions: GET /webhook/dryrun/meetings and GET /webhook/dryrun/meeting?id= (docs/CONTRACT.md).', [listTrigger, oneTrigger], { color: 4 });

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
  .to(shapeOne)
  .to(sendOne)
  .group('Meetings', [readAll, sessionsAll, shapeList, sendList], { description: 'GET /meetings: upcoming meetings, each with its rehearsals so far' })
  .group('One meeting', [readOne, sessionsOne, shapeOne, sendOne], { description: 'GET /meeting: one meeting with its brief, panel and rehearsals' });
