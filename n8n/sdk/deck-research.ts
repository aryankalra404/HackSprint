import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, fromAi, expr } from '@n8n/workflow-sdk';

const deckTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "A deck was uploaded (laptop)",
    "parameters": {
      "httpMethod": "POST",
      "path": "dryrun/deck-research",
      "responseMode": "responseNode",
      "options": {}
    },
    "output": [
  {
    "body": {
      "meeting_id": "evt123",
      "deck": {
        "name": "RouteIQ.pdf",
        "slides": [
          {
            "index": 0,
            "text": "RouteIQ cuts fuel cost by 30%"
          }
        ]
      },
      "presenter": {
        "offer": "RouteIQ: route optimisation"
      },
      "goal": "a paid pilot"
    }
  }
]
  }
});

const deckMeeting = node({
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
        "value": "wURCb4PjdZLpttns",
        "cachedResultName": "DryRun meetings"
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
      }
    },
    "alwaysOutputData": true,
    "output": [
  {
    "meeting_id": "evt123",
    "title": "RouteIQ pitch",
    "company": "Delhivery",
    "brief": "{}",
    "proposal": "{}"
  }
]
  }
});

const deckRead = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Read the deck",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The deck's slide text, the meeting and what the presenter wants from it (docs/CONTRACT.md, POST /deck-research)\nconst req = $('A deck was uploaded (laptop)').first().json.body;\nconst row = $input.first().json || {};\nconst parse = x => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };\nconst proposal = parse(row.proposal) || {};\nconst goal = req.goal || (proposal.goal && proposal.goal.text) || '';\nconst offer = (req.presenter && req.presenter.offer) || '';\nconst slides = ((req.deck && req.deck.slides) || []).map(s => ({ index: s.index, text: String(s.text || '').slice(0, 1200) })).filter(s => s.text);\nconst meeting = (row.title || 'A meeting') + (row.company ? ' with ' + row.company : '');\nconst side = (offer ? 'They offer: ' + offer + '. ' : '') + (goal ? 'They want: ' + goal + '.' : '') || 'Not given.';\nconst parts = { meeting, side, deck: JSON.stringify(slides) };\nconst PROMPT = \"You are preparing a presenter for a real meeting. Read their deck and plan how to find who else already does what\\nit pitches: competitors, big companies with a similar product, startups, government programmes, research labs.\\n\\nThe meeting: {meeting}\\nWhat the presenter offers and wants from it: {side}\\nThe deck, slide by slide (index from 0):\\n{deck}\\n\\nabout: one sentence on what the deck pitches and to whom, in plain words.\\nsearches: 2 or 3 Google News searches that would surface others doing the same thing, the most specific first. Each:\\n- query: 3 to 5 words naming the kind of product or solution the way a journalist would (e.g. \\\"AI route optimisation logistics\\\",\\n  \\\"remote patient monitoring app\\\", \\\"solar inverter fault detection\\\"), never the presenter's own product name, project title or team; spell out acronyms the way the\\n  deck means them; no quotes or operators;\\n- broad: a broader search, 2 or 3 words, for when the first finds nothing (e.g. \\\"fleet management software\\\");\\n- slide_index: the slide where a panel would bring the competition up: the slide that says what is new or different, or the solution\\n  slide (never the title slide unless the deck has nothing else).\\nAnswer in JSON.\";\nconst prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);\n// Each slide's first line, so the model can place who it finds on a slide\nconst titles = slides.map(s => s.index + ': ' + s.text.split('\\n')[0].trim().slice(0, 90)).join('; ');\nreturn [{ json: { meeting_id: row.meeting_id || '', found: !!row.meeting_id, meeting, indexes: slides.map(s => s.index), titles, prompt } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "found": true,
    "meeting": "RouteIQ pitch with Delhivery",
    "indexes": [
      0
    ],
    "titles": "",
    "prompt": ""
  }
]
  }
});

const deckClaims = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Plan the searches",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"about\": {\"type\": \"string\"}, \"searches\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"query\": {\"type\": \"string\"}, \"broad\": {\"type\": \"string\"}, \"slide_index\": {\"type\": \"integer\"} }, \"required\": [\"query\", \"broad\", \"slide_index\"]} } }, \"required\": [\"about\", \"searches\"]} } }) }}"),
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

const deckClaimsGroq = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Plan the searches (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $('Read the deck').first().json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: (j.prompt) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"about\": {\"type\": \"string\"}, \"searches\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"query\": {\"type\": \"string\"}, \"broad\": {\"type\": \"string\"}, \"slide_index\": {\"type\": \"integer\"} }, \"required\": [\"query\", \"broad\", \"slide_index\"]} } }, \"required\": [\"about\", \"searches\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
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

const deckSearches = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "The searches",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// Each planned search on Google News, then its broader one: at most six, no repeats\nconst g = $('Read the deck').first().json;\nconst d = JSON.parse(replyText($input.first().json) || '{}');\nconst clean = q => String(q || '').split('\"').join('').trim();\nconst seen = new Set();\nconst fallback = g.indexes.length > 1 ? g.indexes[1] : (g.indexes[0] || 0);\nconst qs = (d.searches || []).flatMap(x => [clean(x.query), clean(x.broad)].filter(Boolean)\n  .map(q => ({ q, slide_index: g.indexes.includes(x.slide_index) ? x.slide_index : fallback })))\n  .filter(x => !seen.has(x.q.toLowerCase()) && seen.add(x.q.toLowerCase())).slice(0, 6);\n// Nothing to search still goes on (one empty search that fails quietly), so the laptop always gets an answer\nif (!qs.length) return [{ json: { none: true, about: d.about || '', url: '' } }];\nconst url = q => 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-IN&gl=IN&ceid=IN:en';\nreturn qs.map(x => ({ json: { ...x, about: d.about || '', url: url(x.q) } }));"
    },
    "output": [
  {
    "q": "route optimisation logistics",
    "slide_index": 1,
    "about": "",
    "url": ""
  }
]
  }
});

const deckNews = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Search the news",
    "parameters": {
      "method": "GET",
      "url": expr("{{ $json.url }}"),
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

const deckGather = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Gather what it found",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Every headline found (date, publisher, link), without repeats, numbered for the model to cite\nconst g = $('Read the deck').first().json;\nconst all = $('The searches').all().map(i => i.json);\nconst results = $input.all().map(i => String(i.json.data || ''));\nconst unescape = t => t.replace(/<!\\[CDATA\\[|\\]\\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&#39;/g, \"'\");\nconst tag = (xml, t) => { const m = xml.match(new RegExp('<' + t + '[^>]*>([^]*?)</' + t + '>')); return m ? unescape(m[1]).trim() : ''; };\nconst headlines = xml => xml.split('<item>').slice(1).map(it => {\n  const src = it.match(/<source url=\"([^\"]*)\">([^]*?)<\\/source>/);\n  const date = new Date(tag(it, 'pubDate'));\n  return { title: tag(it, 'title').replace(/ - [^-]+$/, ''), url: tag(it, 'link'), publisher: src ? unescape(src[2]) : '', date: isNaN(date) ? '' : date.toISOString().slice(0, 10) };\n}).filter(h => h.title && h.url);\n// Six from each search in turn, so one broad search can't crowd out the specific ones\nconst seen = new Set();\nconst sources = [];\nconst per = all.map((x, k) => x.none ? [] : headlines(results[k] || '').slice(0, 6));\nfor (let round = 0; round < 6; round++) per.forEach(list => {\n  const h = list[round];\n  if (h && sources.length < 16 && !seen.has(h.title.toLowerCase())) { seen.add(h.title.toLowerCase()); sources.push(h); }\n});\nconst text = sources.map((h, i) => '[' + (i + 1) + '] ' + h.title + (h.publisher ? ' (' + h.publisher + (h.date ? ', ' + h.date : '') + ')' : '')).join('\\n');\nconst about = (all[0] && all[0].about) || 'Not given.';\nconst parts = { meeting: g.meeting, about, slides: g.titles || 'None.', headlines: text || 'No headlines found.' };\nconst PROMPT = \"You find who else already does what a presenter pitches, before a real meeting, so the panel can ask how they\\nare different. Say only what the sources say.\\n\\nThe meeting: {meeting}\\nWhat the deck pitches: {about}\\nThe deck's slides (index, title line): {slides}\\n\\nHeadlines found (numbered sources; many will share a word or an acronym but be about something else):\\n{headlines}\\n\\nothers: up to 4 companies, products, programmes or labs that the headlines show already building or running the same or nearly the\\nsame thing as the deck (the same problem for the same kind of user, or the same technology for the same use). Leave out: a headline\\nabout the wider field (e.g. \\\"AI in healthcare\\\", \\\"the EV boom\\\"), a trend piece, explainer or opinion, a company only investing,\\nhiring or seeking partners, and a hobby project. Most decks have 0 to 2; an empty list is a fine answer. Each:\\n- name: who does the work, as the headline names them (e.g. \\\"Tata Motors\\\", \\\"a Pune startup\\\"); never the publisher, the outlet or a\\n  think tank writing about it (if the headline doesn't say who, name the programme, e.g. \\\"the state's telemedicine programme\\\");\\n- what: what the source says they do, in one plain sentence, with the date where the headline gives one; nothing beyond the headline;\\n- close: \\\"same\\\" if they do what the deck pitches, \\\"near\\\" if it overlaps (the same technology on the same kind of machine or user, or\\n  the same problem for the same user solved another way); the same technology in an unrelated industry (e.g. AI\\n  fault detection on railway tracks, for a deck about factory machines) is neither: leave it out;\\n- slide_index: the slide where the panel would bring them up (from the slides above);\\n- question: how someone on the panel would put it, naming them, in one short sentence (e.g. \\\"A Pune startup already plans routes for\\n  fleets like ours. What does yours do that theirs doesn't?\\\");\\n- sources: the numbers of the headlines it rests on (at least one).\\nAnswer in JSON.\";\nconst prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);\nconst counts = {};\nall.forEach((x, k) => { if (!x.none) counts[x.q] = { query: x.q, slide_index: x.slide_index, found: headlines(results[k] || '').length }; });\nreturn [{ json: { searched: Object.values(counts), about, sources, prompt } }];"
    },
    "output": [
  {
    "searched": [],
    "about": "",
    "sources": [],
    "prompt": ""
  }
]
  }
});

const deckWeigh = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Who else does this?",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"others\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"name\": {\"type\": \"string\"}, \"what\": {\"type\": \"string\"}, \"close\": {\"type\": \"string\", \"enum\": [\"same\", \"near\"]}, \"slide_index\": {\"type\": \"integer\"}, \"question\": {\"type\": \"string\"}, \"sources\": {\"type\": \"array\", \"items\": {\"type\": \"integer\"} } }, \"required\": [\"name\", \"what\", \"close\", \"slide_index\", \"question\", \"sources\"]} } }, \"required\": [\"others\"]} } }) }}"),
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

const deckWeighGroq = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Who else does this? (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $('Gather what it found').first().json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: (j.prompt) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"others\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"name\": {\"type\": \"string\"}, \"what\": {\"type\": \"string\"}, \"close\": {\"type\": \"string\", \"enum\": [\"same\", \"near\"]}, \"slide_index\": {\"type\": \"integer\"}, \"question\": {\"type\": \"string\"}, \"sources\": {\"type\": \"array\", \"items\": {\"type\": \"integer\"} } }, \"required\": [\"name\", \"what\", \"close\", \"slide_index\", \"question\", \"sources\"]} } }, \"required\": [\"others\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
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

const deckBuild = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Hold to the sources",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// Held to the sources: each one cites at least one headline n8n found, on a real slide, no one twice; the same thing first\nconst r = $('Read the deck').first().json;\nconst g = $('Gather what it found').first().json;\nconst d = JSON.parse(replyText($json) || '{}');\nconst fallback = r.indexes.length > 1 ? r.indexes[1] : (r.indexes[0] || 0);\nconst named = new Set();\nconst others = (d.others || []).map(o => {\n  const sources = [...new Set(o.sources || [])].map(n => g.sources[n - 1]).filter(Boolean).slice(0, 3);\n  const name = String(o.name || '').trim();\n  // A publisher reporting on someone isn't the someone\n  const publisher = sources.some(x => x.publisher && (x.publisher.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(x.publisher.toLowerCase())));\n  if (!sources.length || !name || !o.what || publisher || named.has(name.toLowerCase())) return null;\n  named.add(name.toLowerCase());\n  return { name, what: String(o.what), close: o.close === 'same' ? 'same' : 'near', slide_index: r.indexes.includes(o.slide_index) ? o.slide_index : fallback,\n           question: String(o.question || ''), sources };\n}).filter(Boolean).sort((a, b) => (a.close === 'same' ? 0 : 1) - (b.close === 'same' ? 0 : 1)).slice(0, 4);\nconst research = { about: g.about === 'Not given.' ? '' : g.about, searched: g.searched, others, at: new Date().toISOString() };\nreturn [{ json: { meeting_id: r.meeting_id, found: r.found, research, deck_research: JSON.stringify(research), updated_at: research.at } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "found": true,
    "research": {
      "others": []
    },
    "deck_research": "{}"
  }
]
  }
});

const deckKnown = ifElse({
  type: "n8n-nodes-base.if",
  version: 2.3,
  config: {
    "name": "A known meeting?",
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "leftValue": expr("{{ $json.found }}"),
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
    "found": true
  }
]
  }
});

const deckSave = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    "name": "Save it on the meeting",
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
          "deck_research": expr("{{ $json.deck_research }}"),
          "updated_at": expr("{{ $json.updated_at }}")
        },
        "matchingColumns": [],
        "schema": [
          {
            "id": "deck_research",
            "displayName": "deck_research",
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

const deckReply = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send what it found",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify($('Hold to the sources').first().json.research) }}"),
      "options": {}
    },
    "output": [
  {}
]
  }
});

const about = sticky('## DryRun deck research\nWhen the presenter uploads a deck (POST /webhook/dryrun/deck-research, docs/CONTRACT.md): who else already does what it pitches? n8n plans news searches from the deck, then keeps only the companies, products and programmes the headlines show doing the same thing, each with its source. Saved on the meeting: in the next rehearsal the panel asks how the pitch is different from them, by name. It never checks the presenter\'s own claims.', [deckTrigger], { color: 4 });

export default workflow('dryrun-deck-research', 'DryRun deck research')
  .add(about)
  .add(deckTrigger)
  .to(deckMeeting)
  .to(deckRead)
  .to(deckClaims)
  .to(deckSearches)
  .to(deckNews)
  .to(deckGather)
  .to(deckWeigh)
  .to(deckBuild)
  .to(deckKnown
    .onTrue(deckSave.to(deckReply))
    .onFalse(deckReply))
  .add(deckClaims.onError(deckClaimsGroq))
  .add(deckClaimsGroq)
  .to(deckSearches)
  .add(deckWeigh.onError(deckWeighGroq))
  .add(deckWeighGroq)
  .to(deckBuild)
  .group('Read the deck', [deckMeeting, deckRead, deckClaims, deckClaimsGroq, deckSearches], { description: 'Plans news searches for who else already does what the deck pitches' })
  .group('Research', [deckNews, deckGather, deckWeigh, deckWeighGroq, deckBuild], { description: 'Searches the news and keeps who the headlines show doing the same thing, held to the sources' });
