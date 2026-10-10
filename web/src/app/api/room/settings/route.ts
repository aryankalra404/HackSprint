import { updateRoom } from "@/lib/room";

// Room settings from the web (contract: PUT /api/room/settings); the headset sees them on its next poll
export async function PUT(request: Request) {
  const body = (await request.json()) as { name_cards?: unknown };
  if (typeof body.name_cards !== "boolean") return Response.json({ error: "name_cards must be true or false" }, { status: 400 });
  return Response.json(updateRoom({ name_cards: body.name_cards }));
}
