import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, fromAi, expr } from '@n8n/workflow-sdk';

const prepTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "Start a rehearsal (web app)",
    "parameters": {
      "httpMethod": "POST",
      "path": "dryrun/prep",
      "responseMode": "responseNode",
      "options": {}
    },
    "output": [
  {
    "body": {
      "draft_id": "evt123",
      "presenter": {
        "name": "Aryan",
        "email": "you@example.com"
      },
      "pitch_minutes": 5,
      "deck": {
        "name": "RouteIQ.pdf",
        "slides": [
          {
            "index": 0,
            "text": "RouteIQ for Delhivery"
          }
        ]
      },
      "prospect": {
        "company": "Delhivery",
        "website": "",
        "context": "RouteIQ pitch"
      },
      "panel": [
        {
          "id": "p1",
          "seat": 0,
          "color": 0,
          "role": "VP Operations",
          "role_short": "VP Ops",
          "display_name": "Priya Nair",
          "avatar": "business_female_01",
          "difficulty": 2,
          "source": "email"
        }
      ]
    }
  }
]
  }
});

const findMeeting = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Find the meeting",
    "parameters": {
      "resource": "row",
      "operation": "get",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "86BWrDlUXrOWFgqc",
        "cachedResultName": "DryRun meetings"
      },
      "matchType": "anyCondition",
      "filters": {
        "conditions": [
          {
            "keyName": "meeting_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.body.draft_id }}")
          }
        ]
      }
    },
    "alwaysOutputData": true,
    "output": [
  {
    "meeting_id": "evt123",
    "title": "RouteIQ pitch",
    "kind": "sales_pitch",
    "why": "",
    "brief": "{}"
  }
]
  }
});

const gather = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Gather what n8n knows",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Everything the rehearsal is planned from: the meeting and its brief (from the DryRun meetings table), the confirmed panel,\n// the deck's slide text and the pitch length (docs/CONTRACT.md, POST /prep)\nconst req = $('Start a rehearsal (web app)').first().json.body;\nconst row = $input.first().json || {};\nconst parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };\nconst brief = parse(row.brief) || {};\nconst minutes = Math.max(1, Math.min(60, Math.round(Number(req.pitch_minutes) || 5)));\nconst meeting = { title: row.title || (req.prospect && req.prospect.context) || 'Meeting', company: row.company || (req.prospect && req.prospect.company) || '',\n                  kind: row.kind || 'other', start: row.start || '', notes: row.why || '' };\nconst panel = (req.panel || []).map(p => ({ id: p.id, name: p.display_name || '', role: p.role, difficulty: p.difficulty || 2,\n                                            source: p.source || 'typical', will_push_on: p.will_push_on || '', why: p.why || '' }));\nconst slides = ((req.deck && req.deck.slides) || []).map(s => ({ index: s.index, text: String(s.text || '').slice(0, 1500) }));\nreturn [{ json: { req, minutes, presenter: (req.presenter && req.presenter.name) || '', meeting, panel, slides,\n                  brief: { summary: brief.summary || '', attendees: brief.attendees || [], questions: brief.questions || [], risks: brief.risks || [],\n                           company: brief.company || {} } } }];"
    },
    "output": [
  {
    "minutes": 5,
    "presenter": "Aryan",
    "meeting": {},
    "panel": [],
    "slides": [],
    "brief": {}
  }
]
  }
});

const plan = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Plan the rehearsal",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: \"You set up a rehearsal of a real meeting. The presenter, {presenter}, will pitch for about {minutes} minutes to the practice\\npanel below, in a virtual boardroom, and the panel will react as these people would in this meeting. Plan it.\\n\\nMeeting (from the calendar, with n8n's notes):\\n{meeting}\\n\\nThe presenter's brief (real attendees, research, likely questions, risks):\\n{brief}\\n\\nThe practice panel (ids are fixed; \\\"source\\\": \\\"email\\\" means a real attendee, anything else is a practice role):\\n{panel}\\n\\nThe deck, slide by slide (index from 0; empty if there is no deck or a slide has no text):\\n{deck}\\n\\nDecide, for this meeting and this panel (never a generic template):\\n- slides: for each slide in the deck, a short title, its 1 to 3 key points (what the presenter must get across), target_seconds\\n  (all slides together about {minutes} minutes, more time where the slide carries more), and rescue cues for when the presenter\\n  freezes: calm (a few calming words), keyword (the one word or number that unlocks the slide), bridge (a phrase to carry on from).\\n  A slide with no text: title \\\"Slide <n>\\\" (n from 1), no key points and a calm cue only; never guess what it shows. No deck: an empty list.\\n- personas: for each panel member, by id: display_name (keep the given name; invent a realistic Indian name only if it is empty),\\n  priorities (what they care about most in this meeting), and objections tied to slides (slide_index, or -1 when there is no deck or it\\n  could come at any time), grounded in the deck and the research, with source \\\"deck\\\" or \\\"research\\\". manner: \\\"interrupts\\\" if, in a real\\n  meeting like this, this person would raise a hand during the pitch; \\\"waits\\\" if they would keep it for the questions. Base it on the\\n  role, the kind of meeting and difficulty (1 easy to 3 hard).\\n- chair: the id of the one person who would run this meeting (usually the most senior person from the company): they welcome the\\n  presenter, open the floor and close the meeting.\\n- plan: during_pitch and after_pitch, how many questions a real meeting of this kind and length would have during and after the\\n  pitch, and why (one sentence the presenter will read). Interruptions come from people whose manner is \\\"interrupts\\\". A question with\\n  its answer takes about a minute, and interruptions eat into the pitch, so keep the numbers realistic for {minutes} minutes: a short\\n  pitch gets few interruptions, if any. Pick the questions that matter most, not one per person.\\n- rescue_after_s: seconds of silence before the calm, keyword and bridge cues, rising (about 3, 6 and 10 for most presenters).\\n- lines: short lines voiced ahead of time so common reactions play at once, in the voice of each person, for this meeting:\\n  the chair's \\\"welcome\\\" (one, greeting the presenter by name if known, warm and brief, inviting them to begin),\\n  the chair's \\\"open_floor\\\" (one, thanking them and opening the questions, without naming who asks first: that is decided live),\\n  and 2 \\\"acknowledge\\\" lines per person: 2 to 6 words that fit after ANY reasonable answer to ANY question, so never mention a topic\\n  (e.g. \\\"Okay, that helps.\\\", \\\"Fair enough.\\\", \\\"Understood, thanks.\\\"), in that person's manner. Spoken English, natural; the welcome and\\n  open_floor under 20 words each.\\nAnswer in JSON.\".replace('{presenter}', $json.presenter || 'the presenter').split('{minutes}').join(String($json.minutes)).replace('{meeting}', JSON.stringify($json.meeting, null, 1)).replace('{brief}', JSON.stringify($json.brief, null, 1)).replace('{panel}', JSON.stringify($json.panel, null, 1)).replace('{deck}', JSON.stringify($json.slides, null, 1)) }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"slides\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"index\": {\"type\": \"integer\"}, \"title\": {\"type\": \"string\"}, \"key_points\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} }, \"target_seconds\": {\"type\": \"integer\"}, \"rescue\": {\"type\": \"object\", \"properties\": {\"calm\": {\"type\": \"string\"}, \"keyword\": {\"type\": \"string\"}, \"bridge\": {\"type\": \"string\"} }, \"required\": [\"calm\", \"keyword\", \"bridge\"]} }, \"required\": [\"index\", \"title\", \"key_points\", \"target_seconds\", \"rescue\"]} }, \"personas\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"id\": {\"type\": \"string\"}, \"display_name\": {\"type\": \"string\"}, \"priorities\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} }, \"objections\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"slide_index\": {\"type\": \"integer\"}, \"text\": {\"type\": \"string\"}, \"source\": {\"type\": \"string\", \"enum\": [\"deck\", \"research\"]} }, \"required\": [\"slide_index\", \"text\", \"source\"]} }, \"manner\": {\"type\": \"string\", \"enum\": [\"interrupts\", \"waits\"]} }, \"required\": [\"id\", \"display_name\", \"priorities\", \"objections\", \"manner\"]} }, \"chair\": {\"type\": \"string\"}, \"plan\": {\"type\": \"object\", \"properties\": {\"during_pitch\": {\"type\": \"integer\"}, \"after_pitch\": {\"type\": \"integer\"}, \"why\": {\"type\": \"string\"} }, \"required\": [\"during_pitch\", \"after_pitch\", \"why\"]}, \"rescue_after_s\": {\"type\": \"array\", \"items\": {\"type\": \"integer\"} }, \"lines\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"persona_id\": {\"type\": \"string\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"welcome\", \"open_floor\", \"acknowledge\"]}, \"text\": {\"type\": \"string\"} }, \"required\": [\"persona_id\", \"kind\", \"text\"]} } }, \"required\": [\"slides\", \"personas\", \"chair\", \"plan\", \"rescue_after_s\", \"lines\"]} } }) }}"),
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

const planGroq = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Plan the rehearsal (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $('Gather what n8n knows').first().json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: (\"You set up a rehearsal of a real meeting. The presenter, {presenter}, will pitch for about {minutes} minutes to the practice\\npanel below, in a virtual boardroom, and the panel will react as these people would in this meeting. Plan it.\\n\\nMeeting (from the calendar, with n8n's notes):\\n{meeting}\\n\\nThe presenter's brief (real attendees, research, likely questions, risks):\\n{brief}\\n\\nThe practice panel (ids are fixed; \\\"source\\\": \\\"email\\\" means a real attendee, anything else is a practice role):\\n{panel}\\n\\nThe deck, slide by slide (index from 0; empty if there is no deck or a slide has no text):\\n{deck}\\n\\nDecide, for this meeting and this panel (never a generic template):\\n- slides: for each slide in the deck, a short title, its 1 to 3 key points (what the presenter must get across), target_seconds\\n  (all slides together about {minutes} minutes, more time where the slide carries more), and rescue cues for when the presenter\\n  freezes: calm (a few calming words), keyword (the one word or number that unlocks the slide), bridge (a phrase to carry on from).\\n  A slide with no text: title \\\"Slide <n>\\\" (n from 1), no key points and a calm cue only; never guess what it shows. No deck: an empty list.\\n- personas: for each panel member, by id: display_name (keep the given name; invent a realistic Indian name only if it is empty),\\n  priorities (what they care about most in this meeting), and objections tied to slides (slide_index, or -1 when there is no deck or it\\n  could come at any time), grounded in the deck and the research, with source \\\"deck\\\" or \\\"research\\\". manner: \\\"interrupts\\\" if, in a real\\n  meeting like this, this person would raise a hand during the pitch; \\\"waits\\\" if they would keep it for the questions. Base it on the\\n  role, the kind of meeting and difficulty (1 easy to 3 hard).\\n- chair: the id of the one person who would run this meeting (usually the most senior person from the company): they welcome the\\n  presenter, open the floor and close the meeting.\\n- plan: during_pitch and after_pitch, how many questions a real meeting of this kind and length would have during and after the\\n  pitch, and why (one sentence the presenter will read). Interruptions come from people whose manner is \\\"interrupts\\\". A question with\\n  its answer takes about a minute, and interruptions eat into the pitch, so keep the numbers realistic for {minutes} minutes: a short\\n  pitch gets few interruptions, if any. Pick the questions that matter most, not one per person.\\n- rescue_after_s: seconds of silence before the calm, keyword and bridge cues, rising (about 3, 6 and 10 for most presenters).\\n- lines: short lines voiced ahead of time so common reactions play at once, in the voice of each person, for this meeting:\\n  the chair's \\\"welcome\\\" (one, greeting the presenter by name if known, warm and brief, inviting them to begin),\\n  the chair's \\\"open_floor\\\" (one, thanking them and opening the questions, without naming who asks first: that is decided live),\\n  and 2 \\\"acknowledge\\\" lines per person: 2 to 6 words that fit after ANY reasonable answer to ANY question, so never mention a topic\\n  (e.g. \\\"Okay, that helps.\\\", \\\"Fair enough.\\\", \\\"Understood, thanks.\\\"), in that person's manner. Spoken English, natural; the welcome and\\n  open_floor under 20 words each.\\nAnswer in JSON.\".replace('{presenter}', j.presenter || 'the presenter').split('{minutes}').join(String(j.minutes)).replace('{meeting}', JSON.stringify(j.meeting, null, 1)).replace('{brief}', JSON.stringify(j.brief, null, 1)).replace('{panel}', JSON.stringify(j.panel, null, 1)).replace('{deck}', JSON.stringify(j.slides, null, 1))) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"slides\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"index\": {\"type\": \"integer\"}, \"title\": {\"type\": \"string\"}, \"key_points\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} }, \"target_seconds\": {\"type\": \"integer\"}, \"rescue\": {\"type\": \"object\", \"properties\": {\"calm\": {\"type\": \"string\"}, \"keyword\": {\"type\": \"string\"}, \"bridge\": {\"type\": \"string\"} }, \"required\": [\"calm\", \"keyword\", \"bridge\"]} }, \"required\": [\"index\", \"title\", \"key_points\", \"target_seconds\", \"rescue\"]} }, \"personas\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"id\": {\"type\": \"string\"}, \"display_name\": {\"type\": \"string\"}, \"priorities\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} }, \"objections\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"slide_index\": {\"type\": \"integer\"}, \"text\": {\"type\": \"string\"}, \"source\": {\"type\": \"string\", \"enum\": [\"deck\", \"research\"]} }, \"required\": [\"slide_index\", \"text\", \"source\"]} }, \"manner\": {\"type\": \"string\", \"enum\": [\"interrupts\", \"waits\"]} }, \"required\": [\"id\", \"display_name\", \"priorities\", \"objections\", \"manner\"]} }, \"chair\": {\"type\": \"string\"}, \"plan\": {\"type\": \"object\", \"properties\": {\"during_pitch\": {\"type\": \"integer\"}, \"after_pitch\": {\"type\": \"integer\"}, \"why\": {\"type\": \"string\"} }, \"required\": [\"during_pitch\", \"after_pitch\", \"why\"]}, \"rescue_after_s\": {\"type\": \"array\", \"items\": {\"type\": \"integer\"} }, \"lines\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"persona_id\": {\"type\": \"string\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"welcome\", \"open_floor\", \"acknowledge\"]}, \"text\": {\"type\": \"string\"} }, \"required\": [\"persona_id\", \"kind\", \"text\"]} } }, \"required\": [\"slides\", \"personas\", \"chair\", \"plan\", \"rescue_after_s\", \"lines\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
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

const bundle = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Build the bundle",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// The rehearsal bundle (docs/CONTRACT.md, POST /prep response). Seats, colours, faces and difficulty stay as the presenter set them;\n// the plan, the briefs and the lines are n8n's. The laptop fills in each slide's image and saves the voices.\nconst g = $('Gather what n8n knows').first().json;\nconst p = JSON.parse(replyText($json) || '{}');\nconst byId = Object.fromEntries((p.personas || []).map(x => [x.id, x]));\nconst ids = g.req.panel.map(m => m.id);\n// A different voice for each person, fitting their avatar (Sarvam speaker names)\nconst VOICES = {\"female\": [\"priya\", \"kavya\", \"neha\", \"ritu\", \"shreya\", \"simran\"], \"male\": [\"rahul\", \"aditya\", \"rohan\", \"amit\", \"kabir\", \"varun\", \"dev\"]};\nconst used = { female: 0, male: 0 };\nconst voiceFor = avatar => { const g = String(avatar).includes('female') ? 'female' : 'male'; return VOICES[g][used[g]++ % VOICES[g].length]; };\nconst chair = ids.includes(p.chair) ? p.chair : (g.req.panel.find(m => m.seat === 0) || g.req.panel[0] || {}).id;\nconst personas = g.req.panel.map(m => {\n  const x = byId[m.id] || {};\n  return { id: m.id, seat: m.seat, color: m.color, role: m.role, role_short: m.role_short, avatar: m.avatar,\n           display_name: m.display_name || x.display_name || m.role, priorities: x.priorities || [],\n           objections: (x.objections || []).map(o => ({ slide_index: o.slide_index, text: o.text, source: o.source === 'deck' ? 'deck' : 'research' })),\n           difficulty: m.difficulty || 2, manner: x.manner === 'interrupts' ? 'interrupts' : 'waits', chair: m.id === chair,\n           voice: voiceFor(m.avatar) };\n});\n// Slide times scaled so they add up to the pitch length\nconst pitchSeconds = g.minutes * 60;\nconst raw = g.slides.map(s => (p.slides || []).find(x => x.index === s.index) || { index: s.index, title: 'Slide ' + (s.index + 1), key_points: [], target_seconds: 60, rescue: {} });\nconst total = raw.reduce((a, s) => a + Math.max(5, s.target_seconds || 0), 0) || 1;\nconst slides = raw.map(s => ({ index: s.index, title: s.title || '', image_url: '', key_points: s.key_points || [],\n  target_seconds: Math.max(5, Math.round(Math.max(5, s.target_seconds || 0) * pitchSeconds / total)),\n  rescue: { calm: (s.rescue && s.rescue.calm) || 'Take a breath.', keyword: (s.rescue && s.rescue.keyword) || '', bridge: (s.rescue && s.rescue.bridge) || '' },\n  notes: null }));\nconst r = (p.rescue_after_s || []).map(Number).filter(n => n > 0).slice(0, 3);\nconst rescue = r.length === 3 && r[0] < r[1] && r[1] < r[2] ? r : [3, 6, 10];\nconst plan = { during_pitch: Math.max(0, Math.round((p.plan && p.plan.during_pitch) || 0)), after_pitch: Math.max(0, Math.round((p.plan && p.plan.after_pitch) || 0)),\n               why: (p.plan && p.plan.why) || '' };\nconst lines = (p.lines || []).filter(l => ids.includes(l.persona_id) && l.text).map((l, i) => ({ id: 'l' + (i + 1), persona_id: l.persona_id, kind: l.kind, text: l.text }));\nreturn [{ json: { session_id: 's' + Date.now().toString(36), prospect: { company: g.meeting.company }, pitch_seconds: pitchSeconds, plan,\n                  rescue_after_s: rescue, slides, personas, lines, drill: null } }];"
    },
    "output": [
  {
    "session_id": "s1",
    "personas": [],
    "slides": [],
    "lines": []
  }
]
  }
});

const eachLine = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "One item per line",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Each line to voice, in its person's voice. Skipped when the web app asks for no voices (testing without spending TTS credits).\nconst b = $input.first().json;\nconst req = $('Start a rehearsal (web app)').first().json.body;\nif (req.voices === false) return [];\nconst voice = Object.fromEntries(b.personas.map(p => [p.id, p.voice]));\nreturn b.lines.map(l => ({ json: { id: l.id, text: l.text, speaker: voice[l.persona_id] } }));"
    },
    "alwaysOutputData": true,
    "output": [
  {
    "id": "l1",
    "text": "Welcome, Aryan.",
    "speaker": "priya"
  }
]
  }
});

const voice = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Voice the line (Sarvam)",
    "parameters": {
      "method": "POST",
      "url": "https://api.sarvam.ai/text-to-speech",
      "authentication": "genericCredentialType",
      "genericAuthType": "httpHeaderAuth",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ text: $json.text, language_code: 'en-IN', model: 'bulbul:v3', speaker: $json.speaker, speech_sample_rate: 22050 }) }}"),
      "options": {
        "timeout": 30000
      }
    },
    "onError": "continueRegularOutput",
    "retryOnFail": true,
    "maxTries": 2,
    "waitBetweenTries": 1000,
    "credentials": { "httpHeaderAuth": newCredential("Sarvam") },
    "output": [
  {
    "request_id": "r1",
    "audios": [
      "UklGRg=="
    ]
  }
]
  }
});

const addVoices = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Add the voices",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Each line's audio (base64 WAV) into the bundle; the laptop saves them and serves them to the headset\nconst b = $('Build the bundle').first().json;\nconst lines = $('One item per line').all().map(i => i.json);\nconst out = $input.all().map(i => i.json);\nconst audio = {};\nlines.forEach((l, i) => { const a = out[i] && out[i].audios && out[i].audios[0]; if (l.id && a) audio[l.id] = a; });\nreturn [{ json: { ...b, lines: b.lines.map(l => (audio[l.id] ? { ...l, audio_wav_base64: audio[l.id] } : l)) } }];"
    },
    "output": [
  {
    "session_id": "s1",
    "lines": []
  }
]
  }
});

const reply = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send the bundle",
    "parameters": {
      "respondWith": "firstIncomingItem",
      "options": {}
    },
    "output": [
  {}
]
  }
});

const about = sticky('## DryRun rehearsal prep\nBriefs the practice panel for one rehearsal (POST /webhook/dryrun/prep, docs/CONTRACT.md): plans each slide and the rescue cues, what each person will push on, who interrupts and who chairs, how many questions to ask and when, and the lines voiced ahead of time.', [prepTrigger], { color: 4 });

export default workflow('dryrun-rehearsal-prep', 'DryRun rehearsal prep')
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
  .group('Voices', [eachLine, voice, addVoices], { description: 'Voices the lines ahead of time with Sarvam, in each person\'s voice' });
