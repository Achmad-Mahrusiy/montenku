import type { MetadataRoute } from "next";

// Web app manifest (D-037), served at /manifest.webmanifest. Lets phones install Montenku to the home screen, which
// iPhone needs before it allows push notifications (iOS 16.4+).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Montenku",
    short_name: "Montenku",
    description: "Monitor kontenku: jadwal dan pengingat untuk banyak akun konten.",
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f1ea",
    theme_color: "#f5f1ea",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
