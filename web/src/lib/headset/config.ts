// The headset view (contract: Headset view). The relay runs in this app's server on its own port, so the
// video never shares a connection with the room's long poll. The headset finds it at the laptop address it
// already uses, on this port; over USB, `npm run quest` forwards it too.
export const STREAM_PORT = 3001;

// One laptop, one headset: everyone watches the same stream
export const STREAM_SESSION = "room";
