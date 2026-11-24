import { isStageDone, statusLabels, type ContentStatus, type DeadlineStage } from "@/lib/validation/content-item";

// iCalendar (RFC 5545) feed for one content account (D-035). Hand-written: the format needs only a few rules, all
// tested in tests/calendar-feed.test.ts.

export type IcsEvent = {
  /** Stable across refreshes, or calendar apps show every event twice after the next sync. */
  uid: string;
  start: Date;
  summary: string;
  description: string;
  url: string;
};

/** Every event is a 30-minute block: posts and deadlines are moments, and a zero-length event is easy to miss. */
const DURATION = "PT30M";

/** "20311107T120000Z". Always UTC, so the feed needs no VTIMEZONE block and every calendar app agrees on the time. */
const utc = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Text values escape backslash, semicolon, comma and newlines (RFC 5545 3.3.11). */
export const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const encoder = new TextEncoder();

/**
 * Lines longer than 75 octets continue on the next line after CRLF + space (RFC 5545 3.1). Counted in bytes, not
 * characters, and never inside a character: an emoji in a title is 4 bytes.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // The first line may hold 75 octets; continuation lines start with a space, so they hold 74 more.
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(calendarName: string, events: IcsEvent[], now: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Montenku//Kalender konten//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // A hint only: Google refreshes on its own schedule (often every few hours), Apple honours it.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${utc(now)}`,
      `DTSTART:${utc(event.start)}`,
      `DURATION:${DURATION}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      `URL:${event.url}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

type FeedInput = {
  baseUrl: string;
  items: { id: string; title: string; status: ContentStatus; targetAt: Date }[];
  slots: { id: string; targetAt: Date; slot?: { scheduleId: string; scheduleTitle: string } }[];
  deadlines: { itemId: string; title: string; status: ContentStatus; stage: DeadlineStage; dueAt: Date }[];
};

/**
 * What one account's feed shows (user's choice): its posts, its empty recurring-schedule slots, and stage deadlines
 * that are still open. A met deadline is left out: once the item moved past that stage it is no longer something to do.
 */
export function feedEvents({ baseUrl, items, slots, deadlines }: FeedInput): IcsEvent[] {
  const events: IcsEvent[] = [
    ...items.map((item) => ({
      uid: `item-${item.id}@montenku`,
      start: item.targetAt,
      summary: item.title,
      description: `Posting · Status: ${statusLabels[item.status]}`,
      url: `${baseUrl}/konten/${item.id}`,
    })),
    ...slots.flatMap((s) =>
      s.slot
        ? [
            {
              // The slot id is "<scheduleId>:<occurrenceKey>", stable while the slot exists.
              uid: `slot-${s.id}@montenku`,
              start: s.targetAt,
              summary: `Slot kosong: ${s.slot.scheduleTitle}`,
              description: "Slot jadwal berulang yang belum diisi konten.",
              url: `${baseUrl}/jadwal?ubah=${s.slot.scheduleId}`,
            },
          ]
        : [],
    ),
    ...deadlines
      .filter((d) => !isStageDone(d.status, d.stage))
      .map((d) => ({
        uid: `deadline-${d.itemId}-${d.stage}@montenku`,
        start: d.dueAt,
        summary: `Tenggat ${statusLabels[d.stage]}: ${d.title}`,
        description: `Tenggat tahap ${statusLabels[d.stage]} · Status sekarang: ${statusLabels[d.status]}`,
        url: `${baseUrl}/konten/${d.itemId}`,
      })),
  ];
  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}
