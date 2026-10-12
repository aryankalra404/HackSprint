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
      "jsCode": "// The deck's slide text, the meeting and what the presenter wants from it (docs/CONTRACT.md, POST /deck-research)\nconst req = $('A deck was uploaded (laptop)').first().json.body;\nconst row = $input.first().json || {};\nconst parse = x => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };\nconst proposal = parse(row.proposal) || {};\nconst goal = req.goal || (proposal.goal && proposal.goal.text) || '';\nconst offer = (req.presenter && req.presenter.offer) || '';\nconst slides = ((req.deck && req.deck.slides) || []).map(s => ({ index: s.index, text: String(s.text || '').slice(0, 1200) })).filter(s => s.text);\nconst meeting = (row.title || 'A meeting') + (row.company ? ' with ' + row.company : '');\nconst side = (offer ? 'They offer: ' + offer + '. ' : '') + (goal ? 'They want: ' + goal + '.' : '') || 'Not given.';\nconst parts = { meeting, side, deck: JSON.stringify(slides) };\nconst PROMPT = \"You are preparing a presenter for a real meeting. Read their deck and decide which of its claims the people\\nthey pitch to would check, and how to search the news for each.\\n\\nThe meeting: {meeting}\\nWhat the presenter offers and wants from it: {side}\\nThe deck, slide by slide (index from 0):\\n{deck}\\n\\nabout: one sentence on what the deck pitches and to whom, in plain words.\\nchecks: 2 to 5 claims worth checking, the most decisive first. Pick claims about the world that the news could confirm or\\n  contradict: the size of the problem (failures, costs, accidents, demand), the market and who buys, who else already does this\\n  (competitors, existing government schemes, platforms or programmes), numbers the deck gives (savings, growth, accuracy), and how\\n  mature the technology is. Never pick claims only the presenter could know or that no newspaper would report: their team, IDs and\\n  reference numbers, reviews or approvals of their own project, their roadmap, their own results or which dataset they used. Each:\\n- slide_index: the slide the claim is on;\\n- claim: the claim, copied or closely paraphrased from the slide (e.g. \\\"30% lower fuel cost\\\");\\n- query: a Google News search on the claim's subject, 3 to 5 words, the way a journalist would headline it (e.g. \\\"UAV engine\\n  failures India\\\", \\\"route optimisation fuel savings\\\"), not the claim's wording. Spell out acronyms the way the deck means them\\n  (\\\"Smart India Hackathon\\\", not \\\"SIH\\\"); no names of the presenter's product, no quotes or operators;\\n- broad: a broader search, 2 or 3 words, for when the first finds nothing (e.g. \\\"drone predictive maintenance\\\").\\nAnswer in JSON.\";\nconst prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);\nreturn [{ json: { meeting_id: row.meeting_id || '', found: !!row.meeting_id, meeting, indexes: slides.map(s => s.index), brief: row.brief || '', prompt } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "found": true,
    "meeting": "RouteIQ pitch with Delhivery",
    "indexes": [
      0
    ],
    "brief": "",
    "prompt": ""
  }
]
  }
});

const deckClaims = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Pick the claims to check",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"about\": {\"type\": \"string\"}, \"checks\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"slide_index\": {\"type\": \"integer\"}, \"claim\": {\"type\": \"string\"}, \"query\": {\"type\": \"string\"}, \"broad\": {\"type\": \"string\"} }, \"required\": [\"slide_index\", \"claim\", \"query\", \"broad\"]} } }, \"required\": [\"about\", \"checks\"]} } }) }}"),
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
    "name": "Pick the claims to check (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $('Read the deck').first().json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: (j.prompt) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"about\": {\"type\": \"string\"}, \"checks\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"slide_index\": {\"type\": \"integer\"}, \"claim\": {\"type\": \"string\"}, \"query\": {\"type\": \"string\"}, \"broad\": {\"type\": \"string\"} }, \"required\": [\"slide_index\", \"claim\", \"query\", \"broad\"]} } }, \"required\": [\"about\", \"checks\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
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
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// Two Google News searches per claim (its subject, then broader), on a real slide, at most five claims\nconst g = $('Read the deck').first().json;\nconst d = JSON.parse(replyText($input.first().json) || '{}');\nconst clean = q => String(q || '').split('\"').join('').trim();\nconst seen = new Set();\nconst checks = (d.checks || []).filter(x => g.indexes.includes(x.slide_index) && x.claim && clean(x.query))\n  .map(x => ({ slide_index: x.slide_index, claim: String(x.claim), query: clean(x.query), broad: clean(x.broad) }))\n  .filter(x => !seen.has(x.query.toLowerCase()) && seen.add(x.query.toLowerCase())).slice(0, 5);\n// Nothing worth checking still goes on (one empty search that fails quietly), so the laptop always gets an answer\nif (!checks.length) return [{ json: { none: true, about: d.about || '', url: '' } }];\nconst url = q => 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-IN&gl=IN&ceid=IN:en';\nreturn checks.flatMap((x, i) => [x.query].concat(x.broad && x.broad.toLowerCase() !== x.query.toLowerCase() ? [x.broad] : [])\n  .map(q => ({ json: { ...x, i, q, about: d.about || '', url: url(q) } })));"
    },
    "output": [
  {
    "i": 0,
    "slide_index": 0,
    "claim": "30% lower fuel cost",
    "query": "route optimisation fuel savings",
    "broad": "fleet fuel costs",
    "q": "route optimisation fuel savings",
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
      "jsCode": "// Each claim with its headlines (date, publisher, link), numbered across all searches, then the brief's own sources after them\nconst g = $('Read the deck').first().json;\nconst all = $('The searches').all().map(i => i.json);\nconst results = $input.all().map(i => String(i.json.data || ''));\nconst unescape = t => t.replace(/<!\\[CDATA\\[|\\]\\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&#39;/g, \"'\");\nconst tag = (xml, t) => { const m = xml.match(new RegExp('<' + t + '[^>]*>([^]*?)</' + t + '>')); return m ? unescape(m[1]).trim() : ''; };\nconst headlines = xml => xml.split('<item>').slice(1).map(it => {\n  const src = it.match(/<source url=\"([^\"]*)\">([^]*?)<\\/source>/);\n  const date = new Date(tag(it, 'pubDate'));\n  return { title: tag(it, 'title').replace(/ - [^-]+$/, ''), url: tag(it, 'link'), publisher: src ? unescape(src[2]) : '', date: isNaN(date) ? '' : date.toISOString().slice(0, 10) };\n}).filter(h => h.title && h.url);\n// Per claim: the subject search first, topped up from the broad one, without repeats\nconst byClaim = {};\nall.forEach((x, k) => { if (x.none) return; (byClaim[x.i] = byClaim[x.i] || { ...x, items: [] }).items.push(...headlines(results[k] || '')); });\nconst sources = [];\nconst searched = Object.values(byClaim).sort((a, b) => a.i - b.i).map(x => {\n  const seen = new Set();\n  const items = x.items.filter(h => !seen.has(h.title.toLowerCase()) && seen.add(h.title.toLowerCase())).slice(0, 6);\n  const numbered = items.map(h => { sources.push(h); return sources.length; });\n  return { slide_index: x.slide_index, claim: x.claim, query: x.query, found: items.length, numbered };\n});\nconst parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };\nconst brief = parse(g.brief) || {};\nconst own = (brief.sources || []).slice(0, 8).map(x => ({ title: x.title, url: x.url, publisher: '', date: '' }));\nconst research = [brief.company && brief.company.what_they_do ? 'What they do: ' + brief.company.what_they_do : '']\n  .concat(own.map(x => { sources.push(x); return '[' + sources.length + '] ' + x.title; })).filter(Boolean).join('\\n') || 'None.';\nconst text = searched.map((x, k) => (k + 1) + '. Slide ' + (x.slide_index + 1) + ': \"' + x.claim + '\" (searched: ' + x.query + ')\\n'\n  + (x.numbered.length ? x.numbered.map(n => '   [' + n + '] ' + sources[n - 1].title + (sources[n - 1].publisher ? ' (' + sources[n - 1].publisher + (sources[n - 1].date ? ', ' + sources[n - 1].date : '') + ')' : '')).join('\\n') : '   No headlines found.')).join('\\n');\nconst parts = { meeting: g.meeting, about: (all[0] && all[0].about) || 'Not given.', checks: text || 'No claims to check.', research };\nconst PROMPT = \"You check a presenter's claims against the news before a real meeting. Say what the sources say; give no\\nadvice on the slides.\\n\\nThe meeting: {meeting}\\nWhat the deck pitches: {about}\\n\\nThe claims, each with the headlines found for it (numbered sources; a headline may be about something else that shares a word or an\\nacronym: ignore any that is not about the same subject):\\n{checks}\\n\\nWhat n8n already found about the company for the brief (numbered sources continue):\\n{research}\\n\\nfindings: one per claim above, in the same order, each:\\n- check: the claim's number;\\n- verdict: \\\"backed\\\" if the relevant sources support it, \\\"challenged\\\" if they contradict it or show a competitor, an existing scheme or\\n  platform, or a smaller number, \\\"unproven\\\" if no relevant source speaks to it;\\n- fact: what the relevant sources say about it, in one or two plain sentences, with dates or numbers where the headlines give them.\\n  Only what the sources say; for \\\"unproven\\\", say plainly that n8n found nothing that backs or contradicts it;\\n- question: how someone on the panel would put it to the presenter, in one short sentence (e.g. \\\"Where does 30% come from, when the\\n  industry reports half that?\\\");\\n- sources: the numbers of the relevant sources it rests on (empty for \\\"unproven\\\").\\nNever state facts that are not in the sources, and never invent facts about the presenter's own product. Answer in JSON.\";\nconst prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);\nreturn [{ json: { searched: searched.map(x => ({ query: x.query, slide_index: x.slide_index, claim: x.claim, found: x.found })), about: parts.about,\n                  headlines: searched.reduce((a, x) => a + x.found, 0), sources, prompt } }];"
    },
    "output": [
  {
    "searched": [],
    "about": "",
    "headlines": 0,
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
    "name": "Weigh the evidence",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"findings\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"check\": {\"type\": \"integer\"}, \"verdict\": {\"type\": \"string\", \"enum\": [\"backed\", \"challenged\", \"unproven\"]}, \"fact\": {\"type\": \"string\"}, \"question\": {\"type\": \"string\"}, \"sources\": {\"type\": \"array\", \"items\": {\"type\": \"integer\"} } }, \"required\": [\"check\", \"verdict\", \"fact\", \"question\", \"sources\"]} } }, \"required\": [\"findings\"]} } }) }}"),
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
    "name": "Weigh the evidence (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $('Gather what it found').first().json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: (j.prompt) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"findings\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"check\": {\"type\": \"integer\"}, \"verdict\": {\"type\": \"string\", \"enum\": [\"backed\", \"challenged\", \"unproven\"]}, \"fact\": {\"type\": \"string\"}, \"question\": {\"type\": \"string\"}, \"sources\": {\"type\": \"array\", \"items\": {\"type\": \"integer\"} } }, \"required\": [\"check\", \"verdict\", \"fact\", \"question\", \"sources\"]} } }, \"required\": [\"findings\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
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
    "name": "The findings",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// Held to the sources: each finding on a claim that was searched, citing only sources n8n found; a finding with no source can only be\n// \"unproven\". Challenged first, then backed, then unproven.\nconst r = $('Read the deck').first().json;\nconst g = $('Gather what it found').first().json;\nconst d = JSON.parse(replyText($json) || '{}');\nconst order = { challenged: 0, backed: 1, unproven: 2 };\nconst used = new Set();\nconst findings = (d.findings || []).map(f => {\n  const x = g.searched[f.check - 1];\n  if (!x || used.has(f.check) || !f.fact) return null;\n  used.add(f.check);\n  const sources = [...new Set(f.sources || [])].map(n => g.sources[n - 1]).filter(Boolean).slice(0, 3);\n  const verdict = sources.length && order[f.verdict] != null ? f.verdict : 'unproven';\n  return { slide_index: x.slide_index, claim: x.claim, verdict, fact: String(f.fact), question: String(f.question || ''), sources };\n}).filter(Boolean).sort((a, b) => order[a.verdict] - order[b.verdict]);\nconst research = { about: g.about === 'Not given.' ? '' : g.about, searched: g.searched.map(x => ({ query: x.query, slide_index: x.slide_index, found: x.found })),\n                   findings, at: new Date().toISOString() };\nreturn [{ json: { meeting_id: r.meeting_id, found: r.found, research, deck_research: JSON.stringify(research), updated_at: research.at } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "found": true,
    "research": {
      "findings": []
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
    "name": "Send the findings",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify($('The findings').first().json.research) }}"),
      "options": {}
    },
    "output": [
  {}
]
  }
});

const about = sticky('## DryRun deck research\nWhen the presenter uploads a deck (POST /webhook/dryrun/deck-research, docs/CONTRACT.md): the deck is a source, not something to mark. n8n picks the claims an outsider could check, searches Google News for each in the deck\'s own words, and weighs what it found: backed, challenged or unproven, with the sources. Saved on the meeting: the next rehearsal asks about them, and the debrief checks what the presenter said against them.', [deckTrigger], { color: 4 });

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
  .group('Read the deck', [deckMeeting, deckRead, deckClaims, deckClaimsGroq, deckSearches], { description: 'Picks the claims an outsider could check and a news search for each' })
  .group('Research', [deckNews, deckGather, deckWeigh, deckWeighGroq, deckBuild], { description: 'Searches the news per claim and weighs what it found, held to the sources' });
