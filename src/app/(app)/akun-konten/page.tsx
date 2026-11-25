import type { Metadata } from "next";
import * as motion from "motion/react-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { cardHover, cardIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  accountColors,
  allTimezones,
  contentAccountIdSchema,
  feedUrl,
  indonesianTimezones,
  platformLabels,
  timezoneLabel,
} from "@/lib/validation/content-account";
import { restoreContentAccountAction } from "@/server/actions/content-accounts";
import { listContentAccounts, type ContentAccount } from "@/server/dal/content-accounts";
import { requireUser } from "@/server/dal/session";
import { AccountForm, type AccountFormValues } from "./account-form";
import { FeedSection } from "./feed-section";

export const metadata: Metadata = { title: "Akun konten | Montenku" };

const formatDate = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone }).format(date);

function AccountRow({ account, selected, order }: { account: ContentAccount; selected: boolean; order: number }) {
  const archived = account.archivedAt !== null;
  return (
    <motion.li
      {...cardIn(order)}
      {...cardHover}
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:p-5",
        selected && "border-foreground",
      )}
    >
      <div className="flex min-w-0 flex-1 gap-4">
        <span aria-hidden="true" className="size-10 shrink-0 rounded-lg" style={{ background: account.color }} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-lg font-bold break-words">{account.name}</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-sm text-muted-foreground">
              {platformLabels[account.platform]}
              {archived ? ", diarsipkan" : null}
            </span>
          </p>
          <p className="mt-0.5 text-sm break-words text-muted-foreground">
            @{account.handle} · {timezoneLabel(account.timezone)}
            {account.archivedAt ? ` · Diarsipkan ${formatDate(account.archivedAt, account.timezone)}` : null}
          </p>
        </div>
      </div>
      {archived ? (
        <form action={restoreContentAccountAction}>
          <input type="hidden" name="id" value={account.id} />
          <Button type="submit" variant="outline" className="w-full sm:w-auto">
            Pulihkan
          </Button>
        </form>
      ) : (
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href={`/akun-konten?ubah=${account.id}`} aria-label={`Ubah ${account.name}`}>
            Ubah
          </Link>
        </Button>
      )}
    </motion.li>
  );
}

type SearchParams = Promise<{ tambah?: string; ubah?: string }>;

export default async function ContentAccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const accounts = await listContentAccounts(user.id);
  const params = await searchParams;

  // The edit panel is driven by the URL (?ubah=<id> or ?tambah=1), so it works without client state and survives a refresh.
  const editId = contentAccountIdSchema.safeParse(params.ubah);
  const editing = editId.success ? accounts.find((a) => a.id === editId.data) : undefined;
  const panel = editing ? "ubah" : params.tambah ? "tambah" : params.ubah ? "hilang" : null;

  const usedColors = new Set(accounts.filter((a) => !a.archivedAt).map((a) => a.color));
  const defaults: AccountFormValues = {
    name: "",
    platform: "tiktok",
    handle: "",
    // A new account gets the first color nobody is using yet, so the calendar stays easy to tell apart.
    color: accountColors.find((c) => !usedColors.has(c)) ?? "#e4572e",
    timezone: "Asia/Jakarta",
  };
  const otherTimezones = allTimezones.filter((tz) => !(tz in indonesianTimezones));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-12 lg:py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-3xl font-bold">Akun konten</h1>
        {panel !== "tambah" ? (
          <Button asChild>
            <Link href="/akun-konten?tambah=1">
              Tambah<span className="hidden sm:inline">&nbsp;akun konten</span>
            </Link>
          </Button>
        ) : null}
      </div>

      <div className={cn("mt-6 grid gap-6 lg:items-start", panel && "lg:grid-cols-[minmax(0,1fr)_400px]")}>
        {/* On phones the open panel comes first, so tapping "Ubah" does not leave the form below a long list. */}
        {panel ? (
          <section aria-labelledby="panel-title" className="rounded-xl border bg-card p-5 sm:p-6 lg:order-last">
            {panel === "hilang" ? (
              <>
                <h2 id="panel-title" className="font-heading text-xl font-bold">
                  Akun konten tidak ditemukan
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Mungkin tautannya salah. Pilih akun dari daftar.</p>
              </>
            ) : (
              <>
                <h2 id="panel-title" className="mb-5 font-heading text-xl font-bold break-words">
                  {editing ? `Ubah: ${editing.name}` : "Tambah akun konten"}
                </h2>
                <AccountForm
                  key={editing?.id ?? "baru"}
                  account={
                    editing
                      ? {
                          id: editing.id,
                          archived: editing.archivedAt !== null,
                          name: editing.name,
                          platform: editing.platform,
                          handle: editing.handle,
                          color: editing.color,
                          timezone: editing.timezone,
                        }
                      : undefined
                  }
                  defaults={defaults}
                  otherTimezones={otherTimezones}
                />
                {editing ? (
                  <FeedSection
                    accountId={editing.id}
                    accountName={editing.name}
                    url={editing.feedToken ? feedUrl(env.BETTER_AUTH_URL, editing.feedToken) : null}
                  />
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {accounts.length === 0 ? (
          <section className="rounded-xl border border-dashed bg-card p-6">
            <h2 className="font-heading text-lg font-bold">Belum ada akun konten</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tambahkan akun TikTok, Instagram, atau YouTube yang kamu kelola. Setiap akun dapat warna sendiri di kalender.
            </p>
          </section>
        ) : (
          <ul className="grid gap-3" aria-label="Daftar akun konten">
            {accounts.map((account, i) => (
              <AccountRow key={account.id} account={account} selected={account.id === editing?.id} order={i} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
