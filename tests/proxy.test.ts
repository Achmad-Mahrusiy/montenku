import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });

describe("proxy", () => {
  it("mengarahkan pengunjung tanpa cookie sesi ke /masuk", () => {
    const response = proxy(request("/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/masuk");
  });

  it("membiarkan halaman masuk dan daftar terbuka", () => {
    for (const path of ["/masuk", "/daftar"]) {
      expect(proxy(request(path)).headers.get("location")).toBeNull();
    }
  });

  it("meneruskan pengunjung yang punya cookie sesi", () => {
    expect(proxy(request("/", "better-auth.session_token=abc")).headers.get("location")).toBeNull();
  });
});
