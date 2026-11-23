import { z } from "zod";

// Offsets offered in the UI, in minutes before the posting time. The brief's examples are H-1, 2 hours, on time.
export const reminderOffsets = [0, 30, 60, 120, 1440, 4320] as const;

/** "Tepat waktu", "30 menit sebelum", "2 jam sebelum", "H-1 hari". */
export function offsetLabel(minutes: number): string {
  if (minutes === 0) return "Tepat waktu";
  if (minutes % 1440 === 0) return `H-${minutes / 1440} hari`;
  if (minutes % 60 === 0) return `${minutes / 60} jam sebelum`;
  return `${minutes} menit sebelum`;
}

export const reminderOffsetSchema = z.coerce
  .number()
  .int()
  .refine((m) => (reminderOffsets as readonly number[]).includes(m), "Pilih waktu pengingat");
