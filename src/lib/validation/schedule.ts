import { z } from "zod";
import { isPlainDate, isWallTime } from "@/lib/time";

// The editor offers weekly rules only ("every Tuesday and Friday at 19:00"), as in the Figma editor.
// The full RRULE is stored, so other patterns can be added later without a migration.
export const weekdays = [
  { code: "MO", short: "Sen", long: "Senin" },
  { code: "TU", short: "Sel", long: "Selasa" },
  { code: "WE", short: "Rab", long: "Rabu" },
  { code: "TH", short: "Kam", long: "Kamis" },
  { code: "FR", short: "Jum", long: "Jumat" },
  { code: "SA", short: "Sab", long: "Sabtu" },
  { code: "SU", short: "Min", long: "Minggu" },
] as const;
type DayCode = (typeof weekdays)[number]["code"];
const dayCodes = weekdays.map((d) => d.code) as [DayCode, ...DayCode[]];

/** "FREQ=WEEKLY;BYDAY=TU,FR" plus UNTIL at the end of the last day (wall-clock, no Z) when there is one. */
export function weeklyRrule(days: DayCode[], endDate?: string): string {
  const ordered = dayCodes.filter((c) => days.includes(c));
  const until = endDate ? `;UNTIL=${endDate.replaceAll("-", "")}T235959` : "";
  return `FREQ=WEEKLY;BYDAY=${ordered.join(",")}${until}`;
}

/** Back from a stored weekly RRULE to the editor's fields. */
export function readWeeklyRrule(rrule: string): { days: DayCode[]; endDate: string | null } {
  const parts = new Map(rrule.split(";").map((p) => p.split("=") as [string, string]));
  const days = (parts.get("BYDAY") ?? "").split(",").filter((c): c is DayCode => (dayCodes as string[]).includes(c));
  const until = parts.get("UNTIL");
  return { days, endDate: until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : null };
}

/** "Selasa & Jumat, 19:00" for the schedule list. */
export function describeWeekly(rrule: string, dtstartLocal: string): string {
  const names = readWeeklyRrule(rrule).days.map((c) => weekdays.find((d) => d.code === c)?.long ?? c);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : (names[0] ?? "");
  return `${list}, ${dtstartLocal.slice(11, 16)}`;
}

export const scheduleSchema = z
  .object({
    accountId: z.uuid("Pilih akun konten"),
    title: z.string().trim().min(1, "Nama jadwal wajib diisi").max(100, "Nama jadwal maksimal 100 karakter"),
    days: z.array(z.enum(dayCodes)).min(1, "Pilih minimal satu hari"),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Jam wajib diisi"),
    startDate: z.string().refine(isPlainDate, "Tanggal mulai wajib diisi"),
    // A form sends "" for "Tidak berakhir".
    endDate: z.preprocess((v) => (v === "" ? undefined : v), z.string().refine(isPlainDate, "Tanggal berakhir belum benar").optional()),
  })
  .refine((v) => isWallTime(`${v.startDate}T${v.time}`), { message: "Jam belum benar", path: ["time"] })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "Tanggal berakhir tidak boleh sebelum tanggal mulai", path: ["endDate"] })
  .transform((v) => ({
    accountId: v.accountId,
    title: v.title,
    rrule: weeklyRrule(v.days, v.endDate),
    dtstartLocal: `${v.startDate}T${v.time}`,
  }));

export type ScheduleInput = z.infer<typeof scheduleSchema>;

export const scheduleIdSchema = z.uuid();
export const occurrenceKeySchema = z.string().refine(isWallTime);
export const wallTimeSchema = z.string().refine(isWallTime, "Tanggal dan jam belum benar");
