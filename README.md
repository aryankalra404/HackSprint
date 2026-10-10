# DryRun

**Meet your buyers before you meet your buyers.**

DryRun prepares you for high-stakes meetings and lets you rehearse them. An n8n agent watches your calendar, decides which meetings matter, researches the company from your emails and the news, and sends you a brief that sticks to sourced facts. Then you rehearse the pitch in a VR boardroom (Meta Quest), in front of a panel built from the real attendees plus the roles that usually sign off on a deal like this.

Built for HackSprint 2026 (MAHE Bengaluru), Track: AI & Automation, PS 22 (Built with n8n).

## What works today
- **n8n prepares your meetings by itself.** A new Google Calendar event (or one added on the web) starts the workflow:
  1. Gemini decides whether the meeting is worth preparing for, and says why.
  2. It reads your recent emails with the attendees, the company's news (Google News) and its website. If the news is thin, it also searches the web (this needs a paid Gemini key).
  3. It writes the brief: real attendees only, likely questions, risks, and dated news with sources.
  4. It proposes a practice panel.
  5. It saves everything to an n8n data table and emails you the brief.

  The web app shows each step live as n8n works, with a link to the run.
- **The web app** lists your upcoming meetings and asks "prepare for this meeting?". It shows the brief, and you can edit the practice panel: up to 6 people, any chair, any face.
- **The VR boardroom** seats that panel live as you edit it. The headset finds the laptop over Wi-Fi, with USB as the fallback. When you start speaking, the session starts and the panel turns to look at you. The dashboard shows the headset's view on the big screen. (Tested in the Unity editor; testing on the Quest this week.)

## Being built
Stakeholders interrupting with grounded questions (in voice), the Rescue Agent that feeds you cues when you freeze, and an n8n debrief that scores the session with evidence and makes the next rehearsal harder where you were weak.

## Stack
- n8n Cloud and Gemini
- Gmail and Google Calendar
- Next.js web app
- Unity 6.3 (URP, Meta XR SDK) on Meta Quest 3S

## Repo
- `n8n/`: the workflows, and the code that builds them
- `web/`: the web app, which is also the hub the headset talks to

## Team
Git Push and Pray
