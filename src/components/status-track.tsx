import { cn } from "@/lib/utils";
import { contentStatuses, statusLabels, type ContentStatus } from "@/lib/validation/content-item";

/** The six-step production bar from Figma ("StatusTrack"), with "Editing (4/6)" under it. */
export function StatusTrack({ status, className }: { status: ContentStatus; className?: string }) {
  const step = contentStatuses.indexOf(status) + 1;
  return (
    <div className={className}>
      <div aria-hidden="true" className="flex gap-1">
        {contentStatuses.map((s, i) => (
          <span key={s} className={cn("h-1.5 w-6 rounded-full", i < step ? "bg-foreground" : "bg-border")} />
        ))}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {statusLabels[status]} ({step}/{contentStatuses.length})
      </p>
    </div>
  );
}
