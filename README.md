# DryRun

**Meet your buyers before you meet your buyers.**

DryRun prepares you for high-stakes meetings and lets you rehearse them. An n8n agent watches your calendar, decides which meetings matter, researches the company from your emails and the news, and sends you a brief that sticks to sourced facts. Then you rehearse the pitch in a VR boardroom (Meta Quest), in front of a panel built from the real attendees plus the roles that usually sign off on a deal like this.

Built for HackSprint 2026 (MAHE Bengaluru), Track: AI & Automation, PS 22 (Built with n8n).

## What works today
- **n8n prepares your meetings by itself.** A new Google Calendar event (or one added on the web) starts the workflow:
  1. Gemini decides whether the meeting is worth preparing for, and says why.
  2. It reads your recent emails with the attendees, the company's news (Google News) and its website. If the news is thin, it also searches the web (this needs a paid Gemini key).
  3. It writes the brief: real attendees only, likely questions, risks, and dated news with sources.
  4. It seats the real people from the invite as your practice panel, and suggests practice roles (a CFO, procurement) you can add with one tap.
  5. It saves everything to an n8n data table and emails you the brief.

  The web app shows each step live as n8n works, with a link to the run.
- **The web app** lists your upcoming meetings and asks "prepare for this meeting?". It shows the brief, and you can edit the practice panel: up to 6 people, any chair, any face. Upload your deck (PDF, PowerPoint or Keynote) and it goes on the boardroom TV.
- **The VR boardroom** seats that panel live as you edit it. The headset finds the laptop over Wi-Fi, with USB as the fallback. Your slides are on the TV behind you, with a speaker view on the monitor you face; a quick pinch (right hand next, left hand back) or the controller's triggers change slides, no controllers needed. When you start speaking, the session starts and the panel turns to look at you; when you finish on your last slide, it wraps up by itself. The dashboard shows the headset's view on the big screen. (Tested in the Unity editor; testing on the Quest this week.)

- **n8n debriefs every rehearsal.** When a session ends, n8n reads what you said slide by slide, marks it (hedges, claims with no proof, what landed) with a better way to say each, scores you with quotes as evidence, judges who on the panel would back you, emails you the report and briefs the next rehearsal to press on your weak spots. The meeting shows every rehearsal and its report. (Tested end to end through the web app.)

## Being built
In the headset: the panel interrupting with grounded questions in voice (built and tested in the Unity editor, not yet on the Quest), and the Rescue Agent that feeds you cues when you freeze.

Rehearse in the browser: the same panel at the same table, your slides, raised hands, questions, rescue cues and the chair's closing, then the same debrief, for anyone without a headset. Built and tested end to end against stand-in turns; not yet with n8n's real turns.

## Stack
- n8n Cloud, with Gemini (and Groq as the fallback)
- Gmail and Google Calendar
- Next.js web app
- Unity 6.3 (URP, Meta XR SDK) on Meta Quest 3S

## Repo
- `n8n/`: the workflows, and the code that builds them
- `web/`: the web app, which is also the hub the headset talks to

## Team
Git Push and Pray
