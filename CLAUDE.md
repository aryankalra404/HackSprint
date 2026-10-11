# DryRun — project guide for Claude

HackSprint (MAHE Bengaluru, 17–18 Oct 2026), team **Git Push and Pray**, Track T.02 AI & Automation, **PS 22: "Built with n8n."**
DryRun prepares you for high-stakes meetings and lets you rehearse them. n8n watches Google Calendar, decides which meetings are worth preparing, researches them (your emails with the attendees, Google News, the company website), emails a factual brief and proposes a practice panel. The web app is the full product (meetings, brief, practice panel, dashboard); the VR boardroom (Quest) is the premium way to rehearse, seated live from the web. The target, not built yet: stakeholders interrupt with grounded questions, a Rescue Agent catches you when you freeze, and an n8n debrief scores you, acts on the result and makes the next rehearsal harder where you were weak. Direction and demo script: `docs/PLAN.md`.

## Current state (keep this short and current)
- **Live and real:** n8n Cloud workflows **DryRun prep** (calendar or web → triage (skipped meetings kept with the reason) → emails → news, website, web search if news is thin → brief and panel → data table → email, with live progress and a failure branch) and **DryRun meetings API**; the web home, brief, add-meeting and practice pages on top of them; the room on the laptop, synced live to the headset; your deck (PDF, PowerPoint or Keynote, converted on the laptop) on the boardroom TV with a speaker view on the confidence monitor, paged by a quick pinch (right hand next, left hand back; hand tracking, no controllers needed; the hands are dressed with skin and a suit sleeve), the triggers, the web or a clicker; the presenter's eye height, set from a bar on the web; the session lifecycle (start on speech, A or the dashboard; end, or by itself when you go quiet on the last slide; run it again; survives the laptop dropping out); the headset view on the dashboard.
- **Sample data:** the dashboard's bundle, "What the agent did" feed and slide strip (`prepSession` always returns `web/src/lib/mock/prep.ts`; objections come from the practice panel), and the report (`/s/demo/report`). n8n `/panel`, `/prep` (deck), `/turn` and `/debrief` aren't built; `/api/turn` and `/api/debrief` forward to URLs that don't exist yet.
- **Tested only in the Unity editor:** live seating, slides, voice start, look-at, Wi-Fi discovery, eye height and the headset view (it only streams from an Android build). The hand pinches and the dressed hands' tracking can't run in the editor at all: untested until a Quest build (`Snapshot Hands` shows the look).
- **n8n access:** the n8n MCP server is set up for this project in Claude Code (local scope; the token isn't in the repo). Workflow IDs, how to change and redeploy them, and credentials: `n8n/README.md`. The Gemini key is on the free tier, with a Groq fallback on every Gemini step; watch the quotas (PLAN.md, Risks).

## Where things live
| Part | Location | Notes |
|---|---|---|
| Docs, n8n workflows, web client | this repo (`~/Desktop/HackSprint`) | GitHub: aryankalra404/HackSprint |
| VR client (Unity 6.3, Quest 3S) | `~/My project` (not in this repo; its own local Git since 11 Oct, no remote) | Its own `CLAUDE.md` is the source of truth for scene, lighting, build steps and Unity gotchas. Read it before any Unity work. |
| n8n workflows | `n8n/` | Built from `n8n/build/*.py` (prompts and nodes) into `n8n/sdk/*.ts`, deployed through the n8n MCP server; `n8n/*.json` are exports of the live workflows, credentials stripped. Re-export after every change. See `n8n/README.md`. |
| Web client | `web/` | Next.js 16 (App Router, Cache Components, Tailwind 4). Must speak the same contract as VR. See `web/README.md`. |

## Docs (keep these current)
- `docs/PLAN.md`: the week plan, status checkboxes, decisions log and risks. **Update it whenever a task finishes or a decision is made.**
- `docs/ARCHITECTURE.md`: components, the n8n workflows (built and planned), and what runs where.
- `docs/CONTRACT.md`: webhook request and response JSON shared by VR, web and n8n. **Change this file first, bump its version, then change the code.**
- `docs/VR_CLIENT.md`: what the VR client does and needs, from the rest of the team's point of view.
- `README.md`: public, judge-facing overview. Keep it short and true. Never claim features that don't work.

When a task changes something these files describe, update the file in the same piece of work. Don't create new docs when an existing one fits.

## Ground rules
1. **n8n is the brain.** The judges (and n8n Community mentors) will ask what n8n does. Reasoning, decisions and actions belong in n8n workflows: persona generation, who asks what and when, scoring, the drill and follow-up actions. Clients capture input, render and play audio. Don't move decision logic into Unity or the web client to save time without logging it in PLAN.md.
2. **One contract, two clients.** VR and web send and receive identical JSON (`docs/CONTRACT.md`). Fields only one client can produce (e.g. gaze) are optional, never required.
3. **Nothing blocks on the network while the presenter is frozen.** Rescue cues are pre-generated in the prep bundle. Silence detection runs on the device.
4. **The demo path wins.** Before adding a feature, check it serves the end-to-end demo in `docs/PLAN.md`.

## Web client conventions
- Next.js 16 differs from older versions. Read the relevant guide in `web/node_modules/next/dist/docs/` before writing Next.js code (see `web/AGENTS.md`).
- Types for the contract live in `web/src/lib/contract.ts`; keep them in step with `docs/CONTRACT.md`.
- Screens: home (`/`, the meetings n8n is preparing, with a "prepare for this meeting?" pop-up), the brief (`/m/[id]`, facts only), practice (`/m/[id]/practise`, the editable table, live in the headset), add a meeting (`/new`), the dashboard (`/s/[id]`, one screen, no scrolling, for the big display during the VR session) and the report (`/s/[id]/report`). Keep the dashboard sparse; detail belongs in the report or the persona drawer.
- The brief and its email only state facts (real attendees, sourced news). Hypothetical roles exist only in the practice panel, always labelled as practice.
- `DRYRUN_N8N_URL` (in `web/.env.local`) points at n8n's webhooks; `DRYRUN_OWNER_EMAIL` is where briefs go by default. With `DRYRUN_N8N_URL` unset, the app serves sample data from `web/src/lib/mock/`.
- Visual style: briefing-file look (paper, ink). One typeface, Archivo; its wide cut (`font-display`) is for names, headings and big numbers. Sentence-case labels, no all-caps, no `·`-joined strings. Tokens in `web/src/app/globals.css`. Each stakeholder has a fixed colour in `web/src/lib/personas.ts`, always paired with a role label (colour alone can't tell five apart). Status colours (good, warn, bad) always come with an icon and a label.

## Git
- Commit messages are one line, written like a person would write them (e.g. "add debrief screen with sample data").
- No "Co-Authored-By: Claude" or any other AI attribution in commits or PRs.
- Commit often, without asking each time: after each working step (a screen, a workflow, a fix), once it builds. Keep each commit to one change.
- Never commit `docs/` (kept local). Stage files by path, not with `git add -A`.

## Gotchas
- Disk is nearly full (16 GB free on 11 Oct, after clearing an old project copy's cache; it was 4.5 GB on 10 Oct). Unity builds fail and crash when it's low, so check `df -h ~` before builds or big imports.
- Don't trigger Quest builds through MCP Unity (it crashed Unity once). Ask the user to run `Tools > DryRun > Build And Run On Quest`.
- Never commit API keys, n8n credentials or `.env` files. n8n exports must have credentials removed.
- Only the laptop talks to n8n. The Quest must reach the laptop: the same network with device-to-device traffic allowed (a phone hotspot works; venue Wi-Fi often blocks it), or USB (`npm run quest`).
- The user usually has `next dev` running on :3000. Don't delete `web/.next` while it runs. `web/.room.json` is their live room (panel, phase): copy it before tests that change the room, and put it back after.
- n8n Code nodes have no `URL` class, and backslashes in JS written inside `build.py` strings get eaten by Python; prefer `[^]` and string splits to escapes.
