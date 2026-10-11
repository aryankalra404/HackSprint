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
        "pending": []
      }
    }
  }
]
  }
});

const readTurn = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Read the turn",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The moment, its audio as a file for transcription, and the context the laptop sent (docs/CONTRACT.md, POST /turn).\n// n8n keeps no state between turns: everything it decides from is here.\nconst b = $input.first().json.body;\nconst ctx = b.context || {};\nconst bundle = ctx.bundle || {};\nconst turns = ctx.turns || [];\nconst pitchEnd = turns.findIndex(t => t.mode === 'pitch_end');\nconst askedDuring = turns.filter((t, i) => (pitchEnd < 0 || i < pitchEnd) && t.mode !== 'pitch_end').reduce((a, t) => a + (t.reactions || []).filter(r => r.kind === 'question').length, 0);\nconst askedAfter = pitchEnd < 0 ? 0 : turns.slice(pitchEnd).reduce((a, t) => a + (t.reactions || []).filter(r => r.kind === 'question').length, 0);\nconst json = { session_id: b.session_id, mode: b.mode, slide_index: b.slide_index, t: b.t, asked_by: b.asked_by || '', bundle, elapsed: Math.round(ctx.elapsed_s || b.t || 0),\n               turns, pending: ctx.pending || [], asked_during: askedDuring, asked_after: askedAfter };\n// The laptop sends the speech as AAC (m4a), or WAV if it couldn't compress it\nconst audio = b.audio_base64 || b.audio_wav_base64 || '';\nconst m4a = b.audio_format === 'm4a';\nreturn [{ json: { ...json, has_audio: !!audio }, binary: audio ? { audio: { data: audio, mimeType: m4a ? 'audio/mp4' : 'audio/wav', fileName: m4a ? 'turn.m4a' : 'turn.wav' } } : {} }];"
    },
    "output": [
  {
    "mode": "segment",
    "bundle": {},
    "turns": [],
    "pending": [],
    "asked_during": 0,
    "asked_after": 0,
    "has_audio": true
  }
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
            "inputDataFieldName": "audio"
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
            "value": expr("{{ [($json.bundle.prospect || {}).company].concat(($json.bundle.slides || []).map(s => s.title), ($json.bundle.personas || []).map(p => p.display_name)).filter(Boolean).join(', ').slice(0, 600) }}")
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
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "What the room knows",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The prompt, kept short: a live turn should take a few seconds, and Groq's free tier allows 8,000 tokens a minute\nconst PROMPT = \"You are the panel in a rehearsal of a real meeting, deciding how the room reacts to what the presenter just said.\\nReact as these people would in this meeting: realistic, specific, never theatrical. During the pitch, most of the time nobody speaks.\\n\\nThe meeting: {meeting}\\nThe plan for questions: {plan}. Asked so far: {asked_during} during the pitch, {asked_after} after it.\\nTime: {elapsed} seconds in, for a pitch of {pitch} seconds.\\nThe panel: {personas}\\nLines voiced ahead of time (use one by its line_id when it fits, instead of new text): {lines}\\nThe slide on screen: {slide}\\nWhat has happened so far, oldest first: {turns}\\nQuestions raised but not answered yet: {pending}\\n\\nThis moment: {mode}{asked_by}\\nWhat the presenter just said: \\\"{transcript}\\\"\\n\\nWhat to do for each moment:\\n- opening (their first words): if they introduced themselves or greeted the room, the chair welcomes them (kind \\\"welcome\\\", its line_id).\\n  If they went straight into the pitch, or said nothing, no reaction.\\n- segment (what they said on one slide): decide whether anyone interrupts now. Only someone whose manner is \\\"interrupts\\\", only while\\n  questions during the pitch remain in the plan (a guide: break it only for something that really matters), and only about this slide\\n  or what was just said: a claim with nothing behind it, a number that does not add up, a gap against their objections or the research.\\n  Never ask what the presenter already covered, and never repeat a pending question. A question: kind \\\"question\\\", raise_hand true,\\n  one or two sentences in that person's voice, referring to what was said. Otherwise no reaction.\\n- answer (to the question in this moment): judge it in answer_verdict: \\\"resolved\\\" (direct and specific), \\\"partial\\\" or \\\"dodged\\\". The person\\n  who asked reacts: an \\\"acknowledge\\\" line (by line_id) if resolved, or one \\\"follow_up\\\" (only if that question has had no follow-up yet)\\n  if partial or dodged and it matters. After the pitch, add what comes next: the next \\\"question\\\" from whoever matters most (a pending\\n  one first), or, once the questions in the plan are done or time is well past the pitch, the chair's \\\"closing\\\".\\n- pitch_end (the pitch is over): the chair opens the floor (kind \\\"open_floor\\\", its line_id), then the first \\\"question\\\" from whoever\\n  matters most, a pending one first. If the plan has no questions after the pitch, the chair closes instead.\\n- closing (by the chair): how this kind of meeting really ends, in one or two sentences, fitting how it went (a next step if it went\\n  well, polite and noncommittal if not), and end_session true.\\nAfter the pitch, questions are asked directly (raise_hand false). Every reaction has a reason: one sentence on why this person said this\\nnow, which the presenter reads afterwards. note: one short sentence to the presenter (\\\"you\\\") on how this moment landed, matching what\\nactually happens in reactions, also when nobody reacts (e.g. \\\"You put a number on the savings, so Rajiv held his cost question.\\\").\\nSpoken English, natural, short. Answer in JSON.\";\nconst r = $('Read the turn').first().json;\nconst b = r.bundle;\nconst transcript = String(($json && $json.text) || '').trim();\nconst personas = (b.personas || []).map(p => ({ id: p.id, name: p.display_name, role: p.role, manner: p.manner, chair: p.chair, difficulty: p.difficulty,\n  priorities: p.priorities, objections: (p.objections || []).map(o => (o.slide_index >= 0 ? 'slide ' + (o.slide_index + 1) + ': ' : '') + o.text) }));\nconst slide = (b.slides || []).find(s => s.index === r.slide_index);\nconst name = id => ((b.personas || []).find(p => p.id === id) || {}).display_name || id;\nconst history = r.turns.slice(-12).map(t => '[' + t.mode + (t.slide_index >= 0 ? ', slide ' + (t.slide_index + 1) : '') + '] presenter: \"' + String(t.transcript || '').slice(0, 400) + '\"'\n  + (t.reactions || []).map(x => ' | ' + name(x.persona_id) + ' (' + x.kind + '): \"' + x.text + '\"').join('') + (t.answer_verdict ? ' | answer ' + t.answer_verdict : '')).join('\\n') || 'Nothing yet.';\nconst parts = {\n  meeting: b.prospect && b.prospect.company ? 'with ' + b.prospect.company : 'a meeting', plan: JSON.stringify(b.plan || {}),\n  asked_during: String(r.asked_during), asked_after: String(r.asked_after), elapsed: String(r.elapsed), pitch: String(b.pitch_seconds || 0),\n  personas: JSON.stringify(personas), lines: JSON.stringify((b.lines || []).map(l => ({ line_id: l.id, persona_id: l.persona_id, kind: l.kind, text: l.text }))),\n  slide: slide ? JSON.stringify({ number: slide.index + 1, title: slide.title, key_points: slide.key_points }) : 'No slides.',\n  turns: history, pending: JSON.stringify(r.pending), mode: r.mode, asked_by: r.asked_by ? ' (answering ' + name(r.asked_by) + ', id ' + r.asked_by + ')' : '', transcript,\n};\n// Each {name} in the prompt filled in by splitting, so nothing in the text is read as a replacement pattern\nconst prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);\nreturn [{ json: { ...r, transcript, prompt } }];"
    },
    "output": [
  {
    "mode": "segment",
    "transcript": ""
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
      "jsonBody": expr("{{ (() => { const j = $('What the room knows').first().json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 4096, messages: [{ role: 'user', content: (j.prompt) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"note\": {\"type\": \"string\"}, \"reactions\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"persona_id\": {\"type\": \"string\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"welcome\", \"question\", \"follow_up\", \"acknowledge\", \"open_floor\", \"closing\"]}, \"text\": {\"type\": \"string\"}, \"line_id\": {\"type\": \"string\", \"description\": \"A line voiced ahead of time, or empty\"}, \"raise_hand\": {\"type\": \"boolean\"}, \"reason\": {\"type\": \"string\"} }, \"required\": [\"persona_id\", \"kind\", \"text\", \"line_id\", \"raise_hand\", \"reason\"]} }, \"answer_verdict\": {\"type\": \"string\", \"enum\": [\"resolved\", \"partial\", \"dodged\", \"none\"]}, \"end_session\": {\"type\": \"boolean\"} }, \"required\": [\"note\", \"reactions\", \"answer_verdict\", \"end_session\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
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
      "jsonBody": expr("{{ (() => { const j = $('What the room knows').first().json; return JSON.stringify({ contents: [{ parts: [{ text: j.prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"note\": {\"type\": \"string\"}, \"reactions\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"persona_id\": {\"type\": \"string\"}, \"kind\": {\"type\": \"string\", \"enum\": [\"welcome\", \"question\", \"follow_up\", \"acknowledge\", \"open_floor\", \"closing\"]}, \"text\": {\"type\": \"string\"}, \"line_id\": {\"type\": \"string\", \"description\": \"A line voiced ahead of time, or empty\"}, \"raise_hand\": {\"type\": \"boolean\"}, \"reason\": {\"type\": \"string\"} }, \"required\": [\"persona_id\", \"kind\", \"text\", \"line_id\", \"raise_hand\", \"reason\"]} }, \"answer_verdict\": {\"type\": \"string\", \"enum\": [\"resolved\", \"partial\", \"dodged\", \"none\"]}, \"end_session\": {\"type\": \"boolean\"} }, \"required\": [\"note\", \"reactions\", \"answer_verdict\", \"end_session\"]} } }); })() }}"),
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
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Check the reactions",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// What n8n decided, held to the contract: real people and lines, only a welcome at the opening, the session ends only on a closing.\n// New lines go to the voice; lines voiced ahead of time play as they are.\nconst r = $('What the room knows').first().json;\nconst d = JSON.parse(replyText($json) || '{}');\nconst people = Object.fromEntries((r.bundle.personas || []).map(p => [p.id, p]));\nconst lines = Object.fromEntries((r.bundle.lines || []).map(l => [l.id, l]));\nconst KINDS = ['welcome', 'question', 'follow_up', 'acknowledge', 'open_floor', 'closing'];\nlet reactions = (d.reactions || []).filter(x => people[x.persona_id] && KINDS.includes(x.kind) && (x.text || lines[x.line_id]));\nif (r.mode === 'opening') reactions = reactions.filter(x => x.kind === 'welcome').slice(0, 1);\nreactions = reactions.slice(0, 3).map(x => {\n  const line = lines[x.line_id] && lines[x.line_id].persona_id === x.persona_id ? lines[x.line_id] : null;\n  const out = { persona_id: x.persona_id, kind: x.kind, text: line ? line.text : String(x.text), raise_hand: r.mode === 'segment' && x.kind === 'question', reason: x.reason || '' };\n  return line ? { ...out, line_id: line.id } : out;\n});\nconst verdict = r.mode === 'answer' && ['resolved', 'partial', 'dodged'].includes(d.answer_verdict) ? d.answer_verdict : null;\n// A bundle briefed before voices existed has none: fall back to a voice that fits the avatar\nconst voiceOf = p => p.voice || (String(p.avatar).includes('female') ? 'priya' : 'rahul');\nconst toVoice = reactions.map((x, i) => ({ i, text: x.text, speaker: voiceOf(people[x.persona_id]), voiced: !!x.line_id })).filter(x => !x.voiced);\nreturn [{ json: { reply: { transcript: r.transcript, note: d.note || '', reactions, answer_verdict: verdict, end_session: reactions.some(x => x.kind === 'closing') },\n                  to_voice: toVoice } }];"
    },
    "output": [
  {
    "reply": {
      "reactions": []
    },
    "to_voice": []
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
            "leftValue": expr("{{ $json.to_voice.length }}"),
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
    "to_voice": []
  }
]
  }
});

const eachReaction = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "One item per new line",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "return $input.first().json.to_voice.map(v => ({ json: v }));"
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
        "timeout": 20000
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
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Add the voices",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The reply with each new line's audio (base64 MP3); the laptop saves them as WAV and gives the headset their paths\nconst c = $('Check the reactions').first().json;\nconst voiced = (() => { try { return $('Voice the line (Sarvam)').isExecuted; } catch (e) { return false; } })();\nconst items = voiced ? $('One item per new line').all().map(i => i.json) : [];\nconst out = voiced ? $('Voice the line (Sarvam)').all().map(i => i.json) : [];\nconst reactions = c.reply.reactions.map(x => ({ ...x }));\nitems.forEach((v, k) => { const a = out[k] && out[k].audios && out[k].audios[0]; if (a) reactions[v.i].audio_base64 = a; });\nreturn [{ json: { ...c.reply, reactions } }];"
    },
    "output": [
  {
    "transcript": "",
    "reactions": []
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
      "respondWith": "firstIncomingItem",
      "options": {}
    },
    "output": [
  {}
]
  }
});

const about = sticky('## DryRun turn\nHow the room reacts to what the presenter just said (POST /webhook/dryrun/turn, docs/CONTRACT.md): transcribes it, decides whether anyone speaks, who, what and why (or why nobody does), and voices it. The laptop sends the context, so this keeps no state.', [turnTrigger], { color: 4 });

export default workflow('dryrun-turn', 'DryRun turn')
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
