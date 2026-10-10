import type { Meeting, MeetingDetail } from "../contract";
import { demoProposal } from "./panel";

// What n8n's meetings API returns for the sample, for running without n8n
const inTwoDays = new Date(Date.now() + 2 * 86400000);
inTwoDays.setHours(15, 0, 0, 0);

export const demoMeeting: Meeting = {
  id: "demo-meeting",
  title: "RouteIQ pitch",
  start: inTwoDays.toISOString(),
  company: "Kaveri Freight",
  why: "Priya Nair (VP Operations) and Rajiv Menon (CFO) from Kaveri Freight are evaluating RouteIQ, with payback the deciding question.",
  status: "ready",
  attendees: [
    { name: "Priya Nair", email: "priya.nair@kaverifreight.in" },
    { name: "Rajiv Menon", email: "rajiv.menon@kaverifreight.in" },
  ],
};

// One meeting n8n decided not to prepare, so the sample shows the "Skipped by n8n" list
const tomorrow = new Date(Date.now() + 86400000);
tomorrow.setHours(10, 0, 0, 0);
export const demoSkippedMeeting: Meeting = {
  id: "demo-skipped",
  title: "Weekly product sync",
  start: tomorrow.toISOString(),
  company: "Weekly product sync",
  why: "Internal weekly sync with your own team, nothing to persuade anyone of.",
  status: "skipped",
  attendees: [{ name: "Ritika", email: "ritika@example.com" }],
};

export const demoMeetingDetail: MeetingDetail = {
  meeting: demoMeeting,
  brief: {
    summary: "A sales pitch of RouteIQ to Kaveri Freight's operations and finance leads. It will be decided on whether RouteIQ cuts empty return legs and pays back inside a year at their fleet size.",
    company: {
      what_they_do: "Kaveri Freight runs a 400-truck line-haul fleet across South India for e-commerce and FMCG shippers.",
      recent_news: [{ text: "Sample data: no live research without n8n.", date: "" }],
    },
    attendees: [
      { name: "Priya Nair", email: "priya.nair@kaverifreight.in", role: "VP Operations", likely_focus: "How RouteIQ fills empty return legs, and how it fits their dispatch system." },
      { name: "Rajiv Menon", email: "rajiv.menon@kaverifreight.in", role: "CFO", likely_focus: "Payback period at their fleet size." },
    ],
    questions: [
      { question: "What is the payback period at our fleet size?", asked_by: "Rajiv Menon", why: "The ROI slide has no number.", suggested_answer: "Bring the payback model: at 400 trucks, about 7 months." },
      { question: "How does it work with our in-house dispatch system?", asked_by: "Priya Nair", why: "She raised it in her email.", suggested_answer: "Name the integration path and the time it takes." },
    ],
    risks: ["No payback number", "Integration effort sounds open-ended"],
    sources: [],
  },
  proposal: demoProposal,
};
