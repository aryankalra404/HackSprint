import dgram from "node:dgram";

// Lets the headset find this laptop over Wi-Fi (docs/CONTRACT.md, Finding the laptop):
// it broadcasts "DRYRUN?" to UDP 47777 and we answer the sender with "DRYRUN <port>".
const DISCOVERY_PORT = 47777;

export function startDiscovery() {
  const g = globalThis as { __dryrunDiscovery?: boolean };
  if (g.__dryrunDiscovery) return;
  g.__dryrunDiscovery = true;

  const port = Number(process.env.PORT) || 3000;
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  socket.on("message", (msg, from) => {
    if (msg.toString().trim() === "DRYRUN?") socket.send(`DRYRUN ${port}`, from.port, from.address);
  });
  socket.on("error", (err) => {
    console.warn(`[discovery] headset Wi-Fi discovery is off: ${err.message}`);
    socket.close();
  });
  socket.bind(DISCOVERY_PORT, () => console.log(`[discovery] answering the headset on UDP ${DISCOVERY_PORT} (web app port ${port})`));
}
