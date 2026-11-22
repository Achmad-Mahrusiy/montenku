import { z } from "zod";
import { isWallTime } from "@/lib/time";

export const contentStatuses = ["idea", "script", "production", "editing", "ready", "posted"] as const;
export type ContentStatus = (typeof contentStatuses)[number];
export const statusLabels: Record<ContentStatus, string> = {
  idea: "Ide",
  script: "Naskah",
  production: "Produksi",
  editing: "Editing",
  ready: "Siap",
  posted: "Terposting",
};

// Stages that can have their own deadline. "posted" uses the item's target time instead.
export const deadlineStages = ["script", "production", "editing", "ready"] as const;
export type DeadlineStage = (typeof deadlineStages)[number];

const MAX_TAGS = 10;

// "resep, hemat, Resep , " -> ["resep", "hemat"]: trimmed, empty parts dropped, duplicates (any case) removed.
const tagsSchema = z
  .string()
  .default("")
  .transform((value) => {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const raw of value.split(",")) {
      const tag = raw.trim();
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        tags.push(tag);
      }
    }
    return tags;
  })
  .pipe(
    z
      .array(z.string().max(30, "Setiap tag maksimal 30 karakter"))
      .max(MAX_TAGS, `Maksimal ${MAX_TAGS} tag`),
  );

const wallTime = (message: string) => z.string().refine(isWallTime, message);
// A form sends "" for an empty optional field.
const optionalWallTime = z.preprocess((v) => (v === "" ? undefined : v), wallTime("Tanggal dan jam tenggat belum benar").optional());

export const contentItemSchema = z
  .object({
    title: z.string().trim().min(1, "Judul wajib diisi").max(200, "Judul maksimal 200 karakter"),
    description: z.string().trim().max(500, "Deskripsi maksimal 500 karakter").default(""),
    accountId: z.uuid("Pilih akun konten"),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal target wajib diisi"),
    targetTime: z.string().regex(/^\d{2}:\d{2}$/, "Jam target wajib diisi"),
    status: z.enum(contentStatuses, "Pilih status"),
    tags: tagsSchema,
    deadlines: z.object({
      script: optionalWallTime,
      production: optionalWallTime,
      editing: optionalWallTime,
      ready: optionalWallTime,
    }),
  })
  .transform(({ targetDate, targetTime, ...rest }) => ({ ...rest, targetWallTime: `${targetDate}T${targetTime}` }))
  .refine((value) => isWallTime(value.targetWallTime), { message: "Tanggal atau jam target belum benar", path: ["targetDate"] });

/** Validated item, with times still as wall-clock strings in the content account's timezone. */
export type ContentItemInput = z.infer<typeof contentItemSchema>;

export const noteSchema = z.object({
  body: z.string().trim().min(1, "Catatan tidak boleh kosong").max(10_000, "Catatan maksimal 10.000 karakter"),
});

export const contentItemIdSchema = z.uuid();
