import { getRoom, trackHeadset, waitForChange } from "@/lib/room";

const LONG_POLL_MS = 25_000;

// The headset keeps this open: it answers as soon as the room changes past `since` (contract: Room API).
// `client=headset&via=wifi|usb` marks the headset as connected, and how, for the Brief screen.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const since = params.get("since");
  const read = async () => (since == null ? getRoom() : waitForChange(Number(since), LONG_POLL_MS, request.signal));
  const via = params.get("via") === "wifi" ? "wifi" : "usb";
  const room = params.get("client") === "headset" ? await trackHeadset(via, read) : await read();
  return Response.json(room, { headers: { "Cache-Control": "no-store" } });
}
