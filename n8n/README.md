# n8n workflows

DryRun's brain. The files here are importable n8n workflows, generated from [build/build.py](build/build.py) (edit the Python, then run `python3 n8n/build/build.py`). They contain no credentials. The webhook shapes are defined in [../docs/CONTRACT.md](../docs/CONTRACT.md).

| File | Workflow | What it does |
|---|---|---|
| `wf1-prep.json` | **DryRun prep** | Watches Google Calendar. For each new event, Gemini decides whether it's worth preparing for. If so: reads your recent emails with the attendees, researches the company with Google Search, writes the brief and proposes the panel, saves it to the Meetings sheet and emails you. The web app can also add a meeting by hand (`POST /webhook/dryrun/add-meeting`). |
| `wf0-meetings-api.json` | **DryRun meetings API** | Serves `GET /webhook/dryrun/meetings` and `GET /webhook/dryrun/meeting?id=` to the web app, from the Meetings sheet. |

## Set up (about 10 minutes)

1. **The Meetings sheet.** Create a Google Sheet (e.g. "DryRun"), rename its first tab to `Meetings`, and put these headers in row 1:
   `id, title, start, company, kind, why, attendees, owner_email, status, brief, proposal, updated_at`
2. **Import.** In n8n: Workflows → ⋯ → Import from file, for each JSON file here.
3. **Credentials** (n8n Cloud: Credentials → Create):
   - **Google Calendar**, **Gmail** and **Google Sheets**: use "Sign in with Google" with the account whose calendar DryRun should watch.
   - **Gemini key**: type *Header Auth*, Name `x-goog-api-key`, Value your Google AI Studio key.
4. **Point the nodes at them.** Open each node with a warning triangle and pick the credential: the Gemini key on the three Gemini nodes (Worth preparing?, Research the company, Write the brief and panel), Google on the others. In every Google Sheets node, paste the sheet's URL.
5. **Activate** both workflows (toggle at the top right).

## Try it
Add a calendar event with someone outside your organisation as an attendee (e.g. "Pitch to Delhivery", with a made-up `@delhivery.com` guest). Within a couple of minutes:
- a row appears in the Meetings sheet with status `researching`, then `ready`;
- you get an email "Your brief for … is ready";
- `https://<your-n8n>/webhook/dryrun/meetings` lists it.

An internal event (only your own colleagues) is skipped: the execution ends at "Not worth it".
