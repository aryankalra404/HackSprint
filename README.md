# DryRun

**Rehearse your next high-stakes pitch in front of the people who will actually question it.**

DryRun puts you in a VR boardroom (or a browser) with an AI buying committee: a CFO, a CTO, Procurement, a VP of Operations and an End User Lead. Before the session, an n8n agent reads your deck, researches the company you're pitching to, and gives each stakeholder priorities and objections grounded in that research. During the pitch they interrupt with pointed questions. If you freeze, a Rescue Agent feeds you a cue. Afterwards n8n scores the session, cites the evidence for every score, sends you the report, schedules a targeted drill, and makes the next rehearsal press harder on whatever you fumbled.

Built for HackSprint 2026 (MAHE Bengaluru), Track: AI & Automation, PS 22 (Built with n8n).

## How it works
1. **Prep (n8n).** Deck + prospect + meeting context → slide notes, stakeholder personas, likely objections and pre-generated rescue cues.
2. **Rehearse (VR on Meta Quest, or web).** Present to the AI committee. Stakeholders raise hands and ask questions in voice. Rescue cues appear on the confidence monitor when you go silent.
3. **Debrief (n8n).** Scores with timestamped evidence, follow-up actions, and a drill that feeds the next session.

## Stack
n8n · Gemini · Google Cloud TTS · Unity 6.3 (URP, Meta XR SDK) for Meta Quest 3S · web client

## Status
In development. See [docs/PLAN.md](docs/PLAN.md).

## Team
Git Push and Pray
