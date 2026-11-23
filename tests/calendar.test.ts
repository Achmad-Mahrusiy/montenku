import { describe, expect, it } from "vitest";
import { placeOnCalendar } from "@/lib/calendar";

const jakarta = { id: "a", name: "Masak Hemat", color: "#e4572e", timezone: "Asia/Jakarta" };
const tokyo = { id: "b", name: "Kota Tokyo", color: "#2f6fdb", timezone: "Asia/Tokyo" };
const item = (id: string, iso: string, account = jakarta) => ({ id, title: id, targetAt: new Date(iso), account });

describe("placeOnCalendar", () => {
  it("menaruh item di tanggal zona akunnya, bukan tanggal UTC", () => {
    // 30 Nov 20:00 UTC = 1 Des 03:00 WIB.
    const days = placeOnCalendar([item("subuh", "2026-11-30T20:00:00Z")]);
    expect([...days.keys()]).toEqual(["2026-12-01"]);
    expect(days.get("2026-12-01")?.[0]).toMatchObject({ time: "03:00", hour: 3, zoneLabel: null });
  });

  it("jam dinding tiap akun: 19:00 Tokyo tampil 19:00 dengan label zona", () => {
    const days = placeOnCalendar([item("tokyo", "2026-11-25T10:00:00Z", tokyo)]);
    expect(days.get("2026-11-25")?.[0]).toMatchObject({ time: "19:00", zoneLabel: "GMT+9", accountName: "Kota Tokyo" });
  });

  it("dalam satu hari diurutkan menurut jam yang tampil", () => {
    const days = placeOnCalendar([
      item("malam", "2026-11-23T13:00:00Z"), // 20:00 WIB
      item("pagi", "2026-11-23T00:00:00Z"), // 07:00 WIB
      item("siang", "2026-11-23T05:00:00Z"), // 12:00 WIB
    ]);
    expect(days.get("2026-11-23")?.map((e) => e.title)).toEqual(["pagi", "siang", "malam"]);
  });
});
