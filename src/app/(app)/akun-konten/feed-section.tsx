"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setFeedAction } from "@/server/actions/content-accounts";

type Props = { accountId: string; accountName: string; url: string | null };

// "Langganan kalender" (D-035): a secret .ics link per content account for Google Calendar, Apple Calendar and others.
export function FeedSection({ accountId, accountName, url }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked (http, old browser): the field below is selectable, so copying by hand still works.
    }
  }

  return (
    <section aria-labelledby="feed-title" className="mt-6 grid gap-3 border-t pt-6">
      <h3 id="feed-title" className="font-heading text-lg font-bold">
        Langganan kalender
      </h3>
      <p className="text-sm text-muted-foreground">
        Tampilkan posting, slot kosong, dan tenggat {accountName} di Google Calendar atau Apple Calendar. Siapa pun yang punya
        tautannya bisa melihat jadwal ini, jadi jangan dibagikan.
      </p>
      {url ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="feed-url">Tautan rahasia (.ics)</Label>
            <Input id="feed-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-sm" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={copy}>
              {copied ? "Tersalin" : "Salin tautan"}
            </Button>
            <Button asChild variant="outline">
              <a href={url.replace(/^https?:/, "webcal:")}>Buka di aplikasi kalender</a>
            </Button>
          </div>
          <p role="status" className="sr-only">
            {copied ? "Tautan tersalin." : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            Aplikasi kalender memperbarui sendiri, biasanya tiap beberapa jam. Kalau tautan bocor, buat yang baru: tautan lama
            langsung berhenti bekerja.
          </p>
          <form action={setFeedAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="id" value={accountId} />
            <Button type="submit" name="feed" value="on" variant="outline">
              Buat tautan baru
            </Button>
            <Button type="submit" name="feed" value="off" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5">
              Matikan tautan
            </Button>
          </form>
        </>
      ) : (
        <form action={setFeedAction}>
          <input type="hidden" name="id" value={accountId} />
          <Button type="submit" name="feed" value="on" variant="outline">
            Buat tautan kalender
          </Button>
        </form>
      )}
    </section>
  );
}
