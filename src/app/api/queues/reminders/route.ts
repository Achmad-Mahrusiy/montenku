import { handleCallback } from "@vercel/queue";
import { handleReminderMessage, retryDelay } from "@/server/reminder-jobs";

// Queue consumer for reminder messages (topic "reminders", registered in vercel.json).
// Only Vercel's queue can call it: queue consumers have no public URL.
export const POST = handleCallback(handleReminderMessage, {
  retry: (_error, metadata) => retryDelay(metadata.deliveryCount),
});
