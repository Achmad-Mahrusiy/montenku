import { describe, expect, it } from "vitest";
import { lateLabel, pickReminder, todoLists, type DeadlineRow, type LatePostRow } from "@/lib/dashboard";

const account = { id: "a", name: "Masak Hemat", color: "#e4572e", timezone: "Asia/Jakarta" };
// Mon 23 Nov 2026 14:00 WIB.
const NOW = new Date("2026-11-23T07:00:00Z");
const deadline = (itemId: string, stage: DeadlineRow["stage"], iso: string, status: DeadlineRow["status"] = "idea"): DeadlineRow => ({
  itemId,
  title: itemId,
  status,
  account,
  stage,
  dueAt: new Date(iso),
});
const latePost = (itemId: string, iso: string, status: LatePostRow["status"] = "ready"): LatePostRow => ({
  itemId,
  title: itemId,
  status,
  account,
  targetAt: new Date(iso),
});

describe("todoLists: Terlambat dan Tenggat mendekat", () => {
  it("tenggat yang lewat dan belum dilewati statusnya masuk Terlambat; yang sudah lewat tahapnya tidak", () => {
    const { late } = todoLists(
      [deadline("sambal", "script", "2026-11-21T03:00:00Z"), deadline("selesai", "script", "2026-11-21T03:00:00Z", "production")],
      [],
      NOW,
    );
    expect(late.map((r) => [r.itemId, r.what])).toEqual([["sambal", "script"]]);
  });

  it("satu baris per konten: yang paling awal (naskah lewat lebih dulu daripada waktu posting)", () => {
    const { late } = todoLists(
      [deadline("x", "script", "2026-11-20T03:00:00Z"), deadline("x", "editing", "2026-11-22T03:00:00Z")],
      [latePost("x", "2026-11-23T01:00:00Z")],
      NOW,
    );
    expect(late.map((r) => r.what)).toEqual(["script"]);
  });

  it("waktu posting yang lewat tanpa status Terposting masuk Terlambat; yang sudah terposting tidak", () => {
    const { late } = todoLists([], [latePost("lupa", "2026-11-22T12:00:00Z"), latePost("beres", "2026-11-22T12:00:00Z", "posted")], NOW);
    expect(late.map((r) => [r.itemId, r.what])).toEqual([["lupa", "posted"]]);
  });

  it("Tenggat mendekat: 7 hari ke depan, urut waktu, tanpa konten yang sudah terlambat", () => {
    const { upcoming } = todoLists(
      [
        deadline("docker", "editing", "2026-11-25T03:00:00Z", "production"),
        deadline("kopi", "script", "2026-11-24T03:00:00Z"),
        deadline("jauh", "script", "2026-12-05T03:00:00Z"),
        deadline("telat", "script", "2026-11-22T03:00:00Z"),
        deadline("telat", "production", "2026-11-24T03:00:00Z"),
      ],
      [],
      NOW,
    );
    expect(upcoming.map((r) => r.itemId)).toEqual(["kopi", "docker"]);
  });
});

describe("lateLabel", () => {
  it("hari kalender di zona akun, lalu jam dan menit di hari yang sama", () => {
    expect(lateLabel(new Date("2026-11-21T03:00:00Z"), NOW, "Asia/Jakarta")).toBe("lewat 2 hari");
    // 22 Nov 23:30 WIB is yesterday in Jakarta even though only 7.5 hours ago.
    expect(lateLabel(new Date("2026-11-22T16:30:00Z"), NOW, "Asia/Jakarta")).toBe("lewat 1 hari");
    expect(lateLabel(new Date("2026-11-23T03:59:00Z"), NOW, "Asia/Jakarta")).toBe("lewat 3 jam");
    expect(lateLabel(new Date("2026-11-23T06:40:00Z"), NOW, "Asia/Jakarta")).toBe("lewat 20 menit");
  });
});

describe("pickReminder", () => {
  const r = (status: "pending" | "sending" | "sent" | "cancelled" | "failed", iso: string) => ({ status, sendAt: new Date(iso) });

  it("gagal dulu, lalu yang berikutnya terjadwal, lalu yang terakhir terkirim; dibatalkan diabaikan", () => {
    expect(pickReminder([r("sent", "2026-11-23T01:00:00Z"), r("failed", "2026-11-22T01:00:00Z")])?.status).toBe("failed");
    expect(pickReminder([r("pending", "2026-11-23T10:00:00Z"), r("pending", "2026-11-23T08:00:00Z"), r("sent", "2026-11-23T01:00:00Z")])?.sendAt.toISOString()).toBe(
      "2026-11-23T08:00:00.000Z",
    );
    expect(pickReminder([r("sent", "2026-11-22T01:00:00Z"), r("sent", "2026-11-23T01:00:00Z")])?.sendAt.toISOString()).toBe("2026-11-23T01:00:00.000Z");
    expect(pickReminder([r("cancelled", "2026-11-23T01:00:00Z")])).toBeNull();
  });
});
