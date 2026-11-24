import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The service worker (D-037), as the Next.js PWA guide recommends: never cached, so an update reaches every browser,
  // and only our own scripts.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
