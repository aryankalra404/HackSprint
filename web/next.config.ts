import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The headset view's relay (src/lib/headset/relay.ts) runs in Node; ws loads optional native helpers
  serverExternalPackages: ["ws"],
  partialPrefetching: true,
  // Every open page and the headset long-poll the room, so each change answered them all in the terminal; slides and voices too
  logging: {
    incomingRequests: { ignore: [/\/api\/room(\?|$)/, /\/api\/deck\//, /\/api\/audio\//] },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
