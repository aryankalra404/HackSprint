# DryRun — project guide for Claude

HackSprint (MAHE Bengaluru, 17–18 Oct 2026), team **Git Push and Pray**, Track T.02 AI & Automation, **PS 22: "Built with n8n."**
DryRun is an AI rehearsal agent for high-stakes pitches. You present to a VR boardroom of AI stakeholders (CFO, CTO, Procurement, VP Ops, End User Lead) who have researched your prospect. They interrupt with grounded questions, a Rescue Agent catches you when you freeze, and an n8n debrief scores you, acts on the result, and makes the next rehearsal harder where you were weak.

## Where things live
| Part | Location | Notes |
|---|---|---|
| Docs, n8n workflows, web client | this repo (`~/Desktop/HackSprint`) | GitHub: aryankalra404/HackSprint |
| VR client (Unity 6.3, Quest 3S) | `~/My project` (**not in this repo, not under version control yet**) | Its own `CLAUDE.md` is the source of truth for scene, lighting, build steps and Unity gotchas. Read it before any Unity work. |
| n8n workflow exports | `n8n/*.json` | Export from n8n after every meaningful change. Strip credentials. |
| Web client | `web/` | Next.js 16 (App Router, Cache Components, Tailwind 4). Must speak the same contract as VR. See `web/README.md`. |

## Docs (keep these current)
- `docs/PLAN.md`: the week plan, status checkboxes, decisions log and risks. **Update it whenever a task finishes or a decision is made.**
- `docs/ARCHITECTURE.md`: components, the three n8n workflows, and what runs where.
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
- Two screens: the dashboard (`/s/[id]`, one screen, no scrolling, for the big display during the VR session) and the report (`/s/[id]/report`, the detailed read afterwards). Keep the dashboard sparse; detail belongs in the report or the persona drawer.
- With `DRYRUN_N8N_URL` unset, the app serves sample data from `web/src/lib/mock/`, so screens can be built before the workflows exist.
- Visual style: briefing-file look (paper, ink). One typeface, Archivo; its wide cut (`font-display`) is for names, headings and big numbers. Sentence-case labels, no all-caps, no `·`-joined strings. Tokens in `web/src/app/globals.css`. Each stakeholder has a fixed colour in `web/src/lib/personas.ts`, always paired with a role label (colour alone can't tell five apart). Status colours (good, warn, bad) always come with an icon and a label.

## Git
- Commit messages are one line, written like a person would write them (e.g. "add debrief screen with sample data").
- No "Co-Authored-By: Claude" or any other AI attribution in commits or PRs.
- Commit often, without asking each time: after each working step (a screen, a workflow, a fix), once it builds. Keep each commit to one change.
- Never commit `docs/` (kept local). Stage files by path, not with `git add -A`.

## Gotchas
- Disk is nearly full (about 4.5 GB free on 10 Oct). Unity builds fail and crash when it's low, so check `df -h ~` before builds or big imports.
- Don't trigger Quest builds through MCP Unity (it crashed Unity once). Ask the user to run `Tools > DryRun > Build And Run On Quest`.
- Never commit API keys, n8n credentials or `.env` files. n8n exports must have credentials removed.
- The Quest must reach n8n's webhook URL over the venue network. Use n8n Cloud or a stable tunnel, and test on a phone hotspot as a fallback.
