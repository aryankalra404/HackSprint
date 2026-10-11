import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, fromAi, expr } from '@n8n/workflow-sdk';

const debriefTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "Debrief a session (laptop)",
    "parameters": {
      "httpMethod": "POST",
      "path": "dryrun/debrief",
      "responseMode": "responseNode",
      "options": {}
    },
    "output": [
  {
    "body": {
      "session_id": "s1",
      "meeting_id": "evt123",
      "client": "web",
      "duration_s": 300,
      "owner_email": "you@example.com",
      "presenter": {
        "name": "Aryan",
        "email": "you@example.com"
      },
      "events": [
        {
          "t": 0,
          "type": "slide",
          "slide_index": 0
        },
        {
          "t": 40,
          "type": "turn",
          "mode": "segment",
          "slide_index": 0,
          "transcript": "We cut empty miles by a third.",
          "note": "",
          "reactions": [],
          "answer_verdict": null
        }
      ],
      "bundle": {
        "session_id": "s1",
        "prospect": {
          "company": "Delhivery"
        },
        "pitch_seconds": 300,
        "slides": [],
        "personas": [],
        "lines": []
      }
    }
  }
]
  }
});

const findHistory = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Earlier rehearsals",
    "parameters": {
      "resource": "row",
      "operation": "get",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "xzUZexBbX6bcX18F",
        "cachedResultName": "DryRun sessions"
      },
      "matchType": "anyCondition",
      "filters": {
        "conditions": [
          {
            "keyName": "meeting_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.body.meeting_id || 'none' }}")
          }
        ]
      },
      "returnAll": true
    },
    "alwaysOutputData": true,
    "output": [
  {
    "session_id": "s0",
    "meeting_id": "evt123",
    "status": "done",
    "overall": 65,
    "at": "2026-10-10T19:12:00.000Z",
    "debrief": "{}"
  }
]
  }
});

const readSession = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Read the session",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// What happened, slide by slide, with everything that can be counted counted here (the same input always gives the same numbers):\n// time on each slide, words per minute, filler words, pacing against the plan. The model only judges (docs/CONTRACT.md, POST /debrief).\nconst b = $('Debrief a session (laptop)').first().json.body;\nconst bundle = b.bundle || {};\nconst personas = bundle.personas || [];\nconst planned = bundle.slides || [];\nconst events = (b.events || []).slice().sort((x, y) => x.t - y.t);\nconst duration = Number(b.duration_s) || (events.length ? events[events.length - 1].t : 0);\nconst turns = events.filter(e => e.type === 'turn');\nconst end = turns.find(t => t.mode === 'pitch_end');\nconst pitchEnd = end ? end.t : duration;\n// Time on each slide during the pitch, from the slide changes\nconst changes = events.filter(e => e.type === 'slide');\nif (!changes.length || changes[0].t > 0) changes.unshift({ t: 0, type: 'slide', slide_index: changes.length ? 0 : 0 });\nconst seconds = {};\nchanges.forEach((c, i) => {\n  const from = Math.min(c.t, pitchEnd);\n  const to = Math.min(i + 1 < changes.length ? changes[i + 1].t : duration, pitchEnd);\n  seconds[c.slide_index] = (seconds[c.slide_index] || 0) + Math.max(0, to - from);\n});\n// What was said on each slide during the pitch (the opening, each slide, the last slide), and the answers apart\nconst said = {};\nturns.filter(t => t.mode !== 'answer' && String(t.transcript || '').trim()).forEach(t => { said[t.slide_index] = ((said[t.slide_index] || '') + ' ' + t.transcript.trim()).trim(); });\nconst words = t => String(t || '').split(/\\s+/).filter(Boolean).length;\nconst FILLER = /\\b(um+|uh+|erm|you know|basically|sort of|kind of|i mean)\\b/gi;\nconst indexes = [...new Set(Object.keys(said).map(Number).concat(Object.keys(seconds).map(Number)))].sort((x, y) => x - y);\nconst slides = indexes.map(i => {\n  const transcript = said[i] || '';\n  const plan = planned.find(s => s.index === i) || {};\n  const sec = Math.round(seconds[i] || 0);\n  const fillers = transcript.match(FILLER) || [];\n  return { index: i, title: plan.title || 'Slide ' + (i + 1), transcript, seconds: sec, target_seconds: plan.target_seconds || 0,\n           words_per_minute: sec >= 10 ? Math.round(words(transcript) / (sec / 60)) : 0, key_points: plan.key_points || [],\n           fillers: [...new Set(fillers)].slice(0, 3), filler_count: fillers.length };\n});\n// Each question with the answer that followed it\nconst name = id => ((personas.find(p => p.id === id) || {}).display_name) || id;\nconst exchanges = [];\nturns.forEach(t => {\n  if (t.mode === 'answer') {\n    const open = exchanges.slice().reverse().find(x => !x.answer && x.persona_id === t.asked_by);\n    if (open) Object.assign(open, { answer: t.transcript || '', verdict: t.answer_verdict || null });\n  }\n  (t.reactions || []).filter(r => r.kind === 'question' || r.kind === 'follow_up').forEach(r =>\n    exchanges.push({ t: t.t, slide_index: t.slide_index, persona_id: r.persona_id, question: r.text, answer: null, verdict: null }));\n});\n// Pacing: how far each slide was from its target, and the whole pitch from its length\nconst timed = slides.filter(s => s.target_seconds > 0 && s.seconds > 0);\nconst off = timed.length ? timed.reduce((a, s) => a + Math.min(1, Math.abs(s.seconds / s.target_seconds - 1)), 0) / timed.length : 0;\nconst pitchSec = Math.round(Math.min(pitchEnd, duration));\nconst clock = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');\nconst worst = timed.slice().sort((x, y) => Math.abs(y.seconds / y.target_seconds - 1) - Math.abs(x.seconds / x.target_seconds - 1))[0];\nconst pacing = { name: 'Pacing', score: timed.length ? Math.max(20, Math.round(100 - 70 * off)) : 60,\n  explanation: 'You pitched for ' + clock(pitchSec) + (bundle.pitch_seconds ? ' against a plan of ' + clock(bundle.pitch_seconds) : '')\n    + (worst ? '; slide ' + (worst.index + 1) + ' took ' + clock(worst.seconds) + ' against ' + clock(worst.target_seconds) : '') + '.', evidence: [] };\n// Earlier debriefed rehearsals of this meeting, oldest first, and the weak spots the last one left\nconst parse = x => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };\nconst earlier = $input.all().map(i => i.json).filter(r => r.session_id && r.session_id !== b.session_id && r.status === 'done' && typeof r.overall === 'number')\n  .sort((x, y) => Date.parse(x.at) - Date.parse(y.at));\nconst history = earlier.map(r => ({ session_id: r.session_id, at: r.at, overall: r.overall }));\nconst last = earlier.length ? parse(earlier[earlier.length - 1].debrief) : null;\nconst weakBefore = (last && last.weak_spots) || [];\nconst totalWords = slides.reduce((a, s) => a + words(s.transcript), 0) + exchanges.reduce((a, x) => a + words(x.answer), 0);\nconst answered = exchanges.filter(x => x.answer).length;\nconst summary = totalWords + ' words over ' + slides.filter(s => s.transcript).length + ' slide' + (slides.length === 1 ? '' : 's')\n  + ', ' + exchanges.length + ' question' + (exchanges.length === 1 ? '' : 's') + ' (' + answered + ' answered) in ' + clock(duration);\n// The prompt, with each {name} filled in by splitting (nothing in the text is read as a replacement pattern)\nconst PROMPT = \"You are debriefing a rehearsal of a real meeting. {presenter} just pitched to a practice panel in a virtual boardroom;\\nthe panel reacted live. Judge it as a sharp, fair coach would, using only what was actually said below. Write to the presenter (\\\"you\\\").\\n\\nThe meeting: {meeting}\\nThe panel (what each cares about and will push on): {personas}\\nThe plan for each slide (key points, target time): {slides}\\nWeak spots from the last rehearsal of this meeting (check whether they were fixed): {weak_spots}\\n\\nWhat the presenter said, slide by slide, with the time spent and the numbers already counted:\\n{transcript}\\n\\nThe questions, the answers and how each answer was judged live:\\n{exchanges}\\n\\nDecide:\\n- headline: one sentence on how it went and what it means for the real meeting (e.g. \\\"A clear story, but finance left unconvinced\\n  about the price.\\\").\\n- metrics: score 0-100 for exactly these four, each with a one-sentence explanation and 1 or 2 quotes as evidence (copied exactly, word\\n  for word, from what the presenter said, with the slide it was on):\\n  \\\"Clarity\\\" (could the panel follow what you offer and why it matters), \\\"Evidence\\\" (claims backed by numbers, proof, customers),\\n  \\\"Objection handling\\\" (how the questions were answered; 60 if there were none), \\\"Structure\\\" (opening, flow between slides, a clear ask\\n  at the end).\\n- stakeholders: for each panel member, by id: stance \\\"backs\\\", \\\"undecided\\\" or \\\"opposes\\\" after this pitch, given what they care about and\\n  how their questions went; reason (one sentence, specific); and the deciding moment: a quote copied exactly from the presenter and its\\n  slide (or an empty quote if nothing decided it).\\n- slides: for each slide that has something said on it, by index: covered and missed (which of its key points came across, in a few words\\n  each); marks on the transcript: up to 4 per slide, each a quote copied exactly from that slide's transcript (a few words to one\\n  sentence), its kind (\\\"hedge\\\" for weak or apologetic phrasing, \\\"unsupported\\\" for a claim with nothing behind it, \\\"wrong_fact\\\" for\\n  something false or contradicting the deck, \\\"landed\\\" for something that clearly worked), a short note on why, and better: how to say it\\n  instead (empty for \\\"landed\\\"). Do not mark filler words; they are already counted. notes: the talk track for this slide next time, 2 to 4\\n  sentences in the presenter's voice, keeping what worked and fixing what did not.\\n- drill: the one thing to practise next: a short title, focus_persona (the id of the person who will press on it), the slides it is about\\n  (indexes) and minutes (2 to 5).\\n- weak_spots: 1 to 3 topics to press on next time, a few words each (e.g. \\\"the payback period\\\", \\\"integration with their TMS\\\").\\nBe honest and specific; no generic advice. Answer in JSON.\";\nconst parts = {\n  presenter: (b.presenter && b.presenter.name) || 'The presenter',\n  meeting: (bundle.prospect && bundle.prospect.company ? 'with ' + bundle.prospect.company : 'a meeting') + ', a ' + clock(bundle.pitch_seconds || pitchSec) + ' pitch',\n  personas: JSON.stringify(personas.map(p => ({ id: p.id, name: p.display_name, role: p.role, priorities: p.priorities, objections: (p.objections || []).map(o => o.text) }))),\n  slides: JSON.stringify(planned.map(s => ({ index: s.index, title: s.title, key_points: s.key_points, target_seconds: s.target_seconds }))),\n  weak_spots: weakBefore.length ? weakBefore.join('; ') : 'None (first rehearsal).',\n  transcript: slides.map(s => '[slide ' + (s.index + 1) + ' (index ' + s.index + '): ' + s.title + ', ' + s.seconds + ' s against ' + s.target_seconds + ' s, '\n    + s.words_per_minute + ' words a minute, ' + s.filler_count + ' filler words] \"' + (s.transcript || '(nothing said)') + '\"').join('\\n') || 'Nothing was said.',\n  exchanges: exchanges.map(x => name(x.persona_id) + ' (' + x.persona_id + ') asked on slide ' + (x.slide_index + 1) + ': \"' + x.question + '\" Answer: \"'\n    + (x.answer || '(not answered)') + '\"' + (x.verdict ? ' (judged ' + x.verdict + ')' : '')).join('\\n') || 'No questions were asked.',\n};\nconst prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);\nconst telemetry = { session_id: b.session_id, client: b.client || 'web', duration_s: duration, events, ...(b.gaze_dwell_s ? { gaze_dwell_s: b.gaze_dwell_s } : {}),\n                    ...(b.facing_slides_s != null ? { facing_slides_s: b.facing_slides_s } : {}) };\nreturn [{ json: { session_id: b.session_id, meeting_id: b.meeting_id || '', owner_email: b.owner_email || (b.presenter && b.presenter.email) || '',\n                  bundle, telemetry, slides, exchanges, pacing, history, weak_before: weakBefore, summary, prompt } }];"
    },
    "output": [
  {
    "session_id": "s1",
    "meeting_id": "evt123",
    "summary": "",
    "prompt": "",
    "slides": [],
    "exchanges": [],
    "history": []
  }
]
  }
});

const rowStart = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Row: debriefing",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const ran = name => { try { return $(name).isExecuted; } catch (e) { return false; } };\nconst out = name => (ran(name) ? $(name).first().json : null);\nconst read = $('Read the session').first().json;\nconst judged = out('Build the debrief');\nconst mailed = out('Email the report');\nconst step = (id, label, done, running, doneText, runningText) => ({ id, label, state: done ? 'done' : running ? 'running' : 'pending', detail: done ? doneText : running ? runningText : '' });\nconst debriefSteps = [\n  step('read', 'Read the transcript', true, false, read.summary, ''),\n  step('judge', 'Judged the pitch', !!judged, true,\n    judged ? 'Scored ' + judged.debrief.metrics.length + ' things with evidence, marked ' + judged.marks + ' moments, ' + judged.backs + ' of ' + judged.debrief.stakeholders.length + ' would back it' : '',\n    'Marking the transcript, scoring the answers and reading the room'),\n  step('plan', 'Planned the next rehearsal', !!judged, !!judged,\n    judged ? 'Drill: ' + judged.debrief.drill.title + (judged.debrief.weak_spots.length ? '. The panel will press on ' + judged.debrief.weak_spots.join(', ') : '') : '', ''),\n  step('email', 'Emailed you the report', !!mailed && !mailed.error, !!judged, 'To ' + (read.owner_email || 'you'), 'Emailing you the report'),\n];\nif (mailed && mailed.error) Object.assign(debriefSteps[3], { state: 'error', detail: \"Couldn't email the report\" });\nconst statusFields = { debrief_status: JSON.stringify({ done: !!mailed, steps: debriefSteps }), execution_id: String($execution.id), workflow_id: String($workflow.id), updated_at: new Date().toISOString() };\n\n// The session in the DryRun sessions table while n8n debriefs it\nconst r = $('Read the session').first().json;\nreturn [{ json: { session_id: r.session_id, meeting_id: r.meeting_id, at: new Date().toISOString(), status: 'debriefing', headline: '',\n                  bundle: JSON.stringify(r.bundle), telemetry: JSON.stringify(r.telemetry), debrief: '', ...statusFields } }];"
    },
    "output": [
  {
    "session_id": "s1"
  }
]
  }
});

const saveStart = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save: debriefing",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "xzUZexBbX6bcX18F",
        "cachedResultName": "DryRun sessions"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "session_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.session_id }}")
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

const judge = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Judge the pitch",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: $('Read the session').first().json.prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"headline\": {\"type\": \"string\"}, \"metrics\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"name\": {\"type\": \"string\", \"enum\": [\"Clarity\", \"Evidence\", \"Objection handling\", \"Structure\"]}, \"score\": {\"type\": \"integer\"}, \"explanation\": {\"type\": \"string\"}, \"evidence\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"slide_index\": {\"type\": \"integer\"}, \"quote\": {\"type\": \"string\"} }, \"required\": [\"slide_index\", \"quote\"]} } }, \"required\": [\"name\", \"score\", \"explanation\", \"evidence\"]} }, \"stakeholders\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"persona_id\": {\"type\": \"string\"}, \"stance\": {\"type\": \"string\", \"enum\": [\"backs\", \"undecided\", \"opposes\"]}, \"reason\": {\"type\": \"string\"}, \"quote\": {\"type\": \"string\"}, \"slide_index\": {\"type\": \"integer\"} }, \"required\": [\"persona_id\", \"stance\", \"reason\", \"quote\", \"slide_index\"]} }, \"slides\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"index\": {\"type\": \"integer\"}, \"covered\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} }, \"missed\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} }, \"marks\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"quote\": {\"type\": \"string\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"hedge\", \"unsupported\", \"wrong_fact\", \"landed\"]}, \"note\": {\"type\": \"string\"}, \"better\": {\"type\": \"string\"} }, \"required\": [\"quote\", \"kind\", \"note\", \"better\"]} }, \"notes\": {\"type\": \"string\"} }, \"required\": [\"index\", \"covered\", \"missed\", \"marks\", \"notes\"]} }, \"drill\": {\"type\": \"object\", \"properties\": {\"title\": {\"type\": \"string\"}, \"focus_persona\": {\"type\": \"string\"}, \"slides\": {\"type\": \"array\", \"items\": {\"type\": \"integer\"} }, \"minutes\": {\"type\": \"integer\"} }, \"required\": [\"title\", \"focus_persona\", \"slides\", \"minutes\"]}, \"weak_spots\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} } }, \"required\": [\"headline\", \"metrics\", \"stakeholders\", \"slides\", \"drill\", \"weak_spots\"]} } }) }}"),
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

const judgeGroq = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Judge the pitch (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $('Read the session').first().json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: ($('Read the session').first().json.prompt) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"headline\": {\"type\": \"string\"}, \"metrics\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"name\": {\"type\": \"string\", \"enum\": [\"Clarity\", \"Evidence\", \"Objection handling\", \"Structure\"]}, \"score\": {\"type\": \"integer\"}, \"explanation\": {\"type\": \"string\"}, \"evidence\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"slide_index\": {\"type\": \"integer\"}, \"quote\": {\"type\": \"string\"} }, \"required\": [\"slide_index\", \"quote\"]} } }, \"required\": [\"name\", \"score\", \"explanation\", \"evidence\"]} }, \"stakeholders\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"persona_id\": {\"type\": \"string\"}, \"stance\": {\"type\": \"string\", \"enum\": [\"backs\", \"undecided\", \"opposes\"]}, \"reason\": {\"type\": \"string\"}, \"quote\": {\"type\": \"string\"}, \"slide_index\": {\"type\": \"integer\"} }, \"required\": [\"persona_id\", \"stance\", \"reason\", \"quote\", \"slide_index\"]} }, \"slides\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"index\": {\"type\": \"integer\"}, \"covered\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} }, \"missed\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} }, \"marks\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"quote\": {\"type\": \"string\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"hedge\", \"unsupported\", \"wrong_fact\", \"landed\"]}, \"note\": {\"type\": \"string\"}, \"better\": {\"type\": \"string\"} }, \"required\": [\"quote\", \"kind\", \"note\", \"better\"]} }, \"notes\": {\"type\": \"string\"} }, \"required\": [\"index\", \"covered\", \"missed\", \"marks\", \"notes\"]} }, \"drill\": {\"type\": \"object\", \"properties\": {\"title\": {\"type\": \"string\"}, \"focus_persona\": {\"type\": \"string\"}, \"slides\": {\"type\": \"array\", \"items\": {\"type\": \"integer\"} }, \"minutes\": {\"type\": \"integer\"} }, \"required\": [\"title\", \"focus_persona\", \"slides\", \"minutes\"]}, \"weak_spots\": {\"type\": \"array\", \"items\": {\"type\": \"string\"} } }, \"required\": [\"headline\", \"metrics\", \"stakeholders\", \"slides\", \"drill\", \"weak_spots\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
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

const buildDebrief = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Build the debrief",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// The debrief (docs/CONTRACT.md, POST /debrief result): the model's judgement held to what was really said (every quote must be in the\n// transcript, so the report can underline it), with the counted numbers, the overall score and the history.\nconst r = $('Read the session').first().json;\nconst d = JSON.parse(replyText($json) || '{}');\nconst personas = r.bundle.personas || [];\nconst ids = personas.map(p => p.id);\nconst turns = r.telemetry.events.filter(e => e.type === 'turn');\n// A quote as it appears in the transcript (the model sometimes changes case or spacing), or null if it isn't there\nconst find = (text, quote) => {\n  const q = String(quote || '').trim().replace(/^[\"']|[\"'.,]$/g, '');\n  if (q.length < 3 || !text) return null;\n  const at = text.toLowerCase().indexOf(q.toLowerCase());\n  return at < 0 ? null : text.slice(at, at + q.length);\n};\n// When a quote was said: the turn whose transcript has it\nconst moment = (quote, slideIndex) => {\n  const t = turns.find(x => find(x.transcript, quote));\n  if (!t) return null;\n  return { t: t.t, slide_index: t.slide_index, quote: find(t.transcript, quote) };\n};\nconst NAMES = ['Clarity', 'Evidence', 'Objection handling', 'Structure'];\nconst clamp = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));\nconst metrics = NAMES.map(n => {\n  const m = (d.metrics || []).find(x => x.name === n) || { score: 50, explanation: '', evidence: [] };\n  return { name: n, score: clamp(m.score), explanation: m.explanation || '', evidence: (m.evidence || []).map(e => moment(e.quote, e.slide_index)).filter(Boolean).slice(0, 2) };\n}).concat([r.pacing]);\nconst overall = Math.round(metrics.reduce((a, m) => a + m.score, 0) / metrics.length);\nconst stakeholders = ids.map(id => {\n  const s = (d.stakeholders || []).find(x => x.persona_id === id) || { stance: 'undecided', reason: '' };\n  return { persona_id: id, stance: ['backs', 'undecided', 'opposes'].includes(s.stance) ? s.stance : 'undecided', reason: s.reason || '',\n           deciding_moment: s.quote ? moment(s.quote, s.slide_index) : null };\n});\nlet marks = 0;\nconst slides = r.slides.map(s => {\n  const j = (d.slides || []).find(x => x.index === s.index) || { covered: [], missed: [], marks: [], notes: '' };\n  const judged = (j.marks || []).map(m => ({ ...m, quote: find(s.transcript, m.quote) })).filter(m => m.quote)\n    .map(m => ({ quote: m.quote, kind: m.kind, note: m.note || '', better: m.kind === 'landed' ? '' : (m.better || '') })).slice(0, 4);\n  const fillers = s.fillers.map(f => ({ quote: f, kind: 'filler', note: s.filler_count > 1 ? 'Filler word (' + s.filler_count + ' on this slide)' : 'Filler word', better: '' }));\n  marks += judged.length;\n  return { index: s.index, transcript: s.transcript, seconds: s.seconds, target_seconds: s.target_seconds, words_per_minute: s.words_per_minute,\n           covered: j.covered || [], missed: j.missed || [], marks: judged.concat(fillers), notes: j.notes || '' };\n});\nconst dr = d.drill || {};\nconst drill = { title: dr.title || 'Run it again', focus_persona: ids.includes(dr.focus_persona) ? dr.focus_persona : (ids[0] || ''),\n                slides: (dr.slides || []).filter(i => r.slides.some(s => s.index === i)), minutes: Math.max(2, Math.min(5, Math.round(dr.minutes || 3))) };\nconst g = r.telemetry.gaze_dwell_s;\nconst facing = g ? { slides_s: r.telemetry.facing_slides_s || 0, longest_gap: null } : null;\nconst debrief = { headline: d.headline || '', overall, previous_overall: r.history.length ? r.history[r.history.length - 1].overall : null,\n                  stakeholders, metrics, slides, facing, drill, weak_spots: (d.weak_spots || []).slice(0, 3), actions_taken: ['weak_spots_saved'] };\nreturn [{ json: { session_id: r.session_id, debrief, marks, backs: stakeholders.filter(s => s.stance === 'backs').length } }];"
    },
    "output": [
  {
    "session_id": "s1",
    "debrief": {
      "metrics": [],
      "stakeholders": [],
      "drill": {
        "title": ""
      },
      "weak_spots": []
    },
    "marks": 0,
    "backs": 0
  }
]
  }
});

const rowJudged = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Row: judged",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const ran = name => { try { return $(name).isExecuted; } catch (e) { return false; } };\nconst out = name => (ran(name) ? $(name).first().json : null);\nconst read = $('Read the session').first().json;\nconst judged = out('Build the debrief');\nconst mailed = out('Email the report');\nconst step = (id, label, done, running, doneText, runningText) => ({ id, label, state: done ? 'done' : running ? 'running' : 'pending', detail: done ? doneText : running ? runningText : '' });\nconst debriefSteps = [\n  step('read', 'Read the transcript', true, false, read.summary, ''),\n  step('judge', 'Judged the pitch', !!judged, true,\n    judged ? 'Scored ' + judged.debrief.metrics.length + ' things with evidence, marked ' + judged.marks + ' moments, ' + judged.backs + ' of ' + judged.debrief.stakeholders.length + ' would back it' : '',\n    'Marking the transcript, scoring the answers and reading the room'),\n  step('plan', 'Planned the next rehearsal', !!judged, !!judged,\n    judged ? 'Drill: ' + judged.debrief.drill.title + (judged.debrief.weak_spots.length ? '. The panel will press on ' + judged.debrief.weak_spots.join(', ') : '') : '', ''),\n  step('email', 'Emailed you the report', !!mailed && !mailed.error, !!judged, 'To ' + (read.owner_email || 'you'), 'Emailing you the report'),\n];\nif (mailed && mailed.error) Object.assign(debriefSteps[3], { state: 'error', detail: \"Couldn't email the report\" });\nconst statusFields = { debrief_status: JSON.stringify({ done: !!mailed, steps: debriefSteps }), execution_id: String($execution.id), workflow_id: String($workflow.id), updated_at: new Date().toISOString() };\n\nconst j = $('Build the debrief').first().json;\nreturn [{ json: { session_id: j.session_id, overall: j.debrief.overall, headline: j.debrief.headline, ...statusFields } }];"
    },
    "output": [
  {
    "session_id": "s1"
  }
]
  }
});

const saveJudged = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save progress: judged",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "xzUZexBbX6bcX18F",
        "cachedResultName": "DryRun sessions"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "session_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.session_id }}")
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

const emailReport = node({
  type: "n8n-nodes-base.gmail",
  version: 2.2,
  config: {
    "name": "Email the report",
    "parameters": {
      "resource": "message",
      "operation": "send",
      "sendTo": expr("{{ $('Read the session').first().json.owner_email }}"),
      "subject": expr("{{ (() => { const r = $('Read the session').first().json; const d = $('Build the debrief').first().json.debrief; return 'Your rehearsal for ' + ((r.bundle.prospect || {}).company || 'your meeting') + ': ' + d.overall + '/100'; })() }}"),
      "emailType": "html",
      "message": expr("{{ (() => { const r = $('Read the session').first().json; const d = $('Build the debrief').first().json.debrief; const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); const who = id => ((r.bundle.personas || []).find(p => p.id === id) || {}).display_name || id; const STANCE = { backs: 'would back it', undecided: 'is undecided', opposes: 'is not convinced' }; return '<h2>' + esc(d.headline) + '</h2><p><b>' + d.overall + '/100</b>' + (d.previous_overall != null ? ' (last time ' + d.previous_overall + ')' : '') + '</p>' + '<h3>The room</h3><ul>' + d.stakeholders.map(s => '<li><b>' + esc(who(s.persona_id)) + '</b> ' + STANCE[s.stance] + '. ' + esc(s.reason) + '</li>').join('') + '</ul>' + '<h3>Scores</h3><ul>' + d.metrics.map(m => '<li>' + esc(m.name) + ': ' + m.score + '. ' + esc(m.explanation) + '</li>').join('') + '</ul>' + '<h3>Next time</h3><p><b>' + esc(d.drill.title) + '</b>, ' + d.drill.minutes + ' minutes against ' + esc(who(d.drill.focus_persona)) + '.' + (d.weak_spots.length ? ' The panel will press on ' + esc(d.weak_spots.join(', ')) + '.' : '') + '</p>' + '<p><a href=\"http://localhost:3000/s/' + encodeURIComponent(r.session_id) + '/report\">Open the full report</a>: what you said on each slide, marked up, with a talk track for next time.</p>'; })() }}"),
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

const rowDone = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Row: done",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const ran = name => { try { return $(name).isExecuted; } catch (e) { return false; } };\nconst out = name => (ran(name) ? $(name).first().json : null);\nconst read = $('Read the session').first().json;\nconst judged = out('Build the debrief');\nconst mailed = out('Email the report');\nconst step = (id, label, done, running, doneText, runningText) => ({ id, label, state: done ? 'done' : running ? 'running' : 'pending', detail: done ? doneText : running ? runningText : '' });\nconst debriefSteps = [\n  step('read', 'Read the transcript', true, false, read.summary, ''),\n  step('judge', 'Judged the pitch', !!judged, true,\n    judged ? 'Scored ' + judged.debrief.metrics.length + ' things with evidence, marked ' + judged.marks + ' moments, ' + judged.backs + ' of ' + judged.debrief.stakeholders.length + ' would back it' : '',\n    'Marking the transcript, scoring the answers and reading the room'),\n  step('plan', 'Planned the next rehearsal', !!judged, !!judged,\n    judged ? 'Drill: ' + judged.debrief.drill.title + (judged.debrief.weak_spots.length ? '. The panel will press on ' + judged.debrief.weak_spots.join(', ') : '') : '', ''),\n  step('email', 'Emailed you the report', !!mailed && !mailed.error, !!judged, 'To ' + (read.owner_email || 'you'), 'Emailing you the report'),\n];\nif (mailed && mailed.error) Object.assign(debriefSteps[3], { state: 'error', detail: \"Couldn't email the report\" });\nconst statusFields = { debrief_status: JSON.stringify({ done: !!mailed, steps: debriefSteps }), execution_id: String($execution.id), workflow_id: String($workflow.id), updated_at: new Date().toISOString() };\n\n// The finished debrief, and the whole session record the laptop gets back (the same as GET /session)\nconst r = $('Read the session').first().json;\nconst j = $('Build the debrief').first().json;\nconst mailedOk = !!mailed && !mailed.error;\nconst debrief = { ...j.debrief, actions_taken: (mailedOk ? ['report_emailed'] : []).concat(j.debrief.actions_taken) };\nreturn [{ json: { session_id: r.session_id, status: 'done', overall: debrief.overall, headline: debrief.headline, debrief: JSON.stringify(debrief), ...statusFields } }];"
    },
    "output": [
  {
    "session_id": "s1",
    "debrief": "{}",
    "debrief_status": "{}"
  }
]
  }
});

const saveDone = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save: debriefed",
    "parameters": {
      "resource": "row",
      "operation": "upsert",
      "dataTableId": {
        "__rl": true,
        "mode": "id",
        "value": "xzUZexBbX6bcX18F",
        "cachedResultName": "DryRun sessions"
      },
      "matchType": "allConditions",
      "filters": {
        "conditions": [
          {
            "keyName": "session_id",
            "condition": "eq",
            "keyValue": expr("{{ $json.session_id }}")
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

const practised = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Mark the meeting practised",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The meeting now has a rehearsal behind it (shown on the web app's home page)\nconst r = $('Read the session').first().json;\n// (always one item, so the reply still goes out for a session without a meeting: 'none' matches no row)\nreturn [{ json: { meeting_id: r.meeting_id || 'none', status: 'practised', updated_at: new Date().toISOString() } }];"
    },
    "output": [
  {
    "meeting_id": "evt123"
  }
]
  }
});

const savePractised = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save: practised",
    "parameters": {
      "resource": "row",
      "operation": "update",
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
        "mappingMode": "defineBelow",
        "value": {
          "status": expr("{{ $json.status }}"),
          "updated_at": expr("{{ $json.updated_at }}")
        },
        "matchingColumns": [],
        "schema": [
          {
            "id": "status",
            "displayName": "status",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          },
          {
            "id": "updated_at",
            "displayName": "updated_at",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "type": "string",
            "canBeUsedToMatch": true
          }
        ]
      }
    },
    "onError": "continueRegularOutput",
    "alwaysOutputData": true,
    "output": [
  {
    "id": 1
  }
]
  }
});

const theRecord = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "The session record",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The whole session, the same as GET /session gives, for the laptop that is waiting on this run\nconst r = $('Read the session').first().json;\nconst done = $('Row: done').first().json;\nreturn [{ json: { bundle: r.bundle, status: { done: true, steps: [] }, telemetry: r.telemetry, debrief_status: JSON.parse(done.debrief_status),\n                  debrief: JSON.parse(done.debrief), history: r.history } }];"
    },
    "output": [
  {
    "bundle": {},
    "debrief": {}
  }
]
  }
});

const replyDebrief = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send the debrief",
    "parameters": {
      "respondWith": "firstIncomingItem",
      "options": {}
    },
    "output": [
  {}
]
  }
});

const sessionTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "GET /session",
    "parameters": {
      "httpMethod": "GET",
      "path": "dryrun/session",
      "responseMode": "responseNode",
      "options": {}
    },
    "output": [
  {
    "query": {
      "session_id": "s1"
    }
  }
]
  }
});

const readSessions = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Read sessions",
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
    "output": [
  {
    "session_id": "s1",
    "meeting_id": "evt123",
    "status": "done"
  }
]
  }
});

const shapeSession = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "The session",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// docs/CONTRACT.md, GET /session: the record, or 404\nconst id = $('GET /session').first().json.query.session_id;\nconst rows = $input.all().map(i => i.json).filter(r => r.session_id);\nconst row = rows.find(r => String(r.session_id) === String(id));\nconst parse = x => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };\nif (!row) return [{ json: { code: 404, body: { error: 'not found' } } }];\nconst history = rows.filter(r => r.meeting_id === row.meeting_id && r.session_id !== row.session_id && r.status === 'done' && typeof r.overall === 'number'\n  && Date.parse(r.at) < Date.parse(row.at)).sort((x, y) => Date.parse(x.at) - Date.parse(y.at)).map(r => ({ session_id: r.session_id, at: r.at, overall: r.overall }));\nreturn [{ json: { code: 200, body: { bundle: parse(row.bundle), status: { done: true, steps: [] }, telemetry: parse(row.telemetry),\n  debrief_status: parse(row.debrief_status), debrief: row.status === 'done' ? parse(row.debrief) : null, history, state: row.status } } }];"
    },
    "output": [
  {
    "code": 200,
    "body": {}
  }
]
  }
});

const sendSession = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send the session",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify($json.body) }}"),
      "options": {
        "responseCode": expr("{{ $json.code }}")
      }
    },
    "output": [
  {}
]
  }
});

const about = sticky('## DryRun debrief\nWhen a rehearsal ends (POST /webhook/dryrun/debrief, docs/CONTRACT.md): counts the time, pace and filler words on each slide, has the model judge the pitch against the plan and the panel (marks on the transcript, scores with evidence, who would back it, a talk track per slide, the drill and weak spots), saves it to the DryRun sessions table step by step, emails the report and marks the meeting practised. The next /prep for the meeting reads it. GET /webhook/dryrun/session reads one session.', [debriefTrigger, sessionTrigger], { color: 4 });

export default workflow('dryrun-debrief', 'DryRun debrief')
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
