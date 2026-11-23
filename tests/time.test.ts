import { describe, expect, it } from "vitest";
import { instantToWallTime, isWallTime, timezoneShortName, wallTimeToInstant } from "@/lib/time";

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
