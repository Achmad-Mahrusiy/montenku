import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });

describe("proxy", () => {
  it("mengarahkan pengunjung tanpa cookie sesi ke /masuk", () => {
    const response = proxy(request("/kalender"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/masuk");
  });

  it("menampilkan beranda di / untuk pengunjung tanpa cookie sesi, tanpa mengganti alamat (D-043)", () => {
    const response = proxy(request("/"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/beranda");
  });

  it("membiarkan halaman masuk, daftar, dan beranda terbuka", () => {
    for (const path of ["/masuk", "/daftar", "/beranda"]) {
      expect(proxy(request(path)).headers.get("location")).toBeNull();
    }
  });

  it("meneruskan pengunjung yang punya cookie sesi", () => {
    const response = proxy(request("/", "better-auth.session_token=abc"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("tidak menghalangi berkas PWA tanpa sesi: service worker, manifest, dan ikon (D-037)", () => {
    for (const path of ["/sw.js", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"]) {
      expect(unstable_doesMiddlewareMatch({ config, url: path }), path).toBe(false);
    }
    // Pages are still guarded.
    expect(unstable_doesMiddlewareMatch({ config, url: "/pengaturan" })).toBe(true);
  });
});
