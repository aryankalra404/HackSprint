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
      "jsCode": "// One meeting per calendar event, in the shape the rest of the workflow (and docs/CONTRACT.md) uses\nreturn $input.all().map(({ json: e }) => {\n  const attendees = (e.attendees || []).map(a => ({ name: a.displayName || a.email.split('@')[0], email: a.email, self: !!a.self }));\n  const self = attendees.find(a => a.self) || { email: (e.creator && e.creator.email) || (e.organizer && e.organizer.email) || '' };\n  return { json: {\n    meeting_id: e.id,\n    title: e.summary || 'Untitled meeting',\n    start: (e.start && (e.start.dateTime || e.start.date)) || '',\n    description: (e.description || '').replace(/<[^>]+>/g, ' ').slice(0, 2000),\n    attendees: attendees.filter(a => !a.self).map(a => ({ name: a.name, email: a.email })),\n    owner_email: self.email,\n    from_web: false,\n  } };\n});"
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
      "jsCode": "// The web app sends { title, start, company, website, context, attendees: [{ name, email }], owner_email }\nreturn $input.all().map(({ json }) => {\n  const b = json.body || json;\n  return { json: {\n    meeting_id: 'web-' + Date.now(),\n    title: b.title || ('Meeting with ' + (b.company || 'a prospect')),\n    start: b.start || new Date(Date.now() + 2 * 86400000).toISOString(),\n    description: [b.company && ('Company: ' + b.company), b.website && ('Website: ' + b.website), b.context].filter(Boolean).join('\\n').slice(0, 4000),\n    attendees: b.attendees || [],\n    owner_email: b.owner_email || '',\n    from_web: true,\n  } };\n});"
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
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: \"You decide which calendar events are worth preparing a rehearsal for. The presenter is the attendee marked \\\"self\\\".\\nPrepare for high-stakes conversations with people outside the presenter's organisation where they must persuade or perform:\\nsales pitches and demos, investor pitches, interviews, client reviews, partnership talks. Skip internal syncs, standups,\\n1:1s with colleagues, personal events and anything with no external attendee.\\n\\\"why\\\" is one specific sentence for the presenter: who is coming and what is at stake.\\n\\nEvent:\\n\" + JSON.stringify($json, null, 1) }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"prepare\": {\"type\": \"boolean\"}, \"why\": {\"type\": \"string\"}, \"company\": {\"type\": \"string\", \"description\": \"The external organisation, or empty\"}, \"company_domain\": {\"type\": \"string\", \"description\": \"Their email or web domain, or empty\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"sales_pitch\", \"investor_pitch\", \"interview\", \"client_review\", \"partnership\", \"internal\", \"personal\", \"other\"]} }, \"required\": [\"prepare\", \"why\", \"company\", \"company_domain\", \"kind\"]} } }) }}"),
      "options": {
        "timeout": 120000
      }
    },
    "retryOnFail": true,
    "maxTries": 3,
    "waitBetweenTries": 3000,
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

const readDecision = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Read the decision",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Gemini's answer, merged back into the meeting it was about. Meetings added from the web app are always prepared.\nconst shaped = $('Shape the event').isExecuted ? $('Shape the event').all() : $('Shape the request').all();\nreturn $input.all().map((item, i) => {\n  const parts = (item.json.candidates && item.json.candidates[0] && item.json.candidates[0].content && item.json.candidates[0].content.parts) || [];\n  const d = JSON.parse(parts.map(p => p.text || '').join('') || '{}');\n  const m = shaped[i].json;\n  const domain = d.company_domain || ((m.attendees[0] && m.attendees[0].email) || '').split('@')[1] || '';\n  return { json: { ...m, prepare: m.from_web || !!d.prepare, why: d.why || '', company: d.company || m.title, company_domain: domain, kind: d.kind || 'other' } };\n});"
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

const skip = node({
  type: "n8n-nodes-base.noOp",
  version: 1,
  config: {
    "name": "Not worth it",
    "parameters": {},
    "output": [
  {}
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
      "jsCode": "// The meeting as a row in the DryRun meetings table, while n8n works on it\nreturn $input.all().map(({ json: m }) => ({ json: {\n  meeting_id: m.meeting_id, title: m.title, start: m.start, company: m.company, kind: m.kind, why: m.why,\n  attendees: JSON.stringify(m.attendees), owner_email: m.owner_email, status: 'researching',\n  brief: '', proposal: '', updated_at: new Date().toISOString(),\n} }));"
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
        "value": "86BWrDlUXrOWFgqc",
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
      "jsCode": "// The recent thread with the attendees, as short text for the brief\nconst msgs = $input.all().map(i => i.json).filter(m => m.snippet);\nconst meeting = $('Read the decision').first().json;\nconst emails = msgs.slice(0, 10).map(m => 'From ' + (m.From || '') + ' (' + (m.Subject || '') + '): ' + (m.snippet || '').slice(0, 400)).join('\\n') || 'No recent emails.';\nreturn [{ json: { meeting, emails } }];"
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
    "emails": "No recent emails."
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
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: \"Research {company} ({domain}) for someone about to meet them: a {kind} titled \\\"{title}\\\".\\nIn under 200 words: what they do, their scale, and the 3 to 5 most relevant recent developments (with dates) that the people\\nin the meeting will have on their minds: results, costs, leadership, strategy, problems. Plain text.\".replace('{company}', $json.meeting.company).replace('{domain}', $json.meeting.company_domain).replace('{kind}', $json.meeting.kind).replace('{title}', $json.meeting.title) }] }], tools: [{ google_search: {} }] }) }}"),
      "options": {
        "timeout": 120000
      }
    },
    "retryOnFail": true,
    "maxTries": 3,
    "waitBetweenTries": 3000,
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

const readResearch = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Read the research",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The grounded research text and its web sources\nconst c = ($json.candidates && $json.candidates[0]) || {};\nconst research = ((c.content && c.content.parts) || []).map(p => p.text || '').join('');\nconst sources = ((c.groundingMetadata && c.groundingMetadata.groundingChunks) || []).filter(g => g.web).map(g => ({ title: g.web.title || '', url: g.web.uri }));\nconst prev = $('Summarise the emails').first().json;\nreturn [{ json: { ...prev, research, sources } }];"
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
    "sources": []
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
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: \"You prepare a presenter for a high-stakes meeting. Write their brief and decide who will be in the room.\\n\\nMeeting:\\n{meeting}\\n\\nRecent emails with them:\\n{emails}\\n\\nResearch on the company:\\n{research}\\n\\nRules:\\n- panel: 4 to 6 people. Real attendees from the invite and the emails come first, with their real names (source \\\"email\\\").\\n  Then add the roles that usually decide a deal like this at a company like this (source \\\"research\\\" or \\\"typical\\\") with\\n  invented, realistic Indian names. Never use the names of real people found in the research, and never invent facts about real attendees beyond their role.\\n- Each person's will_push_on must be specific to this meeting, citing the research or emails where possible, not generic.\\n- questions: the 5 hardest questions they will ask, each with asked_by (a panel name), why they will ask it, and a short suggested answer.\\n- suggestions: 2 or 3 more roles that could be in the room, with why.\\n- risks: what could lose this meeting, in short phrases.\\nAnswer in JSON.\".replace('{meeting}', JSON.stringify($json.meeting)).replace('{emails}', $json.emails).replace('{research}', $json.research) }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"summary\": {\"type\": \"string\", \"description\": \"2 sentences: what this meeting is and what will decide it\"}, \"what_they_do\": {\"type\": \"string\"}, \"recent_news\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"text\": {\"type\": \"string\"}, \"date\": {\"type\": \"string\"} }, \"required\": [\"text\", \"date\"]} }, \"panel\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"name\": {\"type\": \"string\"}, \"role\": {\"type\": \"string\"}, \"role_short\": {\"type\": \"string\", \"description\": \"2 to 12 characters, e.g. CFO\"}, \"gender\": {\"type\": \"string\", \"enum\": [\"male\", \"female\"]}, \"why\": {\"type\": \"string\", \"description\": \"Why they will be in the room, one sentence\"}, \"source\": {\"type\": \"string\", \"enum\": [\"email\", \"research\", \"deck\", \"typical\"]}, \"cares_about\": {\"type\": \"string\"}, \"will_push_on\": {\"type\": \"string\"} }, \"required\": [\"name\", \"role\", \"role_short\", \"gender\", \"why\", \"source\", \"cares_about\", \"will_push_on\"]} }, \"suggestions\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"role\": {\"type\": \"string\"}, \"role_short\": {\"type\": \"string\"}, \"why\": {\"type\": \"string\"} }, \"required\": [\"role\", \"role_short\", \"why\"]} }, \"questions\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"question\": {\"type\": \"string\"}, \"asked_by\": {\"type\": \"string\"}, \"why\": {\"type\": \"string\"}, \"suggested_answer\": {\"type\": \"string\"} }, \"required\": [\"question\", \"asked_by\", \"why\", \"suggested_answer\"]} }, \"risks\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} } }, \"required\": [\"summary\", \"what_they_do\", \"recent_news\", \"panel\", \"suggestions\", \"questions\", \"risks\"]} } }) }}"),
      "options": {
        "timeout": 120000
      }
    },
    "retryOnFail": true,
    "maxTries": 3,
    "waitBetweenTries": 3000,
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

const seatPanel = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Seat the panel",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Give everyone a chair, a colour and a face, as the contract's /panel response (docs/CONTRACT.md)\nconst prev = $('Read the research').first().json;\nconst parts = ($json.candidates && $json.candidates[0] && $json.candidates[0].content && $json.candidates[0].content.parts) || [];\nconst b = JSON.parse(parts.map(p => p.text || '').join('') || '{}');\nconst SEATS = [0, 1, 5, 2, 6, 3, 7, 4, 8];\nconst FACES = { female: ['business_female_01', 'business_female_02', 'business_female_03', 'business_female_04'],\n                male: ['business_male_01', 'business_male_02', 'business_male_03', 'business_male_04', 'business_male_05', 'business_male_06', 'business_male_07'] };\nconst used = { female: 0, male: 0 };\nconst members = (b.panel || []).slice(0, 6).map((p, i) => {\n  let g = p.gender === 'female' ? 'female' : 'male';\n  if (used[g] >= FACES[g].length) g = g === 'female' ? 'male' : 'female';\n  const avatar = FACES[g][used[g]];\n  used[g] += 1;\n  return { id: 'p' + (i + 1), seat: SEATS[i], color: i, role: p.role, role_short: p.role_short, display_name: p.name,\n           gender: p.gender, avatar, why: p.why, source: p.source, cares_about: p.cares_about, will_push_on: p.will_push_on };\n});\nconst brief = {\n  summary: b.summary || '', company: { what_they_do: b.what_they_do || '', recent_news: b.recent_news || [] },\n  people: members.map(m => ({ name: m.display_name, role: m.role, cares_about: m.cares_about, will_push_on: m.will_push_on })),\n  questions: b.questions || [], risks: b.risks || [], sources: prev.sources.slice(0, 8),\n};\nconst proposal = { draft_id: prev.meeting.meeting_id, members, suggestions: b.suggestions || [] };\nreturn [{ json: { meeting: prev.meeting, brief, proposal } }];"
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
      "jsCode": "const m = $json.meeting;\nreturn [{ json: { meeting_id: m.meeting_id, status: 'ready', brief: JSON.stringify($json.brief), proposal: JSON.stringify($json.proposal), updated_at: new Date().toISOString() } }];"
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
        "value": "86BWrDlUXrOWFgqc",
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
      "message": expr("{{ (() => { const s = $('Seat the panel').first().json; const m = s.meeting; const b = s.brief; const li = xs => '<ul>' + xs.map(x => '<li>' + x + '</li>').join('') + '</ul>'; return '<h2>' + m.title + ' with ' + m.company + '</h2><p>' + b.summary + '</p>' + '<h3>Who will push on what</h3>' + li(b.people.map(p => '<b>' + p.name + '</b> (' + p.role + '): ' + p.will_push_on)) + '<h3>The hardest questions</h3>' + li(b.questions.map(q => '<b>' + q.asked_by + ':</b> ' + q.question)) + '<h3>What could lose it</h3>' + li(b.risks) + '<p><a href=\"http://localhost:3000/m/' + encodeURIComponent(m.meeting_id) + '\">Open the brief and rehearse</a></p>'; })() }}"),
      "options": {
        "appendAttribution": false
      }
    },
    "credentials": { "gmailOAuth2": newCredential("Gmail") },
    "output": [
  {
    "id": "msg1"
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
  .to(prepareIt
    .onTrue(rowResearching.to(saveResearching.to(emails.to(summariseEmails.to(research.to(readResearch.to(brief.to(seatPanel.to(rowReady.to(saveReady.to(emailBrief)))))))))))
    .onFalse(skip))
  .group('Decide', [readDecision], { description: 'Gemini decides whether this meeting is worth preparing for, and why' })
  .group('Research', [rowResearching, saveResearching, emails, summariseEmails, research, readResearch], { description: 'Reads your recent emails with the attendees and researches the company with Google Search' })
  .group('Brief', [brief, seatPanel, rowReady, saveReady, emailBrief], { description: 'Writes the brief, seats the panel, saves it and emails you' });
