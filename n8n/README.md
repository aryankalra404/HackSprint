# n8n workflows

DryRun's brain, running on n8n Cloud (`https://aryankalra.app.n8n.cloud`). The webhook shapes are defined in [../docs/CONTRACT.md](../docs/CONTRACT.md).

| Workflow | What it does |
|---|---|
| **DryRun prep** (`wf1-prep.json`) | Watches Google Calendar. For each new event, Gemini decides whether it's worth preparing for. If so: reads your recent emails with the attendees, reads the news about the company (Google News) and its website (if there are fewer than 3 stories, it also asks Gemini to search the web, which needs billing on the Gemini key; without it the run carries on), writes the brief and proposes the panel, saves it to the **DryRun meetings** data table and emails you. Every Gemini step (decide, research, brief) falls back to the same prompt on Groq (`openai/gpt-oss-120b`, free tier) if Gemini fails, so a quota or billing problem doesn't stop a run. It saves its progress after each stage (shown live on the web app's brief page), and if a run fails it marks the meeting failed with the reason. The web app can also add a meeting by hand: `POST /webhook/dryrun/add-meeting`. |
| **DryRun meetings API** (`wf0-meetings-api.json`) | `GET /webhook/dryrun/meetings` (upcoming meetings) and `GET /webhook/dryrun/meeting?id=` (one meeting with its brief and panel), from the data table. |

## How they're built
- `build/prompts.py`: the prompts and JSON schemas. `build/build.py`: every node (Code node JavaScript included) and the constants: `GEMINI_MODEL` (now `gemini-3-flash-preview`; free-tier limits are per model), `GROQ_MODEL`, `MIN_NEWS`, the data table id. `llm_nodes()` makes each Gemini call with its Groq fallback on the error output; Groq's JSON mode takes no schema, so the schema goes in its prompt.
- `python3 n8n/build/build.py` writes `sdk/*.ts`, n8n Workflow SDK code. Never edit `sdk/*.ts` or the live workflow by hand: change `build.py`, rebuild, deploy.
- `wf*.json` are exports of the live workflows with credentials removed, for reading or importing elsewhere.

## Live in n8n Cloud
| What | ID |
|---|---|
| DryRun prep (published) | `E1Tq9CN9LY7CPlzo` |
| DryRun meetings API (published) | `uc3ZgfQvtK08Iv15` |
| DryRun meetings data table | `86BWrDlUXrOWFgqc` |

Columns of the data table: `meeting_id, title, start, company, kind, why, attendees, owner_email, status, brief, proposal, updated_at, progress, started_at, execution_id, workflow_id` (JSON is stored as strings). `status` is `researching`, `ready` or `failed`.

## Changing a workflow
The n8n MCP server is set up for this project in Claude Code (local scope, so the token isn't in the repo). With it:
1. Change `build/*.py`, run `python3 n8n/build/build.py`, and check the code with `validate_workflow`.
2. Save the live workflow (`get_workflow_details`) to a file and run `python3 n8n/build/live_ops.py n8n/sdk/prep.ts <that file>`. It prints `update_workflow` operations for every parameter that changed, and names any new or removed nodes; add those with `addNode`, `setNodeSettings` (onError, retries) and `addConnection`.
3. Send the operations with `update_workflow`, then `publish_workflow`. Editing in place keeps the credentials attached, which the MCP server can't set up from scratch.
4. Test: add a meeting from the web app (it emails the owner) and watch the brief page, or read the run with `get_workflow_execution`.
5. Re-export `wf*.json` without credentials and commit.

## Credentials (in n8n, not in this repo)
Google Calendar OAuth2, Gmail OAuth2, "Google Gemini(PaLM) Api account" (an AI Studio key, free tier for now: about 4 calls per meeting, and Google Search is refused until billing is on) and "Groq account" (free tier: 1,000 requests a day, 8,000 tokens a minute per model; the three Groq nodes retry to ride out the per-minute limit), attached to the nodes that need them. To change a key, edit that credential in n8n.

Planned: Gemini through Vertex AI on the team's Google Cloud project `trio-507114` (paid by its credits; a service account `dryrun-n8n` with Vertex AI User exists, but the project isn't linked to the billing account yet).

## Try it
- **From the calendar:** add an event with someone outside your organisation as a guest. Within a couple of minutes it appears in the DryRun meetings table as `ready`, and you get "Your brief for … is ready". An internal event ends at "Not worth it".
- **From the web app (or curl):**
  ```bash
  curl -X POST https://aryankalra.app.n8n.cloud/webhook/dryrun/add-meeting -H "Content-Type: application/json" \
    -d '{"title":"RouteIQ pitch","company":"Delhivery","context":"Demo for ops and finance","attendees":[{"name":"Priya Nair","email":"priya.nair@delhivery.com"}],"owner_email":"you@example.com"}'
  curl https://aryankalra.app.n8n.cloud/webhook/dryrun/meetings
  ```
