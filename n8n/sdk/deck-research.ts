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
      "jsCode": "// The deck's slide text, the meeting and what the presenter wants from it (docs/CONTRACT.md, POST /deck-research), for the agent\nconst req = $('A deck was uploaded (laptop)').first().json.body;\nconst row = $input.first().json || {};\nconst parse = x => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };\nconst proposal = parse(row.proposal) || {};\nconst goal = req.goal || (proposal.goal && proposal.goal.text) || '';\nconst offer = (req.presenter && req.presenter.offer) || '';\nconst slides = ((req.deck && req.deck.slides) || []).map(s => ({ index: s.index, text: String(s.text || '').slice(0, 1200) })).filter(s => s.text);\nconst meeting = (row.title || 'A meeting') + (row.company ? ' with ' + row.company : '');\nconst side = (offer ? 'They offer: ' + offer + '. ' : '') + (goal ? 'They want: ' + goal + '.' : '') || 'Not given.';\nconst prompt = 'The meeting: ' + meeting + '\\nWhat the presenter offers and wants from it: ' + side + '\\nThe deck, slide by slide (index from 0):\\n' + JSON.stringify(slides);\nreturn [{ json: { meeting_id: row.meeting_id || '', found: !!row.meeting_id, meeting, indexes: slides.map(s => s.index), prompt } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "found": true,
    "meeting": "RouteIQ pitch with Delhivery",
    "indexes": [
      0
    ],
    "prompt": ""
  }
]
  }
});

const deckGemini = languageModel({
  type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
  version: 1.2,
  config: {
    "name": "Gemini",
    "parameters": {
      "modelName": "models/gemini-3-flash-preview",
      "options": {
        "temperature": 0.2,
        "maxOutputTokens": 4096
      }
    },
    "credentials": { "googlePalmApi": newCredential("Gemini") }
  }
});

const deckGroq = languageModel({
  type: "@n8n/n8n-nodes-langchain.lmChatGroq",
  version: 1,
  config: {
    "name": "Groq (if Gemini fails)",
    "parameters": {
      "model": "openai/gpt-oss-120b",
      "options": {
        "temperature": 0.2,
        "maxTokensToSample": 4096
      }
    },
    "credentials": { "groqApi": newCredential("Groq") }
  }
});

const deckTool = tool({
  type: "@n8n/n8n-nodes-langchain.toolWorkflow",
  version: 2.2,
  config: {
    "name": "Search Google News",
    "parameters": {
      "description": "Searches Google News (India) and returns up to 8 headlines (id, title, publisher, date, url) and how many it found in all. query: 3 to 5 plain words naming a kind of product or solution, or a company's name.",
      "source": "database",
      "workflowId": {
        "__rl": true,
        "mode": "id",
        "value": "6Ak1cDg376YAfG3J",
        "cachedResultName": "DryRun news search"
      },
      "workflowInputs": {
        "mappingMode": "defineBelow",
        "value": {
          "query": expr("{{ $fromAI('query', 'A few plain words to search Google News for, e.g. AI route optimisation logistics', 'string') }}")
        },
        "matchingColumns": [],
        "attemptToConvertTypes": false,
        "convertFieldsToString": false,
        "schema": [
          {
            "id": "query",
            "displayName": "query",
            "required": false,
            "defaultMatch": false,
            "display": true,
            "canBeUsedToMatch": true,
            "type": "string"
          }
        ]
      }
    }
  }
});

const deckAgent = node({
  type: "@n8n/n8n-nodes-langchain.agent",
  version: 3.1,
  config: {
    "name": "Who else does this?",
    "parameters": {
      "promptType": "define",
      "text": expr("{{ $json.prompt }}"),
      "needsFallback": true,
      "options": {
        "systemMessage": "You are DryRun's research agent. A presenter has uploaded the deck for a real meeting. Find who else already\ndoes what the deck pitches (competitors, big companies with a similar product, startups, government programmes, research labs), so\nthe practice panel can ask how the pitch is different from them, by name. Say only what the headlines say.\n\nYour one tool, \"Search Google News\", searches Google News (India) and returns up to 8 headlines, each with an id.\nHow to search:\n- Name the kind of product or solution in 3 to 5 words, the way a journalist would (e.g. \"AI route optimisation logistics\",\n  \"remote patient monitoring app\", \"solar inverter fault detection\"); never the presenter's own product name, project title or team;\n  spell out acronyms the way the deck means them; no quotes or operators.\n- Start with the most specific search and read what comes back. If the headlines are about something else (many share a word or an\n  acronym), or there are few, search again with other words, or a broader 2 or 3 word search (e.g. \"fleet management software\").\n- At most 3 searches: each one costs a model call. Stop as soon as you have enough. Finding nobody is a fine answer.\n\nThen reply with only a JSON object, no other text:\n{\"about\": \"...\", \"searched\": [{\"query\": \"...\", \"slide_index\": 2}], \"others\": [{\"name\": \"...\", \"what\": \"...\", \"close\": \"same\",\n\"slide_index\": 2, \"question\": \"...\", \"sources\": [\"h1x2y3\"]}]}\n- about: one sentence on what the deck pitches and to whom, in plain words.\n- searched: every search you ran, each with the slide where a panel would bring the competition up: the slide that says what is new\n  or different, or the solution slide (never the title slide unless the deck has nothing else).\n- others: up to 4 companies, products, programmes or labs that the headlines show already building or running the same or nearly the\n  same thing as the deck (the same problem for the same kind of user, or the same technology for the same use). Leave out: a headline\n  about the wider field (e.g. \"AI in healthcare\", \"the EV boom\"), a trend piece, explainer or opinion, a company only investing,\n  hiring or seeking partners, and a hobby project. Most decks have 0 to 2; an empty list is a fine answer. Each:\n  - name: who does the work, as the headline names them (e.g. \"Tata Motors\", \"a Pune startup\"); never the publisher, the outlet or a\n    think tank writing about it (if the headline doesn't say who, name the programme, e.g. \"the state's telemedicine programme\");\n  - what: what the headline says they do, in one plain sentence, with the date where it gives one; nothing beyond the headline;\n  - close: \"same\" if they do what the deck pitches, \"near\" if it overlaps (the same technology on the same kind of machine or user,\n    or the same problem for the same user solved another way); the same technology in an unrelated industry (e.g. AI fault\n    detection on railway tracks, for a deck about factory machines) is neither: leave it out;\n  - slide_index: the slide where the panel would bring them up;\n  - question: how someone on the panel would put it, naming them, in one short sentence (e.g. \"A Pune startup already plans routes\n    for fleets like ours. What does yours do that theirs doesn't?\");\n  - sources: the ids of the headlines it rests on (at least one), exactly as the tool gave them.",
        "maxIterations": 5,
        "returnIntermediateSteps": true,
        "enableStreaming": false
      }
    },
    "subnodes": { model: [deckGemini, deckGroq], tools: [deckTool] },
    "output": [
  {
    "output": "{}",
    "intermediateSteps": []
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
      "jsCode": "// Held to the sources: the agent may only cite headlines its Search Google News tool really returned; each one on a real slide, never\n// the publisher, no one twice; the same thing first\nconst r = $('Read the deck').first().json;\nconst a = $input.first().json;\nconst out = String(a.output || '');\nlet d = {};\ntry { d = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch (e) { d = {}; }\n// Every headline the tool returned (by id), and each search the agent ran with how many it found\nconst byId = {};\nlet last = null;\nconst walk = x => {\n  if (typeof x === 'string' && /^[[{]/.test(x.trim())) { try { return walk(JSON.parse(x)); } catch (e) { return; } }\n  if (Array.isArray(x)) return x.forEach(walk);\n  if (!x || typeof x !== 'object') return;\n  if (Array.isArray(x.headlines)) last = x;\n  if (x.id && x.title && x.url) byId[x.id] = { title: String(x.title), url: String(x.url), publisher: String(x.publisher || ''), date: String(x.date || '') };\n  Object.values(x).forEach(walk);\n};\nconst fallback = r.indexes.length > 1 ? r.indexes[1] : (r.indexes[0] || 0);\nconst slideOf = i => r.indexes.includes(i) ? i : fallback;\nconst planned = d.searched || [];\nconst searched = (a.intermediateSteps || []).map(s => {\n  last = null;\n  walk(s.observation);\n  const ti = s.action && s.action.toolInput;\n  const query = String(typeof ti === 'string' ? ti : (ti && (ti.query || ti.input)) || (last && last.query) || '');\n  const p = planned.find(x => String(x.query || '').toLowerCase() === query.toLowerCase());\n  return { query, slide_index: slideOf(p ? p.slide_index : fallback), found: last ? Number(last.found) || 0 : 0 };\n}).filter(x => x.query).slice(0, 6);\nconst named = new Set();\nconst others = (d.others || []).map(o => {\n  const sources = [...new Set(o.sources || [])].map(id => byId[String(id).trim()]).filter(Boolean).slice(0, 3);\n  const name = String(o.name || '').trim();\n  // A publisher reporting on someone isn't the someone\n  const publisher = sources.some(x => x.publisher && (x.publisher.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(x.publisher.toLowerCase())));\n  if (!sources.length || !name || !o.what || publisher || named.has(name.toLowerCase())) return null;\n  named.add(name.toLowerCase());\n  return { name, what: String(o.what), close: o.close === 'same' ? 'same' : 'near', slide_index: slideOf(o.slide_index), question: String(o.question || ''), sources };\n}).filter(Boolean).sort((a, b) => (a.close === 'same' ? 0 : 1) - (b.close === 'same' ? 0 : 1)).slice(0, 4);\nconst research = { about: String(d.about || ''), searched, others, at: new Date().toISOString() };\nreturn [{ json: { meeting_id: r.meeting_id, found: r.found, research, deck_research: JSON.stringify(research), updated_at: research.at } }];"
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

const about = sticky('## DryRun deck research\nWhen the presenter uploads a deck (POST /webhook/dryrun/deck-research, docs/CONTRACT.md): who else already does what it pitches? An AI Agent reads the deck and decides what to search with its Search Google News tool, reads the headlines and searches again when they are about something else (at most 3 searches). Hold to the sources then keeps only the companies, products and programmes that cite headlines the tool really returned. Saved on the meeting: in the next rehearsal the panel asks how the pitch is different from them, by name. It never checks the presenter\'s own claims.', [deckTrigger], { color: 4 });

export default workflow('dryrun-deck-research', 'DryRun deck research')
  .add(about)
  .add(deckTrigger)
  .to(deckMeeting)
  .to(deckRead)
  .to(deckAgent)
  .to(deckBuild)
  .to(deckKnown
    .onTrue(deckSave.to(deckReply))
    .onFalse(deckReply))
  .group('Read the deck', [deckMeeting, deckRead], { description: 'The deck, the meeting and what the presenter wants from it' })
  .group('Research', [deckAgent, deckGemini, deckGroq, deckTool, deckBuild], { description: 'An agent searches the news for who else does this; held to the headlines it found' });
