import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  instantToWallTime,
  isPlainDate,
  isWallTime,
  monthGrid,
  startOfWeek,
  timezoneShortName,
  todayIn,
  utcRangeCovering,
  wallTimeToInstant,
} from "@/lib/time";

describe("jam dinding <-> instant", () => {
  it("Asia/Jakarta (WIB, UTC+7, tanpa DST)", () => {
    expect(wallTimeToInstant("2026-11-23T19:00", "Asia/Jakarta").toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(instantToWallTime(new Date("2026-11-23T12:00:00Z"), "Asia/Jakarta")).toBe("2026-11-23T19:00");
  });

  it("jam yang sama di zona berbeda adalah momen berbeda", () => {
    const jakarta = wallTimeToInstant("2026-11-23T19:00", "Asia/Jakarta");
    const tokyo = wallTimeToInstant("2026-11-23T19:00", "Asia/Tokyo");
    expect(jakarta.getTime() - tokyo.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("melewati tengah malam: 23:30 WIB masih tanggal yang sama di WIB", () => {
    const instant = wallTimeToInstant("2026-12-31T23:30", "Asia/Jakarta");
    expect(instant.toISOString()).toBe("2026-12-31T16:30:00.000Z");
    expect(instantToWallTime(instant, "Asia/Jakarta")).toBe("2026-12-31T23:30");
  });

  // Asia/Jakarta has no DST, so a DST zone is required to test the hard cases (docs/fase-0-arsitektur.md).
  it("DST maju (New York, 8 Mar 2026): 02:30 tidak ada, digeser ke 03:30 EDT", () => {
    const instant = wallTimeToInstant("2026-03-08T02:30", "America/New_York");
    expect(instant.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(instantToWallTime(instant, "America/New_York")).toBe("2026-03-08T03:30");
  });

  it("DST mundur (New York, 1 Nov 2026): 01:30 terjadi dua kali, dipakai yang pertama (EDT)", () => {
    expect(wallTimeToInstant("2026-11-01T01:30", "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("bolak-balik stabil untuk jam biasa di zona ber-DST", () => {
    for (const wall of ["2026-01-15T09:00", "2026-07-15T09:00"]) {
      expect(instantToWallTime(wallTimeToInstant(wall, "America/New_York"), "America/New_York")).toBe(wall);
    }
  });
});

describe("timezoneShortName", () => {
  it("memakai singkatan Indonesia dan mengikuti DST", () => {
    const november = new Date("2026-11-23T12:00:00Z");
    expect(timezoneShortName("Asia/Jakarta", november)).toBe("WIB");
    expect(timezoneShortName("Asia/Makassar", november)).toBe("WITA");
    expect(timezoneShortName("Asia/Jayapura", november)).toBe("WIT");
    expect(timezoneShortName("America/New_York", november)).toBe("EST");
    expect(timezoneShortName("America/New_York", new Date("2026-07-01T12:00:00Z"))).toBe("EDT");
  });
});

describe("isWallTime", () => {
  it("menerima format YYYY-MM-DDTHH:mm yang valid", () => {
    expect(isWallTime("2026-11-23T19:00")).toBe(true);
  });

  it("menolak tanggal mustahil dan format lain", () => {
    for (const bad of ["2026-02-30T10:00", "2026-11-23T24:00", "2026-11-23 19:00", "2026-11-23T19:00:00", "", "besok"]) {
      expect(isWallTime(bad), bad).toBe(false);
    }
  });

  it("wallTimeToInstant menolak input yang tidak valid", () => {
    expect(() => wallTimeToInstant("2026-02-30T10:00", "Asia/Jakarta")).toThrow(RangeError);
  });
});

describe("tanggal kalender", () => {
  it("grid November 2026 mulai Senin 26 Okt dan berakhir Minggu 6 Des (seperti Figma)", () => {
    const grid = monthGrid("2026-11-23");
    expect(grid).toHaveLength(6);
    expect(grid[0]?.[0]).toBe("2026-10-26");
    expect(grid.at(-1)?.at(-1)).toBe("2026-12-06");
    expect(grid.every((week) => week.length === 7)).toBe(true);
  });

  it("bulan yang pas 4 minggu: Februari 2027 mulai Senin 1 Feb", () => {
    expect(monthGrid("2027-02-10").map((w) => w[0])).toEqual(["2027-02-01", "2027-02-08", "2027-02-15", "2027-02-22"]);
  });

  it("minggu mulai Senin; Minggu masih ikut minggu sebelumnya", () => {
    expect(startOfWeek("2026-11-23")).toBe("2026-11-23");
    expect(startOfWeek("2026-11-29")).toBe("2026-11-23");
  });

  it("tambah hari melewati bulan dan tahun; tambah bulan dijepit ke akhir bulan", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("hari ini mengikuti zona: 23 Nov 20:00 UTC sudah 24 Nov di WIB", () => {
    const now = new Date("2026-11-23T20:00:00Z");
    expect(todayIn("Asia/Jakarta", now)).toBe("2026-11-24");
    expect(todayIn("America/New_York", now)).toBe("2026-11-23");
  });

  it("rentang UTC menutup semua zona, dari +14 jam sampai -12 jam", () => {
    const { from, to } = utcRangeCovering("2026-11-01", "2026-11-30");
    expect(from.getTime()).toBeLessThanOrEqual(wallTimeToInstant("2026-11-01T00:00", "Pacific/Kiritimati").getTime());
    expect(to.getTime()).toBeGreaterThan(wallTimeToInstant("2026-11-30T23:59", "Etc/GMT+12").getTime());
  });

  it("isPlainDate menolak tanggal mustahil", () => {
    expect(isPlainDate("2026-11-23")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "23-11-2026", ""]) expect(isPlainDate(bad), bad).toBe(false);
  });
});
