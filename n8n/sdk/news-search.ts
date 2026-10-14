import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, fromAi, expr } from '@n8n/workflow-sdk';

const newsTrigger = trigger({
  type: "n8n-nodes-base.executeWorkflowTrigger",
  version: 1.2,
  config: {
    "name": "Search wanted (agent)",
    "parameters": {
      "inputSource": "workflowInputs",
      "workflowInputs": {
        "values": [
          {
            "name": "query",
            "type": "string"
          }
        ]
      }
    },
    "output": [
  {
    "query": "AI route optimisation logistics"
  }
]
  }
});

const newsGet = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    "name": "Google News",
    "parameters": {
      "method": "GET",
      "url": expr("https://news.google.com/rss/search?q={{ encodeURIComponent(String($json.query || '').split('\"').join('').trim()) }}&hl=en-IN&gl=IN&ceid=IN:en"),
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

const newsHeadlines = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    "name": "Headlines",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "// Up to 8 headlines (date, publisher, link), each with a short id from its link for the agent to cite\nconst query = $('Search wanted (agent)').first().json.query || '';\nconst xml = String($input.first().json.data || '');\nconst unescape = t => t.replace(/<!\\[CDATA\\[|\\]\\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&#39;/g, \"'\");\nconst tag = (it, t) => { const m = it.match(new RegExp('<' + t + '[^>]*>([^]*?)</' + t + '>')); return m ? unescape(m[1]).trim() : ''; };\nconst id = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 'h' + h.toString(36); };\nconst all = xml.split('<item>').slice(1).map(it => {\n  const src = it.match(/<source url=\"([^\"]*)\">([^]*?)<\\/source>/);\n  const date = new Date(tag(it, 'pubDate'));\n  return { title: tag(it, 'title').replace(/ - [^-]+$/, ''), publisher: src ? unescape(src[2]) : '', date: isNaN(date) ? '' : date.toISOString().slice(0, 10), url: tag(it, 'link') };\n}).filter(h => h.title && h.url);\nconst headlines = all.slice(0, 8).map(h => ({ id: id(h.url), ...h }));\nreturn [{ json: { query, found: all.length, headlines } }];"
    },
    "output": [
  {
    "query": "AI route optimisation logistics",
    "found": 0,
    "headlines": []
  }
]
  }
});

const about = sticky('## DryRun news search\nThe tool behind the deck research agent (DryRun deck research, Search Google News): one Google News search, up to 8 headlines back, each with an id the agent cites. Hold to the sources then checks every citation against these.', [newsTrigger], { color: 4 });

export default workflow('dryrun-news-search', 'DryRun news search')
  .add(about)
  .add(newsTrigger)
  .to(newsGet)
  .to(newsHeadlines);
