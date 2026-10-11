import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, fromAi, expr } from '@n8n/workflow-sdk';

const reviewTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    "name": "A deck was uploaded (laptop)",
    "parameters": {
      "httpMethod": "POST",
      "path": "dryrun/deck-review",
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

const reviewMeeting = node({
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

const reviewGather = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "What to check it against",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// The deck's slide text against the brief: its research with numbered sources, the attendees and what they care about, the hardest\n// questions and risks, and what the presenter offers and wants (docs/CONTRACT.md, POST /deck-review)\nconst req = $('A deck was uploaded (laptop)').first().json.body;\nconst row = $input.first().json || {};\nconst parse = x => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };\nconst brief = parse(row.brief) || {};\nconst proposal = parse(row.proposal) || {};\nconst sources = (brief.sources || []).slice(0, 12);\nconst research = [brief.company && brief.company.what_they_do ? 'What they do: ' + brief.company.what_they_do : '']\n  .concat(((brief.company && brief.company.recent_news) || []).map(n => 'News' + (n.date ? ' (' + n.date + ')' : '') + ': ' + n.text))\n  .concat(sources.map((x, i) => '[' + (i + 1) + '] ' + x.title + ' ' + x.url)).filter(Boolean).join('\\n') || 'No research saved for this meeting.';\nconst goal = req.goal || (proposal.goal && proposal.goal.text) || '';\nconst offer = (req.presenter && req.presenter.offer) || '';\nconst slides = ((req.deck && req.deck.slides) || []).map(s => ({ index: s.index, text: String(s.text || '').slice(0, 1200) })).filter(s => s.text);\nconst parts = {\n  meeting: (row.title || 'A meeting') + (row.company ? ' with ' + row.company : ''),\n  side: (offer ? 'They offer: ' + offer + '. ' : '') + (goal ? 'They want: ' + goal + '.' : '') || 'Not given.',\n  brief: JSON.stringify({ summary: brief.summary || '', attendees: brief.attendees || [], questions: (brief.questions || []).map(q => q.question), risks: brief.risks || [] }),\n  research,\n  deck: JSON.stringify(slides),\n};\nconst PROMPT = \"You check a presenter's deck before a real meeting, against what is known about the people they will pitch to.\\nFind where the deck will get pushback in this meeting, and from whom.\\n\\nThe meeting: {meeting}\\nWhat the presenter offers and wants from it: {side}\\nThe brief (real attendees and what they care about, the hardest questions, the risks):\\n{brief}\\nThe research on the company, with numbered sources:\\n{research}\\nThe deck, slide by slide (index from 0):\\n{deck}\\n\\nitems: 3 to 5, the strongest first, each:\\n- slide_index: the slide it is about;\\n- claim: the claim on that slide, copied or closely paraphrased from its text (e.g. \\\"30% lower fuel cost\\\");\\n- pushback: what they know or care about that challenges it, in one or two sentences, from the research or the brief only\\n  (e.g. \\\"Their FY25 report says fuel cost already fell 18%, so they will ask what is left to save\\\"). If nothing in the research\\n  contradicts it but nothing supports it either, say what evidence they will ask for;\\n- source: the number of the research source it rests on, or 0 if it comes from the brief or is a claim with nothing behind it;\\n- who: who will push, an attendee's name from the brief with their focus in brackets, or a role if no attendee fits;\\n- fix: what to change on the slide or what to say, in one sentence.\\nsummary: one sentence on how the deck will land with this panel.\\nNever state facts that are not in the brief or the research, and never invent facts about the presenter's own product.\\nAnswer in JSON.\";\nconst prompt = Object.entries(parts).reduce((t, [k, v]) => t.split('{' + k + '}').join(v), PROMPT);\nconst indexes = ((req.deck && req.deck.slides) || []).map(s => s.index);\nreturn [{ json: { meeting_id: row.meeting_id || '', found: !!row.meeting_id, slides: slides.length, indexes, sources, prompt } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "found": true,
    "slides": 1,
    "sources": [],
    "prompt": ""
  }
]
  }
});

const reviewJudge = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Review the deck",
    "parameters": {
      "method": "POST",
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "googlePalmApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: {\"type\": \"object\", \"properties\": {\"items\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"slide_index\": {\"type\": \"integer\"}, \"claim\": {\"type\": \"string\"}, \"pushback\": {\"type\": \"string\"}, \"source\": {\"type\": \"integer\"}, \"who\": {\"type\": \"string\"}, \"fix\": {\"type\": \"string\"} }, \"required\": [\"slide_index\", \"claim\", \"pushback\", \"source\", \"who\", \"fix\"]} }, \"summary\": {\"type\": \"string\"} }, \"required\": [\"items\", \"summary\"]} } }) }}"),
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

const reviewJudgeGroq = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Review the deck (Groq)",
    "parameters": {
      "method": "POST",
      "url": "https://api.groq.com/openai/v1/chat/completions",
      "authentication": "predefinedCredentialType",
      "nodeCredentialType": "groqApi",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": expr("{{ (() => { const j = $('What to check it against').first().json; return JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 8192, messages: [{ role: 'user', content: (j.prompt) + \"\\n\\nReply with only a JSON object that follows this JSON schema:\\n\" + JSON.stringify({\"type\": \"object\", \"properties\": {\"items\": {\"type\": \"array\", \"items\": {\"type\": \"object\", \"properties\": {\"slide_index\": {\"type\": \"integer\"}, \"claim\": {\"type\": \"string\"}, \"pushback\": {\"type\": \"string\"}, \"source\": {\"type\": \"integer\"}, \"who\": {\"type\": \"string\"}, \"fix\": {\"type\": \"string\"} }, \"required\": [\"slide_index\", \"claim\", \"pushback\", \"source\", \"who\", \"fix\"]} }, \"summary\": {\"type\": \"string\"} }, \"required\": [\"items\", \"summary\"]}) }], response_format: { type: 'json_object' } }); })() }}"),
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

const reviewBuild = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "The review",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const replyText = j => j.choices\n  ? ((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '')\n  : ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');\n\n// Held to the deck and the sources: real slides only, each source by its number, at most five\nconst g = $('What to check it against').first().json;\nconst d = JSON.parse(replyText($json) || '{}');\nconst items = (d.items || []).filter(x => g.indexes.includes(x.slide_index) && x.claim && x.pushback).slice(0, 5)\n  .map(x => ({ slide_index: x.slide_index, claim: x.claim, pushback: x.pushback, who: x.who || '', fix: x.fix || '',\n               source: g.sources[x.source - 1] ? { title: g.sources[x.source - 1].title, url: g.sources[x.source - 1].url } : null }));\nconst review = { items, summary: d.summary || '', at: new Date().toISOString() };\nreturn [{ json: { meeting_id: g.meeting_id, found: g.found, review, deck_review: JSON.stringify(review), updated_at: review.at } }];"
    },
    "output": [
  {
    "meeting_id": "evt123",
    "found": true,
    "review": {
      "items": []
    },
    "deck_review": "{}"
  }
]
  }
});

const reviewKnown = ifElse({
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

const reviewSave = node({
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
          "deck_review": expr("{{ $json.deck_review }}"),
          "updated_at": expr("{{ $json.updated_at }}")
        },
        "matchingColumns": [],
        "schema": [
          {
            "id": "deck_review",
            "displayName": "deck_review",
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

const reviewReply = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    "name": "Send the review",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ JSON.stringify($('The review').first().json.review) }}"),
      "options": {}
    },
    "output": [
  {}
]
  }
});

const about = sticky('## DryRun deck review\nWhen the presenter uploads a deck (POST /webhook/dryrun/deck-review, docs/CONTRACT.md): checks its claims against the brief (the research and its sources, the attendees and what they care about) and says where it will get pushback, from whom, and how to fix it. Saved on the meeting, so the next rehearsal presses on the same points.', [reviewTrigger], { color: 4 });

export default workflow('dryrun-deck-review', 'DryRun deck review')
  .add(about)
  .add(reviewTrigger)
  .to(reviewMeeting)
  .to(reviewGather)
  .to(reviewJudge)
  .to(reviewBuild)
  .to(reviewKnown
    .onTrue(reviewSave.to(reviewReply))
    .onFalse(reviewReply))
  .add(reviewJudge.onError(reviewJudgeGroq))
  .add(reviewJudgeGroq)
  .to(reviewBuild)
  .group('Review', [reviewMeeting, reviewGather, reviewJudge, reviewJudgeGroq, reviewBuild], { description: 'Checks the deck against the brief and its sources' })
  .group('Save', [reviewKnown, reviewSave], { description: 'Saves the review on the meeting for the next rehearsal' });
