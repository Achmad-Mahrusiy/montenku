import { describe, expect, it } from "vitest";
import { isOccurrence, occurrencesBetween, type ExceptionIn, type ScheduleRule } from "@/lib/occurrences";

const tueFri = (timezone = "Asia/Jakarta", rrule = "FREQ=WEEKLY;BYDAY=TU,FR"): ScheduleRule => ({
  rrule,
  dtstartLocal: "2026-11-03T19:00",
  timezone,
});
const range = (from: string, to: string) => [new Date(from), new Date(to)] as const;
const keys = (list: { key: string }[]) => list.map((o) => o.key);

describe("kemunculan jadwal berulang", () => {
  it("Selasa & Jumat 19:00 WIB di akhir November 2026", () => {
    const list = occurrencesBetween(tueFri(), [], ...range("2026-11-23T00:00:00Z", "2026-12-01T00:00:00Z"));
    expect(keys(list)).toEqual(["2026-11-24T19:00", "2026-11-27T19:00"]);
    expect(list[0]?.at.toISOString()).toBe("2026-11-24T12:00:00.000Z");
    expect(list.every((o) => o.state === "planned")).toBe(true);
  });

  it("rentang [from, to): kemunculan tepat di `to` tidak ikut, tepat di `from` ikut", () => {
    const at = "2026-11-24T12:00:00.000Z"; // Selasa 19:00 WIB
    expect(keys(occurrencesBetween(tueFri(), [], ...range("2026-11-20T00:00:00Z", at)))).toEqual(["2026-11-20T19:00"]);
    expect(keys(occurrencesBetween(tueFri(), [], ...range(at, "2026-11-25T00:00:00Z")))).toEqual(["2026-11-24T19:00"]);
  });

  it("tidak ada kemunculan sebelum tanggal mulai, dan berhenti di UNTIL (hari terakhir ikut)", () => {
    const rule = tueFri("Asia/Jakarta", "FREQ=WEEKLY;BYDAY=TU,FR;UNTIL=20261127T235959");
    expect(keys(occurrencesBetween(rule, [], ...range("2026-10-01T00:00:00Z", "2027-01-01T00:00:00Z")))).toEqual([
      "2026-11-03T19:00",
      "2026-11-06T19:00",
      "2026-11-10T19:00",
      "2026-11-13T19:00",
      "2026-11-17T19:00",
      "2026-11-20T19:00",
      "2026-11-24T19:00",
      "2026-11-27T19:00",
    ]);
  });

  // Q1: changing the account timezone keeps 19:00 at 19:00 in the new zone, and the keys stay the same.
  it("zona akun diganti Jakarta -> Tokyo: jam dinding tetap 19:00, kunci tetap, momennya maju 2 jam", () => {
    const window = range("2026-11-23T00:00:00Z", "2026-11-26T00:00:00Z");
    const jakarta = occurrencesBetween(tueFri("Asia/Jakarta"), [], ...window);
    const tokyo = occurrencesBetween(tueFri("Asia/Tokyo"), [], ...window);
    expect(keys(tokyo)).toEqual(keys(jakarta));
    expect(tokyo[0]?.wallTime).toBe("2026-11-24T19:00");
    expect((jakarta[0]?.at.getTime() ?? 0) - (tokyo[0]?.at.getTime() ?? 0)).toBe(2 * 60 * 60 * 1000);
  });

  it("pengecualian tetap menempel setelah zona akun diganti", () => {
    const skip: ExceptionIn[] = [{ occurrenceKey: "2026-11-24T19:00", kind: "skip", movedToLocal: null }];
    const tokyo = occurrencesBetween(tueFri("Asia/Tokyo"), skip, ...range("2026-11-23T00:00:00Z", "2026-11-28T00:00:00Z"));
    expect(keys(tokyo)).toEqual(["2026-11-27T19:00"]);
  });
});

// Asia/Jakarta has no DST, so the hard cases need a DST zone (docs/fase-0-arsitektur.md).
describe("DST (America/New_York)", () => {
  const sunday = (time: string): ScheduleRule => ({
    rrule: "FREQ=WEEKLY;BYDAY=SU",
    dtstartLocal: `2026-03-01T${time}`,
    timezone: "America/New_York",
  });

  it("jam maju 8 Mar 2026: 02:30 tidak ada, jadi 03:30 EDT; minggu sebelum dan sesudahnya normal", () => {
    const list = occurrencesBetween(sunday("02:30"), [], ...range("2026-03-01T00:00:00Z", "2026-03-16T00:00:00Z"));
    expect(list.map((o) => [o.key, o.at.toISOString()])).toEqual([
      ["2026-03-01T02:30", "2026-03-01T07:30:00.000Z"], // EST, UTC-5
      ["2026-03-08T02:30", "2026-03-08T07:30:00.000Z"], // gap: shifted to 03:30 EDT
      ["2026-03-15T02:30", "2026-03-15T06:30:00.000Z"], // EDT, UTC-4
    ]);
  });

  it("jam mundur 1 Nov 2026: 01:30 terjadi dua kali, dipakai yang pertama (EDT), satu kemunculan saja", () => {
    const list = occurrencesBetween(sunday("01:30"), [], ...range("2026-10-31T00:00:00Z", "2026-11-03T00:00:00Z"));
    expect(list.map((o) => o.at.toISOString())).toEqual(["2026-11-01T05:30:00.000Z"]);
  });
});

describe("pengecualian", () => {
  const window = range("2026-11-23T00:00:00Z", "2026-12-08T00:00:00Z");

  it("lewati: hilang dari daftar, tapi tetap terlihat sebagai 'skipped' kalau diminta", () => {
    const skip: ExceptionIn[] = [{ occurrenceKey: "2026-12-01T19:00", kind: "skip", movedToLocal: null }];
    expect(keys(occurrencesBetween(tueFri(), skip, ...window))).not.toContain("2026-12-01T19:00");
    const all = occurrencesBetween(tueFri(), skip, ...window, { withSkipped: true });
    expect(all.find((o) => o.key === "2026-12-01T19:00")?.state).toBe("skipped");
  });

  it("geser: muncul di jam baru dengan kunci aslinya, urut menurut jam baru", () => {
    const move: ExceptionIn[] = [{ occurrenceKey: "2026-12-04T19:00", kind: "move", movedToLocal: "2026-12-05T10:00" }];
    const list = occurrencesBetween(tueFri(), move, ...window);
    const moved = list.find((o) => o.key === "2026-12-04T19:00");
    expect(moved).toMatchObject({ wallTime: "2026-12-05T10:00", state: "moved" });
    expect(moved?.at.toISOString()).toBe("2026-12-05T03:00:00.000Z");
    expect(list.filter((o) => o.key === "2026-12-04T19:00")).toHaveLength(1);
  });

  it("geser jauh ke bulan berikutnya tetap muncul di bulan tujuan", () => {
    const move: ExceptionIn[] = [{ occurrenceKey: "2026-11-27T19:00", kind: "move", movedToLocal: "2027-01-10T09:00" }];
    const january = occurrencesBetween(tueFri(), move, ...range("2027-01-10T00:00:00Z", "2027-01-11T00:00:00Z"));
    expect(january.map((o) => [o.key, o.state])).toEqual([["2026-11-27T19:00", "moved"]]);
  });

  // Q3: after the rule is edited, exceptions whose key is no longer an occurrence are ignored.
  it("pengecualian yang kuncinya tidak cocok lagi dengan aturan diabaikan", () => {
    const stale: ExceptionIn[] = [{ occurrenceKey: "2026-11-25T19:00", kind: "move", movedToLocal: "2026-11-26T10:00" }];
    expect(occurrencesBetween(tueFri(), stale, ...window).some((o) => o.state === "moved")).toBe(false);
    expect(isOccurrence(tueFri(), "2026-11-25T19:00")).toBe(false); // Rabu
    expect(isOccurrence(tueFri(), "2026-11-24T19:00")).toBe(true);
    expect(isOccurrence(tueFri(), "2026-11-24T18:00")).toBe(false);
    expect(isOccurrence(tueFri(), "bukan-tanggal")).toBe(false);
  });
});
