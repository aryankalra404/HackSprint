import type { Twin, TwinFact, TwinSource } from "../contract";
import { SAMPLE_ID, sampleMeeting } from "./sample";

// The sample twin: Rajiv Menon of the sample meeting (Kaveri Freight is made up). Its sources, facts and build are written here, so the
// twin page, its live build and Replay can be shown without n8n or a model. Labelled as a sample wherever it shows; never sent to n8n.
export const SAMPLE_TWIN_EMAIL = "rajiv.menon@kaverifreight.in";

const SOURCES: TwinSource[] = [
  { id: "s1", type: "email", title: "Intro: RouteIQ x Kaveri", date: "2026-09-18", from: "Rajiv Menon <rajiv.menon@kaverifreight.in>", status: "connected", why: "From their address", key: "sample:1" },
  { id: "s2", type: "email", title: "Re: Intro: RouteIQ x Kaveri", date: "2026-09-19", from: "you", status: "connected", why: "You wrote to their address", key: "sample:2" },
  { id: "s3", type: "email", title: "Numbers before the call", date: "2026-09-26", from: "Rajiv Menon <rajiv.menon@kaverifreight.in>", status: "connected", why: "From their address", key: "sample:3" },
  { id: "s4", type: "email", title: "Pilot proposal", date: "2026-10-03", from: "Rajiv Menon <rajiv.menon@kaverifreight.in>", status: "connected", why: "From their address", key: "sample:4" },
  { id: "s5", type: "email", title: "Re: Pilot proposal", date: "2026-10-04", from: "you", status: "connected", why: "You wrote to their address", key: "sample:5" },
  { id: "s6", type: "email", title: "Kaveri: who to loop in", date: "2026-09-17", from: "Priya Nair <priya.nair@kaverifreight.in>", status: "suggested", why: "Priya Nair mentions a Rajiv Menon", key: "sample:6" },
  { id: "s7", type: "web", title: "kaverifreight.in/team", date: "2026-10-12", url: "https://kaverifreight.in/team", status: "suggested", why: "kaverifreight.in/team lists a Rajiv Menon", key: "sample:7" },
  { id: "s8", type: "news", title: "Freight Weekly: Rajiv Menon joins Deccan Cargo as CFO", date: "2025-06-02", status: "suggested", why: "A news story names a Rajiv Menon", key: "sample:8" },
  { id: "s9", type: "manual", title: "Your note", date: "2026-09-22", status: "connected", why: "You added this", key: "sample:9", text: "Prefers the numbers on one page, no appendix" },
];

const fact = (id: string, kind: TwinFact["kind"], text: string, source_id: string, quote: string, status: TwinFact["status"] = "connected"): TwinFact => ({
  id,
  kind,
  text,
  source_id,
  quote,
  status,
  added: "2026-10-12T09:00:00.000Z",
});

const FACTS: TwinFact[] = [
  fact("f1", "role", "CFO at Kaveri Freight", "s1", "Rajiv Menon, Chief Financial Officer, Kaveri Freight"),
  fact("f2", "context", "Signs off any spend over 50 lakh", "s1", "anything over 50 lakh comes to me for sign-off"),
  fact("f3", "raised", "Asked what fuel price the payback assumes", "s3", "what diesel price is your 7-month payback based on"),
  fact("f4", "raised", "Wants the saving shown per truck, not per fleet", "s3", "show me the saving per truck per month, not for the whole fleet"),
  fact("f5", "preference", "Wants numbers before any call", "s3", "send me the numbers before the call so I can read them first"),
  fact("f6", "raised", "Asked for a pilot proposal on one lane", "s4", "could you send a pilot proposal for the Delhi to Mumbai lane"),
  fact("f7", "decision", "Budget for a pilot is approved by the CEO", "s4", "Vikram has approved a budget for a small pilot this quarter"),
  fact("f8", "raised", "Asked who pays for integration with the TMS", "s4", "who carries the cost of the TMS integration, you or us"),
  fact("f9", "promised", "Case study from a similar fleet by 18 Oct", "s5", "I will send you the case study from a 300-truck fleet by 18 Oct"),
  fact("f10", "promised", "Integration cost in the pilot proposal", "s5", "the pilot proposal will spell out the integration cost line by line"),
  fact("f11", "preference", "Prefers the numbers on one page", "s9", "Prefers the numbers on one page, no appendix"),
  fact("f12", "context", "Finance owns vendor decisions above the pilot", "s6", "Rajiv runs finance and owns every vendor decision above pilot size", "suggested"),
  fact("f13", "role", "Listed as Chief Financial Officer", "s7", "Rajiv Menon Chief Financial Officer", "suggested"),
  fact("f14", "role", "CFO at Deccan Cargo in 2025", "s8", "Rajiv Menon joins Deccan Cargo as CFO", "suggested"),
];

// The build as n8n streams it: what each step added, and when (ms from the start)
const LOG: Twin["build_log"] = [
  { step: "load", text: "Started a twin of rajiv.menon@kaverifreight.in (Rajiv Menon)", t: 0, adds: { sources: [], facts: [], readings: [], meetings: [] } },
  { step: "emails", text: "Found 5 emails with rajiv.menon@kaverifreight.in", t: 1900, adds: { sources: ["s1", "s2", "s3", "s4", "s5", "s9"], facts: [], readings: [], meetings: [] } },
  { step: "meetings", text: "Invited to 2 of your meetings: Intro call (2026-09-22), RouteIQ pitch (sample)", t: 3100, adds: { sources: [], facts: [], readings: [], meetings: ["intro", SAMPLE_ID] } },
  { step: "mentions", text: "3 possible mentions by name: Priya Nair mentions a Rajiv Menon; kaverifreight.in/team lists a Rajiv Menon. Same person?", t: 5200, adds: { sources: ["s6", "s7", "s8"], facts: [], readings: [], meetings: [] } },
  {
    step: "extract",
    text: "Pulled 14 new facts, each with its quote; 3 sources to check; 2 readings with evidence",
    t: 9300,
    adds: { sources: [], facts: FACTS.map((f) => f.id), readings: ["r1", "r2"], meetings: [] },
  },
];

export function sampleTwin(): Twin {
  return {
    email: SAMPLE_TWIN_EMAIL,
    aliases: [],
    name: "Rajiv Menon",
    company: "Kaveri Freight",
    role: { text: "CFO", source_id: "s1" },
    sources: SOURCES.map((s) => ({ ...s })),
    facts: FACTS.map((f) => ({ ...f })),
    readings: [
      { id: "r1", text: "Pushes on cost and payback", evidence: ["f3", "f4", "f8"] },
      { id: "r2", text: "Reads the numbers before he meets", evidence: ["f5", "f11"] },
    ],
    meetings: [
      { id: "intro", title: "Intro call", date: "2026-09-22" },
      { id: SAMPLE_ID, title: sampleMeeting.title, date: sampleMeeting.start.slice(0, 10) },
    ],
    predictions: [],
    build_log: LOG,
    updated: "2026-10-12T09:00:00.000Z",
    sample: true,
  };
}
