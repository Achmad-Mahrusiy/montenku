import { describe, expect, it } from "vitest";
import { placeOnCalendar, scheduleSlots } from "@/lib/calendar";

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

describe("slot jadwal berulang di kalender", () => {
  const schedule = {
    id: "s1",
    title: "Upload resep",
    rrule: "FREQ=WEEKLY;BYDAY=TU,FR",
    dtstartLocal: "2026-11-03T19:00",
    account: { ...jakarta, archivedAt: null },
    exceptions: [
      { occurrenceKey: "2026-12-01T19:00", kind: "skip" as const, movedToLocal: null },
      { occurrenceKey: "2026-12-04T19:00", kind: "move" as const, movedToLocal: "2026-12-05T10:00" },
    ],
  };
  const window = [new Date("2026-11-23T00:00:00Z"), new Date("2026-12-07T00:00:00Z")] as const;

  it("slot kosong tampil, yang terisi dan dilewati tidak, yang digeser di jam barunya", () => {
    const filled = [{ scheduleId: "s1", occurrenceKey: "2026-11-24T19:00" }];
    const days = placeOnCalendar(scheduleSlots([schedule], filled, ...window));
    expect([...days.keys()].sort()).toEqual(["2026-11-27", "2026-12-05"]);
    expect(days.get("2026-11-27")?.[0]).toMatchObject({ title: "Slot kosong", slotOf: "Upload resep", href: "/jadwal?ubah=s1", time: "19:00" });
    expect(days.get("2026-12-05")?.[0]).toMatchObject({ time: "10:00", slotOf: "Upload resep" });
  });

  it("item biasa tetap menuju halaman kontennya", () => {
    expect(placeOnCalendar([item("x", "2026-11-23T12:00:00Z")]).get("2026-11-23")?.[0]).toMatchObject({ href: "/konten/x", slotOf: null });
  });

  it("akun yang diarsipkan tidak menghasilkan slot baru", () => {
    const archived = { ...schedule, account: { ...schedule.account, archivedAt: new Date() } };
    expect(scheduleSlots([archived], [], ...window)).toEqual([]);
  });
});
