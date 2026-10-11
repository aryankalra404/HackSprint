import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, fromAi, expr } from '@n8n/workflow-sdk';

const calendarTrigger = trigger({
  type: "n8n-nodes-base.googleCalendarTrigger",
  version: 1,
  config: {
    "name": "New calendar event",
    "parameters": {
      "pollTimes": {
        "item": [
          {
            "mode": "everyMinute"
          }
        ]
      },
      "calendarId": {
        "__rl": true,
        "mode": "list",
        "value": "primary",
        "cachedResultName": "primary"
      },
      "triggerOn": "eventCreated",
      "options": {}
    },
    "credentials": { "googleCalendarOAuth2Api": newCredential("Google Calendar") },
    "output": [
  {
    "id": "evt123",
    "summary": "RouteIQ pitch",
    "start": {
      "dateTime": "2026-10-16T15:00:00+05:30"
    },
    "attendees": []
  }
]
  }
});

const shapeEvent = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Shape the event",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// One meeting per calendar event, in the shape the rest of the workflow (and docs/CONTRACT.md) uses\nreturn $input.all().map(({ json: e }) => {\n  const attendees = (e.attendees || []).map(a => ({ name: a.displayName || a.email.split('@')[0], email: a.email, self: !!a.self }));\n  const self = attendees.find(a => a.self) || { email: (e.creator && e.creator.email) || (e.organizer && e.organizer.email) || '' };\n  const start = (e.start && (e.start.dateTime || e.start.date)) || '';\n  const end = (e.end && (e.end.dateTime || e.end.date)) || '';\n  // The slot's length, so the brief can suggest how long to pitch (null for all-day events)\n  const minutes = start && end && e.start.dateTime ? Math.round((Date.parse(end) - Date.parse(start)) / 60000) : null;\n  return { json: {\n    meeting_id: e.id,\n    title: e.summary || 'Untitled meeting',\n    start,\n    minutes,\n    description: (e.description || '').replace(/<[^>]+>/g, ' ').slice(0, 2000),\n    attendees: attendees.filter(a => !a.self).map(a => ({ name: a.name, email: a.email })),\n    owner_email: self.email,\n    from_web: false,\n  } };\n});"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "title": "RouteIQ pitch",
    "start": "2026-10-16T15:00:00+05:30",
    "description": "",
    "attendees": [
      {
        "name": "Priya Nair",
        "email": "priya.nair@delhivery.com"
      }
    ],
    "owner_email": "you@example.com",
    "from_web": false,
    "company": "Delhivery",
    "company_domain": "delhivery.com",
    "kind": "sales_pitch",
    "why": ""
  }
]
  }
});

const webTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "Add a meeting (web app)",
    "parameters": {
      "httpMethod": "POST",
      "path": "dryrun/add-meeting",
      "responseMode": "onReceived",
      "options": {}
    },
    "output": [
  {
    "body": {
      "company": "Delhivery",
      "context": "",
      "attendees": []
    }
  }
]
  }
});

const shapeRequest = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Shape the request",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The web app sends { id, title, start, company, website, context, attendees: [{ name, email }], owner_email }\nreturn $input.all().map(({ json }) => {\n  const b = json.body || json;\n  return { json: {\n    meeting_id: b.id || ('web-' + Date.now()),\n    title: b.title || ('Meeting with ' + (b.company || 'a prospect')),\n    start: b.start || new Date(Date.now() + 2 * 86400000).toISOString(),\n    minutes: b.minutes || null,\n    description: [b.company && ('Company: ' + b.company), b.website && ('Website: ' + b.website), b.context].filter(Boolean).join('\\n').slice(0, 4000),\n    attendees: b.attendees || [],\n    owner_email: b.owner_email || '',\n    from_web: true,\n  } };\n});"
    },
    "output": [
  {
    "meeting_id": "web-1",
    "title": "RouteIQ pitch",
    "start": "2026-10-16T15:00:00+05:30",
    "description": "",
    "attendees": [
      {
        "name": "Priya Nair",
        "email": "priya.nair@delhivery.com"
      }
    ],
    "owner_email": "you@example.com",
    "from_web": true,
    "company": "Delhivery",
    "company_domain": "delhivery.com",
    "kind": "sales_pitch",
    "why": ""
  }
]
  }
});

const triage = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Worth preparing?",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: \"You decide which calendar events are worth preparing a rehearsal for. The presenter is the attendee marked \\\"self\\\".\\nPrepare for high-stakes conversations with people outside the presenter's organisation where they must persuade or perform:\\nsales pitches and demos, investor pitches, interviews, client reviews, partnership talks. Skip internal syncs, standups,\\n1:1s with colleagues, personal events and anything with no external attendee.\\n\\\"why\\\" is one specific sentence for the presenter. If it is worth preparing: who is coming and what is at stake. If not: why it\\nisn't worth preparing (e.g. \\\"Internal weekly sync, no one from outside\\\"); the presenter sees it and can prepare it anyway.\\n\\nEvent:\\n\" + JSON.stringify($json, null, 1) }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"prepare\": {\"type\": \"boolean\"}, \"why\": {\"type\": \"string\"}, \"company\": {\"type\": \"string\", \"description\": \"The external organisation, or empty\"}, \"company_domain\": {\"type\": \"string\", \"description\": \"Their email or web domain, or empty\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"sales_pitch\", \"investor_pitch\", \"interview\", \"client_review\", \"partnership\", \"internal\", \"personal\", \"other\"]} }, \"required\": [\"prepare\", \"why\", \"company\", \"company_domain\", \"kind\"]} } }) }}"),
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

const triageGroq = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Worth preparing? (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = ($('Shape the event').isExecuted ? $('Shape the event') : $('Shape the request')).item.json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: (\"You decide which calendar events are worth preparing a rehearsal for. The presenter is the attendee marked \\\"self\\\".\\nPrepare for high-stakes conversations with people outside the presenter's organisation where they must persuade or perform:\\nsales pitches and demos, investor pitches, interviews, client reviews, partnership talks. Skip internal syncs, standups,\\n1:1s with colleagues, personal events and anything with no external attendee.\\n\\\"why\\\" is one specific sentence for the presenter. If it is worth preparing: who is coming and what is at stake. If not: why it\\nisn't worth preparing (e.g. \\\"Internal weekly sync, no one from outside\\\"); the presenter sees it and can prepare it anyway.\\n\\nEvent:\\n\" + JSON.stringify(j, null, 1)) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"prepare\": {\"type\": \"boolean\"}, \"why\": {\"type\": \"string\"}, \"company\": {\"type\": \"string\", \"description\": \"The external organisation, or empty\"}, \"company_domain\": {\"type\": \"string\", \"description\": \"Their email or web domain, or empty\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"sales_pitch\", \"investor_pitch\", \"interview\", \"client_review\", \"partnership\", \"internal\", \"personal\", \"other\"]} }, \"required\": [\"prepare\", \"why\", \"company\", \"company_domain\", \"kind\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
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

const readDecision = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Read the decision",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// The model's answer, merged back into the meeting it was about. Meetings added from the web app are always prepared.\nconst shaped = $('Shape the event').isExecuted ? $('Shape the event').all() : $('Shape the request').all();\nreturn $input.all().map((item, i) => {\n  const d = JSON.parse(replyText(item.json) || '{}');\n  const m = shaped[i].json;\n  const domain = d.company_domain || ((m.attendees[0] && m.attendees[0].email) || '').split('@')[1] || '';\n  // Added by hand (or \"Prepare anyway\"): always prepared, and the reason says so when n8n would have skipped it\n  const why = m.from_web && !d.prepare ? \"Prepared because you asked. n8n's view: \" + (d.why || 'not a high-stakes meeting') : (d.why || '');\n  return { json: { ...m, prepare: m.from_web || !!d.prepare, why, company: d.company || m.title, company_domain: domain, kind: d.kind || 'other' } };\n});"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "title": "RouteIQ pitch",
    "start": "2026-10-16T15:00:00+05:30",
    "description": "",
    "attendees": [
      {
        "name": "Priya Nair",
        "email": "priya.nair@delhivery.com"
      }
    ],
    "owner_email": "you@example.com",
    "from_web": false,
    "company": "Delhivery",
    "company_domain": "delhivery.com",
    "kind": "sales_pitch",
    "why": "",
    "prepare": true
  }
]
  }
});

const prepareIt = ifElse({
  type: "n8n-nodes-base.if",
  version: 2.3,
  config: {
    "name": "Prepare it?",
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "leftValue": expr("{{ $json.prepare }}"),
            "rightValue": true,
            "operator": {
              "type": "boolean",
              "operation": "true",
              "singleValue": true
            }
          }
        ],
        "combinator": "and"
      },
      "options": {}
    },
    "output": [
  {
    "prepare": true
  }
]
  }
});

const rowSkipped = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Row: skipped",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Not worth preparing: keep it in the table with n8n's reason, so the web app can list it and offer \"Prepare anyway\"\nreturn $input.all().map(({ json: m }) => ({ json: {\n  meeting_id: m.meeting_id, title: m.title, start: m.start, company: m.company, kind: m.kind, why: m.why,\n  attendees: JSON.stringify(m.attendees), owner_email: m.owner_email, status: 'skipped',\n  brief: '', proposal: '', progress: '[]', started_at: '', updated_at: new Date().toISOString(),\n  execution_id: String($execution.id), workflow_id: String($workflow.id),\n} }));"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "status": "skipped"
  }
]
  }
});

const saveSkipped = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save: skipped",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "wURCb4PjdZLpttns",
        "cachedResultName": "DryRun meetings"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "meeting_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.meeting_id }}")
          }
        ]
      },
      "columns": {
        "mappingMode": "autoMapInputData",
        "value": null
      }
    },
    "output": [
  {
    "id": 1
  }
]
  }
});

const rowResearching = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Row: researching",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The meeting as a row in the DryRun meetings table, while n8n works on it\n\nconst ran = name => { try { return $(name).isExecuted; } catch (e) { return false; } };\nconst out = name => (ran(name) ? $(name).first().json : null);\nconst decision = out('Read the decision') || {};\nconst mail = out('Summarise the emails');\nconst research = out('Read the research');\nconst seated = out('Seat the panel');\nconst sent = out('Email the brief');\nconst names = (decision.attendees || []).map(a => a.name).join(' and ') || 'the attendees';\nconst company = decision.company || 'the company';\n// n8n's code sandbox has no URL class, so read the host by hand: https://www.zeebiz.com/x -> zeebiz.com\nconst host = u => { const h = String(u || '').split('//').pop().split('/')[0]; return h.startsWith('www.') ? h.slice(4) : h; };\nconst sites = research ? [...new Set(research.sources.map(x => host(x.site || x.url)).filter(Boolean))] : [];\nconst attending = seated ? seated.proposal.members.filter(m => m.source === 'email').length : 0;\nconst practising = seated ? seated.proposal.members.length - attending : 0;\nconst suggested = seated ? (seated.proposal.suggestions || []).length : 0;\nconst step = (id, label, done, running, doneText, runningText, extra) =>\n  ({ id, label, state: done ? 'done' : running ? 'running' : 'pending', detail: done ? doneText : running ? runningText : '', ...(extra || {}) });\nconst progress = [\n  step('decide', 'Decide', true, false, decision.why || 'Worth preparing', ''),\n  step('emails', 'Emails', !!mail, true,\n    mail && mail.count ? 'Read ' + mail.count + ' recent email' + (mail.count === 1 ? '' : 's') + ' with ' + names : 'No recent emails with ' + names,\n    'Reading your recent emails with ' + names),\n  step('research', 'Research', !!research, !!mail,\n    research ? 'Read ' + research.news_count + ' recent news stor' + (research.news_count === 1 ? 'y' : 'ies') + ' about ' + company + (research.has_website ? ' and their website' : '')\n      + (!research.web_searched ? '' : research.web_count ? ', then searched the web (' + research.web_count + ' page' + (research.web_count === 1 ? '' : 's') + ')'\n         : \". Little news, and web search isn't available on this Gemini key\") : '',\n    'Reading the news about ' + company + ' and their website',\n    { sources: sites.slice(0, 8).map(h => ({ title: h, url: 'https://' + h })) }),\n  step('brief', 'Brief', !!seated, !!research,\n    seated ? 'Wrote ' + seated.brief.questions.length + ' likely questions and ' + seated.brief.risks.length + ' risks' : '', 'Writing your brief and the hardest questions'),\n  step('panel', 'Panel', !!seated, !!research,\n    'Seated ' + attending + ' from the invite' + (practising ? ' and ' + practising + ' practice role' + (practising === 1 ? '' : 's') : '') + '; suggested '\n      + suggested + ' more to practise against', 'Seating the practice panel'),\n  step('email', 'Email', !!sent && !sent.error, !!seated,\n    'Emailed you the brief', 'Emailing you the brief'),\n];\nif (sent && sent.error) Object.assign(progress[5], { state: 'error', detail: \"Couldn't email the brief\" });\nconst progressFields = { progress: JSON.stringify(progress), execution_id: String($execution.id), workflow_id: String($workflow.id) };\n\nreturn $input.all().map(({ json: m }) => ({ json: {\n  meeting_id: m.meeting_id, title: m.title, start: m.start, company: m.company, kind: m.kind, why: m.why,\n  attendees: JSON.stringify(m.attendees), owner_email: m.owner_email, status: 'researching',\n  brief: '', proposal: '', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...progressFields,\n} }));"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "status": "researching"
  }
]
  }
});

const saveResearching = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save: researching",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "wURCb4PjdZLpttns",
        "cachedResultName": "DryRun meetings"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "meeting_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.meeting_id }}")
          }
        ]
      },
      "columns": {
        "mappingMode": "autoMapInputData",
        "value": null
      }
    },
    "output": [
  {
    "id": 1
  }
]
  }
});

const emails = node({
  type: "n8n-nodes-base.gmail",
  version: 2.2,
  config: {
    "name": "Emails with them",
    "parameters": {
      "resource": "message",
      "operation": "getAll",
      "returnAll": false,
      "limit": 10,
      "simple": true,
      "filters": {
        "readStatus": "both",
        "q": expr("{{ (() => { const m = $('Read the decision').item.json; const who = m.attendees.map(a => a.email).filter(Boolean); return who.length ? '(' + who.map(e => 'from:' + e + ' OR to:' + e).join(' OR ') + ') newer_than:120d' : 'from:nobody@invalid'; })() }}")
      }
    },
    "alwaysOutputData": true,
    "executeOnce": true,
    "credentials": { "gmailOAuth2": newCredential("Gmail") },
    "output": [
  {
    "From": "Priya Nair <priya.nair@delhivery.com>",
    "snippet": "Thanks for the intro call",
    "Subject": "RouteIQ"
  }
]
  }
});

const summariseEmails = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Summarise the emails",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The recent thread with the attendees, as short text for the brief\nconst msgs = $input.all().map(i => i.json).filter(m => m.snippet);\nconst meeting = $('Read the decision').first().json;\nconst emails = msgs.slice(0, 10).map(m => 'From ' + (m.From || '') + ' (' + (m.Subject || '') + '): ' + (m.snippet || '').slice(0, 400)).join('\\n') || 'No recent emails.';\nreturn [{ json: { meeting, emails, count: msgs.length } }];"
    },
    "output": [
  {
    "meeting": {
      "meeting_id": "evt123",
      "title": "RouteIQ pitch",
      "start": "2026-10-16T15:00:00+05:30",
      "description": "",
      "attendees": [
        {
          "name": "Priya Nair",
          "email": "priya.nair@delhivery.com"
        }
      ],
      "owner_email": "you@example.com",
      "from_web": false,
      "company": "Delhivery",
      "company_domain": "delhivery.com",
      "kind": "sales_pitch",
      "why": ""
    },
    "emails": "No recent emails.",
    "count": 0
  }
]
  }
});

const progressEmails = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Progress: emails read",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const ran = name => { try { return $(name).isExecuted; } catch (e) { return false; } };\nconst out = name => (ran(name) ? $(name).first().json : null);\nconst decision = out('Read the decision') || {};\nconst mail = out('Summarise the emails');\nconst research = out('Read the research');\nconst seated = out('Seat the panel');\nconst sent = out('Email the brief');\nconst names = (decision.attendees || []).map(a => a.name).join(' and ') || 'the attendees';\nconst company = decision.company || 'the company';\n// n8n's code sandbox has no URL class, so read the host by hand: https://www.zeebiz.com/x -> zeebiz.com\nconst host = u => { const h = String(u || '').split('//').pop().split('/')[0]; return h.startsWith('www.') ? h.slice(4) : h; };\nconst sites = research ? [...new Set(research.sources.map(x => host(x.site || x.url)).filter(Boolean))] : [];\nconst attending = seated ? seated.proposal.members.filter(m => m.source === 'email').length : 0;\nconst practising = seated ? seated.proposal.members.length - attending : 0;\nconst suggested = seated ? (seated.proposal.suggestions || []).length : 0;\nconst step = (id, label, done, running, doneText, runningText, extra) =>\n  ({ id, label, state: done ? 'done' : running ? 'running' : 'pending', detail: done ? doneText : running ? runningText : '', ...(extra || {}) });\nconst progress = [\n  step('decide', 'Decide', true, false, decision.why || 'Worth preparing', ''),\n  step('emails', 'Emails', !!mail, true,\n    mail && mail.count ? 'Read ' + mail.count + ' recent email' + (mail.count === 1 ? '' : 's') + ' with ' + names : 'No recent emails with ' + names,\n    'Reading your recent emails with ' + names),\n  step('research', 'Research', !!research, !!mail,\n    research ? 'Read ' + research.news_count + ' recent news stor' + (research.news_count === 1 ? 'y' : 'ies') + ' about ' + company + (research.has_website ? ' and their website' : '')\n      + (!research.web_searched ? '' : research.web_count ? ', then searched the web (' + research.web_count + ' page' + (research.web_count === 1 ? '' : 's') + ')'\n         : \". Little news, and web search isn't available on this Gemini key\") : '',\n    'Reading the news about ' + company + ' and their website',\n    { sources: sites.slice(0, 8).map(h => ({ title: h, url: 'https://' + h })) }),\n  step('brief', 'Brief', !!seated, !!research,\n    seated ? 'Wrote ' + seated.brief.questions.length + ' likely questions and ' + seated.brief.risks.length + ' risks' : '', 'Writing your brief and the hardest questions'),\n  step('panel', 'Panel', !!seated, !!research,\n    'Seated ' + attending + ' from the invite' + (practising ? ' and ' + practising + ' practice role' + (practising === 1 ? '' : 's') : '') + '; suggested '\n      + suggested + ' more to practise against', 'Seating the practice panel'),\n  step('email', 'Email', !!sent && !sent.error, !!seated,\n    'Emailed you the brief', 'Emailing you the brief'),\n];\nif (sent && sent.error) Object.assign(progress[5], { state: 'error', detail: \"Couldn't email the brief\" });\nconst progressFields = { progress: JSON.stringify(progress), execution_id: String($execution.id), workflow_id: String($workflow.id) };\n\n// Save how far n8n has got, for the live progress on the brief page\nreturn [{ json: { meeting_id: $('Read the decision').first().json.meeting_id, ...progressFields } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "progress": "[]"
  }
]
  }
});

const saveProgressEmails = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save progress: emails",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "wURCb4PjdZLpttns",
        "cachedResultName": "DryRun meetings"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "meeting_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.meeting_id }}")
          }
        ]
      },
      "columns": {
        "mappingMode": "autoMapInputData",
        "value": null
      }
    },
    "output": [
  {
    "id": 1
  }
]
  }
});

const news = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Find the news",
    "parameters": {
      "method": "GET",
      "url": expr("https://news.google.com/rss/search?q={{ encodeURIComponent('\"' + $('Summarise the emails').first().json.meeting.company + '\"') }}&hl=en-IN&gl=IN&ceid=IN:en"),
      "options": {
        "timeout": 20000,
        "response": {
          "response": {
            "responseFormat": "text"
          }
        }
      }
    },
    "onError": "continueRegularOutput",
    "retryOnFail": true,
    "maxTries": 2,
    "output": [
  {
    "data": "<rss></rss>"
  }
]
  }
});

const website = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Read their website",
    "parameters": {
      "method": "GET",
      "url": expr("https://{{ $('Summarise the emails').first().json.meeting.company_domain || 'invalid.invalid' }}"),
      "options": {
        "timeout": 15000,
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
    "output": [
  {
    "data": "<html></html>"
  }
]
  }
});

const gatherSources = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Gather the sources",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Up to 15 recent headlines (with date, publisher and link) and the readable text of their homepage\nconst prev = $('Summarise the emails').first().json;\nconst rss = ($('Find the news').first().json.data || '').toString();\nconst unescape = t => t.replace(/<!\\[CDATA\\[|\\]\\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&#39;/g, \"'\");\nconst tag = (xml, t) => { const m = xml.match(new RegExp('<' + t + '[^>]*>([^]*?)</' + t + '>')); return m ? unescape(m[1]).trim() : ''; };\nconst news = (rss.match(/<item>[^]*?<\\/item>/g) || []).slice(0, 15).map(it => {\n  const src = it.match(/<source url=\"([^\"]*)\">([^]*?)<\\/source>/);\n  const date = new Date(tag(it, 'pubDate'));\n  return { title: tag(it, 'title').replace(/ - [^-]+$/, ''), url: tag(it, 'link'), publisher: src ? unescape(src[2]) : '', site: src ? src[1] : '',\n           date: isNaN(date) ? '' : date.toISOString().slice(0, 10) };\n});\nconst html = ($('Read their website').first().json.data || '').toString();\nconst meta = name => { const m = html.match(new RegExp('<meta[^>]+(?:name|property)=\"' + name + '\"[^>]+content=\"([^\"]*)\"', 'i')); return m ? unescape(m[1]) : ''; };\nconst body = html.replace(/<script[^]*?<\\/script>/gi, ' ').replace(/<style[^]*?<\\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();\n// App-style sites render in the browser; their meta description still says what the company does\nconst website = [tag(html, 'title'), meta('description'), meta('og:description'), body].filter(Boolean).join(' ').slice(0, 3000);\nreturn [{ json: { ...prev, news, website } }];"
    },
    "output": [
  {
    "meeting": {
      "meeting_id": "evt123",
      "title": "RouteIQ pitch",
      "start": "2026-10-16T15:00:00+05:30",
      "description": "",
      "attendees": [
        {
          "name": "Priya Nair",
          "email": "priya.nair@delhivery.com"
        }
      ],
      "owner_email": "you@example.com",
      "from_web": false,
      "company": "Delhivery",
      "company_domain": "delhivery.com",
      "kind": "sales_pitch",
      "why": ""
    },
    "emails": "",
    "news": [],
    "website": ""
  }
]
  }
});

const enoughNews = ifElse({
  type: "n8n-nodes-base.if",
  version: 2.3,
  config: {
    "name": "Enough news?",
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "leftValue": expr("{{ $json.news.length }}"),
            "rightValue": 3,
            "operator": {
              "type": "number",
              "operation": "gte"
            }
          }
        ],
        "combinator": "and"
      },
      "options": {}
    },
    "output": [
  {
    "meeting": {
      "meeting_id": "evt123",
      "title": "RouteIQ pitch",
      "start": "2026-10-16T15:00:00+05:30",
      "description": "",
      "attendees": [
        {
          "name": "Priya Nair",
          "email": "priya.nair@delhivery.com"
        }
      ],
      "owner_email": "you@example.com",
      "from_web": false,
      "company": "Delhivery",
      "company_domain": "delhivery.com",
      "kind": "sales_pitch",
      "why": ""
    },
    "news": []
  }
]
  }
});

const searchWeb = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Search the web",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: \"Search the web for recent, verifiable facts about {company} ({domain}) that someone going into a {kind} with them should know:\\nwhat they do and their scale, funding, results, leadership changes, launches, partnerships and problems in the last 12 months.\\nList up to 8 facts, one per line, each with its date and the publication or site that reported it.\\nOnly include facts you found in search results. If you found little, say so. Plain text.\".replace('{company}', $json.meeting.company).replace('{domain}', $json.meeting.company_domain || 'domain unknown').replace('{kind}', $json.meeting.kind) }] }], tools: [{ google_search: {} }] }) }}"),
      "options": {
        "timeout": 120000
      }
    },
    "onError": "continueRegularOutput",
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

const addWeb = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Add the web results",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Keep the search answer only if Google Search actually backed it, with the pages it used as sources\nconst prev = $('Gather the sources').first().json;\nconst c = ($json.candidates && $json.candidates[0]) || {};\nconst text = ((c.content && c.content.parts) || []).map(p => p.text || '').join('').trim();\nconst pages = ((c.groundingMetadata && c.groundingMetadata.groundingChunks) || []).map(x => x.web).filter(w => w && w.uri);\nconst found = text && pages.length > 0;\n// Each page's title is its site (e.g. inc42.com); its link goes through Google's redirect to the article\nconst web = found ? pages.slice(0, 6).map(w => ({ title: w.title || 'Web page', url: w.uri, site: 'https://' + (w.domain || w.title || '') })) : [];\nconst error = $json.error ? ($json.error.message || String($json.error)).split('\\n')[0].slice(0, 160) : '';\nreturn [{ json: { ...prev, web_searched: true, web_found: found ? text : '', web, web_error: error } }];"
    },
    "output": [
  {
    "meeting": {
      "meeting_id": "evt123",
      "title": "RouteIQ pitch",
      "start": "2026-10-16T15:00:00+05:30",
      "description": "",
      "attendees": [
        {
          "name": "Priya Nair",
          "email": "priya.nair@delhivery.com"
        }
      ],
      "owner_email": "you@example.com",
      "from_web": false,
      "company": "Delhivery",
      "company_domain": "delhivery.com",
      "kind": "sales_pitch",
      "why": ""
    },
    "emails": "",
    "news": [],
    "website": "",
    "web_searched": true,
    "web_found": "",
    "web": [],
    "web_error": ""
  }
]
  }
});

const research = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Research the company",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: \"Someone is about to meet {company}: a {kind} titled \\\"{title}\\\". Summarise what they should know, using ONLY the sources below.\\nIn under 200 words: what the company does and its scale (from its website), then the 3 to 5 developments from the news that the\\npeople in the meeting will most likely have on their minds (results, costs, leadership, strategy, problems), each with its date.\\nDo not add anything that is not in these sources. If the sources say little, say so. Plain text.\\n\\nRecent news headlines (date, publisher, headline):\\n{news}\\n\\nFrom their website:\\n{website}\\n\\nFrom a web search (only when the news had little; facts as reported, with dates):\\n{web}\".replace('{company}', $json.meeting.company).replace('{kind}', $json.meeting.kind).replace('{title}', $json.meeting.title).replace('{news}', $json.news.map(n => n.date + ' | ' + n.publisher + ' | ' + n.title).join('\\n') || 'None found.').replace('{website}', $json.website || 'Not available.').replace('{web}', $json.web_found || 'Not searched.') }] }] }) }}"),
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

const researchGroq = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Research the company (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = ((() => { try { return $('Add the web results').isExecuted; } catch (e) { return false; } })() ? $('Add the web results') : $('Gather the sources')).first().json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: (\"Someone is about to meet {company}: a {kind} titled \\\"{title}\\\". Summarise what they should know, using ONLY the sources below.\\nIn under 200 words: what the company does and its scale (from its website), then the 3 to 5 developments from the news that the\\npeople in the meeting will most likely have on their minds (results, costs, leadership, strategy, problems), each with its date.\\nDo not add anything that is not in these sources. If the sources say little, say so. Plain text.\\n\\nRecent news headlines (date, publisher, headline):\\n{news}\\n\\nFrom their website:\\n{website}\\n\\nFrom a web search (only when the news had little; facts as reported, with dates):\\n{web}\".replace('{company}', j.meeting.company).replace('{kind}', j.meeting.kind).replace('{title}', j.meeting.title).replace('{news}', j.news.map(n => n.date + ' | ' + n.publisher + ' | ' + n.title).join('\\n') || 'None found.').replace('{website}', j.website || 'Not available.').replace('{web}', j.web_found || 'Not searched.')) }] }); })() }}"),
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

const readResearch = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Read the research",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// The research summary, with the news it was written from as sources\nconst research = replyText($json);\n// Came straight from the news, or through the web search when the news had little\nconst searched = (() => { try { return $('Add the web results').isExecuted; } catch (e) { return false; } })();\nconst prev = searched ? $('Add the web results').first().json : $('Gather the sources').first().json;\nconst web = prev.web || [];\nconst sources = prev.news.slice(0, 8).map(n => ({ title: (n.publisher ? n.publisher + ': ' : '') + n.title, url: n.url, date: n.date, site: n.site }))\n  .concat(web.map(w => ({ title: w.title, url: w.url, site: w.site })));\nreturn [{ json: { meeting: prev.meeting, emails: prev.emails, research, sources, news_count: prev.news.length, has_website: !!prev.website,\n                  web_searched: searched, web_count: web.length, web_error: prev.web_error || '' } }];"
    },
    "output": [
  {
    "meeting": {
      "meeting_id": "evt123",
      "title": "RouteIQ pitch",
      "start": "2026-10-16T15:00:00+05:30",
      "description": "",
      "attendees": [
        {
          "name": "Priya Nair",
          "email": "priya.nair@delhivery.com"
        }
      ],
      "owner_email": "you@example.com",
      "from_web": false,
      "company": "Delhivery",
      "company_domain": "delhivery.com",
      "kind": "sales_pitch",
      "why": ""
    },
    "emails": "",
    "research": "",
    "sources": [],
    "news_count": 0,
    "has_website": false,
    "web_searched": false,
    "web_count": 0,
    "web_error": ""
  }
]
  }
});

const progressResearch = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Progress: researched",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const ran = name => { try { return $(name).isExecuted; } catch (e) { return false; } };\nconst out = name => (ran(name) ? $(name).first().json : null);\nconst decision = out('Read the decision') || {};\nconst mail = out('Summarise the emails');\nconst research = out('Read the research');\nconst seated = out('Seat the panel');\nconst sent = out('Email the brief');\nconst names = (decision.attendees || []).map(a => a.name).join(' and ') || 'the attendees';\nconst company = decision.company || 'the company';\n// n8n's code sandbox has no URL class, so read the host by hand: https://www.zeebiz.com/x -> zeebiz.com\nconst host = u => { const h = String(u || '').split('//').pop().split('/')[0]; return h.startsWith('www.') ? h.slice(4) : h; };\nconst sites = research ? [...new Set(research.sources.map(x => host(x.site || x.url)).filter(Boolean))] : [];\nconst attending = seated ? seated.proposal.members.filter(m => m.source === 'email').length : 0;\nconst practising = seated ? seated.proposal.members.length - attending : 0;\nconst suggested = seated ? (seated.proposal.suggestions || []).length : 0;\nconst step = (id, label, done, running, doneText, runningText, extra) =>\n  ({ id, label, state: done ? 'done' : running ? 'running' : 'pending', detail: done ? doneText : running ? runningText : '', ...(extra || {}) });\nconst progress = [\n  step('decide', 'Decide', true, false, decision.why || 'Worth preparing', ''),\n  step('emails', 'Emails', !!mail, true,\n    mail && mail.count ? 'Read ' + mail.count + ' recent email' + (mail.count === 1 ? '' : 's') + ' with ' + names : 'No recent emails with ' + names,\n    'Reading your recent emails with ' + names),\n  step('research', 'Research', !!research, !!mail,\n    research ? 'Read ' + research.news_count + ' recent news stor' + (research.news_count === 1 ? 'y' : 'ies') + ' about ' + company + (research.has_website ? ' and their website' : '')\n      + (!research.web_searched ? '' : research.web_count ? ', then searched the web (' + research.web_count + ' page' + (research.web_count === 1 ? '' : 's') + ')'\n         : \". Little news, and web search isn't available on this Gemini key\") : '',\n    'Reading the news about ' + company + ' and their website',\n    { sources: sites.slice(0, 8).map(h => ({ title: h, url: 'https://' + h })) }),\n  step('brief', 'Brief', !!seated, !!research,\n    seated ? 'Wrote ' + seated.brief.questions.length + ' likely questions and ' + seated.brief.risks.length + ' risks' : '', 'Writing your brief and the hardest questions'),\n  step('panel', 'Panel', !!seated, !!research,\n    'Seated ' + attending + ' from the invite' + (practising ? ' and ' + practising + ' practice role' + (practising === 1 ? '' : 's') : '') + '; suggested '\n      + suggested + ' more to practise against', 'Seating the practice panel'),\n  step('email', 'Email', !!sent && !sent.error, !!seated,\n    'Emailed you the brief', 'Emailing you the brief'),\n];\nif (sent && sent.error) Object.assign(progress[5], { state: 'error', detail: \"Couldn't email the brief\" });\nconst progressFields = { progress: JSON.stringify(progress), execution_id: String($execution.id), workflow_id: String($workflow.id) };\n\n// Save how far n8n has got, for the live progress on the brief page\nreturn [{ json: { meeting_id: $('Read the decision').first().json.meeting_id, ...progressFields } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "progress": "[]"
  }
]
  }
});

const saveProgressResearch = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save progress: research",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "wURCb4PjdZLpttns",
        "cachedResultName": "DryRun meetings"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "meeting_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.meeting_id }}")
          }
        ]
      },
      "columns": {
        "mappingMode": "autoMapInputData",
        "value": null
      }
    },
    "output": [
  {
    "id": 1
  }
]
  }
});

const brief = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Write the brief and panel",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: \"You prepare a presenter for a high-stakes meeting. Write their brief, which they will rely on, so it must be accurate.\\n\\nMeeting:\\n{meeting}\\n\\nRecent emails with them:\\n{emails}\\n\\nResearch on the company (from the news, their website and a web search):\\n{research}\\n\\nRules:\\n- attendees: ONLY people named in the meeting invite or the emails above, with their real names. Never add anyone else.\\n  role: only if the invite or emails state it (e.g. \\\"Rajiv from finance\\\" -> \\\"Finance\\\"); otherwise an empty string. Never guess a title.\\n  likely_focus: what they will most likely care about or push on in this meeting, based only on the emails and research.\\n- practice_panel: 3 to 5 people the presenter could add to a rehearsal, playing the roles that usually influence a decision like this at a\\n  company like this (e.g. CTO, procurement) and who are not already among the attendees, most influential first. Give them invented,\\n  realistic Indian names. Never use the names of real people found in the research. These are clearly hypothetical and are never presented\\n  as attendees: the presenter rehearses against the real attendees and adds these if they want.\\n- questions: the 5 hardest questions likely to come up. asked_by: the name of the attendee most likely to ask it, or \\\"\\\" if it is not\\n  clearly one of them. Never attribute a question to a practice_panel person. Include why it is likely and a short suggested answer.\\n- risks: what could lose this meeting, in short phrases, grounded in the emails and research.\\n- recent_news: only facts stated in the research above, each with its date. Do not add facts that are not in the research.\\n- pitch: how many minutes the presenter should plan to pitch in this meeting (whole minutes, 1 to 60), leaving the rest of the slot for\\n  discussion, from the meeting's length in minutes (if known) and the kind of meeting; why: one sentence, e.g. \\\"30-minute call: about\\n  10 minutes of pitch, the rest for their questions\\\".\\nAnswer in JSON.\".replace('{meeting}', JSON.stringify($('Read the research').first().json.meeting)).replace('{emails}', $('Read the research').first().json.emails).replace('{research}', $('Read the research').first().json.research) }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"summary\": {\"type\": \"string\", \"description\": \"2 sentences: what this meeting is and what will decide it\"}, \"what_they_do\": {\"type\": \"string\"}, \"recent_news\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"text\": {\"type\": \"string\"}, \"date\": {\"type\": \"string\"} }, \"required\": [\"text\", \"date\"]} }, \"attendees\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"name\": {\"type\": \"string\"}, \"email\": {\"type\": \"string\"}, \"role\": {\"type\": \"string\", \"description\": \"Only if stated in the invite or emails, else empty\"}, \"gender\": {\"type\": \"string\", \"enum\": [\"male\", \"female\"], \"description\": \"Best guess from the name, only used to pick a rehearsal avatar\"}, \"likely_focus\": {\"type\": \"string\"} }, \"required\": [\"name\", \"email\", \"role\", \"gender\", \"likely_focus\"]} }, \"practice_panel\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"name\": {\"type\": \"string\", \"description\": \"Invented\"}, \"role\": {\"type\": \"string\"}, \"role_short\": {\"type\": \"string\", \"description\": \"2 to 12 characters, e.g. CFO\"}, \"gender\": {\"type\": \"string\", \"enum\": [\"male\", \"female\"]}, \"why\": {\"type\": \"string\", \"description\": \"Why this role usually influences a decision like this\"}, \"will_push_on\": {\"type\": \"string\"} }, \"required\": [\"name\", \"role\", \"role_short\", \"gender\", \"why\", \"will_push_on\"]} }, \"questions\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"question\": {\"type\": \"string\"}, \"asked_by\": {\"type\": \"string\"}, \"why\": {\"type\": \"string\"}, \"suggested_answer\": {\"type\": \"string\"} }, \"required\": [\"question\", \"asked_by\", \"why\", \"suggested_answer\"]} }, \"risks\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} }, \"pitch\": {\"type\": \"object\", \"properties\": {\"minutes\": {\"type\": \"integer\"}, \"why\": {\"type\": \"string\"} }, \"required\": [\"minutes\", \"why\"]} }, \"required\": [\"summary\", \"what_they_do\", \"recent_news\", \"attendees\", \"practice_panel\", \"questions\", \"risks\", \"pitch\"]} } }) }}"),
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

const briefGroq = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Write the brief and panel (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: (\"You prepare a presenter for a high-stakes meeting. Write their brief, which they will rely on, so it must be accurate.\\n\\nMeeting:\\n{meeting}\\n\\nRecent emails with them:\\n{emails}\\n\\nResearch on the company (from the news, their website and a web search):\\n{research}\\n\\nRules:\\n- attendees: ONLY people named in the meeting invite or the emails above, with their real names. Never add anyone else.\\n  role: only if the invite or emails state it (e.g. \\\"Rajiv from finance\\\" -> \\\"Finance\\\"); otherwise an empty string. Never guess a title.\\n  likely_focus: what they will most likely care about or push on in this meeting, based only on the emails and research.\\n- practice_panel: 3 to 5 people the presenter could add to a rehearsal, playing the roles that usually influence a decision like this at a\\n  company like this (e.g. CTO, procurement) and who are not already among the attendees, most influential first. Give them invented,\\n  realistic Indian names. Never use the names of real people found in the research. These are clearly hypothetical and are never presented\\n  as attendees: the presenter rehearses against the real attendees and adds these if they want.\\n- questions: the 5 hardest questions likely to come up. asked_by: the name of the attendee most likely to ask it, or \\\"\\\" if it is not\\n  clearly one of them. Never attribute a question to a practice_panel person. Include why it is likely and a short suggested answer.\\n- risks: what could lose this meeting, in short phrases, grounded in the emails and research.\\n- recent_news: only facts stated in the research above, each with its date. Do not add facts that are not in the research.\\n- pitch: how many minutes the presenter should plan to pitch in this meeting (whole minutes, 1 to 60), leaving the rest of the slot for\\n  discussion, from the meeting's length in minutes (if known) and the kind of meeting; why: one sentence, e.g. \\\"30-minute call: about\\n  10 minutes of pitch, the rest for their questions\\\".\\nAnswer in JSON.\".replace('{meeting}', JSON.stringify($('Read the research').first().json.meeting)).replace('{emails}', $('Read the research').first().json.emails).replace('{research}', $('Read the research').first().json.research)) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"summary\": {\"type\": \"string\", \"description\": \"2 sentences: what this meeting is and what will decide it\"}, \"what_they_do\": {\"type\": \"string\"}, \"recent_news\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"text\": {\"type\": \"string\"}, \"date\": {\"type\": \"string\"} }, \"required\": [\"text\", \"date\"]} }, \"attendees\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"name\": {\"type\": \"string\"}, \"email\": {\"type\": \"string\"}, \"role\": {\"type\": \"string\", \"description\": \"Only if stated in the invite or emails, else empty\"}, \"gender\": {\"type\": \"string\", \"enum\": [\"male\", \"female\"], \"description\": \"Best guess from the name, only used to pick a rehearsal avatar\"}, \"likely_focus\": {\"type\": \"string\"} }, \"required\": [\"name\", \"email\", \"role\", \"gender\", \"likely_focus\"]} }, \"practice_panel\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"name\": {\"type\": \"string\", \"description\": \"Invented\"}, \"role\": {\"type\": \"string\"}, \"role_short\": {\"type\": \"string\", \"description\": \"2 to 12 characters, e.g. CFO\"}, \"gender\": {\"type\": \"string\", \"enum\": [\"male\", \"female\"]}, \"why\": {\"type\": \"string\", \"description\": \"Why this role usually influences a decision like this\"}, \"will_push_on\": {\"type\": \"string\"} }, \"required\": [\"name\", \"role\", \"role_short\", \"gender\", \"why\", \"will_push_on\"]} }, \"questions\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"question\": {\"type\": \"string\"}, \"asked_by\": {\"type\": \"string\"}, \"why\": {\"type\": \"string\"}, \"suggested_answer\": {\"type\": \"string\"} }, \"required\": [\"question\", \"asked_by\", \"why\", \"suggested_answer\"]} }, \"risks\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} }, \"pitch\": {\"type\": \"object\", \"properties\": {\"minutes\": {\"type\": \"integer\"}, \"why\": {\"type\": \"string\"} }, \"required\": [\"minutes\", \"why\"]} }, \"required\": [\"summary\", \"what_they_do\", \"recent_news\", \"attendees\", \"practice_panel\", \"questions\", \"risks\", \"pitch\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
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

const seatPanel = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Seat the panel",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// The brief keeps only real attendees. The practice panel seats the real people from outside the presenter's organisation (contract 0.22);\n// the hypothetical practice roles are suggestions the presenter can add with one tap, each a whole person with a name and a face.\n// Only when no real attendee is known are the top two practice roles seated, so there is someone to pitch to.\n// Everyone gets a chair, a colour and a face, as the contract's /panel response (docs/CONTRACT.md).\nconst prev = $('Read the research').first().json;\nconst b = JSON.parse(replyText($json) || '{}');\nconst attendees = (b.attendees || []).filter(a => a.name);\n// Colleagues from the presenter's own company are on their side of the table (a public mail domain says nothing)\nconst PUBLIC = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'rediffmail.com'];\nconst domain = e => String(e || '').toLowerCase().split('@')[1] || '';\nconst own = domain(prev.meeting.owner_email);\nconst external = attendees.filter(a => !own || PUBLIC.includes(own) || domain(a.email) !== own);\nconst practice = (b.practice_panel || []).filter(p => p.name && p.role);\nconst SEATS = [0, 1, 5, 2, 6, 3, 7, 4, 8];\nconst FACES = { female: ['business_female_01', 'business_female_02', 'business_female_03', 'business_female_04'],\n                male: ['business_male_01', 'business_male_02', 'business_male_03', 'business_male_04', 'business_male_05', 'business_male_06', 'business_male_07'] };\nconst used = { female: 0, male: 0 };\nconst face = gender => {\n  let g = gender === 'female' ? 'female' : 'male';\n  if (used[g] >= FACES[g].length) g = g === 'female' ? 'male' : 'female';\n  const f = FACES[g][used[g] % FACES[g].length];\n  used[g] += 1;\n  return f;\n};\n// A real person's role only if the invite or emails state it: empty means the presenter fills it in\nconst short = role => !role ? '' : role.length <= 12 ? role : role.split(/\\s+/).filter(w => !['of', 'and', 'the', '&'].includes(w.toLowerCase())).map(w => w[0].toUpperCase()).join('').slice(0, 5);\nconst people = external.slice(0, 6).map(a => ({ display_name: a.name, role: a.role || '', role_short: short(a.role), gender: a.gender,\n  why: 'In the meeting invite', source: 'email', will_push_on: a.likely_focus }));\nconst asPerson = p => ({ display_name: p.name, role: p.role, role_short: p.role_short || short(p.role), gender: p.gender, why: p.why, source: 'typical', will_push_on: p.will_push_on });\nconst seatedPractice = people.length ? [] : practice.slice(0, 2);\nconst members = people.concat(seatedPractice.map(asPerson)).map((m, i) => ({ id: 'p' + (i + 1), seat: SEATS[i], color: i, avatar: face(m.gender), ...m }));\n// The rest of the practice roles, ranked, each with a face of its own so adding one seats a ready person\nconst suggestions = practice.slice(seatedPractice.length).map(p => ({ ...asPerson(p), avatar: face(p.gender) }));\nconst brief = {\n  summary: b.summary || '', company: { what_they_do: b.what_they_do || '', recent_news: b.recent_news || [] },\n  attendees: attendees.map(a => ({ name: a.name, email: a.email || '', role: a.role || '', likely_focus: a.likely_focus || '' })),\n  questions: b.questions || [], risks: b.risks || [], sources: prev.sources.slice(0, 12),\n};\n// n8n's suggested pitch length (contract 0.18: proposal.pitch), kept to whole minutes from 1 to 60\nconst pitch = b.pitch && b.pitch.minutes ? { minutes: Math.max(1, Math.min(60, Math.round(b.pitch.minutes))), why: b.pitch.why || '' } : undefined;\nconst proposal = { draft_id: prev.meeting.meeting_id, members, suggestions, ...(pitch ? { pitch } : {}) };\nreturn [{ json: { meeting: prev.meeting, brief, proposal } }];"
    },
    "output": [
  {
    "meeting": {
      "meeting_id": "evt123",
      "title": "RouteIQ pitch",
      "start": "2026-10-16T15:00:00+05:30",
      "description": "",
      "attendees": [
        {
          "name": "Priya Nair",
          "email": "priya.nair@delhivery.com"
        }
      ],
      "owner_email": "you@example.com",
      "from_web": false,
      "company": "Delhivery",
      "company_domain": "delhivery.com",
      "kind": "sales_pitch",
      "why": ""
    },
    "brief": {},
    "proposal": {}
  }
]
  }
});

const rowReady = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Row: ready",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const ran = name => { try { return $(name).isExecuted; } catch (e) { return false; } };\nconst out = name => (ran(name) ? $(name).first().json : null);\nconst decision = out('Read the decision') || {};\nconst mail = out('Summarise the emails');\nconst research = out('Read the research');\nconst seated = out('Seat the panel');\nconst sent = out('Email the brief');\nconst names = (decision.attendees || []).map(a => a.name).join(' and ') || 'the attendees';\nconst company = decision.company || 'the company';\n// n8n's code sandbox has no URL class, so read the host by hand: https://www.zeebiz.com/x -> zeebiz.com\nconst host = u => { const h = String(u || '').split('//').pop().split('/')[0]; return h.startsWith('www.') ? h.slice(4) : h; };\nconst sites = research ? [...new Set(research.sources.map(x => host(x.site || x.url)).filter(Boolean))] : [];\nconst attending = seated ? seated.proposal.members.filter(m => m.source === 'email').length : 0;\nconst practising = seated ? seated.proposal.members.length - attending : 0;\nconst suggested = seated ? (seated.proposal.suggestions || []).length : 0;\nconst step = (id, label, done, running, doneText, runningText, extra) =>\n  ({ id, label, state: done ? 'done' : running ? 'running' : 'pending', detail: done ? doneText : running ? runningText : '', ...(extra || {}) });\nconst progress = [\n  step('decide', 'Decide', true, false, decision.why || 'Worth preparing', ''),\n  step('emails', 'Emails', !!mail, true,\n    mail && mail.count ? 'Read ' + mail.count + ' recent email' + (mail.count === 1 ? '' : 's') + ' with ' + names : 'No recent emails with ' + names,\n    'Reading your recent emails with ' + names),\n  step('research', 'Research', !!research, !!mail,\n    research ? 'Read ' + research.news_count + ' recent news stor' + (research.news_count === 1 ? 'y' : 'ies') + ' about ' + company + (research.has_website ? ' and their website' : '')\n      + (!research.web_searched ? '' : research.web_count ? ', then searched the web (' + research.web_count + ' page' + (research.web_count === 1 ? '' : 's') + ')'\n         : \". Little news, and web search isn't available on this Gemini key\") : '',\n    'Reading the news about ' + company + ' and their website',\n    { sources: sites.slice(0, 8).map(h => ({ title: h, url: 'https://' + h })) }),\n  step('brief', 'Brief', !!seated, !!research,\n    seated ? 'Wrote ' + seated.brief.questions.length + ' likely questions and ' + seated.brief.risks.length + ' risks' : '', 'Writing your brief and the hardest questions'),\n  step('panel', 'Panel', !!seated, !!research,\n    'Seated ' + attending + ' from the invite' + (practising ? ' and ' + practising + ' practice role' + (practising === 1 ? '' : 's') : '') + '; suggested '\n      + suggested + ' more to practise against', 'Seating the practice panel'),\n  step('email', 'Email', !!sent && !sent.error, !!seated,\n    'Emailed you the brief', 'Emailing you the brief'),\n];\nif (sent && sent.error) Object.assign(progress[5], { state: 'error', detail: \"Couldn't email the brief\" });\nconst progressFields = { progress: JSON.stringify(progress), execution_id: String($execution.id), workflow_id: String($workflow.id) };\n\nconst s = $('Seat the panel').first().json;\nreturn [{ json: { meeting_id: s.meeting.meeting_id, status: 'ready', brief: JSON.stringify(s.brief), proposal: JSON.stringify(s.proposal), updated_at: new Date().toISOString(), ...progressFields } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "status": "ready"
  }
]
  }
});

const saveReady = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save: brief ready",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "wURCb4PjdZLpttns",
        "cachedResultName": "DryRun meetings"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "meeting_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.meeting_id }}")
          }
        ]
      },
      "columns": {
        "mappingMode": "autoMapInputData",
        "value": null
      }
    },
    "output": [
  {
    "id": 1
  }
]
  }
});

const emailBrief = node({
  type: "n8n-nodes-base.gmail",
  version: 2.2,
  config: {
    "name": "Email the brief",
    "parameters": {
      "resource": "message",
      "operation": "send",
      "sendTo": expr("{{ $('Seat the panel').first().json.meeting.owner_email }}"),
      "subject": expr("Your brief for {{ $('Seat the panel').first().json.meeting.title }} is ready"),
      "emailType": "html",
      "message": expr("{{ (() => { const s = $('Seat the panel').first().json; const m = s.meeting; const b = s.brief; const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); const li = xs => xs.length ? '<ul>' + xs.join('') + '</ul>' : '<p>None found.</p>'; const names = b.attendees.map(a => a.name); return '<h2>' + esc(m.title) + ' with ' + esc(m.company) + '</h2><p>' + esc(b.summary) + '</p>' + '<h3>Who is coming</h3>' + li(b.attendees.map(a => '<li><b>' + esc(a.name) + '</b>' + (a.role ? ' (' + esc(a.role) + ')' : '') + '. Likely focus: ' + esc(a.likely_focus) + '</li>')) + '<h3>Questions likely to come up</h3>' + li(b.questions.map(q => '<li>' + esc(q.question) + (names.includes(q.asked_by) ? ' <i>(likely from ' + esc(q.asked_by) + ')</i>' : '') + '<br><small>Suggested answer: ' + esc(q.suggested_answer) + '</small></li>')) + '<h3>What could lose it</h3>' + li(b.risks.map(r => '<li>' + esc(r) + '</li>')) + '<h3>Recent news about ' + esc(m.company) + '</h3>' + li(b.company.recent_news.map(n => '<li>' + esc(n.date) + ': ' + esc(n.text) + '</li>')) + '<p><small>Sources: ' + b.sources.map(x => '<a href=\"' + x.url + '\">' + esc(x.title || 'link') + '</a>').join(', ') + '</small></p>' + '<p><a href=\"http://localhost:3000/m/' + encodeURIComponent(m.meeting_id) + '\">Open the brief and practise in DryRun</a>. The practice panel there adds hypothetical roles to rehearse against.</p>'; })() }}"),
      "options": {
        "appendAttribution": false
      }
    },
    "onError": "continueRegularOutput",
    "credentials": { "gmailOAuth2": newCredential("Gmail") },
    "output": [
  {
    "id": "msg1"
  }
]
  }
});

const progressEmailed = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Progress: emailed",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const ran = name => { try { return $(name).isExecuted; } catch (e) { return false; } };\nconst out = name => (ran(name) ? $(name).first().json : null);\nconst decision = out('Read the decision') || {};\nconst mail = out('Summarise the emails');\nconst research = out('Read the research');\nconst seated = out('Seat the panel');\nconst sent = out('Email the brief');\nconst names = (decision.attendees || []).map(a => a.name).join(' and ') || 'the attendees';\nconst company = decision.company || 'the company';\n// n8n's code sandbox has no URL class, so read the host by hand: https://www.zeebiz.com/x -> zeebiz.com\nconst host = u => { const h = String(u || '').split('//').pop().split('/')[0]; return h.startsWith('www.') ? h.slice(4) : h; };\nconst sites = research ? [...new Set(research.sources.map(x => host(x.site || x.url)).filter(Boolean))] : [];\nconst attending = seated ? seated.proposal.members.filter(m => m.source === 'email').length : 0;\nconst practising = seated ? seated.proposal.members.length - attending : 0;\nconst suggested = seated ? (seated.proposal.suggestions || []).length : 0;\nconst step = (id, label, done, running, doneText, runningText, extra) =>\n  ({ id, label, state: done ? 'done' : running ? 'running' : 'pending', detail: done ? doneText : running ? runningText : '', ...(extra || {}) });\nconst progress = [\n  step('decide', 'Decide', true, false, decision.why || 'Worth preparing', ''),\n  step('emails', 'Emails', !!mail, true,\n    mail && mail.count ? 'Read ' + mail.count + ' recent email' + (mail.count === 1 ? '' : 's') + ' with ' + names : 'No recent emails with ' + names,\n    'Reading your recent emails with ' + names),\n  step('research', 'Research', !!research, !!mail,\n    research ? 'Read ' + research.news_count + ' recent news stor' + (research.news_count === 1 ? 'y' : 'ies') + ' about ' + company + (research.has_website ? ' and their website' : '')\n      + (!research.web_searched ? '' : research.web_count ? ', then searched the web (' + research.web_count + ' page' + (research.web_count === 1 ? '' : 's') + ')'\n         : \". Little news, and web search isn't available on this Gemini key\") : '',\n    'Reading the news about ' + company + ' and their website',\n    { sources: sites.slice(0, 8).map(h => ({ title: h, url: 'https://' + h })) }),\n  step('brief', 'Brief', !!seated, !!research,\n    seated ? 'Wrote ' + seated.brief.questions.length + ' likely questions and ' + seated.brief.risks.length + ' risks' : '', 'Writing your brief and the hardest questions'),\n  step('panel', 'Panel', !!seated, !!research,\n    'Seated ' + attending + ' from the invite' + (practising ? ' and ' + practising + ' practice role' + (practising === 1 ? '' : 's') : '') + '; suggested '\n      + suggested + ' more to practise against', 'Seating the practice panel'),\n  step('email', 'Email', !!sent && !sent.error, !!seated,\n    'Emailed you the brief', 'Emailing you the brief'),\n];\nif (sent && sent.error) Object.assign(progress[5], { state: 'error', detail: \"Couldn't email the brief\" });\nconst progressFields = { progress: JSON.stringify(progress), execution_id: String($execution.id), workflow_id: String($workflow.id) };\n\n// Save how far n8n has got, for the live progress on the brief page\nreturn [{ json: { meeting_id: $('Read the decision').first().json.meeting_id, ...progressFields } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "progress": "[]"
  }
]
  }
});

const saveProgressEmailed = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save progress: emailed",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "wURCb4PjdZLpttns",
        "cachedResultName": "DryRun meetings"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "meeting_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.meeting_id }}")
          }
        ]
      },
      "columns": {
        "mappingMode": "autoMapInputData",
        "value": null
      }
    },
    "output": [
  {
    "id": 1
  }
]
  }
});

const onFailure = trigger({
  type: "n8n-nodes-base.errorTrigger",
  version: 1,
  config: {
    "name": "If a run fails",
    "parameters": {},
    "output": [
  {
    "execution": {
      "id": "12",
      "error": {
        "message": "quota"
      },
      "lastNodeExecuted": "Research the company"
    },
    "workflow": {
      "id": "wf"
    }
  }
]
  }
});

const findRun = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Find its meeting",
    "parameters": {
      "resource": "row",
      "operation": "get",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "wURCb4PjdZLpttns",
        "cachedResultName": "DryRun meetings"
      },
      "matchType": "anyCondition",
      "filters": {
        "conditions": [
          {
            "keyName": "execution_id",
            "condition": "eq",
            "keyValue": expr("{{ String($json.execution.id) }}")
          }
        ]
      }
    },
    "output": [
  {
    "meeting_id": "evt123",
    "progress": "[]"
  }
]
  }
});

const markFailed = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Mark it failed",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Show where it stopped and why, instead of leaving the page on \"researching\" forever\nconst failure = $('If a run fails').first().json.execution || {};\nconst message = (failure.error && (failure.error.description || failure.error.message)) || 'Something went wrong';\nconst reason = /quota|too many requests|rate limit/i.test(message)\n  ? \"Gemini and the Groq fallback are both out of quota. Try again in a minute, or turn on billing for Gemini.\"\n  : message.split('\\n')[0].slice(0, 160);\nreturn $input.all().map(({ json: row }) => {\n  let progress = [];\n  try { progress = JSON.parse(row.progress || '[]'); } catch (e) { progress = []; }\n  const stuck = progress.find(s => s.state === 'running') || progress.find(s => s.state === 'pending');\n  if (stuck) Object.assign(stuck, { state: 'error', detail: reason });\n  return { json: { meeting_id: row.meeting_id, status: 'failed', progress: JSON.stringify(progress), updated_at: new Date().toISOString() } };\n});"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "status": "failed"
  }
]
  }
});

const saveFailed = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save: failed",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "wURCb4PjdZLpttns",
        "cachedResultName": "DryRun meetings"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "meeting_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.meeting_id }}")
          }
        ]
      },
      "columns": {
        "mappingMode": "autoMapInputData",
        "value": null
      }
    },
    "output": [
  {
    "id": 1
  }
]
  }
});

const about = sticky('## DryRun prep\nSpots important meetings on your calendar and prepares you for them: decides if it is worth it, reads your emails with the attendees, researches the company, writes the brief, proposes the panel, saves it to the DryRun meetings table and emails you. The web app can also add a meeting by hand.', [calendarTrigger, webTrigger], { color: 4 });

export default workflow('dryrun-prep', 'DryRun prep')
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
