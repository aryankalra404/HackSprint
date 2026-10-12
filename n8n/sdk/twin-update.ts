import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, fromAi, expr } from '@n8n/workflow-sdk';

const updTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "Changes to a twin (laptop)",
    "parameters": {
      "httpMethod": "POST",
      "path": "dryrun/twin/update",
      "responseMode": "responseNode",
      "options": {}
    },
    "output": [
  {
    "body": {
      "email": "rajiv.menon@kaverifreight.in",
      "changes": [
        {
          "op": "confirm",
          "source_id": "s5"
        }
      ]
    }
  }
]
  }
});

const updPeople = node({
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

const updApply = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Apply the changes",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };\nconst lower = e => String(e || '').trim().toLowerCase();\nconst KINDS = ['raised', 'promised', 'decision', 'preference', 'role', 'context'];\nconst rowToTwin = r => ({ email: lower(r.email), aliases: parseJ(r.aliases, []), name: r.name || '', company: r.company || '', role: parseJ(r.role, null),\n  sources: parseJ(r.sources, []), facts: parseJ(r.facts, []), readings: parseJ(r.readings, []), meetings: parseJ(r.meetings, []),\n  predictions: parseJ(r.predictions, []), build_log: parseJ(r.build_log, []), updated: r.updated || '', sample: false });\nconst twinToRow = t => ({ email: t.email, aliases: JSON.stringify(t.aliases || []), name: t.name || '', company: t.company || '', role: t.role ? JSON.stringify(t.role) : '',\n  sources: JSON.stringify(t.sources || []), facts: JSON.stringify(t.facts || []), readings: JSON.stringify(t.readings || []), meetings: JSON.stringify(t.meetings || []),\n  predictions: JSON.stringify(t.predictions || []), build_log: JSON.stringify(t.build_log || []), updated: t.updated || '' });\n// Any address of theirs finds the row: the key, or one the presenter linked\nconst findRow = (rows, email) => rows.find(r => r.email && (lower(r.email) === email || parseJ(r.aliases, []).map(lower).includes(email)));\nconst maxId = (list, prefix) => list.reduce((a, x) => Math.max(a, Number(String(x.id || '').replace(prefix, '')) || 0), 0);\n// Counts for the brief and the people list, honest: connected facts, real meetings already held, suggestions waiting\nconst twinSummary = t => { const today = new Date().toISOString().slice(0, 10); const past = (t.meetings || []).map(m => m.date).filter(d => d && d <= today).sort();\n  return { facts: (t.facts || []).filter(f => f.status === 'connected').length, meetings: past.length, to_check: (t.sources || []).filter(s => s.status === 'suggested').length,\n           last_met: past.length ? past[past.length - 1] : null }; };\n\n// The presenter's batch of changes from the twin page (docs/CONTRACT.md, POST /twin/update), in order. Confirming a suggestion connects\n// it and its facts; rejecting it rejects them and is remembered, so the same source is never suggested again.\nconst req = $('Changes to a twin (laptop)').first().json.body || {};\nconst email = lower(req.email);\nconst changes = Array.isArray(req.changes) ? req.changes : [];\nconst row = findRow($input.all().map(i => i.json), email);\nif (!row) return [{ json: { action: 'none', reply: { twin: null, error: 'DryRun has no twin of ' + email } } }];\nif (changes.some(x => x.op === 'forget')) return [{ json: { action: 'forget', email: lower(row.email), reply: { forgotten: true } } }];\nconst t = rowToTwin(row);\nlet sN = maxId(t.sources, 's');\nlet fN = maxId(t.facts, 'f');\nconst now = new Date().toISOString();\nfor (const x of changes) {\n  if (x.op === 'confirm' || x.op === 'reject') {\n    const s = t.sources.find(y => y.id === x.source_id);\n    if (!s || s.type === 'manual') continue;\n    s.status = x.op === 'confirm' ? 'connected' : 'rejected';\n    if (x.op === 'confirm') s.why = 'You confirmed it: ' + (s.why || '');\n    t.facts.forEach(f => { if (f.source_id === s.id) f.status = s.status; });\n  } else if (x.op === 'note') {\n    const text = String(x.text || '').trim().slice(0, 8000);\n    if (!text) continue;\n    const s = { id: 's' + (++sN), type: 'manual', title: text.length < 300 ? 'Your note' : 'Text you pasted', date: now.slice(0, 10), status: 'connected', why: 'You added this', key: 'manual:' + now + ':' + sN, text };\n    t.sources.push(s);\n    // A short note is a fact as it stands; longer text is read for facts, with quotes, on the next build\n    if (text.length < 300) t.facts.push({ id: 'f' + (++fN), kind: KINDS.includes(x.kind) ? x.kind : 'context', text: text.slice(0, 120), source_id: s.id, quote: text, status: 'connected', added: now });\n  } else if (x.op === 'alias') {\n    const a = lower(x.email);\n    if (a.includes('@') && a !== t.email && !t.aliases.includes(a)) t.aliases.push(a);\n  } else if (x.op === 'delete') {\n    t.facts = t.facts.filter(f => f.id !== x.fact_id);\n  }\n}\n// What no longer holds goes: readings need two connected facts, the role a connected source\nconst ok = new Set(t.facts.filter(f => f.status === 'connected').map(f => f.id));\nt.readings = t.readings.map(r => ({ ...r, evidence: r.evidence.filter(id => ok.has(id)) })).filter(r => r.evidence.length >= 2);\nif (t.role && !t.sources.some(s => s.id === t.role.source_id && s.status === 'connected')) t.role = null;\nt.updated = now;\nreturn [{ json: { action: 'save', row: { ...twinToRow(t), execution_id: String($execution.id), workflow_id: String($workflow.id) }, reply: { twin: t } } }];"
    },
    "output": [
  {
    "action": "save",
    "row": {
      "email": "rajiv.menon@kaverifreight.in"
    },
    "reply": {}
  }
]
  }
});

const updForget = ifElse({
  type: "n8n-nodes-base.if",
  version: 2.3,
  config: {
    "name": "Forget them?",
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "leftValue": expr("{{ $json.action }}"),
            "rightValue": "forget",
            "operator": {
              "type": "string",
              "operation": "equals"
            }
          }
        ],
        "combinator": "and"
      },
      "options": {}
    },
    "output": [
  {
    "action": "forget"
  }
]
  }
});

const updSave = ifElse({
  type: "n8n-nodes-base.if",
  version: 2.3,
  config: {
    "name": "Save it?",
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "leftValue": expr("{{ $json.action }}"),
            "rightValue": "save",
            "operator": {
              "type": "string",
              "operation": "equals"
            }
          }
        ],
        "combinator": "and"
      },
      "options": {}
    },
    "output": [
  {
    "action": "save"
  }
]
  }
});

const updDelete = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Delete their row",
    "parameters": {
      "resource": "row",
      "operation": "deleteRows",
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
            "keyValue": expr("{{ $json.email }}")
          }
        ]
      }
    },
    "alwaysOutputData": true,
    "output": [
  {
    "id": 1
  }
]
  }
});

const updWrite = node({
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

const updReply = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send the twin",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify($('Apply the changes').first().json.reply) }}"),
      "options": {}
    },
    "output": [
  {}
]
  }
});

const about = sticky('## DryRun twin update\nThe presenter\'s changes to a twin, sent from the twin page as one batch (POST /webhook/dryrun/twin/update, docs/CONTRACT.md 0.27): confirm or reject a suggestion, add a note, link another address, delete a fact, or forget the person.', [updTrigger], { color: 4 });

export default workflow('dryrun-twin-update', 'DryRun twin update')
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
