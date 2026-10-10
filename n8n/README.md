# n8n workflows

DryRun's brain, running on n8n Cloud (`https://aryankalra.app.n8n.cloud`). The webhook shapes are defined in [../docs/CONTRACT.md](../docs/CONTRACT.md).

| Workflow | What it does |
|---|---|
| **DryRun prep** (`wf1-prep.json`) | Watches Google Calendar. For each new event, Gemini decides whether it's worth preparing for. If so: reads your recent emails with the attendees, reads the news about the company (Google News) and its website (if there are fewer than 3 stories, it also asks Gemini to search the web, which needs billing on the Gemini key; without it the run carries on), writes the brief and proposes the panel, saves it to the **DryRun meetings** data table and emails you. It saves its progress after each stage (shown live on the web app's brief page), and if a run fails it marks the meeting failed with the reason. The web app can also add a meeting by hand: `POST /webhook/dryrun/add-meeting`. |
| **DryRun meetings API** (`wf0-meetings-api.json`) | `GET /webhook/dryrun/meetings` (upcoming meetings) and `GET /webhook/dryrun/meeting?id=` (one meeting with its brief and panel), from the data table. |

## How they're built
- `build/prompts.py`: the Gemini prompts and JSON schemas (the model is one setting, `GEMINI_MODEL`, now `gemini-3-flash-preview`; free-tier limits are per model).
- `build/build.py` writes `sdk/*.ts`, n8n Workflow SDK code. It's validated and created in n8n through n8n's MCP server (`validate_workflow`, `create_workflow_from_code`), and later edits go through `update_workflow`.
- `wf*.json` are exports of the live workflows with credentials removed, for reading or importing elsewhere.

## Credentials (in n8n, not in this repo)
Google Calendar OAuth2, Gmail OAuth2 and Google Gemini (PaLM) API, attached to the nodes that need them.

## Try it
- **From the calendar:** add an event with someone outside your organisation as a guest. Within a couple of minutes it appears in the DryRun meetings table as `ready`, and you get "Your brief for … is ready". An internal event ends at "Not worth it".
- **From the web app (or curl):**
  ```bash
  curl -X POST https://aryankalra.app.n8n.cloud/webhook/dryrun/add-meeting -H "Content-Type: application/json" \
    -d '{"title":"RouteIQ pitch","company":"Delhivery","context":"Demo for ops and finance","attendees":[{"name":"Priya Nair","email":"priya.nair@delhivery.com"}],"owner_email":"you@example.com"}'
  curl https://aryankalra.app.n8n.cloud/webhook/dryrun/meetings
  ```
