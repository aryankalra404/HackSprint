import { getMeeting } from "@/lib/api";
import { AfterError, sendAfterMeeting } from "@/lib/afterMeeting";
import { SAMPLE_ID } from "@/lib/mock/sample";

// How the real meeting went (contract 0.28: POST /after-meeting), from the meeting page: a voice note recorded in the browser (16 kHz
// mono WAV, base64) and/or typed notes. The laptop cuts the recording into pieces under 30 s and forwards them to n8n: one execution.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { meeting_id?: string; wav_base64?: string; notes?: string };
  if (!body.meeting_id) return Response.json({ error: "Say which meeting: { meeting_id }" }, { status: 400 });
  if (body.meeting_id === SAMPLE_ID) return Response.json({ error: "The sample meeting hasn't happened: it never reaches n8n" }, { status: 400 });
  try {
    const detail = await getMeeting(body.meeting_id);
    if (!detail) return Response.json({ error: "DryRun has no meeting with that id" }, { status: 404 });
    const attendees = detail.meeting.attendees.map((a) => a.email).filter((e) => e?.includes("@"));
    const after = await sendAfterMeeting({ meeting_id: body.meeting_id, wav_base64: body.wav_base64, notes: body.notes, attendees });
    return Response.json({ after });
  } catch (err) {
    if (err instanceof AfterError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: err instanceof Error ? err.message : "n8n didn't answer" }, { status: 502 });
  }
}
