import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/markdown";

const render = (text: string) => renderToStaticMarkup(<Markdown>{text}</Markdown>);

describe("Markdown catatan", () => {
  it("menampilkan judul dan daftar bernomor seperti contoh di Figma", () => {
    const html = render("## Hook 3 detik pertama\n\n1. Tunjukkan nasi goreng jadi dulu\n2. Teks layar");
    expect(html).toContain("<h2>Hook 3 detik pertama</h2>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>Tunjukkan nasi goreng jadi dulu</li>");
  });

  // A note is user input shown back in the page; it must never run code.
  it("membuang HTML mentah, termasuk <script> dan atribut onerror", () => {
    const html = render('Halo <script>alert(1)</script> <img src="x" onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img");
  });

  it("mengosongkan tautan javascript: dan membuka tautan biasa di tab baru dengan aman", () => {
    expect(render("[klik](javascript:alert(1))")).not.toContain("javascript:");
    const html = render("[resep](https://contoh.com/resep)");
    expect(html).toContain('href="https://contoh.com/resep"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
});
