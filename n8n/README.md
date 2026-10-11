# n8n workflows

DryRun's brain, running on n8n Cloud (`https://aryankalra47.app.n8n.cloud`). The webhook shapes are defined in [../docs/CONTRACT.md](../docs/CONTRACT.md).

| Workflow | What it does |
|---|---|
| **DryRun prep** (`wf1-prep.json`) | Watches Google Calendar. For each new event, Gemini decides whether it's worth preparing for, and why. If not, the meeting is saved as `skipped` with that reason (the web app lists it with "Prepare anyway"). If so: reads your recent emails with the attendees, reads the news about the company (Google News) and its website (if there are fewer than 3 stories, it also asks Gemini to search the web, which needs billing on the Gemini key; without it the run carries on), writes the brief, seats the real external attendees as the practice panel (practice roles become one-tap suggestions with a name and face; only with no known attendee are two seated) and suggests how long to pitch (from the slot's length and the kind of meeting), saves it to the **DryRun meetings** data table and emails you. Every Gemini step (decide, research, brief) falls back to the same prompt on Groq (`openai/gpt-oss-120b`, free tier) if Gemini fails, so a quota or billing problem doesn't stop a run. It saves its progress after each stage (shown live on the web app's brief page), and if a run fails it marks the meeting failed with the reason. The web app can also add a meeting by hand: `POST /webhook/dryrun/add-meeting`. |
| **DryRun rehearsal prep** (`wf2-rehearsal-prep.json`) | `POST /webhook/dryrun/prep`, when the presenter starts a rehearsal. From the meeting's brief (in the data table), its last debrief (weak spots become objections with `source: "history"`, one more difficulty for whoever presses on them, last time's talk track per slide and the drill), the confirmed panel, the deck's slide text and the pitch length, Gemini (Groq if it fails) plans each slide (key points, target time, rescue cues), what each person will push on, who interrupts and who waits, who chairs, how many questions to ask during and after the pitch (with its reason) and short lines to voice ahead of time. Nothing about the meeting is fixed in code. Each line is then voiced by Sarvam (`bulbul:v3`) in that person's voice, one call per line (a line that fails is left silent); the web app's `DRYRUN_VOICES=off` skips this. |
| **DryRun turn** (`wf3-turn.json`) | `POST /webhook/dryrun/turn`, each time the presenter has said something (the laptop forwards it from the headset with the context: the bundle, the turns so far and the open questions). Groq Whisper transcribes it (hinted with the company, slide titles and names), Groq decides whether anyone reacts, who, what and why, with Gemini as the fallback, and Sarvam voices any new line (lines voiced in prep play as they are). Returns the transcript, a one-line note for the dashboard and the reactions. Keeps no state. |
| **DryRun meetings API** (`wf0-meetings-api.json`) | `GET /webhook/dryrun/meetings` (upcoming meetings, each with its rehearsals so far) and `GET /webhook/dryrun/meeting?id=` (one meeting with its brief, panel and rehearsals), from the two data tables. |
| **DryRun debrief** (no export yet) | `POST /webhook/dryrun/debrief`, when a rehearsal ends (the laptop sends every turn's transcript and the slide changes). A Code node counts time, words per minute and filler words per slide and pairs questions with answers; Gemini (Groq if it fails) marks the transcript with exact quotes, scores clarity, evidence, objection handling and structure with evidence, judges each person's stance, writes a talk track per slide, the drill and weak spots. It saves its progress to the **DryRun sessions** table after each step, emails the report, marks the meeting `practised` and answers with the whole session. `GET /webhook/dryrun/session?session_id=` reads one session. The next `/prep` for the meeting reads its last debrief. |

## How they're built
- `build/prompts.py`: the prompts and JSON schemas. `build/build.py`: every node of every workflow (Code node JavaScript included) and the constants: `GEMINI_MODEL` (now `gemini-3-flash-preview`; free-tier limits are per model), `GROQ_MODEL`, `MIN_NEWS`, the data table id. `llm_nodes()` makes each Gemini call with its Groq fallback on the error output; Groq's JSON mode takes no schema, so the schema goes in its prompt; gpt-oss reasons before answering, so its calls ask for low reasoning effort and allow 8,192 output tokens (the default 3,072 ran out mid-answer).
- `python3 n8n/build/build.py` writes `sdk/*.ts` (`prep.ts`, `meetings-api.ts`, `rehearsal-prep.ts`, `turn.ts`, `debrief.ts`), n8n Workflow SDK code. Never edit `sdk/*.ts` or the live workflow by hand: change `build.py`, rebuild, deploy.
- `wf*.json` are exports of the live workflows with credentials removed, for reading or importing elsewhere.

## Live in n8n Cloud
Moved to a new n8n Cloud account (`aryankalra47`) on 11 Oct, after the first one used up its 1,000 executions. DryRun prep was imported from `wf1-prep.json` (too large to paste through MCP): an imported workflow has to be switched to "Available in MCP" in its settings before the MCP server can edit it, and its canvas groups are set again with `setNodeGroups`.
| What | ID |
|---|---|
| DryRun prep (published) | `hlNp38zOOc3D9NTH` |
| DryRun meetings API (published) | `GBgpM9Yq9qF7pGCV` |
| DryRun rehearsal prep (published) | `8uXBbDqskDlv8YBC` |
| DryRun turn (published) | `DMvVTOcJ9GwDSMFn` |
| DryRun debrief (published) | `XpVBWsXaB1UuPop8` |
| DryRun meetings data table | `wURCb4PjdZLpttns` |
| DryRun sessions data table | `xzUZexBbX6bcX18F` |

Columns of the data table: `meeting_id, title, start, company, kind, why, attendees, owner_email, status, brief, proposal, updated_at, progress, started_at, execution_id, workflow_id` (JSON is stored as strings). `status` is `researching`, `ready`, `failed`, `skipped` or `practised` (set by the debrief).

Columns of **DryRun sessions** (one row per run of a panel): `session_id, meeting_id, at, status (debriefing | done | failed), overall, headline, bundle, telemetry, debrief_status, debrief, execution_id, workflow_id, updated_at`.

## Changing a workflow
The n8n MCP server is set up for this project in Claude Code (local scope, so the token isn't in the repo). With it:
1. Change `build/*.py`, run `python3 n8n/build/build.py`, and check the code with `validate_workflow`.
2. Save the live workflow (`get_workflow_details`) to a file and run `python3 n8n/build/live_ops.py n8n/sdk/prep.ts <that file>`. It prints `update_workflow` operations for every parameter that changed, and names any new or removed nodes; add those with `addNode`, `setNodeSettings` (onError, retries) and `addConnection`.
3. Send the operations with `update_workflow`, then `publish_workflow`. Editing in place keeps the credentials attached, which the MCP server can't set up from scratch.
4. Test: add a meeting from the web app (it emails the owner) and watch the brief page, or read the run with `get_workflow_execution`.
5. Re-export `wf*.json` without credentials and commit.

## Credentials (in n8n, not in this repo)
Google Calendar OAuth2, Gmail OAuth2, "Sarvam" (Header Auth, header `api-subscription-key`; about ₹3 per 1,000 characters voiced, so roughly ₹1.5 a rehearsal for the lines voiced ahead of time), "Google Gemini(PaLM) Api account" (an AI Studio key, free tier for now: about 4 calls per meeting, and Google Search is refused until billing is on) and "Groq account" (free tier: 1,000 requests a day, 8,000 tokens a minute per model; the three Groq nodes retry to ride out the per-minute limit), attached to the nodes that need them. To change a key, edit that credential in n8n.

Planned: Gemini through Vertex AI on the team's Google Cloud project `trio-507114` (paid by its credits; a service account `dryrun-n8n` with Vertex AI User exists, but the project isn't linked to the billing account yet).

## Try it
- **From the calendar:** add an event with someone outside your organisation as a guest. Within a couple of minutes it appears in the DryRun meetings table as `ready`, and you get "Your brief for … is ready". An internal event is saved as `skipped` with the reason, and shows under "Skipped by n8n" on the web app's home page. To try the skip path without the calendar, run the workflow with `test_workflow`, pinning "New calendar event" and "Worth preparing?".
- **From the web app (or curl):**
  ```bash
  curl -X POST https://aryankalra47.app.n8n.cloud/webhook/dryrun/add-meeting -H "Content-Type: application/json" \
    -d '{"title":"RouteIQ pitch","company":"Delhivery","context":"Demo for ops and finance","attendees":[{"name":"Priya Nair","email":"priya.nair@delhivery.com"}],"owner_email":"you@example.com"}'
  curl https://aryankalra47.app.n8n.cloud/webhook/dryrun/meetings
  ```
