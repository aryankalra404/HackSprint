// Runs once when the server starts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDiscovery } = await import("./lib/discovery");
    startDiscovery();
    const { startHeadsetRelay } = await import("./lib/headset/relay");
    startHeadsetRelay();
  }
}
