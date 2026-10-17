<div align="center">

# DryRun

### Rehearse the meeting before it happens.

An n8n agent that prepares you for your most important meetings, then puts you in a room with the people you're about to meet: in VR or in the browser.

![n8n](https://img.shields.io/badge/n8n-the%20brain-EA4B71?logo=n8n&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-reasoning-4285F4?logo=googlegemini&logoColor=white)
![Sarvam AI](https://img.shields.io/badge/Sarvam%20AI-voices%20%26%20speech-FF6B00)
![Meta Quest](https://img.shields.io/badge/Meta%20Quest-VR%20boardroom-0467DF?logo=meta&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-web%20app-000000?logo=nextdotjs&logoColor=white)

**[▶ Watch the VR demo](https://www.youtube.com/watch?v=E9vuokGE2ao)** &nbsp;&nbsp;|&nbsp;&nbsp; **[📑 View the pitch deck](https://drive.google.com/file/d/1Et2ReRt8FW2MJp_U0RIgzbMFYAT_YETk/view?usp=sharing)**

**HackSprint at MAHE Bengaluru: Track T.02 AI & Automation, PS 22 "Built with n8n"**
Team **Git Push and Pray**

</div>

---

## The problem
The meetings that matter most (a pitch to a buyer, a funding round, a review with leadership) are the ones people prepare for least. The context is scattered across your inbox, your calendar, the news and the other side's website. Pulling it together takes hours, so it gets skipped. Rehearsing is rarer still, because nobody is there to play the CFO who asks the hard question.

## The solution
DryRun turns that whole process into an autonomous pipeline:

- **It notices.** A new calendar invite arrives, and n8n decides on its own whether the meeting deserves preparation, and logs why.
- **It researches.** It reads your past emails with the attendees, the company's news and website, and searches the web when coverage is thin.
- **It briefs you.** It emails you a brief built only on facts, each with its source.
- **It rehearses you.** You pitch your real deck to a panel modelled on the real attendees. They interrupt, push back on your claims and name your competitors.
- **It coaches you.** It scores the run with quoted evidence and drafts answers to the questions you couldn't handle. Then it makes the next rehearsal harder exactly where you were weak.
- **It remembers.** It keeps a "twin" of every person you meet and gets sharper after each real meeting.

## How it works

```
  ┌───────────────┐    ┌────────────────┐    ┌─────────────────┐    ┌────────────────┐
  │ Calendar      │───►│ n8n triage     │───►│ n8n research    │───►│ Brief email +  │
  │ invite        │    │ worth it? why? │    │ Gmail · News ·  │    │ practice panel │
  └───────────────┘    └────────────────┘    │ website · web   │    └───────┬────────┘
                                             └─────────────────┘            │
                                                                            ▼
  ┌───────────────┐    ┌────────────────┐    ┌─────────────────┐    ┌────────────────┐
  │ Next run      │◄───│ n8n debrief    │◄───│ Live rehearsal  │◄───│ n8n rehearsal  │
  │ presses on    │    │ scores, drafts │    │ VR or browser,  │    │ prep: slides,  │
  │ weak spots    │    │ owed answers   │    │ n8n every turn  │    │ panel, voices  │
  └───────────────┘    └────────────────┘    └─────────────────┘    └────────────────┘
                                                                            ▲
  ┌──────────────────────────────────────────────────────────────┐          │
  │ After the real meeting: voice note → n8n → twins update  ────┼──────────┘
  └──────────────────────────────────────────────────────────────┘
```

### 1. Pre-flight: prep that starts itself
A Google Calendar event triggers the workflow. Gemini triages the meeting: is it worth preparing, who is the company, what kind of meeting is it. Internal meetings are skipped, and the reason is kept. For the rest, n8n gathers your recent email threads with the attendees, Google News coverage and the company's website. It writes a brief that names only real attendees, cites every news item, and lists likely questions and risks. It seats the attendees as your practice panel, suggests a pitch length and emails you. The web app shows every step live as n8n works.

### 2. Rehearsal prep: a panel briefed on you
Upload your deck (PDF, PowerPoint or Keynote). n8n reads every slide and plans:
- the key points and target time for each slide
- each panellist's objections and manner, and who chairs
- where someone may interrupt, and how the chair keeps time
- a way back in for every slide, in case you freeze

Every line is voiced ahead of time with **Sarvam AI**, in natural Indian voices, so the room reacts instantly.

At the same time, an **n8n AI Agent** researches your market. It runs its own Google News searches through a tool workflow and decides when to search again. It names who else already does what you're pitching, and every finding must cite a headline the tool really returned. The panel then asks how you're different, naming those competitors.

### 3. Live: the boardroom
Put on the Meta Quest and you're standing in a boardroom. Your slides are on the TV, a speaker view is on the confidence monitor, and the panel watches you. Change slides with a pinch of your fingers, no controllers needed. Every time you speak, n8n runs a turn:

1. **Whisper** transcribes what you said.
2. **n8n** decides whether anyone reacts, who and why.
3. **Rules in n8n** keep the conversation human. Every question gets at most one follow-up, then it's answered, parked or dropped, never repeated. Only one question is in the air at a time.
4. **Sarvam** voices the reply in that person's voice.

If you freeze, the chair says *"Take your time"* and asks a question to get you going again. When you say *"that's all from me"*, the chair opens the floor. When questions run out, the meeting closes the way this kind of meeting would.

A big-screen dashboard streams the headset's view live and shows what n8n is thinking, turn by turn. No headset? The same panel, voices and rules run in the browser.

### 4. Post-flight: a debrief that acts
When the run ends, n8n:
- measures time, pace and filler words for every slide with fixed formulas, so the numbers are reproducible
- marks your transcript with exact quotes (hedges, unproven claims, what landed) and offers a better way to say each one
- scores clarity, evidence, objection handling and structure, each with evidence
- judges who around the table you convinced, and the moment that decided it
- drafts a sourced answer to every question you couldn't answer
- emails you the full report

Press **Run it again**. The panel re-asks what you owed them and presses harder on your weak spots.

### 5. Twins: memory that compounds
For every real person you meet, n8n builds a **twin**: what they care about, what they've raised and what you promised them. Every fact is quoted from a real source: your emails with them, their invites, and public pages that you confirm. A rule step drops anything the source doesn't support. Your next rehearsal seats them from their twin, and the brief shows "Since last time".

### 6. After the real meeting
Record a voice note on the meeting page. Sarvam transcribes it, including Indian English and Hinglish. n8n extracts what each attendee raised, what you promised and what was decided, and updates their twins. It shows how much of the real meeting your rehearsal predicted. It drafts the follow-up email and asks for your approval in Gmail before sending it to the attendees.

## n8n is the brain
Every decision in DryRun is made in n8n. The web app and the headset capture input, render the room and play audio. They never decide.

| Workflow | Role |
|---|---|
| **DryRun prep** | Calendar trigger → triage with reasons → multi-source research → brief → panel → data table → email, with live progress and an error branch |
| **DryRun rehearsal prep** | Plans slides, objections, the chair, interruptions and timekeeping, and pre-voices every line. Streams its progress to the web app |
| **DryRun turn** | The real-time loop: transcribe → decide → enforce conversation rules → voice. No Code nodes on this path, so each turn stays fast |
| **DryRun debrief** | Reproducible metrics, quoted judgement, drafted answers, report email, and weak spots carried into the next run |
| **DryRun deck research** | An **AI Agent** with a Google News tool (**DryRun news search**). Every finding is grounded in a headline the tool returned |
| **DryRun twin** · **twin update** | Builds and maintains a sourced profile of each person, with every fact quoted |
| **DryRun after the meeting** | Voice note → per-person facts → twins → prediction hit rate → follow-up with human-in-the-loop approval |
| **DryRun meetings API** | Serves meetings, rehearsals and twins from n8n data tables |

**n8n features in use:** A Google Calendar trigger and Gmail actions, an AI Agent with a sub-workflow tool, data tables as long-term memory, streaming webhook responses, Gmail send-and-wait approval, error branches, and model fallbacks. Every Gemini step falls back to Groq, so a quota limit never stops a run.

## Tech stack
| Layer | Technology |
|---|---|
| Orchestration | **n8n Cloud** |
| Reasoning | **Google Gemini**, with **Groq** (`gpt-oss-120b`) as a fallback |
| Speech | **Sarvam AI** (`bulbul` voices, `saaras` transcription), **Groq Whisper** |
| Data sources | Google Calendar, Gmail, Google News, company websites |
| Web app | **Next.js**, Tailwind. Meetings, brief, practice panel, browser rehearsal, live dashboard and report. It's also the hub the headset connects to. |
| VR | **Unity 6** (URP, Meta XR SDK) on **Meta Quest 3S**. Hand tracking, live headset streaming to the dashboard, discovery over Wi-Fi |

## Run it
```bash
cd web
npm install
npm run dev          # http://localhost:3000
```
- **Sample data:** the app runs on sample data out of the box. Open `/s/demo/report` for a full debrief report and `/s/demo` for the dashboard.
- **Live mode:** set `DRYRUN_N8N_URL` (your n8n webhook base) and `DRYRUN_OWNER_EMAIL` in `web/.env.local`.
- **Workflows:** import the exports from [`n8n/`](n8n/) into any n8n instance. Credentials are removed.
- **Deck conversion:** needs Ghostscript and ImageMagick, plus LibreOffice for PowerPoint and Keynote.
- **Headset:** the Quest finds the laptop over Wi-Fi by itself. With a USB cable, run `npm run quest`.

## Repository
| Path | Contents |
|---|---|
| [`n8n/`](n8n/) | Workflow exports, and the Python build system that generates them |
| [`web/`](web/) | The Next.js web app and the hub for the headset |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Every component and workflow, step by step |
| [`docs/CONTRACT.md`](docs/CONTRACT.md) | The shared JSON contract between n8n, the web app and the headset |

---

<div align="center">

**Git Push and Pray**

*Rehearse the meeting before it happens.*

</div>