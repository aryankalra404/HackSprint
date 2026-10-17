import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, fromAi, expr } from '@n8n/workflow-sdk';

const turnTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "What the presenter said (headset)",
    "parameters": {
      "httpMethod": "POST",
      "path": "dryrun/turn",
      "responseMode": "responseNode",
      "options": {}
    },
    "output": [
  {
    "body": {
      "session_id": "s1",
      "mode": "segment",
      "slide_index": 1,
      "t": 42.0,
      "audio_base64": "UklGRg==",
      "audio_format": "m4a",
      "context": {
        "bundle": {
          "personas": [],
          "slides": [],
          "lines": [],
          "plan": {
            "during_pitch": 1,
            "after_pitch": 1,
            "why": ""
          },
          "pitch_seconds": 120,
          "prospect": {
            "company": "Delhivery"
          }
        },
        "elapsed_s": 42.0,
        "turns": [],
        "threads": [],
        "pending": []
      }
    }
  }
]
  }
});

const readAudio = node({
  type: "n8n-nodes-base.convertToFile",
  version: 1.1,
  config: {
    "name": "Read the speech",
    "parameters": {
      "operation": "toBinary",
      "sourceProperty": "body.audio_base64",
      "options": {
        "fileName": expr("{{ $json.body.audio_format === 'm4a' ? 'turn.m4a' : 'turn.wav' }}"),
        "mimeType": expr("{{ $json.body.audio_format === 'm4a' ? 'audio/mp4' : 'audio/wav' }}")
      }
    },
    "onError": "continueRegularOutput",
    "output": [
  {}
]
  }
});

const transcribe = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Transcribe (Groq Whisper)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/audio/transcriptions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "contentType": "multipart-form-data",
      "bodyParameters": {
        "parameters": [
          {
            "parameterType": "formBinaryData",
            "name": "file",
            "inputDataFieldName": "data"
          },
          {
            "name": "model",
            "value": "whisper-large-v3-turbo"
          },
          {
            "name": "language",
            "value": "en"
          },
          {
            "name": "response_format",
            "value": "json"
          },
          {
            "name": "prompt",
            "value": expr("{{ (() => { const b = $json.body || $('What the presenter said (headset)').first().json.body; const ctx = b.context || {}; const bundle = ctx.bundle || {}; const people = bundle.personas || []; const who = people.find(p => p.id === b.asked_by); const open = b.mode === 'answer' ? (ctx.threads || ctx.pending || []).filter(t => t.persona_id === b.asked_by && t.status !== 'answered' && t.status !== 'parked' && t.status !== 'dodged').pop() : null; return [open ? open.text : '', who ? who.display_name : '', (bundle.prospect || {}).company].concat((bundle.slides || []).map(s => s.title), people.map(p => p.display_name)).filter(Boolean).join(', ').slice(0, 600); })() }}")
          }
        ]
      },
      "options": {
        "timeout": 30000
      }
    },
    "onError": "continueRegularOutput",
    "credentials": { "groqApi": newCredential("Groq") },
    "output": [
  {
    "text": "So at your scale, that is a meaningful saving in the first year."
  }
]
  }
});

const context = node({
  type: "n8n-nodes-base.set",
  version: 3.4,
  config: {
    "name": "What the room knows",
    "parameters": {
      "mode": "manual",
      "assignments": {
        "assignments": [
          {
            "id": "context",
            "name": "room",
            "type": "object",
            "value": expr("{{ (() => {\n// The moment, its audio as a file for transcription, and the context the laptop sent (docs/CONTRACT.md, POST /turn).\n// n8n keeps no state between turns: everything it decides from is here.\nconst q = $('What the presenter said (headset)').first().json.body;\nconst ctx = q.context || {};\nconst bundle = ctx.bundle || {};\nconst turns = ctx.turns || [];\nconst pitchEnd = turns.findIndex(t => t.mode === 'pitch_end');\nconst askedDuring = turns.filter((t, i) => (pitchEnd < 0 || i < pitchEnd) && t.mode !== 'pitch_end').reduce((a, t) => a + (t.reactions || []).filter(r => r.kind === 'question').length, 0);\nconst askedAfter = pitchEnd < 0 ? 0 : turns.slice(pitchEnd).reduce((a, t) => a + (t.reactions || []).filter(r => r.kind === 'question').length, 0);\n// Every question's life (0.26), kept by the laptop. An older laptop sends only the pending questions: they become open threads.\nconst threads = (ctx.threads || (ctx.pending || []).map((q, i) => ({ id: 'q' + (i + 1), persona_id: q.persona_id, text: q.text, slide_index: q.slide_index, status: 'open', follow_ups: 0, planned: false })));\n// An answer answers the asker's latest thread that's still open. With none, it answers the chair's way-back-in question after a freeze,\n// which the client asked from the bundle without n8n (0.26): that becomes a thread too.\nlet answering = q.mode === 'answer' && q.asked_by ? threads.filter(t => t.persona_id === q.asked_by && (t.status === 'open' || t.status === 'followed_up')).pop() : null;\nconst rescue = q.mode === 'answer' && !answering ? (bundle.lines || []).find(l => l.kind === 'rescue_question' && l.persona_id === q.asked_by && l.slide_index === q.slide_index) : null;\nif (rescue) {\n  answering = { id: 'q' + (threads.length + 1), persona_id: rescue.persona_id, text: rescue.text, slide_index: q.slide_index, status: 'open', follow_ups: 0, planned: true };\n  threads.push(answering);\n}\nconst r = { session_id: q.session_id, mode: q.mode, slide_index: q.slide_index, t: q.t, asked_by: q.asked_by || '', mid_slide: !!q.mid_slide, time_up: !!q.time_up,\n               pause: q.mode === 'segment' && !!q.pause, floor_opened: q.mode === 'pitch_end' && !!q.floor_opened,\n               bundle, elapsed: Math.round(ctx.elapsed_s || q.t || 0),\n               turns, threads, answering_id: answering ? answering.id : '', asked_during: askedDuring, asked_after: askedAfter };\n\n// The prompt, kept short: a live turn should take a few seconds, and Groq's free tier allows 8,000 tokens a minute\nconst PROMPT = \"You are the panel in a rehearsal of a real meeting, deciding how the room reacts to what the presenter just said.\\nReact as these people would in this meeting: realistic, specific, never theatrical. During the pitch, most of the time nobody speaks.\\n\\nThe meeting: {meeting}\\nThe plan for questions: {plan}. Asked so far: {asked_during} during the pitch, {asked_after} after it.\\nTime: {time}\\nThe panel: {personas}\\nLines voiced ahead of time (use one by its line_id when it fits, instead of new text): {lines}\\nThe slide on screen: {slide}\\nWhat has happened so far, oldest first: {turns}\\nEvery question asked so far (threads): {threads}\\n\\nThis moment: {mode}{asked_by}\\nWhat the presenter just said: \\\"{transcript}\\\"\\n\\nWhat to do for each moment:\\n- opening (their first words): if they introduced themselves or greeted the room, the chair welcomes them (kind \\\"welcome\\\", its line_id).\\n  If they went straight into the pitch, or said nothing, no reaction.\\n- segment (what they said on one slide): decide whether anyone interrupts now. Only someone whose manner is \\\"interrupts\\\", only while\\n  questions during the pitch remain in the plan (a guide: break it only for something that really matters), and only about this slide\\n  or what was just said: a claim with nothing behind it, a number that does not add up, a gap against their objections or the research.\\n  Never ask what the presenter already covered, nor anything a thread already asks. A question: kind \\\"question\\\", raise_hand true,\\n  one or two sentences in that person's voice, referring to what was said. Otherwise no reaction. A segment sent mid-slide comes\\n  at one of the plan's interruption points (plan.interrupts): the hand there goes up only if that point still matters after what\\n  was said; if the presenter already answered it, nobody reacts.\\n- answer (to the thread in this moment): judge it in answer_verdict: \\\"resolved\\\" (direct and specific), \\\"partial\\\" or \\\"dodged\\\", and set\\n  presenter_unsure true if they said they don't know, aren't sure or will come back to it. The person who asked reacts, once:\\n  resolved: an \\\"acknowledge\\\" line (by line_id). Unsure: they accept it and park it, kind \\\"park\\\" (\\\"That's fine, send it to us after.\\\").\\n  Partial or dodged: one \\\"follow_up\\\" only if the thread has had none yet (follow_ups 0) and it matters; if it already had one, they let\\n  it go, kind \\\"move_on\\\" (\\\"Okay, let's leave that there.\\\"), visibly unconvinced if it was dodged. Never a second follow-up.\\n  During the pitch, unless there is a follow-up, the asker then hands back to the pitch, kind \\\"hand_back\\\" (\\\"Thanks, please go on.\\\"),\\n  and nobody asks anything new. After the pitch, nobody hands back or says \\\"go on\\\" (there is no pitch to go back to); add what comes next: the next \\\"question\\\" from whoever matters most (an open thread\\n  first, with its thread_id), or, once the questions in the plan are done or time is well past the pitch, the chair's \\\"closing\\\".\\n  Like a real panel, the next question can build on what was just said by someone else (\\\"Building on Sneha's point, ...\\\"), or the\\n  chair can check back with the asker within their question (\\\"Sneha, does that cover it? Then, ...\\\"), when it fits.\\n- park, move_on and hand_back: leave text and line_id empty; a line voiced ahead of time plays.\\n- Threads: every question has one life: asked, at most one follow-up, then closed (answered, parked or dodged). Never ask a closed\\n  thread again or anything close to it. To ask an open thread again (a hand that went down), give its thread_id; a new question has\\n  an empty thread_id; a follow-up, park, move_on or hand_back has the thread_id of the thread being answered.\\n- pitch_end (the pitch is over): the chair opens the floor (kind \\\"open_floor\\\", its line_id), then the first \\\"question\\\" from whoever\\n  matters most, an open thread first. If the plan has no questions after the pitch, the chair closes instead. If the chair has just\\n  stopped the pitch for time, or has already opened the floor, they have moved to the questions: no open_floor, straight to the first\\n  question.\\n- closing (by the chair): how this kind of meeting really ends, in one or two sentences, fitting how it went and what the presenter\\n  wants (a next step towards it if it went well, polite and noncommittal if not), and end_session true.\\nAfter the pitch, questions are asked directly (raise_hand false). Every reaction has a reason: one sentence on why this person said this\\nnow, which the presenter reads afterwards. note: one short sentence to the presenter (\\\"you\\\") on how this moment landed, matching what\\nactually happens in reactions, also when nobody reacts (e.g. \\\"You put a number on the savings, so Rajiv held his cost question.\\\").\\nSpoken English, natural, short. Answer in JSON.\";\nconst b = r.bundle;\nconst transcript = String($('Transcribe (Groq Whisper)').first().json.text || '').trim();\nconst personas = (b.personas || []).map(p => ({ id: p.id, name: p.display_name, role: p.role, manner: p.manner, chair: p.chair, difficulty: p.difficulty,\n  priorities: p.priorities, objections: (p.objections || []).map(o => (o.slide_index >= 0 ? 'slide ' + (o.slide_index + 1) + ': ' : '') + o.text) }));\nconst slide = (b.slides || []).find(s => s.index === r.slide_index);\nconst name = id => ((b.personas || []).find(p => p.id === id) || {}).display_name || id;\nconst history = r.turns.slice(-12).map(t => '[' + t.mode + (t.slide_index >= 0 ? ', slide ' + (t.slide_index + 1) : '') + '] presenter: \"' + String(t.transcript || '').slice(0, 400) + '\"'\n  + (t.reactions || []).map(x => ' | ' + name(x.persona_id) + ' (' + x.kind + '): \"' + x.text + '\"').join('') + (t.answer_verdict ? ' | answer ' + t.answer_verdict : '')).join('\\n') || 'Nothing yet.';\nconst parts = {\n  meeting: (b.prospect && b.prospect.company ? 'with ' + b.prospect.company : 'a meeting') + (b.offer ? '. The presenter offers: ' + b.offer : '') + (b.goal ? '. They want: ' + b.goal : ''),\n  plan: JSON.stringify(b.plan || {}),\n  asked_during: String(r.asked_during), asked_after: String(r.asked_after),\n  // With a limit, how the chair keeps time; with none (time null, 0.25), the pitch length is only an estimate\n  time: b.time && b.time.limit_s ? r.elapsed + ' seconds in, for a pitch of ' + b.time.limit_s + ' seconds' + (b.time.cut_at_s ? '; the chair stops the pitch at ' + b.time.cut_at_s + ' seconds' : '') + '.'\n    : b.time === null ? r.elapsed + ' seconds in. No time limit (about ' + (b.pitch_seconds || 0) + ' seconds is only an estimate).'\n    : r.elapsed + ' seconds in, for a pitch of ' + (b.pitch_seconds || 0) + ' seconds.',\n  // Generic lines (0.26) aren't listed: n8n's code picks them for a park, move-on or hand-back\n  personas: JSON.stringify(personas), lines: JSON.stringify((b.lines || []).filter(l => !l.generic && l.kind !== 'rescue_question').map(l => ({ line_id: l.id, persona_id: l.persona_id, kind: l.kind, text: l.text }))),\n  slide: slide ? JSON.stringify({ number: slide.index + 1, title: slide.title, key_points: slide.key_points }) : 'No slides.',\n  turns: history,\n  threads: r.threads.length ? r.threads.map(t => t.id + ' (' + name(t.persona_id) + ', ' + t.status + ', follow-ups ' + (t.follow_ups || 0) + '): \"' + t.text + '\"').join('; ') : 'None yet.',\n  mode: r.mode + (r.mid_slide ? \" (mid-slide, at one of the plan's interruption points)\" : '') + (r.time_up ? ' (the chair just stopped the pitch for time)' : '')\n    + (r.floor_opened ? ' (the chair has already opened the floor)' : ''),\n  asked_by: r.asked_by ? ' (answering ' + name(r.asked_by) + ', id ' + r.asked_by + (r.answering_id ? ', thread ' + r.answering_id : '') + ')' : '', transcript,\n};\n// Each {name} in the prompt filled in by splitting, so nothing in the text is read as a replacement pattern\nconst prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);\n// No question is possible on this slide (0.26): \"Check the reactions\" would drop any, so the model is skipped\nconst said = transcript.toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean).length;\nconst interrupters = (b.personas || []).filter(p => p.manner !== 'waits');\n// A pause near the end of the pitch (0.34): did the presenter say they've finished? Checked on their last words, without the model, so\n// the chair can open the floor at once. A pause without a finish is only listened to: the slide's segment carries the words.\nconst spoken = transcript.toLowerCase().replace(/[\u2019\u2018]/g, \"'\").replace(/[^a-z']+/g, ' ').split(' ').filter(Boolean);\n// Clear ones anywhere in the last words (\"happy to take questions\"); short ones (\"that's it\", \"thank you\") only as the very last words\nconst FINISH = /(end of (the|my|our) (pitch|presentation)|(done|finished) with (the|my|our) (pitch|presentation)|(happy|glad|open|ready) to (take|answer|hear) (any |your |some )?questions|(any|over to you for) questions|open (it|the floor) (up )?(to|for) (you|questions)|over to (you|the panel)|thank you (so much |very much |all )?for (listening|your time|having)|that (concludes|wraps up|was) (my|our|the) (pitch|presentation|demo))/;\nconst LAST = /(that'?s (all|it|everything|about it)|that (was|is) (it|all|everything)|(i ?'?m|i am|we ?'?re|we are) (done|finished))( from (me|us|our side|my side))?( for now| for today| guys)?$/;\n// A bare \"thank you\" only on the last slide (or without a deck): Whisper sometimes adds one after the last words\nconst THANKS = /(thank you|thanks)( so much| very much| all| everyone)?$/;\nconst onLast = !(b.slides || []).length || r.slide_index >= (b.slides || []).length - 1;\nconst finished = r.pause && (FINISH.test(spoken.slice(-14).join(' ')) || LAST.test(spoken.slice(-7).join(' ')) || (onLast && THANKS.test(spoken.slice(-4).join(' '))));\nconst skip = r.pause || (r.mode === 'segment' && (!interrupters.length || said < (r.mid_slide ? 12 : 25) || (r.slide_index === 0 && !r.mid_slide)));\nconst skip_note = !skip ? '' : finished ? 'You said you had finished, so the chair opened the floor.'\n  : r.pause ? 'You paused, and the panel waited for you to go on.'\n  : !said ? 'Nothing came through on this slide, so the panel just listened.'\n  : !interrupters.length ? 'Nobody on this panel interrupts a pitch, so they held their questions.'\n  : r.slide_index === 0 && !r.mid_slide ? 'Your opening slide: the panel let you get going.' : 'Only a few words on this slide, so nobody cut in.';\nreturn { ...r, transcript, prompt, skip, skip_note, finished };\n})() }}")
          }
        ]
      },
      "options": {}
    },
    "output": [
  {
    "room": {
      "mode": "segment",
      "transcript": "",
      "prompt": "",
      "skip": false,
      "skip_note": ""
    }
  }
]
  }
});

const couldAsk = ifElse({
  type: "n8n-nodes-base.if",
  version: 2.3,
  config: {
    "name": "Could anyone ask?",
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "leftValue": expr("{{ !$json.room.skip }}"),
            "rightValue": "",
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
    "room": {
      "skip": false
    }
  }
]
  }
});

const nobody = node({
  type: "n8n-nodes-base.set",
  version: 3.4,
  config: {
    "name": "Nobody reacts",
    "parameters": {
      "mode": "manual",
      "assignments": {
        "assignments": [
          {
            "id": "nobody",
            "name": "reply",
            "type": "object",
            "value": expr("{{ (() => {\n// Nobody could have asked here: no model call, just the transcript and why nobody spoke. Or the presenter said they've finished at a\n// pause (0.34): the chair opens the floor with the line voiced ahead of time, and the client sends the pitch end for the first question.\nconst r = $('What the room knows').first().json.room;\nconst chair = (r.bundle.personas || []).find(p => p.chair) || (r.bundle.personas || [])[0];\nconst floor = r.finished && chair ? (r.bundle.lines || []).find(l => l.persona_id === chair.id && l.kind === 'open_floor') : null;\nconst reactions = floor ? [{ persona_id: chair.id, kind: 'open_floor', text: floor.text, line_id: floor.id, raise_hand: false, reason: 'You said you had finished, so the chair opened the floor.' }] : [];\nreturn { transcript: r.transcript, note: r.skip_note, reactions, answer_verdict: null, threads: [], end_session: false, ...(r.finished ? { pitch_over: true } : {}) };\n})() }}")
          }
        ]
      },
      "options": {}
    },
    "output": [
  {
    "reply": {
      "transcript": "",
      "note": "",
      "reactions": []
    }
  }
]
  }
});

const decide = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Decide who reacts",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $('What the room knows').first().json.room; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 4096, messages: [{ role: 'user', content: (j.prompt) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"note\": {\"type\": \"string\"}, \"reactions\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"persona_id\": {\"type\": \"string\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"welcome\", \"question\", \"follow_up\", \"acknowledge\", \"park\", \"move_on\", \"hand_back\", \"open_floor\", \"closing\"]}, \"text\": {\"type\": \"string\"}, \"line_id\": {\"type\": \"string\", \"description\": \"A line voiced ahead of time, or empty\"}, \"raise_hand\": {\"type\": \"boolean\"}, \"reason\": {\"type\": \"string\"}, \"thread_id\": {\"type\": \"string\", \"description\": \"The thread this belongs to, or empty for a new question\"} }, \"required\": [\"persona_id\", \"kind\", \"text\", \"line_id\", \"raise_hand\", \"reason\", \"thread_id\"]} }, \"answer_verdict\": {\"type\": \"string\", \"enum\": [\"resolved\", \"partial\", \"dodged\", \"none\"]}, \"presenter_unsure\": {\"type\": \"boolean\"}, \"end_session\": {\"type\": \"boolean\"} }, \"required\": [\"note\", \"reactions\", \"answer_verdict\", \"presenter_unsure\", \"end_session\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
      "options": {
        "timeout": 30000
      }
    },
    "onError": "continueErrorOutput",
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

const decideGemini = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Decide who reacts (Gemini)",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $('What the room knows').first().json.room; return JSON.stringify({ contents: [{ parts: [{ text: j.prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"note\": {\"type\": \"string\"}, \"reactions\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"persona_id\": {\"type\": \"string\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"welcome\", \"question\", \"follow_up\", \"acknowledge\", \"park\", \"move_on\", \"hand_back\", \"open_floor\", \"closing\"]}, \"text\": {\"type\": \"string\"}, \"line_id\": {\"type\": \"string\", \"description\": \"A line voiced ahead of time, or empty\"}, \"raise_hand\": {\"type\": \"boolean\"}, \"reason\": {\"type\": \"string\"}, \"thread_id\": {\"type\": \"string\", \"description\": \"The thread this belongs to, or empty for a new question\"} }, \"required\": [\"persona_id\", \"kind\", \"text\", \"line_id\", \"raise_hand\", \"reason\", \"thread_id\"]} }, \"answer_verdict\": {\"type\": \"string\", \"enum\": [\"resolved\", \"partial\", \"dodged\", \"none\"]}, \"presenter_unsure\": {\"type\": \"boolean\"}, \"end_session\": {\"type\": \"boolean\"} }, \"required\": [\"note\", \"reactions\", \"answer_verdict\", \"presenter_unsure\", \"end_session\"]} } }); })() }}"),
      "options": {
        "timeout": 120000
      }
    },
    "retryOnFail": false,
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

const check = node({
  type: "n8n-nodes-base.set",
  version: 3.4,
  config: {
    "name": "Check the reactions",
    "parameters": {
      "mode": "manual",
      "assignments": {
        "assignments": [
          {
            "id": "check",
            "name": "out",
            "type": "object",
            "value": expr("{{ (() => {\nconst replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\nconst r = $('What the room knows').first().json.room;\nconst d = JSON.parse(replyText($json) || '{}');\nconst people = Object.fromEntries((r.bundle.personas || []).map(p => [p.id, p]));\nconst lines = Object.fromEntries((r.bundle.lines || []).map(l => [l.id, l]));\nconst name = id => ((people[id] || {}).display_name || id).split(' ')[0];\nconst KINDS = ['welcome', 'question', 'follow_up', 'acknowledge', 'park', 'move_on', 'hand_back', 'open_floor', 'closing'];\n// Park, move-on and hand-back need no text: a generic line plays (0.26)\nconst SOCIAL = ['park', 'move_on', 'hand_back'];\n// The model sometimes starts a line with who says it (\"Rohan: ...\"), which the voice would read out\nconst unnamed = (p, text) => { const t = String(text || '').trim(); const first = String(p.display_name || '').split(' ')[0];\n  return [p.display_name, first, p.role_short].filter(Boolean).reduce((a, n) => (a.toLowerCase().startsWith(n.toLowerCase() + ':') ? a.slice(n.length + 1).trim() : a), t); };\nlet reactions = (d.reactions || []).filter(x => people[x.persona_id] && KINDS.includes(x.kind) && (x.text || lines[x.line_id] || SOCIAL.includes(x.kind)))\n  .map(x => ({ ...x, text: unnamed(people[x.persona_id], x.text) }));\nif (r.mode === 'opening') reactions = reactions.filter(x => x.kind === 'welcome').slice(0, 1);\n// Stopped for time (0.25), or the floor opened after the presenter said they'd finished (0.34): the chair has already moved to the\n// questions with a line the client played\nif (r.mode === 'pitch_end' && (r.time_up || r.floor_opened)) reactions = reactions.filter(x => x.kind !== 'open_floor');\n\n// Near-duplicates: about half the content words (cut to 5 letters, so \"verify\" matches \"verification\") of the shorter question are in the other\nconst STOP = new Set(['what', 'that', 'this', 'with', 'your', 'have', 'will', 'would', 'could', 'should', 'about', 'there', 'their', 'them', 'they',\n  'into', 'from', 'does', 'when', 'where', 'which', 'were', 'been', 'than', 'then', 'also', 'just', 'some', 'more', 'much', 'very', 'like',\n  'make', 'sure', 'know', 'going', 'want', 'tell', 'give', 'okay', 'thanks', 'please', 'how', 'can', 'you', 'the', 'and', 'are', 'for']);\nconst words = t => String(t || '').toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean);\nconst content = t => new Set(words(t).filter(w => w.length > 3 && !STOP.has(w)).map(w => w.slice(0, 5)));\nconst near = (a, b) => {\n  const A = content(a), B = content(b);\n  let n = 0;\n  A.forEach(w => { if (B.has(w)) n++; });\n  return (n >= 4 && n / Math.min(A.size, B.size) >= 0.5) || (n > 0 && n / Math.max(A.size, B.size) >= 0.7);\n};\nconst CLOSED = ['answered', 'parked', 'dodged'];\nconst threads = (r.threads || []).map(t => ({ ...t, follow_ups: t.follow_ups || 0 }));\nconst byId = Object.fromEntries(threads.map(t => [t.id, t]));\n// Everything a thread has asked so far (the question and its follow-up), from the turns\nconst asks = t => [t.text].concat(r.turns.flatMap(x => (x.reactions || []).filter(y => y.thread_id === t.id).map(y => y.text)));\nconst like = text => threads.find(t => asks(t).some(a => near(a, text)));\nconst changed = new Set();\nconst pitchOver = r.mode === 'pitch_end' || r.turns.some(t => t.mode === 'pitch_end');\nconst said = words(r.transcript).length;\n// A line voiced ahead of time of this kind for this person (one not said yet this run, if there is one), or new text\nconst saidBefore = new Set(r.turns.flatMap(t => (t.reactions || []).map(x => x.text)));\nconst say = (pid, kind, text, reason, threadId) => {\n  const own = (r.bundle.lines || []).filter(x => x.persona_id === pid && x.kind === kind);\n  const l = own.find(x => !saidBefore.has(x.text)) || own[0];\n  return { persona_id: pid, kind, text: l ? l.text : text, line_id: l ? l.id : '', raise_hand: false, reason, thread_id: threadId || '' };\n};\nreactions = reactions.map(x => (SOCIAL.includes(x.kind) ? say(x.persona_id, x.kind, x.text || \"Okay.\", x.reason || '', x.thread_id) : x));\n\n// An answer closes its thread, or earns its one follow-up\nconst verdict = r.mode === 'answer' && ['resolved', 'partial', 'dodged'].includes(d.answer_verdict) ? d.answer_verdict : null;\nconst cur = r.answering_id ? byId[r.answering_id] : null;\n// An answer to nobody's open thread (0.34: e.g. more words after the asker already parked it) gets no follow-up, park, move-on or hand-back,\n// and while someone else's question still waits for its answer, nobody asks anything new: one question in the air at a time\nconst lastAsk = r.turns.flatMap(t => (t.reactions || []).filter(x => x.kind === 'question' || x.kind === 'follow_up')).pop();\nconst lastThread = lastAsk && lastAsk.thread_id ? byId[lastAsk.thread_id] : null;\nconst waiting = r.mode === 'answer' && !cur && !!lastThread && !CLOSED.includes(lastThread.status);\nif (r.mode === 'answer' && !cur) reactions = reactions.filter(x => !['follow_up', 'park', 'move_on', 'hand_back'].includes(x.kind));\nif (waiting) reactions = reactions.filter(x => !['question', 'closing'].includes(x.kind));\nif (cur) {\n  const asker = cur.persona_id;\n  const unsure = d.presenter_unsure === true || /(not sure|not certain|don.t know|do not know|no idea|get back to|come back to|find out|have to check|need to check)/i.test(r.transcript);\n  const wantsFollow = reactions.some(x => x.kind === 'follow_up' && x.persona_id === asker);\n  const follow = verdict !== 'resolved' && !unsure && wantsFollow && cur.follow_ups < 1;\n  if (follow) {\n    cur.status = 'followed_up';\n    cur.follow_ups += 1;\n    // Just the follow-up: the presenter answers it next\n    reactions = reactions.filter(x => x.kind === 'follow_up' && x.persona_id === asker).slice(0, 1);\n  } else {\n    // A second follow-up becomes a close: parked if they said they don't know, otherwise dodged\n    cur.status = verdict === 'resolved' ? 'answered' : unsure ? 'parked' : verdict === 'dodged' || wantsFollow ? 'dodged' : 'answered';\n    reactions = reactions.filter(x => x.kind !== 'follow_up');\n    const own = reactions.filter(x => x.persona_id === asker && ['acknowledge', 'park', 'move_on'].includes(x.kind));\n    if (cur.status === 'parked' && !own.some(x => x.kind === 'park')) {\n      reactions = reactions.filter(x => !(x.persona_id === asker && x.kind === 'acknowledge'));\n      reactions.unshift(say(asker, 'park', \"That's fine, send it to us after.\", \"You said you weren't sure, so \" + name(asker) + ' parked it for later.', cur.id));\n    } else if (cur.status === 'dodged' && !own.length) {\n      reactions.unshift(say(asker, 'move_on', \"Okay, let's leave that there.\", name(asker) + ' had already followed up once, so they let it go, unconvinced.', cur.id));\n    }\n    // During the pitch, the asker hands back, and nobody asks anything new\n    if (!pitchOver) {\n      reactions = reactions.filter(x => !['question', 'open_floor', 'closing'].includes(x.kind));\n      if (!reactions.some(x => x.kind === 'hand_back')) reactions.push(say(asker, 'hand_back', 'Thanks. Please, go on.', 'Back to the pitch.', cur.id));\n    }\n  }\n  changed.add(cur.id);\n  reactions.forEach(x => { if (x.persona_id === asker && x.kind !== 'question') x.thread_id = cur.id; });\n}\n\n// Questions: one at a time, never a closed thread or anything close to one; during the pitch only from someone who interrupts, once\n// the presenter has said enough on the slide (about 10 seconds, or 5 at a planned interruption point), never on the title slide\n// unless planned, and never the floor opened or the meeting closed\nconst out = [];\nlet asked = 0;\nfor (const x of reactions) {\n  if (x.kind === 'open_floor' && r.mode !== 'pitch_end') continue;\n  if (x.kind === 'closing' && !pitchOver) continue;\n  if (['park', 'move_on', 'hand_back', 'follow_up'].includes(x.kind) && r.mode !== 'answer') continue;\n  if (x.kind === 'question') {\n    if (asked >= 1) continue;\n    if (!pitchOver && r.mode !== 'segment') continue;\n    if (r.mode === 'segment' && (people[x.persona_id].manner === 'waits' || said < (r.mid_slide ? 12 : 25) || (r.slide_index === 0 && !r.mid_slide))) continue;\n    let t = x.thread_id ? byId[x.thread_id] : null;\n    if (!t) t = like(x.text) || null;\n    if (t && (CLOSED.includes(t.status) || t === cur || t.persona_id !== x.persona_id)) continue;\n    if (!t) {\n      t = { id: 'q' + (threads.length + 1), persona_id: x.persona_id, text: x.text, slide_index: r.slide_index, status: 'open', follow_ups: 0, planned: false };\n      threads.push(t);\n      byId[t.id] = t;\n    }\n    changed.add(t.id);\n    x.thread_id = t.id;\n    asked++;\n  }\n  out.push(x);\n}\nreactions = out;\nif (asked) reactions = reactions.filter(x => x.kind !== 'closing');\n// Handing back to the pitch (0.34) only happens during it, and never in a reply that asks something: \"please go on\" after a question\n// sounded random\nif (pitchOver || reactions.some(x => x.kind === 'question' || x.kind === 'follow_up')) reactions = reactions.filter(x => x.kind !== 'hand_back');\n\n// After the pitch someone always speaks next: if the model's question was dropped, the next open thread, then an objection nobody\n// has asked (they're written as questions), or, with none left or the plan's questions done, the chair closes\nconst followedUp = reactions.some(x => x.kind === 'follow_up');\nif (pitchOver && !waiting && (r.mode === 'answer' || r.mode === 'pitch_end') && !asked && !followedUp && !reactions.some(x => x.kind === 'closing')) {\n  const open = threads.find(t => t.status === 'open' && t !== cur && people[t.persona_id]);\n  const chair = (r.bundle.personas || []).find(p => p.chair) || (r.bundle.personas || [])[0];\n  const more = r.asked_after < Math.max(1, (r.bundle.plan || {}).after_pitch || 0);\n  const unasked = more ? (r.bundle.personas || []).flatMap(p => (p.objections || []).map(o => ({ p, text: o.text })))\n    .filter(o => o.text.includes('?') && !like(o.text)).sort((a, b) => (b.p.difficulty || 0) - (a.p.difficulty || 0))[0] : null;\n  if (open) {\n    reactions.push({ persona_id: open.persona_id, kind: 'question', text: open.text, line_id: '', raise_hand: false, reason: name(open.persona_id) + ' still had this open from earlier.', thread_id: open.id });\n    changed.add(open.id);\n  } else if (unasked) {\n    const t = { id: 'q' + (threads.length + 1), persona_id: unasked.p.id, text: unasked.text, slide_index: r.slide_index, status: 'open', follow_ups: 0, planned: false };\n    threads.push(t);\n    byId[t.id] = t;\n    changed.add(t.id);\n    reactions.push({ persona_id: t.persona_id, kind: 'question', text: t.text, line_id: '', raise_hand: false, reason: name(t.persona_id) + ' had not raised this yet.', thread_id: t.id });\n  } else if (chair) {\n    reactions.push({ persona_id: chair.id, kind: 'closing', text: \"Thank you, that's everything from us for today. We'll be in touch.\", line_id: '', raise_hand: false, reason: 'No questions left, so the chair closed the meeting.', thread_id: '' });\n  }\n}\n\nreactions = reactions.slice(0, 3).map(x => {\n  const line = lines[x.line_id] && lines[x.line_id].persona_id === x.persona_id ? lines[x.line_id] : null;\n  const out = { persona_id: x.persona_id, kind: x.kind, text: line ? line.text : x.text, raise_hand: r.mode === 'segment' && x.kind === 'question',\n                reason: x.reason || '', ...(x.thread_id ? { thread_id: x.thread_id } : {}) };\n  return line ? { ...out, line_id: line.id } : out;\n});\n// A bundle briefed before voices existed has none: fall back to a voice that fits the avatar\nconst voiceOf = p => p.voice || (String(p.avatar).includes('female') ? 'priya' : 'rahul');\nconst toVoice = reactions.map((x, i) => ({ i, text: x.text, speaker: voiceOf(people[x.persona_id]), voiced: !!x.line_id })).filter(x => !x.voiced);\nreturn { reply: { transcript: r.transcript, note: d.note || '', reactions, answer_verdict: verdict, threads: [...changed].map(id => byId[id]),\n                  end_session: reactions.some(x => x.kind === 'closing') }, to_voice: toVoice };\n})() }}")
          }
        ]
      },
      "options": {}
    },
    "output": [
  {
    "out": {
      "reply": {
        "reactions": [],
        "threads": []
      },
      "to_voice": []
    }
  }
]
  }
});

const anyToVoice = ifElse({
  type: "n8n-nodes-base.if",
  version: 2.3,
  config: {
    "name": "New lines to voice?",
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "leftValue": expr("{{ $json.out.to_voice.length }}"),
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
    "out": {
      "to_voice": []
    }
  }
]
  }
});

const eachReaction = node({
  type: "n8n-nodes-base.splitOut",
  version: 1,
  config: {
    "name": "One item per new line",
    "parameters": {
      "fieldToSplitOut": "out.to_voice",
      "options": {}
    },
    "output": [
  {
    "i": 0,
    "text": "Meaningful isn't a number.",
    "speaker": "rahul"
  }
]
  }
});

const voiceTurn = node({
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
      "jsonBody": expr("{{ JSON.stringify({ text: $json.text, language_code: 'en-IN', model: 'bulbul:v3', speaker: $json.speaker, speech_sample_rate: 22050, output_audio_codec: 'mp3' }) }}"),
      "options": {
        "timeout": 20000,
        "batching": {
          "batch": {
            "batchSize": 3,
            "batchInterval": 0
          }
        }
      }
    },
    "onError": "continueRegularOutput",
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

const withVoices = node({
  type: "n8n-nodes-base.set",
  version: 3.4,
  config: {
    "name": "Add the voices",
    "parameters": {
      "mode": "manual",
      "assignments": {
        "assignments": [
          {
            "id": "withVoices",
            "name": "reply",
            "type": "object",
            "value": expr("{{ (() => {\n// The reply with each new line's audio (base64 MP3); the laptop saves them as WAV and gives the headset their paths\nconst c = $('Check the reactions').first().json.out;\nconst voiced = $('Voice the line (Sarvam)').isExecuted;\nconst items = voiced ? $('One item per new line').all().map(i => i.json) : [];\nconst out = voiced ? $('Voice the line (Sarvam)').all().map(i => i.json) : [];\nconst reactions = c.reply.reactions.map(x => ({ ...x }));\nitems.forEach((v, k) => { const a = out[k] && out[k].audios && out[k].audios[0]; if (a) reactions[v.i].audio_base64 = a; });\nreturn { ...c.reply, reactions };\n})() }}")
          }
        ]
      },
      "options": {}
    },
    "executeOnce": true,
    "output": [
  {
    "reply": {
      "transcript": "",
      "reactions": []
    }
  }
]
  }
});

const replyTurn = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send the reactions",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify($json.reply) }}"),
      "options": {}
    },
    "output": [
  {}
]
  }
});

const about = sticky('## DryRun turn\nHow the room reacts to what the presenter just said (POST /webhook/dryrun/turn, docs/CONTRACT.md): transcribes it, decides whether anyone speaks, who, what and why (or why nobody does), holds that to the rules (every question a thread: one follow-up, then answered, parked or dodged), and voices it. The laptop sends the context, so this keeps no state. No Code nodes on this path: their runner takes about 1.7 s to start, expressions don\'t.', [turnTrigger], { color: 4 });

export default workflow('dryrun-turn', 'DryRun turn')
  .add(about)
  .add(turnTrigger)
  .to(readAudio)
  .to(transcribe)
  .to(context)
  .to(couldAsk
    .onTrue(decide)
    .onFalse(nobody.to(replyTurn)))
  .add(decide)
  .to(check)
  .to(anyToVoice
    .onTrue(eachReaction.to(voiceTurn.to(withVoices.to(replyTurn))))
    .onFalse(withVoices))
  .add(decide.onError(decideGemini))
  .add(decideGemini)
  .to(check)
  .group('Listen', [readAudio, transcribe], { description: 'Reads the speech and transcribes what the presenter said' })
  .group('Decide', [context, couldAsk, nobody, decide, decideGemini, check], { description: 'Decides whether anyone reacts, who, what and why, and holds it to the rules; skips the model where no question is possible' })
  .group('Voice', [anyToVoice, eachReaction, voiceTurn, withVoices], { description: 'Voices new lines with Sarvam; lines voiced in prep play as they are' });
