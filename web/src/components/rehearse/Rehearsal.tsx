"use client";

import type { Room } from "@/lib/contract";
import { useRoom } from "@/lib/useRoom";

export function Rehearsal({ room: initialRoom }: { room: Room; meetingId: string | null }) {
  const room = useRoom(initialRoom);
  return (
    <p className="px-8 py-24">
      {room.prospect?.company}: {room.phase}, rehearse in {room.rehearse_in}
    </p>
  );
}
