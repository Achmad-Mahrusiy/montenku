import { describe, expect, it } from "vitest";
import { describeClash, findClashes, placeOnCalendar, scheduleSlots } from "@/lib/calendar";

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

describe("deteksi bentrok (D-033)", () => {
  // Fri 27 Nov 2026 19:00 WIB = 12:00Z.
  const AT = "2026-11-27T12:00:00Z";
  const ids = (items: Parameters<typeof findClashes>[0]) => findClashes(items).map((c) => c.entries.map((e) => e.id).sort());

  it("dua item satu akun di menit yang sama bentrok, termasuk beda detik", () => {
    expect(ids([item("sop", AT), item("teh", "2026-11-27T12:00:42Z"), item("lain", "2026-11-27T12:01:00Z")])).toEqual([["sop", "teh"]]);
  });

  it("menit yang sama di akun berbeda tidak bentrok", () => {
    expect(findClashes([item("a", AT), item("b", AT, tokyo)])).toEqual([]);
  });

  it("slot kosong ikut dihitung: item vs slot, dan dua jadwal di jam yang sama", () => {
    const fridays = (id: string) => ({
      id,
      title: `Jadwal ${id}`,
      rrule: "FREQ=WEEKLY;BYDAY=FR",
      dtstartLocal: "2026-11-06T19:00",
      account: { ...jakarta, archivedAt: null },
      exceptions: [],
    });
    const window = [new Date("2026-11-27T00:00:00Z"), new Date("2026-11-28T00:00:00Z")] as const;
    expect(ids([item("sop", AT), ...scheduleSlots([fridays("s1")], [], ...window)])).toEqual([["s1:2026-11-27T19:00", "sop"]]);
    expect(ids(scheduleSlots([fridays("s1"), fridays("s2")], [], ...window))).toEqual([["s1:2026-11-27T19:00", "s2:2026-11-27T19:00"]]);
  });

  it("slot yang sudah diisi tidak bentrok dengan item pengisinya; slot yang dilewati tidak dihitung", () => {
    const schedule = {
      id: "s1",
      title: "Upload",
      rrule: "FREQ=WEEKLY;BYDAY=FR",
      dtstartLocal: "2026-11-06T19:00",
      account: { ...jakarta, archivedAt: null },
      exceptions: [] as { occurrenceKey: string; kind: "skip" | "move"; movedToLocal: string | null }[],
    };
    const window = [new Date("2026-11-27T00:00:00Z"), new Date("2026-11-28T00:00:00Z")] as const;
    const filled = [{ scheduleId: "s1", occurrenceKey: "2026-11-27T19:00" }];
    expect(findClashes([item("isi", AT), ...scheduleSlots([schedule], filled, ...window)])).toEqual([]);
    const skipped = { ...schedule, exceptions: [{ occurrenceKey: "2026-11-27T19:00", kind: "skip" as const, movedToLocal: null }] };
    expect(findClashes([item("sop", AT), ...scheduleSlots([skipped], [], ...window)])).toEqual([]);
  });

  it("kemunculan yang digeser ke jam sebuah item jadi bentrok", () => {
    const moved = {
      id: "s1",
      title: "Upload",
      rrule: "FREQ=WEEKLY;BYDAY=TH",
      dtstartLocal: "2026-11-05T19:00",
      account: { ...jakarta, archivedAt: null },
      exceptions: [{ occurrenceKey: "2026-11-26T19:00", kind: "move" as const, movedToLocal: "2026-11-27T19:00" }],
    };
    const window = [new Date("2026-11-25T00:00:00Z"), new Date("2026-11-28T00:00:00Z")] as const;
    expect(ids([item("sop", AT), ...scheduleSlots([moved], [], ...window)])).toEqual([["s1:2026-11-26T19:00", "sop"]]);
  });

  it("kalender menandai entri yang bentrok, dan pesannya memakai jam zona akun", () => {
    const days = placeOnCalendar([item("sop", AT), item("teh", AT), item("pagi", "2026-11-27T00:00:00Z")]);
    expect(days.get("2026-11-27")?.map((e) => [e.title, e.clash])).toEqual([
      ["pagi", false],
      ["sop", true],
      ["teh", true],
    ]);
    expect(describeClash(findClashes([item("sop", AT), item("teh", AT)])[0]!)).toBe("Masak Hemat punya 2 posting di Jumat, 27 Nov, 19:00 WIB");
  });
});
